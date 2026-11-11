import { B, type Pt } from './figure';

/**
 * DRAWN FIGURES: the anatomy tables. Limbs are outlines in bone space (bone 0 / 1 of the limb, t
 * along it, n to the side in head units): deltoid, biceps, the forearm swell below the elbow, the
 * thin wrist; outer thigh, knee, the high calf. Control points are the design: edit a number, look
 * at the sheet.
 */

export const ARM_L = [B.upL, B.foL] as const;
export const ARM_R = [B.upR, B.foR] as const;
export const LEG_L = [B.thL, B.shL] as const;
export const LEG_R = [B.thR, B.shR] as const;

// ─── Arms (sleeves; n > 0 lateral in front/back views, screen right otherwise) ─────────────

/** Front: deltoid cap, biceps tapering into the elbow, forearm swell, wrist; the sleeve hangs loose at the cuff. */
export const ARM_F: readonly Pt[] = [
  [0, -0.11, 0.04],
  [0, 0.0, 0.256],
  [0, 0.15, 0.335],
  [0, 0.36, 0.25],
  [0, 0.62, 0.192],
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
  [0, 0.04, -0.128],
  [0, -0.09, -0.08],
];

/** Three-quarter: the near arm reads wider at the shoulder than the far one tapers. */
export const ARM_Q: readonly Pt[] = [
  [0, -0.11, 0.04],
  [0, 0.0, 0.243],
  [0, 0.15, 0.288],
  [0, 0.4, 0.218],
  [0, 0.7, 0.179],
  [0, 0.94, 0.166],
  [1, 0.08, 0.198],
  [1, 0.34, 0.218],
  [1, 0.66, 0.166],
  [1, 0.9, 0.154],
  [1, 1.0, 0.173, 1],
  [1, 1.0, -0.173, 1],
  [1, 0.9, -0.147],
  [1, 0.5, -0.192],
  [1, 0.18, -0.192],
  [1, 0.0, -0.173],
  [0, 0.86, -0.154],
  [0, 0.5, -0.205],
  [0, 0.2, -0.218],
  [0, 0.0, -0.166],
  [0, -0.09, -0.08],
];

/** Side view: a lean arm, deltoid over the shoulder, biceps forward, elbow point back. */
export const ARM_S: readonly Pt[] = [
  [0, -0.11, 0.04],
  [0, 0.0, 0.218],
  [0, 0.18, 0.269],
  [0, 0.45, 0.256],
  [0, 0.72, 0.192],
  [0, 0.92, 0.154],
  [1, 0.06, 0.179],
  [1, 0.32, 0.211],
  [1, 0.7, 0.166],
  [1, 0.92, 0.147],
  [1, 1.0, 0.166, 1],
  [1, 1.0, -0.166, 1],
  [1, 0.92, -0.141],
  [1, 0.55, -0.179],
  [1, 0.2, -0.218],
  [1, 0.02, -0.243],
  [0, 0.92, -0.205],
  [0, 0.55, -0.192],
  [0, 0.24, -0.218],
  [0, 0.0, -0.179],
  [0, -0.09, -0.08],
];

/** Shadow shape: a wedge wide out of the armpit and at the elbow. */
export const ARM_SHADE_F: readonly Pt[] = [
  [0, 0.05, 0.14],
  [0, 0.45, 0.08],
  [0, 0.86, 0.1],
  [1, 0.1, 0.1],
  [1, 0.55, 0.04],
  [1, 1.02, 0.0],
];

// ─── Legs (trouser outlines) ───────────────────────────────────────────────────────────

/** Jeans, front: heavy outer thigh, a real knee, the calf swelling high on the shin, a thin ankle. */
export const LEG_F: readonly Pt[] = [
  [0, -0.04, 0.3],
  [0, 0.14, 0.42],
  [0, 0.42, 0.42],
  [0, 0.72, 0.32],
  [0, 0.88, 0.275],
  [0, 0.99, 0.25],
  [1, 0.06, 0.26],
  [1, 0.14, 0.275],
  [1, 0.3, 0.295],
  [1, 0.58, 0.25],
  [1, 0.82, 0.2],
  [1, 0.94, 0.19],
  [1, 1.02, 0.215, 1],
  [1, 1.02, -0.2, 1],
  [1, 0.94, -0.18],
  [1, 0.6, -0.225],
  [1, 0.3, -0.275],
  [1, 0.12, -0.245],
  [1, 0.02, -0.22],
  [0, 0.94, -0.22],
  [0, 0.6, -0.31],
  [0, 0.28, -0.4],
  [0, 0.02, -0.4],
];

export const LEG_Q: readonly Pt[] = [
  [0, 0.0, 0.42],
  [0, 0.22, 0.45],
  [0, 0.55, 0.37],
  [0, 0.86, 0.275],
  [0, 0.99, 0.25],
  [1, 0.05, 0.265],
  [1, 0.16, 0.235],
  [1, 0.42, 0.215],
  [1, 0.74, 0.195],
  [1, 0.93, 0.205],
  [1, 1.02, 0.225, 1],
  [1, 1.02, -0.21, 1],
  [1, 0.92, -0.2],
  [1, 0.62, -0.245],
  [1, 0.3, -0.345],
  [1, 0.14, -0.3],
  [1, 0.02, -0.24],
  [0, 0.92, -0.27],
  [0, 0.6, -0.36],
  [0, 0.25, -0.44],
  [0, 0.0, -0.44],
];

/** Side: the quad bulges forward above the knee, a bump at the top of the shin, the calf back and high. */
export const LEG_S: readonly Pt[] = [
  [0, 0.0, 0.39],
  [0, 0.22, 0.47],
  [0, 0.55, 0.41],
  [0, 0.84, 0.3],
  [0, 0.97, 0.265],
  [1, 0.04, 0.275],
  [1, 0.14, 0.2],
  [1, 0.42, 0.17],
  [1, 0.76, 0.17],
  [1, 0.93, 0.195],
  [1, 1.02, 0.22, 1],
  [1, 1.02, -0.205, 1],
  [1, 0.9, -0.19],
  [1, 0.64, -0.245],
  [1, 0.3, -0.38],
  [1, 0.12, -0.32],
  [1, 0.0, -0.24],
  [0, 0.93, -0.27],
  [0, 0.6, -0.34],
  [0, 0.25, -0.43],
  [0, 0.0, -0.44],
];

/** Away-side shadow down the leg: wide at the crotch, along the shin. */
export const LEG_SHADE_F: readonly Pt[] = [
  [0, 0.04, 0.2],
  [0, 0.45, 0.11],
  [0, 0.92, 0.07],
  [1, 0.15, 0.08],
  [1, 0.6, 0.05],
  [1, 1.05, 0.08],
];

// ─── Hands: bone 0 = wrist → fingertips (t), n across the hand ─────────────────────────

/** A dead hand: fingers hooked and apart, thumb out. */
export const HAND_CLAW: readonly Pt[] = [
  [0, -0.04, 0.1],
  [0, 0.24, 0.22],
  [0, 0.48, 0.25], // knuckles, little-finger side
  [0, 0.78, 0.25],
  [0, 0.98, 0.17], // finger tip hooks in
  [0, 0.86, 0.11],
  [0, 0.7, 0.1], // notch
  [0, 1.06, 0.06],
  [0, 1.1, -0.02],
  [0, 0.75, -0.04], // notch
  [0, 1.02, -0.09],
  [0, 1.04, -0.17],
  [0, 0.7, -0.17], // notch
  [0, 0.58, -0.21],
  [0, 0.76, -0.37],
  [0, 0.84, -0.42], // thumb tip
  [0, 0.68, -0.44],
  [0, 0.42, -0.3],
  [0, 0.18, -0.19],
  [0, -0.04, -0.1],
];

/** An open living hand: four separated fingers, the thumb set off the palm. */
export const HAND_OPEN: readonly Pt[] = [
  [0, -0.04, 0.09],
  [0, 0.22, 0.17],
  [0, 0.44, 0.2],
  [0, 0.78, 0.21],
  [0, 0.92, 0.17, 1],
  [0, 0.8, 0.13],
  [0, 0.56, 0.11, 1],
  [0, 0.92, 0.1],
  [0, 1.02, 0.05, 1],
  [0, 0.94, 0.01],
  [0, 0.58, 0.0, 1],
  [0, 0.96, -0.02],
  [0, 1.04, -0.07, 1],
  [0, 0.94, -0.11],
  [0, 0.56, -0.11, 1],
  [0, 0.86, -0.13],
  [0, 0.92, -0.18, 1],
  [0, 0.82, -0.21],
  [0, 0.52, -0.21],
  [0, 0.64, -0.3],
  [0, 0.72, -0.37, 1],
  [0, 0.6, -0.4],
  [0, 0.38, -0.3],
  [0, 0.16, -0.17],
  [0, -0.04, -0.09],
];

/** A simple hand for small figures (a mitt with a thumb). */
export const HAND_MITT: readonly Pt[] = [
  [0, -0.02, 0.09],
  [0, 0.3, 0.17],
  [0, 0.72, 0.16],
  [0, 0.96, 0.11, 1],
  [0, 1.05, 0.03],
  [0, 0.98, -0.08, 1],
  [0, 0.7, -0.16],
  [0, 0.52, -0.2],
  [0, 0.68, -0.27, 1],
  [0, 0.42, -0.24],
  [0, 0.16, -0.14],
  [0, -0.02, -0.09],
];

/** A closed hand: knuckles square at the end, a thumb across them. */
export const HAND_FIST: readonly Pt[] = [
  [0, -0.04, 0.1],
  [0, 0.28, 0.2],
  [0, 0.62, 0.24],
  [0, 0.86, 0.2, 1],
  [0, 0.9, 0.0],
  [0, 0.86, -0.2, 1],
  [0, 0.6, -0.26],
  [0, 0.3, -0.22],
  [0, -0.04, -0.1],
];

/**
 * A dead hand grabbing at the viewer: we look into the cupped palm, the fingers hooked around it
 * with their tips coming at us. Bone = wrist toward the tips; n > 0 toward the body's centre when
 * the arm comes up. Short on purpose: the fingers point at the camera, so they foreshorten.
 */
export const HAND_SPLAY: readonly Pt[] = [
  [0, -0.04, -0.13],
  [0, 0.2, -0.27],
  [0, 0.44, -0.37],
  [0, 0.78, -0.46],
  [0, 0.9, -0.42, 1],
  [0, 0.76, -0.31],
  [0, 0.54, -0.24, 1],
  [0, 1.0, -0.3],
  [0, 1.12, -0.23, 1],
  [0, 1.02, -0.14],
  [0, 0.6, -0.07, 1],
  [0, 1.12, -0.08],
  [0, 1.22, 0.01, 1],
  [0, 1.12, 0.1],
  [0, 0.6, 0.12, 1],
  [0, 1.02, 0.17],
  [0, 1.1, 0.27, 1],
  [0, 0.96, 0.33],
  [0, 0.52, 0.28, 1],
  [0, 0.42, 0.36],
  [0, 0.56, 0.54],
  [0, 0.48, 0.62, 1],
  [0, 0.34, 0.53],
  [0, 0.24, 0.36],
  [0, 0.14, 0.26],
  [0, -0.04, 0.13],
];

// ─── Feet: drawn around the ankle, on the foot's own frame (a up, n forward / outward in hu) ─

/** A work boot from the front: blunt high toe, thick sole. */
export const BOOT_F: readonly Pt[] = [
  [0, 0.2, 0.28],
  [0, 0.02, 0.33],
  [0, -0.12, 0.39],
  [0, -0.22, 0.4],
  [0, -0.3, 0.36],
  [0, -0.34, 0.3, 1],
  [0, -0.34, -0.3, 1],
  [0, -0.3, -0.36],
  [0, -0.22, -0.4],
  [0, -0.12, -0.39],
  [0, 0.02, -0.33],
  [0, 0.2, -0.28],
];

/** A work boot from the side: heel with a stepped notch, a sole 4 or 5 texels thick at 180, a blunt high toe. */
export const BOOT_S: readonly Pt[] = [
  [0, 0.22, -0.3],
  [0, 0.22, 0.26],
  [0, 0.06, 0.36],
  [0, -0.01, 0.6],
  [0, -0.04, 0.8],
  [0, -0.11, 0.92],
  [0, -0.2, 0.94],
  [0, -0.24, 0.87, 1],
  [0, -0.34, 0.84, 1],
  [0, -0.34, 0.2, 1],
  [0, -0.27, 0.15, 1],
  [0, -0.27, 0.02, 1],
  [0, -0.34, -0.02, 1],
  [0, -0.34, -0.34, 1],
  [0, -0.18, -0.36],
];

/** Three-quarter: the toe cap coming toward the viewer and out. */
export const BOOT_Q: readonly Pt[] = [
  [0, 0.22, -0.28],
  [0, 0.2, 0.26],
  [0, 0.02, 0.34],
  [0, -0.06, 0.52],
  [0, -0.14, 0.64],
  [0, -0.24, 0.66],
  [0, -0.34, 0.58, 1],
  [0, -0.34, -0.28, 1],
  [0, -0.18, -0.32],
];

/** A low canvas sneaker, side: rounded toe, a fat white sole. */
export const SHOE_S: readonly Pt[] = [
  [0, 0.14, -0.28],
  [0, 0.14, 0.2],
  [0, 0.02, 0.34],
  [0, -0.08, 0.62],
  [0, -0.16, 0.8],
  [0, -0.24, 0.84],
  [0, -0.34, 0.8, 1],
  [0, -0.34, -0.3, 1],
  [0, -0.2, -0.34],
];

export const SHOE_F: readonly Pt[] = [
  [0, 0.14, 0.24],
  [0, -0.04, 0.3],
  [0, -0.18, 0.34],
  [0, -0.3, 0.32],
  [0, -0.34, 0.26, 1],
  [0, -0.34, -0.26, 1],
  [0, -0.3, -0.32],
  [0, -0.18, -0.34],
  [0, -0.04, -0.3],
  [0, 0.14, -0.24],
];

export const SHOE_Q: readonly Pt[] = [
  [0, 0.14, -0.28],
  [0, 0.14, 0.22],
  [0, 0.0, 0.32],
  [0, -0.1, 0.5],
  [0, -0.22, 0.58],
  [0, -0.34, 0.54, 1],
  [0, -0.34, -0.28, 1],
  [0, -0.18, -0.32],
];

// ─── The trunk: a chest frame, a waist frame and a pelvis frame (a up, n screen right) ─

const P = 0;
const W = 1;
const C = 2;
/** Maps table bones 0 / 1 / 2 to pelvis, waist, chest. */
export const TRUNK_MAP = [B.pelvis, B.waist, B.chest] as const;

/** Front: traps sloping into the shoulders, ribcage, waist, the shirt's hem over the hips. */
export const TRUNK_F: readonly Pt[] = [
  [C, 0.44, 0.18],
  [C, 0.38, 0.36],
  [C, 0.26, 0.6],
  [C, 0.02, 0.66],
  [C, -0.28, 0.62],
  [C, -0.54, 0.52],
  [W, -0.02, 0.47],
  [P, 0.3, 0.55],
  [P, 0.08, 0.64],
  [P, -0.16, 0.62, 1],
  [P, -0.16, -0.62, 1],
  [P, 0.08, -0.64],
  [P, 0.3, -0.55],
  [W, -0.02, -0.47],
  [C, -0.54, -0.52],
  [C, -0.28, -0.62],
  [C, 0.02, -0.66],
  [C, 0.26, -0.6],
  [C, 0.38, -0.36],
  [C, 0.44, -0.18],
];

export const TRUNK_Q: readonly Pt[] = [
  [C, 0.5, 0.18],
  [C, 0.4, 0.4],
  [C, 0.22, 0.6],
  [C, -0.04, 0.6],
  [C, -0.32, 0.54],
  [C, -0.55, 0.43],
  [W, -0.02, 0.37],
  [P, 0.3, 0.4],
  [P, 0.08, 0.47],
  [P, -0.16, 0.45, 1],
  [P, -0.16, -0.5, 1],
  [P, 0.08, -0.58],
  [P, 0.3, -0.5],
  [W, -0.02, -0.48],
  [C, -0.55, -0.55],
  [C, -0.28, -0.66],
  [C, 0.04, -0.7],
  [C, 0.26, -0.64],
  [C, 0.4, -0.36],
  [C, 0.5, -0.12],
];

/** Side: the chest forward, the shoulder blade, the small of the back, the belly over the belt. */
export const TRUNK_S: readonly Pt[] = [
  [C, 0.52, 0.08],
  [C, 0.46, 0.26],
  [C, 0.2, 0.42],
  [C, -0.16, 0.44],
  [C, -0.46, 0.36],
  [W, 0.0, 0.3],
  [P, 0.3, 0.3],
  [P, 0.12, 0.34],
  [P, -0.14, 0.32, 1],
  [P, -0.14, -0.4, 1],
  [P, 0.08, -0.44],
  [P, 0.3, -0.34],
  [W, 0.0, -0.3],
  [C, -0.46, -0.38],
  [C, -0.14, -0.46],
  [C, 0.2, -0.46],
  [C, 0.44, -0.28],
  [C, 0.54, -0.1],
];

/** Pelvis / seat of the jeans, front: a mass of its own below the waist. */
export const PELVIS_F: readonly Pt[] = [
  [0, 0.42, 0.55],
  [0, 0.18, 0.65],
  [0, -0.08, 0.66],
  [0, -0.34, 0.56],
  [0, -0.42, 0.2],
  [0, -0.36, 0.0, 1],
  [0, -0.42, -0.2],
  [0, -0.34, -0.56],
  [0, -0.08, -0.66],
  [0, 0.18, -0.65],
  [0, 0.42, -0.55],
];

export const PELVIS_Q: readonly Pt[] = [
  [0, 0.42, 0.42],
  [0, 0.15, 0.5],
  [0, -0.12, 0.5],
  [0, -0.36, 0.4],
  [0, -0.42, 0.1],
  [0, -0.36, -0.1],
  [0, -0.36, -0.42],
  [0, -0.12, -0.6],
  [0, 0.15, -0.6],
  [0, 0.42, -0.52],
];

/** Side: the seat behind, the thigh in front. */
export const PELVIS_S: readonly Pt[] = [
  [0, 0.42, 0.28],
  [0, 0.15, 0.36],
  [0, -0.15, 0.36],
  [0, -0.4, 0.3],
  [0, -0.42, -0.2],
  [0, -0.28, -0.42],
  [0, -0.02, -0.5],
  [0, 0.25, -0.46],
  [0, 0.42, -0.34],
];

/** Neck, a tapered column that widens into the traps. */
export const NECK_F: readonly Pt[] = [
  [0, -0.2, 0.42],
  [0, 0.0, 0.27],
  [0, 0.3, 0.235],
  [0, 0.42, 0.2],
  [0, 0.42, -0.2],
  [0, 0.3, -0.235],
  [0, 0.0, -0.27],
  [0, -0.2, -0.42],
];

// ─── Form: the shapes that turn a flat fill into a mass (bone, along, near edge, far edge) ─
// Rows are read on the side the shape belongs to (toward the light or away from it). Shapes
// follow the anatomy under the cloth; none of them is a band the whole length of a limb.

export type BandRow = readonly [number, number, number, number];

/** The top plane of the thigh, the knee cap, the shin plane. */
export const THIGH_LIT: readonly BandRow[] = [
  [0, 0.12, 0.12, 0.3],
  [0, 0.3, 0.1, 0.33],
  [0, 0.52, 0.1, 0.27],
  [0, 0.7, 0.05, 0.15],
];
export const THIGH_ACCENT: readonly BandRow[] = [
  [0, 0.3, 0.16, 0.26],
  [0, 0.38, 0.17, 0.27],
  [0, 0.46, 0.16, 0.24],
];
export const KNEE_LIT: readonly BandRow[] = [
  [0, 0.92, -0.05, 0.17],
  [1, 0.02, -0.09, 0.19],
  [1, 0.1, -0.05, 0.15],
];
export const SHIN_LIT: readonly BandRow[] = [
  [1, 0.2, 0.03, 0.2],
  [1, 0.42, 0.06, 0.2],
  [1, 0.7, 0.04, 0.13],
  [1, 0.88, 0.02, 0.08],
];
/** Core shadow at the turn of the form; the strip outside it stays a tone lighter (reflected light). */
export const LEG_CORE: readonly BandRow[] = [
  [0, 0.08, 0.22, 0.31],
  [0, 0.48, 0.17, 0.26],
  [0, 0.84, 0.13, 0.19],
  [1, 0.16, 0.12, 0.18],
  [1, 0.5, 0.11, 0.17],
  [1, 0.86, 0.09, 0.13],
];

/** The deltoid, the outer forearm. */
export const DELTOID_LIT: readonly BandRow[] = [
  [0, 0.04, 0.06, 0.24],
  [0, 0.16, 0.06, 0.28],
  [0, 0.34, 0.08, 0.18],
];
export const FOREARM_LIT: readonly BandRow[] = [
  [1, 0.1, 0.03, 0.17],
  [1, 0.32, 0.04, 0.18],
  [1, 0.66, 0.02, 0.12],
];
export const ARM_CORE: readonly BandRow[] = [
  [0, 0.3, 0.09, 0.16],
  [0, 0.62, 0.08, 0.13],
  [0, 0.92, 0.07, 0.12],
  [1, 0.1, 0.06, 0.13],
  [1, 0.36, 0.05, 0.11],
];
