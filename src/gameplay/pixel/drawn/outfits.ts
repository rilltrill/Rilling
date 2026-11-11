import { B, type Draw, type Pt } from './figure';
import { R } from './palette';
import type { ViewId } from './skeleton';
import {
  ARM_F, ARM_L, ARM_Q, ARM_R, ARM_S, ARM_SHADE_F, BOOT_F, BOOT_Q, BOOT_S, HAND_CLAW, HAND_OPEN, HEAD_F, HEAD_Q, HEAD_S, LEG_F, LEG_L, LEG_Q, LEG_R, LEG_S,
  LEG_SHADE_F, NECK_F, PELVIS_F, PELVIS_Q, PELVIS_S, TRUNK_F, TRUNK_MAP, TRUNK_Q, TRUNK_S,
} from './body';

/**
 * DRAWN FIGURES: the costumes. A figure is painted back to front: the body shapes of `body.ts` in
 * cloth ramps, then what the person wears, all as drawn shapes, then the face, hat and hands.
 * Round one: a construction-worker zombie and a civilian in a flannel shirt.
 */

export interface FigureDef {
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
} as const;

const PARTH = 1;
const PARTT = 2;
const PARTL = 3;

interface ClothSpec {
  shirt: number;
  sleeve: number;
  pants: number;
  boot: number;
  skin: number;
  dead: boolean;
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function trunk(d: Draw, tbl: readonly Pt[], ramp: number, group: number) {
  const pen = d.pen;
  pen.begin();
  d.pts(tbl, TRUNK_MAP);
  pen.fill(ramp, 3, PARTT, group, -1);
}

function limb(d: Draw, tbl: readonly Pt[], map: readonly number[], ramp: number, group: number, part: number, tone = 3, line = -2) {
  const pen = d.pen;
  pen.begin();
  d.pts(tbl, map);
  pen.fill(ramp, tone, part, group, line);
}

/** An outline in a single frame (a head, a boot, a hand); `flip` mirrors its normal. */
function shape(d: Draw, tbl: readonly Pt[], bone: number, ramp: number, part: number, group: number, tone = 3, line = -2, flip = 1) {
  const pen = d.pen;
  pen.begin();
  for (let i = 0; i < tbl.length; i++) {
    const p = tbl[i];
    d.pt(bone, p[1], p[2] * flip, p[3] === 1);
  }
  pen.fill(ramp, tone, part, group, line);
}

/** A little drawn stroke in one frame: a run of (a, n). */
function strokeB(d: Draw, bone: number, g: number, delta: number, ...p: number[]) {
  const pen = d.pen;
  pen.begin();
  for (let i = 0; i < p.length; i += 2) d.pt(bone, p[i], p[i + 1]);
  pen.stroke(g, delta);
}

function boots(d: Draw, spec: ClothSpec, view: ViewId) {
  // Boots sit on a level frame at the ankle.
  const tbl = view === 2 ? BOOT_S : view === 1 || view === 3 ? BOOT_Q : BOOT_F;
  const pen = d.pen;
  // The ankle frames: use the shin bones' origin = ankle (a up in hu): a frame with a straight-up axis.
  for (let s = 0; s < 2; s++) {
    const shin = s === 0 ? B.shL : B.shR;
    const ankleX = d.ox[shin] + d.ax[shin] * d.A[shin];
    const ankleY = d.oy[shin] + d.ay[shin] * d.A[shin];
    // Side and 3/4 boots point at the walking direction (screen right); front boots splay.
    const flip = view === 0 ? (s === 0 ? 1 : -1) : view === 4 ? (s === 0 ? -1 : 1) : 1;
    const bx = (a: number, n: number) => d.cx + (ankleX + n * flip) * d.S;
    const by = (a: number, n: number) => d.cy - (ankleY + a) * d.S;
    pen.begin();
    for (let i = 0; i < tbl.length; i++) {
      const p = tbl[i];
      pen.add(bx(p[1], p[2]), by(p[1], p[2]), p[3] === 1);
    }
    pen.fill(spec.boot, 3, PARTL, s === 0 ? G.bootL : G.bootR, -1);
    if (d.lod >= 1) {
      // Sole.
      pen.begin();
      pen.add(bx(-0.3, -0.5), by(-0.3, -0.5));
      pen.add(bx(-0.3, 0.9), by(-0.3, 0.9));
      pen.add(bx(-0.5, 0.9), by(-0.5, 0.9));
      pen.add(bx(-0.5, -0.5), by(-0.5, -0.5));
      pen.shade(s === 0 ? G.bootL : G.bootR, -2);
    }
    if (d.lod >= 2) {
      // Toe cap highlight.
      pen.begin();
      const tcx = view === 2 ? 0.58 : view === 1 || view === 3 ? 0.42 : 0.04;
      pen.add(bx(-0.08, tcx - 0.1), by(-0.08, tcx - 0.1));
      pen.add(bx(-0.08, tcx + 0.06), by(-0.08, tcx + 0.06));
      pen.add(bx(-0.16, tcx + 0.12), by(-0.16, tcx + 0.12));
      pen.add(bx(-0.16, tcx - 0.14), by(-0.16, tcx - 0.14));
      pen.shade(s === 0 ? G.bootL : G.bootR, 1);
    }
  }
}

function jeans(d: Draw, spec: ClothSpec, view: ViewId) {
  const pen = d.pen;
  const tbl = view === 2 ? LEG_S : view === 1 || view === 3 ? LEG_Q : LEG_F;
  const ptbl = view === 2 ? PELVIS_S : view === 1 || view === 3 ? PELVIS_Q : PELVIS_F;
  // In views 1..3 the figure's right leg is nearer the viewer (screen left side).
  const nearLeft = view === 1 || view === 2 || view === 3 ? false : true;
  const first = nearLeft ? LEG_L : LEG_R; // drawn first
  const second = nearLeft ? LEG_R : LEG_L;
  const firstG = view === 0 || view === 4 ? G.legNear : G.legFar;
  limb(d, tbl, first, spec.pants, firstG, PARTL, 3, -1);
  limb(d, tbl, second, spec.pants, G.legNear, PARTL, 3, -1);
  // Pelvis in the near leg's group: no line where the thigh meets the seat.
  pen.begin();
  d.pts(ptbl, [B.pelvis]);
  pen.fill(spec.pants, 3, PARTT, G.legNear, -1);
  // Shadows: down the away side of each leg, wide at the crotch.
  d.wedge(LEG_SHADE_F, LEG_L, firstG === G.legFar && first === LEG_L ? G.legFar : G.legNear);
  d.wedge(LEG_SHADE_F, LEG_R, firstG === G.legFar && first === LEG_R ? G.legFar : G.legNear);
  if (d.lod >= 2) {
    // Crotch folds and knee creases.
    strokeB(d, B.pelvis, G.legNear, -2, -0.42, 0.16, -0.34, 0.03, -0.42, -0.14);
    strokeB(d, B.thL, G.legNear, -1, 0.95, -0.12, 0.92, 0.0, 0.98, 0.13);
    strokeB(d, B.thR, G.legNear, -1, 0.95, 0.1, 0.92, 0.0, 0.98, -0.14);
  }
}

/** Belt, buckle and loops across the top of the jeans, front / back. */
function belt(d: Draw, ramp: number, view: ViewId) {
  const pen = d.pen;
  const w = view === 0 || view === 4 ? 0.52 : view === 2 ? 0.36 : 0.46;
  pen.begin();
  d.pt(B.pelvis, 0.46, -w);
  d.pt(B.pelvis, 0.46, w);
  d.pt(B.pelvis, 0.3, w + 0.03);
  d.pt(B.pelvis, 0.3, -w - 0.03);
  pen.shade(0, 0, ramp, 3);
  if (d.lod >= 2 && view === 0) {
    pen.begin();
    d.pt(B.pelvis, 0.44, -0.07);
    d.pt(B.pelvis, 0.44, 0.07);
    d.pt(B.pelvis, 0.32, 0.07);
    d.pt(B.pelvis, 0.32, -0.07);
    pen.shade(0, 0, R.bone, 3);
  }
}

function headFront(d: Draw, spec: ClothSpec, jaw: number) {
  const pen = d.pen;
  const lod = d.lod;
  shape(d, HEAD_F, B.head, spec.skin, PARTH, G.head, 3, -2);
  // Ears.
  if (lod >= 1) {
    const ear = (s: number) => {
      pen.begin();
      d.pt(B.head, 0.1, s * 0.37);
      d.pt(B.head, 0.14, s * 0.45);
      d.pt(B.head, -0.04, s * 0.45);
      d.pt(B.head, -0.14, s * 0.38);
      pen.fill(spec.skin, 3, PARTH, G.ear, 0);
    };
    ear(1);
    ear(-1);
  }
  // Cheek-and-jaw shadow on the away side.
  pen.begin();
  d.pt(B.head, 0.42, 0.2);
  d.pt(B.head, 0.1, 0.2);
  d.pt(B.head, -0.2, 0.14);
  d.pt(B.head, -0.52, 0.06);
  d.pt(B.head, -0.52, 0.5, true);
  d.pt(B.head, 0.42, 0.5, true);
  pen.shade(G.head, -1);
  if (spec.dead) zombieFaceF(d, spec, jaw);
  else liveFaceF(d, spec);
}

function zombieFaceF(d: Draw, spec: ClothSpec, jaw: number) {
  const pen = d.pen;
  const lod = d.lod;
  if (lod === 0) {
    // Two sockets and a mouth, as plain texels.
    const S = d.S;
    const px = d.px(B.head, 0.02, 0.17);
    const py = d.py(B.head, 0.02, 0.17);
    const qx = d.px(B.head, 0.02, -0.17);
    const qy = d.py(B.head, 0.02, -0.17);
    pen.plot(Math.floor(px), Math.floor(py), G.head, 0, R.skinDead, 1);
    pen.plot(Math.floor(qx), Math.floor(qy), G.head, 0, R.skinDead, 1);
    pen.plot(Math.floor(d.px(B.head, -0.3, 0)), Math.floor(d.py(B.head, -0.3, 0)), G.head, 0, spec.skin, 1);
    void S;
    return;
  }
  const eye = (s: number) => {
    // Dark socket, a brow over it, a glowing pin.
    pen.begin();
    d.pt(B.head, 0.1, s * 0.09);
    d.pt(B.head, 0.09, s * 0.28);
    d.pt(B.head, -0.04, s * 0.28);
    d.pt(B.head, -0.06, s * 0.1);
    pen.shade(G.head, 0, spec.skin, 1);
    if (lod >= 2) {
      pen.begin();
      d.pt(B.head, 0.2, s * 0.05);
      d.pt(B.head, 0.14, s * 0.32);
      d.pt(B.head, 0.09, s * 0.3);
      d.pt(B.head, 0.1, s * 0.05);
      pen.shade(G.head, 0, spec.skin, 2);
    }
    const ex = d.px(B.head, 0.02, s * 0.18);
    const ey = d.py(B.head, 0.02, s * 0.18);
    pen.plot(Math.floor(ex), Math.floor(ey), G.head, 0, R.eyeGlow, 4);
    if (lod >= 3) {
      pen.plot(Math.floor(ex) + 1, Math.floor(ey), G.head, 0, R.eyeGlow, 4);
    }
  };
  eye(1);
  eye(-1);
  // Nose: a shadow under a bridge.
  pen.begin();
  d.pt(B.head, -0.1, 0.1);
  d.pt(B.head, -0.2, 0.08);
  d.pt(B.head, -0.2, -0.08);
  d.pt(B.head, -0.1, -0.06);
  pen.shade(G.head, 0, spec.skin, 2);
  // A jaw hanging open, teeth set in dark.
  const j = 0.14 + jaw * 0.14;
  pen.begin();
  d.pt(B.head, -0.26, 0.16);
  d.pt(B.head, -0.26 - j, 0.13);
  d.pt(B.head, -0.26 - j, -0.14);
  d.pt(B.head, -0.26, -0.17);
  pen.shade(G.head, 0, R.blood, 1);
  if (lod >= 1) {
    pen.begin();
    d.pt(B.head, -0.26, 0.15, true);
    d.pt(B.head, -0.26, -0.15, true);
    d.pt(B.head, -0.31, -0.12, true);
    d.pt(B.head, -0.31, 0.12, true);
    pen.shade(G.head, 0, R.teeth, 4);
  }
  // Blood down from the mouth.
  pen.begin();
  d.pt(B.head, -0.3, 0.1);
  d.pt(B.head, -0.3, 0.2);
  d.pt(B.head, -0.52, 0.15);
  d.pt(B.head, -0.5, 0.1);
  pen.shade(G.head, 0, R.blood, 2);
}

function liveFaceF(d: Draw, spec: ClothSpec) {
  const pen = d.pen;
  const lod = d.lod;
  const eye = (s: number) => {
    if (lod === 0) {
      pen.plot(Math.floor(d.px(B.head, 0.04, s * 0.17)), Math.floor(d.py(B.head, 0.04, s * 0.17)), G.head, 0, R.hairDark, 1);
      return;
    }
    pen.begin();
    d.pt(B.head, 0.08, s * 0.08);
    d.pt(B.head, 0.08, s * 0.28);
    d.pt(B.head, -0.03, s * 0.28);
    d.pt(B.head, -0.03, s * 0.08);
    pen.shade(G.head, 0, R.white, 4);
    const ex = d.px(B.head, 0.03, s * 0.18);
    const ey = d.py(B.head, 0.03, s * 0.18);
    pen.plot(Math.floor(ex), Math.floor(ey), G.head, 0, R.hairDark, 1);
    if (lod >= 2) pen.plot(Math.floor(ex) + (s > 0 ? -1 : 1), Math.floor(ey), G.head, 0, R.hairDark, 1);
    // Brow: raised in fear.
    pen.begin();
    d.pt(B.head, 0.17, s * 0.09);
    d.pt(B.head, 0.2, s * 0.3);
    d.pt(B.head, 0.15, s * 0.31);
    d.pt(B.head, 0.13, s * 0.09);
    pen.shade(G.head, 0, R.hairDark, 2);
  };
  eye(1);
  eye(-1);
  pen.begin();
  d.pt(B.head, -0.08, 0.08);
  d.pt(B.head, -0.2, 0.08);
  d.pt(B.head, -0.2, -0.08);
  d.pt(B.head, -0.08, -0.08);
  pen.shade(G.head, -1);
  pen.begin();
  d.pt(B.head, -0.26, 0.13);
  d.pt(B.head, -0.34, 0.1);
  d.pt(B.head, -0.34, -0.1);
  d.pt(B.head, -0.26, -0.13);
  pen.shade(G.head, 0, R.blood, 2);
}

function hardHat(d: Draw, view: ViewId) {
  const pen = d.pen;
  const lod = d.lod;
  // Dome.
  pen.begin();
  if (view === 2) {
    d.pt(B.head, 0.6, -0.08);
    d.pt(B.head, 0.56, 0.22);
    d.pt(B.head, 0.3, 0.42);
    d.pt(B.head, 0.2, 0.42, true);
    d.pt(B.head, 0.18, 0.56, true);
    d.pt(B.head, 0.1, 0.55, true);
    d.pt(B.head, 0.14, 0.34, true);
    d.pt(B.head, 0.2, -0.44, true);
    d.pt(B.head, 0.42, -0.4);
  } else {
    d.pt(B.head, 0.6, 0.0);
    d.pt(B.head, 0.54, 0.25);
    d.pt(B.head, 0.3, 0.4);
    d.pt(B.head, 0.2, 0.44, true);
    d.pt(B.head, 0.12, 0.52, true);
    d.pt(B.head, 0.1, 0.0);
    d.pt(B.head, 0.12, -0.52, true);
    d.pt(B.head, 0.2, -0.44, true);
    d.pt(B.head, 0.3, -0.4);
    d.pt(B.head, 0.54, -0.25);
  }
  pen.fill(R.hat, 3, PARTH, G.hat, -2);
  // Ridge along the crown and a shadow on the away side.
  pen.begin();
  d.pt(B.head, 0.6, 0.22);
  d.pt(B.head, 0.3, 0.22);
  d.pt(B.head, 0.18, 0.16);
  d.pt(B.head, 0.1, 0.6, true);
  d.pt(B.head, 0.7, 0.6, true);
  pen.shade(G.hat, -1);
  if (lod >= 1) {
    pen.begin();
    d.pt(B.head, 0.58, -0.16);
    d.pt(B.head, 0.42, -0.34);
    d.pt(B.head, 0.34, -0.3);
    d.pt(B.head, 0.5, -0.1);
    pen.shade(G.hat, 1);
  }
}

function hair(d: Draw, view: ViewId, ramp: number) {
  const pen = d.pen;
  pen.begin();
  if (view === 2) {
    // Profile hair: crown to the nape.
    d.pt(B.head, 0.52, 0.02);
    d.pt(B.head, 0.44, 0.2);
    d.pt(B.head, 0.3, 0.3);
    d.pt(B.head, 0.34, 0.08);
    d.pt(B.head, 0.1, 0.0);
    d.pt(B.head, -0.12, -0.26);
    d.pt(B.head, -0.3, -0.4);
    d.pt(B.head, -0.18, -0.46);
    d.pt(B.head, 0.1, -0.48);
    d.pt(B.head, 0.34, -0.42);
  } else if (view === 0) {
    d.pt(B.head, 0.54, 0.0);
    d.pt(B.head, 0.48, 0.26);
    d.pt(B.head, 0.3, 0.42);
    d.pt(B.head, 0.1, 0.42);
    d.pt(B.head, 0.14, 0.32);
    d.pt(B.head, 0.3, 0.12);
    d.pt(B.head, 0.3, -0.1);
    d.pt(B.head, 0.16, -0.34);
    d.pt(B.head, 0.1, -0.42);
    d.pt(B.head, 0.3, -0.42);
    d.pt(B.head, 0.48, -0.26);
  } else {
    d.pt(B.head, 0.54, 0.0);
    d.pt(B.head, 0.46, 0.26);
    d.pt(B.head, 0.3, 0.36);
    d.pt(B.head, 0.3, 0.14);
    d.pt(B.head, 0.18, -0.2);
    d.pt(B.head, 0.0, -0.46);
    d.pt(B.head, 0.3, -0.5);
    d.pt(B.head, 0.46, -0.28);
  }
  pen.fill(ramp, 3, PARTH, G.hair, -1);
}

function neck(d: Draw, ramp: number) {
  shape(d, NECK_F, B.neck, ramp, PARTH, G.neck, 2, 0);
}

/** A hand at the end of a forearm. */
function hand(d: Draw, tbl: readonly Pt[], bone: number, ramp: number, group: number) {
  shape(d, tbl, bone, ramp, PARTL, group, 3, -1);
  d.pen.begin();
}

function arm(d: Draw, tbl: readonly Pt[], map: readonly number[], spec: ClothSpec, group: number) {
  limb(d, tbl, map, spec.sleeve, group, PARTL, 3, -1);
  d.wedge(ARM_SHADE_F, map, group);
}

// ─── The worker ────────────────────────────────────────────────────────────

const WORK: ClothSpec = { shirt: R.shirtGrey, sleeve: R.shirtGrey, pants: R.denim, boot: R.boot, skin: R.skinDead, dead: true };

function vest(d: Draw, view: ViewId) {
  const pen = d.pen;
  // Hi-vis vest over the shirt: deep V at the neck, big armholes, hanging open at the hem.
  pen.begin();
  if (view === 0 || view === 4) {
    // The vest's outline follows the body: chest, nipped at the waist, a short flare over the hips, torn at the hem.
    d.pt(B.chest, 0.47, 0.17, true);
    d.pt(B.chest, 0.38, 0.5);
    d.pt(B.chest, 0.06, 0.5);
    d.pt(B.chest, -0.28, 0.58);
    d.pt(B.waist, 0.0, 0.46);
    d.pt(B.pelvis, 0.3, 0.5);
    d.pt(B.pelvis, 0.12, 0.58, true);
    d.pt(B.pelvis, 0.05, 0.46, true);
    d.pt(B.pelvis, 0.12, 0.34, true);
    d.pt(B.pelvis, 0.03, 0.2, true);
    d.pt(B.pelvis, 0.1, 0.03, true);
    d.pt(B.pelvis, 0.02, -0.12, true);
    d.pt(B.pelvis, 0.11, -0.28, true);
    d.pt(B.pelvis, 0.04, -0.4, true);
    d.pt(B.pelvis, 0.12, -0.58, true);
    d.pt(B.pelvis, 0.3, -0.5);
    d.pt(B.waist, 0.0, -0.46);
    d.pt(B.chest, -0.28, -0.58);
    d.pt(B.chest, 0.06, -0.5);
    d.pt(B.chest, 0.38, -0.5);
    d.pt(B.chest, 0.47, -0.17, true);
    if (view === 0) d.pt(B.chest, -0.02, 0.0, true);
  } else if (view === 2) {
    d.pt(B.chest, 0.46, 0.22, true);
    d.pt(B.chest, 0.18, 0.42);
    d.pt(B.chest, -0.3, 0.42);
    d.pt(B.waist, 0.0, 0.36);
    d.pt(B.pelvis, 0.16, 0.38, true);
    d.pt(B.pelvis, 0.16, -0.46, true);
    d.pt(B.waist, 0.0, -0.36);
    d.pt(B.chest, -0.3, -0.46);
    d.pt(B.chest, 0.18, -0.48);
    d.pt(B.chest, 0.46, -0.3, true);
  } else {
    d.pt(B.chest, 0.46, 0.16, true);
    d.pt(B.chest, 0.3, 0.5);
    d.pt(B.chest, -0.3, 0.5);
    d.pt(B.waist, 0.0, 0.42);
    d.pt(B.pelvis, 0.3, 0.44);
    d.pt(B.pelvis, 0.08, 0.44, true);
    d.pt(B.pelvis, 0.08, -0.56, true);
    d.pt(B.pelvis, 0.3, -0.56);
    d.pt(B.waist, 0.0, -0.5);
    d.pt(B.chest, -0.3, -0.58);
    d.pt(B.chest, 0.3, -0.56);
    d.pt(B.chest, 0.46, -0.1, true);
  }
  pen.fill(R.hivis, 3, PARTT, G.vest, -2);
  // Away-side shadow.
  pen.begin();
  d.pt(B.chest, 0.5, 0.2);
  d.pt(B.chest, -0.1, 0.22);
  d.pt(B.waist, 0.02, 0.2);
  d.pt(B.pelvis, 0.05, 0.28);
  d.pt(B.pelvis, 0.05, 0.8, true);
  d.pt(B.chest, 0.5, 0.9, true);
  pen.shade(G.vest, -1);
  if (d.lod >= 1) {
    // Reflective bands (horizontal round the body).
    const band = (b: number, a0: number, a1: number) => {
      pen.begin();
      d.pt(b, a0, -0.9);
      d.pt(b, a0, 0.9);
      d.pt(b, a1, 0.9);
      d.pt(b, a1, -0.9);
      pen.shade(G.vest, 0, R.reflect, 4);
    };
    band(B.chest, -0.3, -0.42);
    band(B.pelvis, 0.3, 0.18);
    // Fastening down the front.
    if (view === 0) strokeB(d, B.chest, G.vest, -2, 0.4, 0.01, -0.5, 0.0);
    if (view === 0) strokeB(d, B.waist, G.vest, -2, 0.5, 0.0, -0.3, 0.0);
    if (view === 0) strokeB(d, B.pelvis, G.vest, -2, 0.42, 0.0, 0.1, 0.0);
  }
  if (d.lod >= 2 && view === 0) {
    // Chest pocket and a pen.
    strokeB(d, B.chest, G.vest, -2, 0.06, 0.24, 0.06, 0.46);
    strokeB(d, B.chest, G.vest, -2, 0.06, 0.24, -0.1, 0.24, -0.1, 0.46);
  }
  void pen;
}

export const WORKER: FigureDef = {
  name: 'worker',
  paint(d, view) {
    const pen = d.pen;
    const spec = WORK;
    const armTbl = view === 2 ? ARM_S : view === 1 || view === 3 ? ARM_Q : ARM_F;
    const trunkTbl = view === 2 ? TRUNK_S : view === 1 || view === 3 ? TRUNK_Q : TRUNK_F;
    // Far arm (behind the body in side / 3/4 views).
    if (view !== 0 && view !== 4) {
      const farArm = view === 3 ? ARM_R : ARM_L;
      void farArm;
      arm(d, armTbl, ARM_L, spec, G.armFar);
    }
    boots(d, spec, view);
    jeans(d, spec, view);
    belt(d, R.belt, view);
    trunk(d, trunkTbl, spec.shirt, G.trunk);
    // Trunk's designed shadow on the away side.
    pen.begin();
    d.pt(B.chest, 0.5, 0.26);
    d.pt(B.chest, -0.4, 0.3);
    d.pt(B.waist, -0.05, 0.24);
    d.pt(B.pelvis, 0.3, 0.3);
    d.pt(B.pelvis, 0.3, 0.9, true);
    d.pt(B.chest, 0.5, 0.9, true);
    pen.shade(G.trunk, -1);
    neck(d, spec.skin);
    vest(d, view);
    // Head.
    if (view === 0 || view === 4) headFront(d, spec, 0.6);
    else if (view === 2) shape(d, HEAD_S, B.head, spec.skin, PARTH, G.head, 3, -2);
    else shape(d, HEAD_Q, B.head, spec.skin, PARTH, G.head, 3, -2);
    hair(d, view, R.hairDark);
    hardHat(d, view);
    // Arms and hands.
    if (view === 0 || view === 4) {
      arm(d, armTbl, ARM_L, spec, G.armFar);
      arm(d, armTbl, ARM_R, spec, G.armNear);
      hand(d, HAND_CLAW, B.haL, spec.skin, G.handF);
      hand(d, HAND_CLAW, B.haR, spec.skin, G.handN);
    } else {
      arm(d, armTbl, ARM_R, spec, G.armNear);
      hand(d, HAND_CLAW, B.haL, spec.skin, G.handF);
      hand(d, HAND_CLAW, B.haR, spec.skin, G.handN);
    }
  },
};

export const FLANNEL: FigureDef = {
  name: 'flannel',
  paint(d, view) {
    const pen = d.pen;
    const spec: ClothSpec = { shirt: R.flannel, sleeve: R.flannel, pants: R.denimCiv, boot: R.bootCiv, skin: R.skinLive, dead: false };
    const armTbl = view === 2 ? ARM_S : view === 1 || view === 3 ? ARM_Q : ARM_F;
    const trunkTbl = view === 2 ? TRUNK_S : view === 1 || view === 3 ? TRUNK_Q : TRUNK_F;
    if (view !== 0 && view !== 4) arm(d, armTbl, ARM_L, spec, G.armFar);
    boots(d, spec, view);
    jeans(d, spec, view);
    belt(d, R.belt, view);
    trunk(d, trunkTbl, spec.shirt, G.trunk);
    pen.begin();
    d.pt(B.chest, 0.5, 0.26);
    d.pt(B.chest, -0.4, 0.3);
    d.pt(B.waist, -0.05, 0.24);
    d.pt(B.pelvis, 0.3, 0.3);
    d.pt(B.pelvis, 0.3, 0.9, true);
    d.pt(B.chest, 0.5, 0.9, true);
    pen.shade(G.trunk, -1);
    neck(d, spec.skin);
    if (view === 0 || view === 4) headFront(d, spec, 0.4);
    else if (view === 2) shape(d, HEAD_S, B.head, spec.skin, PARTH, G.head, 3, -2);
    else shape(d, HEAD_Q, B.head, spec.skin, PARTH, G.head, 3, -2);
    hair(d, view, R.hairDark);
    if (view === 0 || view === 4) {
      arm(d, armTbl, ARM_L, spec, G.armFar);
      arm(d, armTbl, ARM_R, spec, G.armNear);
      hand(d, HAND_OPEN, B.haL, spec.skin, G.handF);
      hand(d, HAND_OPEN, B.haR, spec.skin, G.handN);
    } else {
      arm(d, armTbl, ARM_R, spec, G.armNear);
      hand(d, HAND_OPEN, B.haL, spec.skin, G.handF);
      hand(d, HAND_OPEN, B.haR, spec.skin, G.handN);
    }
  },
};
