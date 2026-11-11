import { B, type Draw, type Pt } from './figure';
import { R } from './palette';
import type { ViewId } from './skeleton';

/**
 * DRAWN FIGURES: heads, drawn per view. The skull, jaw, nose and ears are in the outline; features
 * are shapes at the two sizes the player reads, and plain texels below that (a face at 10 texels
 * is three decisions: two eyes and a mouth).
 */

const PARTH = 1;

/** Which texels a head paints with: the drawing groups of the figure. */
export interface HeadGroups {
  head: number;
  hair: number;
  hat: number;
  ear: number;
}

export interface HeadSpec {
  skin: number;
  dead: boolean;
  hair: number;
  /** Hard hat colour ramp, or −1. */
  hat: number;
  /** Jaw 0 shut … 1 hanging open. */
  jaw: number;
  /** Bone of the head frame (B.head). */
}

/** Skull, cheek, jaw and chin, front: wider across the cheekbones than at the temple. */
const HEAD_F: readonly Pt[] = [
  [0, 0.5, 0.0],
  [0, 0.44, 0.24],
  [0, 0.27, 0.37],
  [0, 0.05, 0.4],
  [0, -0.14, 0.36],
  [0, -0.3, 0.3],
  [0, -0.42, 0.18],
  [0, -0.5, 0.06],
  [0, -0.5, -0.06],
  [0, -0.42, -0.18],
  [0, -0.3, -0.3],
  [0, -0.14, -0.36],
  [0, 0.05, -0.4],
  [0, 0.27, -0.37],
  [0, 0.44, -0.24],
];

/** Three-quarter (facing screen right): nose and brow on the outline, the far cheek cut in. */
const HEAD_Q: readonly Pt[] = [
  [0, 0.5, -0.04],
  [0, 0.42, 0.2],
  [0, 0.26, 0.33],
  [0, 0.1, 0.34],
  [0, 0.02, 0.4], // bridge → tip
  [0, -0.1, 0.41],
  [0, -0.2, 0.34],
  [0, -0.3, 0.34],
  [0, -0.44, 0.2],
  [0, -0.5, 0.06],
  [0, -0.46, -0.1],
  [0, -0.3, -0.3],
  [0, -0.05, -0.44],
  [0, 0.2, -0.42],
  [0, 0.42, -0.26],
];

/** Profile (facing screen right): forehead, nose, lips, chin; the jaw goes up to the ear; the skull behind. */
const HEAD_S: readonly Pt[] = [
  [0, 0.48, -0.12],
  [0, 0.44, 0.12],
  [0, 0.3, 0.28],
  [0, 0.16, 0.3],
  [0, 0.02, 0.34],
  [0, -0.1, 0.45], // nose tip
  [0, -0.18, 0.36],
  [0, -0.28, 0.36], // upper lip
  [0, -0.34, 0.31],
  [0, -0.42, 0.33], // chin front
  [0, -0.5, 0.25],
  [0, -0.48, 0.06],
  [0, -0.3, -0.14],
  [0, -0.14, -0.32],
  [0, 0.08, -0.46],
  [0, 0.3, -0.38],
];

/** The back of a head (3/4 back and back): just the skull and the jaw's corners. */
const HEAD_B: readonly Pt[] = [
  [0, 0.5, 0.0],
  [0, 0.45, 0.26],
  [0, 0.25, 0.4],
  [0, 0.0, 0.42],
  [0, -0.22, 0.36],
  [0, -0.42, 0.18],
  [0, -0.5, 0.0],
  [0, -0.42, -0.18],
  [0, -0.22, -0.36],
  [0, 0.0, -0.42],
  [0, 0.25, -0.4],
  [0, 0.45, -0.26],
];

function outline(d: Draw, tbl: readonly Pt[], ramp: number, g: HeadGroups) {
  d.pen.begin();
  d.pts(tbl, [B.head]);
  d.pen.fill(ramp, 3, PARTH, g.head, -2);
}

function poly(d: Draw, ...p: number[]) {
  d.pen.begin();
  for (let i = 0; i < p.length; i += 2) d.pt(B.head, p[i], p[i + 1]);
}

/** Shadow on the away side of the head and under the chin plane. */
function faceShade(d: Draw, g: HeadGroups, view: ViewId) {
  const pen = d.pen;
  if (view === 2) {
    poly(d, 0.46, 0.2, 0.2, 0.1, -0.16, 0.1, -0.5, 0.14, -0.52, 0.5, 0.46, 0.5);
    pen.shade(g.head, -1);
  } else if (view === 0 || view === 4) {
    poly(d, 0.44, 0.17, 0.12, 0.2, -0.2, 0.14, -0.52, 0.06, -0.52, 0.52, 0.44, 0.52);
    pen.shade(g.head, -1);
  } else {
    poly(d, 0.44, 0.08, 0.15, 0.14, -0.2, 0.16, -0.52, 0.08, -0.52, 0.56, 0.44, 0.56);
    pen.shade(g.head, -1);
  }
}

// ─── Faces ────────────────────────────────────────────────────────────────

function deadFace(d: Draw, s: HeadSpec, g: HeadGroups, view: ViewId) {
  const pen = d.pen;
  const lod = d.lod;
  const skin = s.skin;
  // n of the two eyes and the mouth on this view.
  const near = view === 0 ? -0.17 : view === 1 ? -0.0 : 0.22;
  const far = view === 0 ? 0.17 : view === 1 ? 0.28 : 99;
  const mid = view === 0 ? 0 : view === 1 ? 0.16 : 0.3;
  const lowLod = lod <= 1;
  const eye = (n: number, wide: number) => {
    if (lowLod) {
      const x = Math.floor(d.px(B.head, 0.02, n));
      const y = Math.floor(d.py(B.head, 0.02, n));
      pen.plot(x, y, g.head, 0, skin, 1);
      pen.plot(x + 1, y, g.head, 0, skin, 1);
      if (lod === 1) pen.plot(x, y, g.head, 0, R.eyeGlow, 4);
      return;
    }
    // Sunken socket under a heavy brow, with the light of a pin in it.
    poly(d, 0.11, n - wide, 0.1, n + wide, -0.03, n + wide * 0.95, -0.07, n - wide * 0.9);
    pen.shade(g.head, 0, skin, 1);
    poly(d, 0.2, n - wide * 1.1, 0.15, n + wide * 1.05, 0.1, n + wide, 0.12, n - wide * 1.1);
    pen.shade(g.head, 0, skin, 2);
    const ex = d.px(B.head, 0.02, n);
    const ey = d.py(B.head, 0.02, n);
    pen.plot(Math.floor(ex), Math.floor(ey), g.head, 0, R.eyeGlow, 4);
    if (lod >= 3) pen.plot(Math.floor(ex) + 1, Math.floor(ey), g.head, 0, R.eyeGlow, 5);
  };
  eye(near, view === 2 ? 0.1 : 0.13);
  if (far < 5) eye(far, view === 1 ? 0.1 : 0.13);
  // Nose and cheek hollows.
  if (lod >= 1 && view !== 2) {
    poly(d, -0.08, mid + 0.04, -0.2, mid + 0.06, -0.21, mid - 0.09, -0.09, mid - 0.07);
    pen.shade(g.head, 0, skin, 2);
  }
  if (lod >= 2) {
    // Hollow cheek under the eye.
    poly(d, -0.12, near - 0.14, -0.3, near - 0.1, -0.28, near + 0.1);
    pen.shade(g.head, -1);
  }
  // The jaw hangs open: lips, a dark mouth, top teeth.
  if (lod === 0) {
    const x = Math.floor(d.px(B.head, -0.3, mid));
    const y = Math.floor(d.py(B.head, -0.3, mid));
    pen.plot(x, y, g.head, 0, R.blood, 1);
    pen.plot(x, y + 1, g.head, 0, R.blood, 1);
    pen.plot(x - 1, y, g.head, 0, R.blood, 1);
    return;
  }
  const j = 0.14 + s.jaw * 0.13;
  const w = view === 2 ? 0.15 : view === 1 ? 0.16 : 0.2;
  poly(d, -0.23, mid + w, -0.23 - j, mid + w * 0.8, -0.26 - j, mid - w * 0.8, -0.23, mid - w);
  pen.shade(g.head, 0, R.blood, 1);
  if (lod >= 2 && view !== 2) {
    // Teeth, set in the dark.
    const n = 5;
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n;
      const a = mid + w * 0.85 - t * w * 1.7;
      if (i % 2 === 0) {
        poly(d, -0.24, a - 0.03, -0.24, a + 0.03, -0.31, a + 0.025, -0.31, a - 0.025);
        pen.shade(g.head, 0, R.teeth, 3);
      }
    }
  } else if (lod === 1 && view !== 2) {
    const x = Math.floor(d.px(B.head, -0.25, mid));
    const y = Math.floor(d.py(B.head, -0.25, mid));
    pen.plot(x, y, g.head, 0, R.teeth, 4);
  } else if (view === 2) {
    poly(d, -0.26, 0.29, -0.26, 0.37, -0.33, 0.36, -0.33, 0.28);
    pen.shade(g.head, 0, R.teeth, 3);
  }
  if (lod >= 2) {
    // Blood out of the corner of the mouth, down the jaw.
    poly(d, -0.28, mid + w * 0.8, -0.32, mid + w * 1.05, -0.54, mid + w * 0.9, -0.52, mid + w * 0.55);
    pen.shade(g.head, 0, R.blood, 2);
  }
}

function liveFace(d: Draw, s: HeadSpec, g: HeadGroups, view: ViewId) {
  const pen = d.pen;
  const lod = d.lod;
  const near = view === 0 ? -0.17 : view === 1 ? -0.0 : 0.2;
  const far = view === 0 ? 0.17 : view === 1 ? 0.27 : 99;
  const mid = view === 0 ? 0 : view === 1 ? 0.15 : 0.32;
  const eye = (n: number, wide: number) => {
    if (lod === 0) {
      pen.plot(Math.floor(d.px(B.head, 0.04, n)), Math.floor(d.py(B.head, 0.04, n)), g.head, 0, R.hairDark, 1);
      return;
    }
    // A white, a pupil looking at the player, a brow lifted with fear.
    poly(d, 0.065, n - wide, 0.065, n + wide, -0.015, n + wide, -0.02, n - wide);
    pen.shade(g.head, 0, R.white, 4);
    const ex = d.px(B.head, 0.02, n + wide * 0.1);
    const ey = d.py(B.head, 0.02, n + wide * 0.1);
    pen.plot(Math.floor(ex), Math.floor(ey), g.head, 0, R.hairDark, 1);
    if (lod >= 2) {
      pen.plot(Math.floor(ex) + 1, Math.floor(ey), g.head, 0, R.hairDark, 1);
      // Upper lid.
      poly(d, 0.08, n - wide * 1.1, 0.08, n + wide * 1.1, 0.06, n + wide * 1.05, 0.06, n - wide);
      pen.shade(g.head, 0, s.skin, 2);
    }
    if (lod >= 1) {
      poly(d, 0.16, n - wide * 1.2, 0.2, n + wide * 1.2, 0.17, n + wide * 1.25, 0.12, n - wide * 1.2);
      pen.shade(g.head, 0, R.hairDark, 2);
    }
  };
  eye(near, view === 2 ? 0.07 : 0.09);
  if (far < 5) eye(far, view === 1 ? 0.065 : 0.09);
  if (lod >= 1 && view !== 2) {
    poly(d, -0.08, mid + 0.07, -0.21, mid + 0.07, -0.21, mid - 0.07, -0.09, mid - 0.07);
    pen.shade(g.head, -1);
  }
  // The mouth: open, gasping.
  const w = view === 1 ? 0.12 : 0.15;
  if (lod === 0) {
    const x = Math.floor(d.px(B.head, -0.3, mid));
    const y = Math.floor(d.py(B.head, -0.3, mid));
    pen.plot(x, y, g.head, 0, R.blood, 1);
    pen.plot(x - 1, y, g.head, 0, R.blood, 1);
    return;
  }
  poly(d, -0.28, mid + w * 0.75, -0.35, mid + w * 0.55, -0.35, mid - w * 0.55, -0.28, mid - w * 0.75);
  pen.shade(g.head, 0, R.blood, 1);
  if (lod >= 2) {
    poly(d, -0.275, mid + w * 0.62, -0.275, mid - w * 0.62, -0.3, mid - w * 0.5, -0.3, mid + w * 0.5);
    pen.shade(g.head, 0, R.teeth, 4);
  }
}

function ear(d: Draw, skin: number, g: HeadGroups, n: number, outer: number) {
  const pen = d.pen;
  pen.begin();
  d.pt(B.head, 0.14, n);
  d.pt(B.head, 0.16, n + outer);
  d.pt(B.head, -0.06, n + outer * 1.05);
  d.pt(B.head, -0.16, n);
  pen.fill(skin, 3, PARTH, g.ear, 0);
  if (d.lod >= 2) {
    poly(d, 0.08, n + outer * 0.2, 0.09, n + outer * 0.65, -0.05, n + outer * 0.65, -0.1, n + outer * 0.2);
    pen.shade(g.ear, -1);
  }
}

/** Short hair from the front: fringe shape with a parting. */
function hairShape(d: Draw, g: HeadGroups, ramp: number, view: ViewId) {
  const pen = d.pen;
  pen.begin();
  if (view === 0) {
    d.pt(B.head, 0.54, 0.02);
    d.pt(B.head, 0.48, 0.28);
    d.pt(B.head, 0.3, 0.42);
    d.pt(B.head, 0.1, 0.43);
    d.pt(B.head, 0.14, 0.32, true);
    d.pt(B.head, 0.3, 0.1);
    d.pt(B.head, 0.32, -0.06);
    d.pt(B.head, 0.18, -0.3);
    d.pt(B.head, 0.12, -0.42);
    d.pt(B.head, 0.3, -0.42);
    d.pt(B.head, 0.48, -0.28);
  } else if (view === 1) {
    d.pt(B.head, 0.54, 0.0);
    d.pt(B.head, 0.46, 0.22);
    d.pt(B.head, 0.32, 0.34);
    d.pt(B.head, 0.24, 0.3);
    d.pt(B.head, 0.3, 0.1);
    d.pt(B.head, 0.14, -0.12);
    d.pt(B.head, 0.04, -0.38);
    d.pt(B.head, 0.26, -0.5);
    d.pt(B.head, 0.46, -0.3);
  } else if (view === 2) {
    d.pt(B.head, 0.53, 0.02);
    d.pt(B.head, 0.45, 0.2);
    d.pt(B.head, 0.32, 0.3);
    d.pt(B.head, 0.35, 0.06);
    d.pt(B.head, 0.12, -0.02);
    d.pt(B.head, -0.14, -0.26);
    d.pt(B.head, -0.32, -0.42);
    d.pt(B.head, -0.12, -0.5);
    d.pt(B.head, 0.1, -0.5);
    d.pt(B.head, 0.36, -0.42);
  } else if (view === 3) {
    // Three-quarter back: the back of the head, hair down to the nape.
    d.pt(B.head, 0.54, 0.02);
    d.pt(B.head, 0.46, 0.28);
    d.pt(B.head, 0.2, 0.4);
    d.pt(B.head, -0.08, 0.34);
    d.pt(B.head, -0.26, 0.14);
    d.pt(B.head, -0.3, -0.2);
    d.pt(B.head, -0.06, -0.48);
    d.pt(B.head, 0.3, -0.46);
    d.pt(B.head, 0.48, -0.26);
  } else {
    d.pt(B.head, 0.54, 0.02);
    d.pt(B.head, 0.48, 0.28);
    d.pt(B.head, 0.25, 0.43);
    d.pt(B.head, -0.1, 0.42);
    d.pt(B.head, -0.3, 0.22);
    d.pt(B.head, -0.36, 0.0);
    d.pt(B.head, -0.3, -0.22);
    d.pt(B.head, -0.1, -0.42);
    d.pt(B.head, 0.25, -0.43);
    d.pt(B.head, 0.48, -0.28);
  }
  pen.fill(ramp, 3, PARTH, g.hair, -1);
  // A band of light on the crown.
  if (d.lod >= 1) {
    poly(d, 0.5, -0.16, 0.42, 0.04, 0.32, 0.1, 0.34, -0.16);
    pen.shade(g.hair, 1);
  }
  if (d.lod >= 2) {
    poly(d, 0.3, 0.38, 0.1, 0.42, 0.06, 0.2, 0.26, 0.24);
    pen.shade(g.hair, -1);
  }
}

function hardHat(d: Draw, g: HeadGroups, view: ViewId, ramp: number) {
  const pen = d.pen;
  pen.begin();
  if (view === 2) {
    // Profile: dome, ridge, the brim out front.
    d.pt(B.head, 0.6, -0.1);
    d.pt(B.head, 0.56, 0.18);
    d.pt(B.head, 0.34, 0.38);
    d.pt(B.head, 0.22, 0.42, true);
    d.pt(B.head, 0.2, 0.58, true);
    d.pt(B.head, 0.1, 0.56, true);
    d.pt(B.head, 0.12, 0.32, true);
    d.pt(B.head, 0.16, -0.46, true);
    d.pt(B.head, 0.42, -0.42);
  } else if (view === 1) {
    d.pt(B.head, 0.6, 0.02);
    d.pt(B.head, 0.54, 0.22);
    d.pt(B.head, 0.34, 0.4);
    d.pt(B.head, 0.24, 0.42, true);
    d.pt(B.head, 0.2, 0.54, true);
    d.pt(B.head, 0.1, 0.52, true);
    d.pt(B.head, 0.12, 0.32);
    d.pt(B.head, 0.16, -0.48, true);
    d.pt(B.head, 0.42, -0.4);
  } else if (view === 3 || view === 4) {
    // From behind: the brim's back edge curving round.
    d.pt(B.head, 0.6, 0.0);
    d.pt(B.head, 0.54, 0.26);
    d.pt(B.head, 0.32, 0.42);
    d.pt(B.head, 0.16, 0.46, true);
    d.pt(B.head, 0.1, 0.0);
    d.pt(B.head, 0.16, -0.46, true);
    d.pt(B.head, 0.32, -0.42);
    d.pt(B.head, 0.54, -0.26);
  } else {
    d.pt(B.head, 0.6, 0.0);
    d.pt(B.head, 0.54, 0.26);
    d.pt(B.head, 0.3, 0.42);
    d.pt(B.head, 0.2, 0.46, true);
    d.pt(B.head, 0.12, 0.54, true);
    d.pt(B.head, 0.08, 0.0);
    d.pt(B.head, 0.12, -0.54, true);
    d.pt(B.head, 0.2, -0.46, true);
    d.pt(B.head, 0.3, -0.42);
    d.pt(B.head, 0.54, -0.26);
  }
  pen.fill(ramp, 3, PARTH, g.hat, -2);
  // Shadow on the away side of the dome.
  poly(d, 0.62, 0.22, 0.3, 0.24, 0.14, 0.2, 0.08, 0.7, 0.7, 0.7);
  pen.shade(g.hat, -1);
  if (d.lod >= 1) {
    // Shine, and the crown ridge a shell has.
    poly(d, 0.58, -0.12, 0.4, -0.34, 0.33, -0.28, 0.5, -0.06);
    pen.shade(g.hat, 1);
    if (d.lod >= 2) {
      poly(d, 0.61, -0.02, 0.2, -0.02, 0.2, 0.05, 0.61, 0.05);
      pen.shade(g.hat, -1);
    }
  }
}

/** Paints the head for the view. */
export function paintHead(d: Draw, s: HeadSpec, g: HeadGroups, view: ViewId) {
  const tbl = view === 0 ? HEAD_F : view === 1 ? HEAD_Q : view === 2 ? HEAD_S : HEAD_B;
  // Ears (behind the skull's outline where the view shows one).
  if (d.lod >= 1) {
    if (view === 0) {
      ear(d, s.skin, g, 0.38, 0.1);
      ear(d, s.skin, g, -0.38, -0.1);
    } else if (view === 1) ear(d, s.skin, g, -0.22, -0.13);
    else if (view === 2) ear(d, s.skin, g, -0.2, -0.14);
    else if (view === 3) ear(d, s.skin, g, 0.34, 0.12);
    else {
      ear(d, s.skin, g, 0.4, 0.1);
      ear(d, s.skin, g, -0.4, -0.1);
    }
  }
  outline(d, tbl, s.skin, g);
  faceShade(d, g, view);
  if (view <= 2) {
    if (s.dead) deadFace(d, s, g, view);
    else liveFace(d, s, g, view);
  }
  if (s.hair >= 0) hairShape(d, g, s.hair, view);
  if (s.hat >= 0) hardHat(d, g, view, s.hat);
}
