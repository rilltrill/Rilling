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

/** Skull, cheek, jaw and chin, front: narrower at the temple than the cheekbone, the jaw tapering in. */
const HEAD_F: readonly Pt[] = [
  [0, 0.5, 0.0],
  [0, 0.44, 0.22],
  [0, 0.27, 0.32],
  [0, 0.05, 0.35],
  [0, -0.14, 0.32],
  [0, -0.3, 0.26],
  [0, -0.42, 0.16],
  [0, -0.5, 0.05],
  [0, -0.5, -0.05],
  [0, -0.42, -0.16],
  [0, -0.3, -0.26],
  [0, -0.14, -0.32],
  [0, 0.05, -0.35],
  [0, 0.27, -0.32],
  [0, 0.44, -0.22],
];

/** The same with the jaw hanging: a chin of its own below the mouth. */
const HEAD_F_SLACK: readonly Pt[] = [
  [0, 0.5, 0.0],
  [0, 0.44, 0.22],
  [0, 0.27, 0.32],
  [0, 0.05, 0.35],
  [0, -0.14, 0.32],
  [0, -0.28, 0.27],
  [0, -0.44, 0.2],
  [0, -0.58, 0.15],
  [0, -0.67, 0.05],
  [0, -0.67, -0.05],
  [0, -0.58, -0.15],
  [0, -0.44, -0.2],
  [0, -0.28, -0.27],
  [0, -0.14, -0.32],
  [0, 0.05, -0.35],
  [0, 0.27, -0.32],
  [0, 0.44, -0.22],
];

/** Three-quarter (facing screen right): nose and brow on the outline, the far cheek cut in. */
const HEAD_Q: readonly Pt[] = [
  [0, 0.5, -0.06],
  [0, 0.42, 0.17],
  [0, 0.26, 0.3],
  [0, 0.1, 0.31],
  [0, 0.02, 0.37],
  [0, -0.1, 0.38],
  [0, -0.2, 0.31],
  [0, -0.3, 0.31],
  [0, -0.44, 0.18],
  [0, -0.5, 0.05],
  [0, -0.46, -0.1],
  [0, -0.3, -0.28],
  [0, -0.05, -0.42],
  [0, 0.2, -0.42],
  [0, 0.42, -0.28],
];

const HEAD_Q_SLACK: readonly Pt[] = [
  [0, 0.5, -0.06],
  [0, 0.42, 0.17],
  [0, 0.26, 0.3],
  [0, 0.1, 0.31],
  [0, 0.02, 0.37],
  [0, -0.1, 0.38],
  [0, -0.2, 0.31],
  [0, -0.32, 0.32],
  [0, -0.48, 0.22],
  [0, -0.62, 0.16],
  [0, -0.68, 0.05],
  [0, -0.6, -0.08],
  [0, -0.42, -0.2],
  [0, -0.26, -0.3],
  [0, -0.05, -0.42],
  [0, 0.2, -0.42],
  [0, 0.42, -0.28],
];

/** Profile (facing screen right): forehead, nose, lips, chin; the jaw runs back to the ear under a real skull. */
const HEAD_S: readonly Pt[] = [
  [0, 0.5, -0.14],
  [0, 0.46, 0.1],
  [0, 0.3, 0.27],
  [0, 0.16, 0.3],
  [0, 0.02, 0.34],
  [0, -0.1, 0.46],
  [0, -0.18, 0.36],
  [0, -0.28, 0.37],
  [0, -0.34, 0.32],
  [0, -0.42, 0.34],
  [0, -0.52, 0.27],
  [0, -0.54, 0.1],
  [0, -0.46, -0.08],
  [0, -0.3, -0.24],
  [0, -0.14, -0.44],
  [0, 0.08, -0.62],
  [0, 0.3, -0.58],
  [0, 0.46, -0.38],
];

const HEAD_S_SLACK: readonly Pt[] = [
  [0, 0.5, -0.14],
  [0, 0.46, 0.1],
  [0, 0.3, 0.27],
  [0, 0.16, 0.3],
  [0, 0.02, 0.34],
  [0, -0.1, 0.46],
  [0, -0.18, 0.36],
  [0, -0.27, 0.36],
  [0, -0.33, 0.22],
  [0, -0.42, 0.2],
  [0, -0.5, 0.26],
  [0, -0.64, 0.24],
  [0, -0.7, 0.1],
  [0, -0.58, -0.04],
  [0, -0.4, -0.22],
  [0, -0.14, -0.44],
  [0, 0.08, -0.62],
  [0, 0.3, -0.58],
  [0, 0.46, -0.38],
];

/** The back of a head (3/4 back and back): the skull wider than the nape it tapers into. */
const HEAD_B: readonly Pt[] = [
  [0, 0.5, 0.0],
  [0, 0.45, 0.26],
  [0, 0.25, 0.39],
  [0, 0.02, 0.39],
  [0, -0.2, 0.3],
  [0, -0.38, 0.18],
  [0, -0.46, 0.08],
  [0, -0.46, -0.08],
  [0, -0.38, -0.18],
  [0, -0.2, -0.3],
  [0, 0.02, -0.39],
  [0, 0.25, -0.39],
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

/** Shadow on the away side of the head and under the chin plane; lit planes on the side toward the light. */
function faceForm(d: Draw, g: HeadGroups, view: ViewId) {
  const pen = d.pen;
  if (view === 2) {
    poly(d, 0.46, 0.08, 0.2, -0.02, -0.16, -0.06, -0.72, -0.02, -0.72, -0.7, 0.46, -0.7);
    pen.shade(g.head, -1);
    if (d.lod >= 1) {
      poly(d, 0.44, 0.0, 0.42, 0.2, 0.2, 0.27, 0.16, 0.12);
      pen.shade(g.head, 1);
      poly(d, -0.02, 0.13, -0.1, 0.36, -0.18, 0.3, -0.18, 0.12);
      pen.shade(g.head, 1);
    }
  } else if (view === 0 || view === 4) {
    poly(d, 0.44, 0.17, 0.12, 0.2, -0.2, 0.14, -0.74, 0.06, -0.74, 0.52, 0.44, 0.52);
    pen.shade(g.head, -1);
    if (d.lod >= 1) {
      poly(d, 0.42, -0.2, 0.44, 0.02, 0.25, 0.04, 0.2, -0.24);
      pen.shade(g.head, 1);
    }
  } else {
    poly(d, 0.44, 0.08, 0.15, 0.14, -0.2, 0.16, -0.74, 0.08, -0.74, 0.56, 0.44, 0.56);
    pen.shade(g.head, -1);
    if (d.lod >= 1) {
      poly(d, 0.42, -0.2, 0.44, 0.0, 0.25, 0.08, 0.2, -0.26);
      pen.shade(g.head, 1);
    }
  }
}

// ─── Faces ────────────────────────────────────────────────────────────────

function deadFace(d: Draw, s: HeadSpec, g: HeadGroups, view: ViewId) {
  const pen = d.pen;
  const lod = d.lod;
  const skin = s.skin;
  // n of the two eyes and the mouth on this view.
  const near = view === 0 ? -0.16 : view === 1 ? -0.02 : 0.22;
  const far = view === 0 ? 0.16 : view === 1 ? 0.24 : 99;
  const mid = view === 0 ? 0 : view === 1 ? 0.14 : 0.3;
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
    // A sunken socket under a heavy brow, with the light of a pin in it.
    poly(d, 0.11, n - wide, 0.11, n + wide, -0.05, n + wide * 0.9, -0.08, n - wide * 0.85);
    pen.shade(g.head, 0, skin, 1);
    poly(d, 0.22, n - wide * 1.2, 0.2, n + wide * 1.15, 0.12, n + wide, 0.13, n - wide * 1.15);
    pen.shade(g.head, 0, skin, 2);
    const ex = d.px(B.head, 0.02, n);
    const ey = d.py(B.head, 0.02, n);
    pen.plot(Math.floor(ex), Math.floor(ey), g.head, 0, R.eyeGlow, 4);
    if (lod >= 3) pen.plot(Math.floor(ex) + 1, Math.floor(ey), g.head, 0, R.eyeGlow, 5);
  };
  eye(near, view === 2 ? 0.1 : 0.1);
  if (far < 5) eye(far, view === 1 ? 0.08 : 0.1);
  if (lod >= 1 && view !== 2) {
    // The bridge stays skin between the sockets; a dark nasal cavity under it, the ridge catches light.
    poly(d, -0.12, mid + 0.06, -0.2, mid + 0.075, -0.21, mid - 0.075, -0.13, mid - 0.06);
    pen.shade(g.head, 0, skin, 1);
    if (lod >= 2) {
      poly(d, 0.12, mid - 0.045, 0.14, mid + 0.01, -0.12, mid + 0.03, -0.1, mid - 0.05);
      pen.shade(g.head, 1);
    }
  }
  if (lod >= 2) {
    // Hollow cheek under the eye; the cheekbone above it takes the light.
    poly(d, -0.16, near - 0.15, -0.3, near - 0.1, -0.28, near + 0.1);
    pen.shade(g.head, -1);
    poly(d, -0.02, near - 0.16, -0.06, near + 0.02, -0.15, near - 0.04, -0.16, near - 0.18);
    pen.shade(g.head, 1);
    poly(d, 0.21, near - 0.14, 0.22, near - 0.04, 0.17, near - 0.03, 0.17, near - 0.14);
    pen.shade(g.head, 2);
  }
  // The jaw hangs open: lips, a dark mouth, the upper teeth; a chin of skin below it.
  if (lod === 0) {
    const x = Math.floor(d.px(B.head, -0.34, mid));
    const y = Math.floor(d.py(B.head, -0.34, mid));
    pen.plot(x, y, g.head, 0, R.blood, 1);
    pen.plot(x, y + 1, g.head, 0, R.blood, 1);
    pen.plot(x - 1, y, g.head, 0, R.blood, 1);
    return;
  }
  const w = view === 2 ? 0.14 : view === 1 ? 0.16 : 0.19;
  const top = -0.27;
  const bot = -0.47;
  if (view === 2) {
    poly(d, top, 0.34, bot - 0.02, 0.2, bot - 0.03, 0.1, top - 0.04, 0.12, top + 0.02, 0.22);
    pen.shade(g.head, 0, R.blood, 1);
    if (lod >= 2) {
      // Upper teeth from the side; the lower lip line.
      poly(d, top - 0.02, 0.33, top - 0.02, 0.24, top - 0.08, 0.25, top - 0.08, 0.32);
      pen.shade(g.head, 0, R.teeth, 3);
    }
  } else {
    poly(d, top, mid + w, bot, mid + w * 0.72, bot - 0.02, mid - w * 0.72, top, mid - w);
    pen.shade(g.head, 0, R.blood, 1);
    if (lod >= 2) {
      // Irregular upper teeth, set in the dark: one texel apart, not squares in the middle of it.
      let n = mid - w * 0.82;
      const widths = lod >= 3 ? [2, 3, 2, 3, 2] : [2, 3, 2];
      const px = 1 / d.S;
      for (let i = 0; i < widths.length; i++) {
        const tw = widths[i] * px;
        const dip = i % 2 === 0 ? 0.07 : 0.1;
        poly(d, top - 0.01, n, top - 0.01, n + tw, top - dip, n + tw, top - dip, n);
        pen.shade(g.head, 0, R.teeth, i === 1 ? 4 : 3);
        n += tw + px;
      }
      // Lip line under the opening; the chin below takes the light.
      poly(d, bot - 0.02, mid - w * 0.7, bot - 0.02, mid + w * 0.7, bot - 0.06, mid + w * 0.62, bot - 0.06, mid - w * 0.62);
      pen.shade(g.head, 0, skin, 2);
      poly(d, -0.56, mid - 0.13, -0.56, mid + 0.02, -0.63, mid + 0.02, -0.63, mid - 0.1);
      pen.shade(g.head, 1);
      if (lod >= 3 && view === 0) {
        // The cheek is torn through on one side, up from the corner of the mouth.
        poly(d, top - 0.02, mid + w, -0.2, mid + w + 0.1, -0.32, mid + w + 0.08, -0.42, mid + w * 0.74);
        pen.shade(g.head, 0, R.blood, 1);
      }
    }
  }
  if (lod >= 2) {
    // Blood out of the corner of the mouth, down the jaw.
    poly(d, bot + 0.04, mid + w * 0.8, bot, mid + w * 1.02, -0.7, mid + w * 0.86, -0.7, mid + w * 0.55);
    pen.shade(g.head, 0, R.blood, 2);
  }
}

function liveFace(d: Draw, s: HeadSpec, g: HeadGroups, view: ViewId) {
  const pen = d.pen;
  const lod = d.lod;
  const near = view === 0 ? -0.16 : view === 1 ? -0.02 : 0.2;
  const far = view === 0 ? 0.16 : view === 1 ? 0.24 : 99;
  const mid = view === 0 ? 0 : view === 1 ? 0.13 : 0.32;
  const eye = (n: number, wide: number) => {
    if (lod === 0) {
      pen.plot(Math.floor(d.px(B.head, 0.04, n)), Math.floor(d.py(B.head, 0.04, n)), g.head, 0, R.hairDark, 1);
      return;
    }
    // A white, a pupil looking at the player, a brow lifted with fear.
    poly(d, 0.075, n - wide, 0.075, n + wide, -0.035, n + wide, -0.04, n - wide);
    pen.shade(g.head, 0, R.white, 4);
    const ex = d.px(B.head, 0.02, n + wide * 0.1);
    const ey = d.py(B.head, 0.02, n + wide * 0.1);
    pen.plot(Math.floor(ex), Math.floor(ey), g.head, 0, R.hairDark, 1);
    if (lod >= 2) {
      // A wide pupil, the whites showing round it: frightened, not sleepy.
      pen.plot(Math.floor(ex) + 1, Math.floor(ey), g.head, 0, R.hairDark, 1);
      pen.plot(Math.floor(ex), Math.floor(ey) + 1, g.head, 0, R.hairDark, 1);
      pen.plot(Math.floor(ex) + 1, Math.floor(ey) + 1, g.head, 0, R.hairDark, 1);
      // Upper lid.
      poly(d, 0.09, n - wide * 1.1, 0.09, n + wide * 1.1, 0.075, n + wide * 1.05, 0.075, n - wide);
      pen.shade(g.head, 0, s.skin, 2);
    }
    if (lod >= 1) {
      poly(d, 0.16, n - wide * 1.2, 0.2, n + wide * 1.2, 0.17, n + wide * 1.25, 0.12, n - wide * 1.2);
      pen.shade(g.head, 0, R.hairDark, 2);
    }
  };
  eye(near, view === 2 ? 0.07 : 0.085);
  if (far < 5) eye(far, view === 1 ? 0.065 : 0.085);
  if (lod >= 1 && view !== 2) {
    poly(d, -0.08, mid + 0.07, -0.21, mid + 0.07, -0.21, mid - 0.07, -0.09, mid - 0.07);
    pen.shade(g.head, -1);
    if (lod >= 2) {
      poly(d, 0.08, mid - 0.04, 0.08, mid + 0.02, -0.12, mid + 0.02, -0.12, mid - 0.05);
      pen.shade(g.head, 1);
      poly(d, -0.02, near - 0.14, -0.04, near + 0.02, -0.14, near - 0.02, -0.14, near - 0.16);
      pen.shade(g.head, 1);
    }
  }
  // The mouth: open, gasping.
  const w = view === 1 ? 0.1 : 0.15;
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
    // A row of teeth under the lip.
    const y0 = Math.floor(d.py(B.head, -0.29, mid));
    const x0 = Math.ceil(d.px(B.head, -0.29, mid - w * 0.5));
    const x1 = Math.floor(d.px(B.head, -0.29, mid + w * 0.5));
    for (let x = x0; x <= x1; x++) pen.plot(x, y0, g.head, 0, R.teeth, 4);
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

/** Short hair: a shape that breaks the outline, cut to the skull and ending at the nape. */
function hairShape(d: Draw, g: HeadGroups, ramp: number, view: ViewId) {
  const pen = d.pen;
  pen.begin();
  if (view === 0) {
    d.pt(B.head, 0.56, 0.02);
    d.pt(B.head, 0.62, 0.14, true);
    d.pt(B.head, 0.5, 0.25);
    d.pt(B.head, 0.3, 0.37);
    d.pt(B.head, 0.1, 0.38);
    d.pt(B.head, 0.14, 0.28, true);
    d.pt(B.head, 0.3, 0.08);
    d.pt(B.head, 0.32, -0.06);
    d.pt(B.head, 0.18, -0.26);
    d.pt(B.head, 0.12, -0.38);
    d.pt(B.head, 0.3, -0.37);
    d.pt(B.head, 0.48, -0.26);
    d.pt(B.head, 0.6, -0.12, true);
  } else if (view === 1) {
    d.pt(B.head, 0.56, 0.0);
    d.pt(B.head, 0.62, 0.1, true);
    d.pt(B.head, 0.46, 0.2);
    d.pt(B.head, 0.32, 0.32);
    d.pt(B.head, 0.24, 0.28);
    d.pt(B.head, 0.3, 0.1);
    d.pt(B.head, 0.14, -0.12);
    d.pt(B.head, 0.02, -0.38);
    d.pt(B.head, -0.2, -0.44);
    d.pt(B.head, -0.3, -0.34, true);
    d.pt(B.head, -0.06, -0.52);
    d.pt(B.head, 0.26, -0.5);
    d.pt(B.head, 0.46, -0.32);
  } else if (view === 2) {
    d.pt(B.head, 0.55, 0.02);
    d.pt(B.head, 0.6, 0.12, true);
    d.pt(B.head, 0.45, 0.2);
    d.pt(B.head, 0.32, 0.29);
    d.pt(B.head, 0.35, 0.06);
    d.pt(B.head, 0.14, -0.04);
    d.pt(B.head, -0.06, -0.18);
    d.pt(B.head, -0.24, -0.4);
    d.pt(B.head, -0.33, -0.54, true);
    d.pt(B.head, -0.12, -0.62);
    d.pt(B.head, 0.1, -0.68);
    d.pt(B.head, 0.34, -0.64);
    d.pt(B.head, 0.5, -0.42);
  } else if (view === 3) {
    // Three-quarter back: the back of the head, hair down to the nape.
    d.pt(B.head, 0.54, 0.02);
    d.pt(B.head, 0.46, 0.28);
    d.pt(B.head, 0.2, 0.4);
    d.pt(B.head, -0.08, 0.33);
    d.pt(B.head, -0.22, 0.14, true);
    d.pt(B.head, -0.3, 0.02);
    d.pt(B.head, -0.24, -0.08, true);
    d.pt(B.head, -0.34, -0.2);
    d.pt(B.head, -0.06, -0.46);
    d.pt(B.head, 0.3, -0.46);
    d.pt(B.head, 0.48, -0.26);
  } else {
    // Back: over the skull, a ragged line at the nape.
    d.pt(B.head, 0.54, 0.02);
    d.pt(B.head, 0.48, 0.28);
    d.pt(B.head, 0.25, 0.43);
    d.pt(B.head, -0.04, 0.4);
    d.pt(B.head, -0.26, 0.26, true);
    d.pt(B.head, -0.3, 0.16);
    d.pt(B.head, -0.25, 0.08, true);
    d.pt(B.head, -0.36, -0.02);
    d.pt(B.head, -0.27, -0.12, true);
    d.pt(B.head, -0.31, -0.2);
    d.pt(B.head, -0.25, -0.28, true);
    d.pt(B.head, -0.04, -0.4);
    d.pt(B.head, 0.25, -0.43);
    d.pt(B.head, 0.48, -0.28);
  }
  pen.fill(ramp, 3, PARTH, g.hair, -1);
  // A band of light on the crown, clumps in the highlight tone.
  if (d.lod >= 1) {
    poly(d, 0.5, -0.16, 0.42, 0.04, 0.32, 0.1, 0.34, -0.16);
    pen.shade(g.hair, 1);
    if (d.lod >= 2) {
      poly(d, 0.2, -0.3, 0.24, -0.14, 0.1, -0.12, 0.06, -0.28);
      pen.shade(g.hair, 1);
    }
  }
  if (d.lod >= 2) {
    poly(d, 0.3, 0.34, 0.1, 0.38, 0.06, 0.2, 0.26, 0.22);
    pen.shade(g.hair, -1);
  }
}

/** Short hair under a hard hat: only below the hat, inside the skull's own outline. */
function stubble(d: Draw, g: HeadGroups, ramp: number, view: ViewId) {
  const pen = d.pen;
  if (view === 2 || view === 1) {
    poly(d, 0.2, -0.2, 0.2, -0.7, -0.16, -0.7, -0.26, -0.3, -0.1, -0.22);
    pen.shade(g.head, 0, ramp, 3);
  } else if (view === 3 || view === 4) {
    pen.begin();
    d.pt(B.head, 0.2, 0.5, true);
    d.pt(B.head, -0.18, 0.36, true);
    d.pt(B.head, -0.26, 0.22, true);
    d.pt(B.head, -0.2, 0.12, true);
    d.pt(B.head, -0.3, 0.0, true);
    d.pt(B.head, -0.2, -0.12, true);
    d.pt(B.head, -0.27, -0.22, true);
    d.pt(B.head, -0.18, -0.36, true);
    d.pt(B.head, 0.2, -0.5, true);
    pen.shade(g.head, 0, ramp, 3);
    if (d.lod >= 2) {
      poly(d, 0.1, -0.3, 0.12, -0.12, 0.0, -0.1, -0.02, -0.28);
      pen.shade(g.head, 0, ramp, 4);
    }
  } else if (d.lod >= 1) {
    poly(d, 0.22, 0.36, 0.2, 0.28, -0.0, 0.3, -0.02, 0.36);
    pen.shade(g.head, 0, ramp, 2);
    poly(d, 0.22, -0.36, 0.2, -0.28, -0.0, -0.3, -0.02, -0.36);
    pen.shade(g.head, 0, ramp, 2);
  }
}

function hardHat(d: Draw, g: HeadGroups, view: ViewId, ramp: number) {
  const pen = d.pen;
  pen.begin();
  if (d.lod === 0) {
    // At a distance the hat is its silhouette: a flat-bottomed dome with a brim past the head.
    const side = view === 2 || view === 1 ? 0.14 : 0;
    d.pt(B.head, 0.62, 0.0, false);
    d.pt(B.head, 0.56, 0.3);
    d.pt(B.head, 0.3, 0.42);
    d.pt(B.head, 0.2, 0.42, true);
    d.pt(B.head, 0.18, 0.62 + side, true);
    d.pt(B.head, 0.06, 0.66 + side, true);
    d.pt(B.head, 0.06, -0.66, true);
    d.pt(B.head, 0.18, -0.62, true);
    d.pt(B.head, 0.2, -0.42, true);
    d.pt(B.head, 0.3, -0.42);
    d.pt(B.head, 0.56, -0.3);
  } else if (view === 2) {
    // Profile: dome, ridge, the brim out front, a lip round the back.
    d.pt(B.head, 0.6, -0.1);
    d.pt(B.head, 0.56, 0.18);
    d.pt(B.head, 0.34, 0.38);
    d.pt(B.head, 0.22, 0.42, true);
    d.pt(B.head, 0.2, 0.58, true);
    d.pt(B.head, 0.1, 0.56, true);
    d.pt(B.head, 0.12, 0.32, true);
    d.pt(B.head, 0.14, -0.5, true);
    d.pt(B.head, 0.1, -0.62, true);
    d.pt(B.head, 0.2, -0.62, true);
    d.pt(B.head, 0.42, -0.42);
  } else if (view === 1) {
    d.pt(B.head, 0.6, 0.02);
    d.pt(B.head, 0.54, 0.22);
    d.pt(B.head, 0.34, 0.38);
    d.pt(B.head, 0.24, 0.4, true);
    d.pt(B.head, 0.2, 0.5, true);
    d.pt(B.head, 0.1, 0.48, true);
    d.pt(B.head, 0.12, 0.3);
    d.pt(B.head, 0.14, -0.4, true);
    d.pt(B.head, 0.1, -0.5, true);
    d.pt(B.head, 0.2, -0.52, true);
    d.pt(B.head, 0.42, -0.38);
  } else if (view === 3 || view === 4) {
    // From behind: the dome, then a lip all the way round with a shadow under it.
    d.pt(B.head, 0.6, 0.0);
    d.pt(B.head, 0.54, 0.26);
    d.pt(B.head, 0.34, 0.4);
    d.pt(B.head, 0.24, 0.42, true);
    d.pt(B.head, 0.2, 0.52, true);
    d.pt(B.head, 0.1, 0.5, true);
    d.pt(B.head, 0.08, 0.0);
    d.pt(B.head, 0.1, -0.5, true);
    d.pt(B.head, 0.2, -0.52, true);
    d.pt(B.head, 0.24, -0.42, true);
    d.pt(B.head, 0.34, -0.4);
    d.pt(B.head, 0.54, -0.26);
  } else {
    d.pt(B.head, 0.6, 0.0);
    d.pt(B.head, 0.54, 0.25);
    d.pt(B.head, 0.3, 0.38);
    d.pt(B.head, 0.2, 0.4, true);
    d.pt(B.head, 0.12, 0.44, true);
    d.pt(B.head, 0.08, 0.0);
    d.pt(B.head, 0.12, -0.44, true);
    d.pt(B.head, 0.2, -0.4, true);
    d.pt(B.head, 0.3, -0.38);
    d.pt(B.head, 0.54, -0.25);
  }
  pen.fill(ramp, 3, PARTH, g.hat, -2);
  // Shadow on the away side of the dome.
  poly(d, 0.62, 0.22, 0.3, 0.24, 0.14, 0.2, 0.08, 0.7, 0.7, 0.7);
  pen.shade(g.hat, -1);
  if (d.lod >= 1) {
    // Lit plane on the dome, the crown ridge a shell has.
    poly(d, 0.58, -0.14, 0.32, -0.34, 0.24, -0.1, 0.5, 0.02);
    pen.shade(g.hat, 1);
    poly(d, 0.58, -0.12, 0.44, -0.26, 0.4, -0.18, 0.54, -0.08);
    pen.shade(g.hat, 2);
    if (d.lod >= 2) {
      poly(d, 0.61, -0.02, 0.2, -0.02, 0.2, 0.05, 0.61, 0.05);
      pen.shade(g.hat, -1);
      // The lip of the shell, a row of shadow under it.
      poly(d, 0.2, -0.7, 0.2, 0.7, 0.12, 0.7, 0.12, -0.7);
      pen.shade(g.hat, -1);
      poly(d, 0.12, -0.7, 0.12, 0.7, 0.07, 0.7, 0.07, -0.7);
      pen.shade(g.hat, -2);
    }
  }
}

/** Paints the head for the view. */
export function paintHead(d: Draw, s: HeadSpec, g: HeadGroups, view: ViewId) {
  const slack = s.dead && s.jaw > 0;
  const tbl = view === 0 ? (slack ? HEAD_F_SLACK : HEAD_F) : view === 1 ? (slack ? HEAD_Q_SLACK : HEAD_Q) : view === 2 ? (slack ? HEAD_S_SLACK : HEAD_S) : HEAD_B;
  // Ears (behind the skull's outline where the view shows one).
  if (d.lod >= 1) {
    if (view === 0) {
      ear(d, s.skin, g, 0.31, 0.08);
      ear(d, s.skin, g, -0.31, -0.08);
    } else if (view === 1) ear(d, s.skin, g, -0.24, -0.12);
    else if (view === 2) ear(d, s.skin, g, -0.24, -0.13);
    else if (view === 3) ear(d, s.skin, g, 0.31, 0.1);
    else {
      ear(d, s.skin, g, 0.34, 0.1);
      ear(d, s.skin, g, -0.34, -0.1);
    }
  }
  outline(d, tbl, s.skin, g);
  faceForm(d, g, view);
  if (view <= 2) {
    if (s.dead) deadFace(d, s, g, view);
    else liveFace(d, s, g, view);
  }
  if (s.hair >= 0) {
    if (s.hat >= 0) stubble(d, g, s.hair, view);
    else hairShape(d, g, s.hair, view);
  }
  if (s.hat >= 0) hardHat(d, g, view, s.hat);
}
