import { linearToOklab, oklchToLinear } from '../spritePalette';

/**
 * PixelCast materials: every surface of a painted character is a MATERIAL — a
 * short hand-built colour ramp (dark → light, hue-shifted the way sprite
 * artists build them: cool violet shadows, warm desaturated highlights) plus a
 * surface PATTERN the paint pass applies per texel (cloth weave, denim twill,
 * buffalo check, rot blotches, hair strands, scales, stripes…).
 *
 * The table is shared by every PixelCast renderer (one GPU texture, ≤ 255
 * materials). Material ids are stable for the session; asking for the same
 * key again returns the same id. Pure maths (no DOM / GL): safe in node tests.
 */

/** Steps per ramp (index 0 = outline / deepest shadow … STEPS-1 = highlight). */
export const STEPS = 6;
/** Base colour lands on this step (lit mid-tone). */
export const BASE_STEP = 3;
/** Most materials the table holds (id 0 = empty). */
export const MAX_MATERIALS = 255;
/** Texels per material row in the GPU table: STEPS colours, pattern, extras. */
export const MAT_COLS = 8;

/**
 * Surface patterns (`PixelMaterial.pattern`). Coordinates the paint pass hands
 * a pattern: the texel position, the part's own (u along, v across) in metres
 * (they stick to the body), and the shading tone.
 */
export const PAT = {
  NONE: 0,
  /** Woven cloth: faint 1-texel weave + dirt / sweat blotches. */
  WEAVE: 1,
  /** Denim: diagonal twill + faded knees. */
  DENIM: 2,
  /** Buffalo check (`scale` = check size in m). */
  PLAID: 3,
  /** Dead skin: rot blotches (secondary material), veins, bruising. */
  ROT: 4,
  /** Living skin: smooth, warm. */
  FLESH: 5,
  /** Hair: strands along the part, darker roots. */
  HAIR: 6,
  /** Leather / rubber: smooth with a tight specular glint. */
  LEATHER: 7,
  /** Gloss plastic / metal: hard specular band. */
  GLOSS: 8,
  /** Wet blood / gore: glistening specks. */
  WET: 9,
  /** Reptile scales: small cells with dark seams. */
  SCALES: 10,
  /** Body stripes (dinos): dark bands across `u` + speckles; secondary = belly. */
  STRIPES: 11,
  /** Hospital gown print (small dots). */
  GOWN: 12,
  /** Camouflage blotches. */
  CAMO: 13,
  /** Exposed ribs: bone bars across `u` over gore. */
  RIBS: 14,
  /** Armour plate: brushed metal, scratches, rivets. */
  PLATE: 15,
  /** Bold dark dapples over the back and flanks (dilos), pale belly underneath. */
  SPOTS: 16,
  /**
   * Big-creature flesh: ROT's blotches (secondary), bruises (tertiary), creases and
   * veins at the material's own `scale` (blotch size, metres) — a 6 m boss gets
   * blotches a few texels across, not ROT's human-sized per-texel speckle.
   */
  MEAT: 17,
} as const;
export type PatternId = (typeof PAT)[keyof typeof PAT];

export interface PixelMaterial {
  /** sRGB colours, dark → light (STEPS entries). */
  ramp: number[];
  pattern: PatternId;
  /** Pattern scale (metres for body-anchored patterns). */
  scale: number;
  /** Pattern strength 0..1. */
  strength: number;
  /** Secondary material id (rot patches, stains, belly) — 0 = none. */
  secondary: number;
  /** Unlit: drawn at full brightness, no outline, no shading (eyes, glows). */
  glow: boolean;
  /** Width of the ordered-dither band between steps (0 = hard steps, 0.5 = full). */
  dither: number;
  /** Specular glint strength (wet, leather, plastic). */
  spec: number;
  /** Third material id (body stripes in their own colour) — 0 = none. */
  tertiary?: number;
}

// ─── Colour maths ──────────────────────────────────────────────────────────

function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}
function linearToSrgb(c: number): number {
  c = Math.min(1, Math.max(0, c));
  return c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
}

/** sRGB hex → OKLCH [L, C, h°]. */
export function hexToOklch(hex: number): [number, number, number] {
  const r = srgbToLinear(((hex >> 16) & 255) / 255);
  const g = srgbToLinear(((hex >> 8) & 255) / 255);
  const b = srgbToLinear((hex & 255) / 255);
  const [L, A, B] = linearToOklab(r, g, b);
  const C = Math.hypot(A, B);
  let h = (Math.atan2(B, A) * 180) / Math.PI;
  if (h < 0) h += 360;
  return [L, C, h];
}

/** OKLCH → sRGB hex (gamut-clipped by chroma). */
export function oklchToHex(L: number, C: number, h: number): number {
  const [r, g, b] = oklchToLinear(Math.min(1, Math.max(0, L)), Math.max(0, C), h);
  const q = (v: number) => Math.round(linearToSrgb(v) * 255);
  return (q(r) << 16) | (q(g) << 8) | q(b);
}

function hueToward(h: number, target: number, t: number): number {
  const d = ((target - h + 540) % 360) - 180;
  return (h + d * t + 360) % 360;
}

export interface RampOptions {
  /** Lightness of the darkest step relative to the base (0..1, default 0.36). */
  dark?: number;
  /** How far the highlight climbs toward white (0..1, default 0.55). */
  light?: number;
  /** Hue shift strength (default 1): shadows → violet, highlights → warm yellow. */
  shift?: number;
  /** Chroma multiplier (default 1.08 — sprite palettes are punchy). */
  sat?: number;
  /** Hue the shadows lean toward (default 285, violet; hi-vis fabric leans green). */
  shadowHue?: number;
}

/**
 * A STEPS-long ramp around `hex` (which lands on BASE_STEP), hue-shifted:
 * shadows cooler and richer, highlights warmer and paler — never just the
 * base colour times a brightness.
 */
export function makeRamp(hex: number, o: RampOptions = {}): number[] {
  const [L, C0, h] = hexToOklch(hex);
  const C = C0 * (o.sat ?? 1.08);
  const shift = o.shift ?? 1;
  const Lmin = Math.max(0.09, L * (o.dark ?? 0.36));
  const Lmax = Math.min(0.97, L + (1 - L) * (o.light ?? 0.55) + 0.06);
  const out: number[] = [];
  for (let i = 0; i < STEPS; i++) {
    if (i === BASE_STEP) {
      out.push(oklchToHex(L, C, h));
      continue;
    }
    if (i < BASE_STEP) {
      const s = (BASE_STEP - i) / BASE_STEP; // 1 at the darkest
      const Li = L - (L - Lmin) * Math.pow(s, 0.9);
      // Shadows: richer chroma, hue toward blue-violet (grey bases get a cool tint).
      const Ci = Math.max(C * (1 + 0.18 * s) * (i === 0 ? 0.85 : 1), 0.018 * s * shift);
      const sh = o.shadowHue ?? 285;
      const hi = C < 0.02 ? hueToward(h, sh, 1) : hueToward(h, sh, (sh === 285 ? 0.12 : 0.35) * s * shift);
      out.push(oklchToHex(Li, Ci, hi));
    } else {
      const s = (i - BASE_STEP) / (STEPS - 1 - BASE_STEP); // 1 at the highlight
      const Li = L + (Lmax - L) * s;
      const Ci = C * (1 - 0.42 * s);
      const hi = C < 0.02 ? h : hueToward(h, 85, 0.1 * s * shift);
      out.push(oklchToHex(Li, Ci, hi));
    }
  }
  return out;
}

// ─── The table ─────────────────────────────────────────────────────────────

const byKey = new Map<string, number>();
const mats: PixelMaterial[] = [];
let version = 0;
/** RGBA8 table: row per material id (row 0 = empty), MAT_COLS texels per row. */
const table = new Uint8Array(256 * MAT_COLS * 4);

function writeRow(id: number, m: PixelMaterial) {
  const o = id * MAT_COLS * 4;
  for (let i = 0; i < STEPS; i++) {
    const c = m.ramp[Math.min(i, m.ramp.length - 1)];
    table[o + i * 4] = (c >> 16) & 255;
    table[o + i * 4 + 1] = (c >> 8) & 255;
    table[o + i * 4 + 2] = c & 255;
    table[o + i * 4 + 3] = 255;
  }
  const p = o + STEPS * 4;
  table[p] = m.pattern;
  table[p + 1] = Math.round(Math.min(1, Math.max(0, m.scale / 0.5)) * 255);
  table[p + 2] = Math.round(Math.min(1, Math.max(0, m.strength)) * 255);
  table[p + 3] = m.secondary;
  const q = p + 4;
  table[q] = m.glow ? 255 : 0;
  table[q + 1] = Math.round(Math.min(1, Math.max(0, m.dither * 2)) * 255);
  table[q + 2] = Math.round(Math.min(1, Math.max(0, m.spec)) * 255);
  table[q + 3] = m.tertiary ?? 0;
}

/**
 * Material id for `key`, creating it with `make()` the first time. When the
 * table is full the closest existing colour's id is reused (never fails).
 */
export function material(key: string, make: () => PixelMaterial): number {
  const hit = byKey.get(key);
  if (hit !== undefined) return hit;
  if (mats.length >= MAX_MATERIALS) return 1;
  const m = make();
  mats.push(m);
  const id = mats.length;
  byKey.set(key, id);
  writeRow(id, m);
  version++;
  return id;
}

/** The material behind an id (undefined for 0 / unknown). */
export function materialInfo(id: number): PixelMaterial | undefined {
  return mats[id - 1];
}

/** GPU table bytes + a version that changes whenever a material is added. */
export function materialTable(): { data: Uint8Array; version: number; rows: number; cols: number } {
  return { data: table, version, rows: 256, cols: MAT_COLS };
}

// ─── The library ───────────────────────────────────────────────────────────

const h6 = (n: number) => n.toString(16).padStart(6, '0');

function base(ramp: number[], pattern: PatternId, o: Partial<PixelMaterial> = {}): PixelMaterial {
  return { ramp, pattern, scale: 0.1, strength: 0.5, secondary: 0, glow: false, dither: 0.14, spec: 0, ...o };
}

/**
 * Ready-made materials. Every creator is cached by its arguments, so painters
 * can call them per redraw for free.
 */
export const Mat = {
  /** Woven fabric (shirts, scrubs, jackets). `stain` = secondary for dirt/blood blotches. */
  cloth(hex: number, o: { pattern?: PatternId; strength?: number; scale?: number; stain?: number; dither?: number } = {}): number {
    const pat = o.pattern ?? PAT.WEAVE;
    return material(`cloth|${h6(hex)}|${pat}|${o.strength ?? ''}|${o.scale ?? ''}|${o.stain ?? 0}`, () =>
      base(makeRamp(hex), pat, { strength: o.strength ?? 0.5, scale: o.scale ?? 0.1, secondary: o.stain ?? 0, dither: o.dither ?? 0.16 }),
    );
  },
  denim(hex: number, stain = 0): number {
    return material(`denim|${h6(hex)}|${stain}`, () => base(makeRamp(hex, { light: 0.5 }), PAT.DENIM, { strength: 0.6, secondary: stain, dither: 0.18 }));
  },
  /** Buffalo check: crossing bands in a near-black of the same hue (secondary), single bands a shade darker. */
  plaid(hex: number, check = 0.07): number {
    return material(`plaid|${h6(hex)}|${check}`, () => {
      const [L, C, h] = hexToOklch(hex);
      const dark = material(`plaidk|${h6(hex)}`, () => base(makeRamp(oklchToHex(L * 0.4, C * 0.55, hueToward(h, 285, 0.15)), { light: 0.4 }), PAT.NONE, { dither: 0.05 }));
      return base(makeRamp(hex, { light: 0.45 }), PAT.PLAID, { scale: check, strength: 0.9, dither: 0.08, secondary: dark });
    });
  },
  /** Zombie skin: pale, with rot patches (a sicklier green-grey) and bruises. `rot` < 0.85 = cleaner (faces). */
  deadSkin(hex: number, rot = 0.85): number {
    return material(`dead|${h6(hex)}|${rot}`, () => {
      const [L, C, h] = hexToOklch(hex);
      // Rot patches: a sicker, darker green; bruises a purple shade (tertiary).
      const rotM = Mat.flat(oklchToHex(L * 0.74, Math.max(C, 0.06) * 1.5, hueToward(h, 130, 0.7)), 'rot');
      const bruise = Mat.flat(oklchToHex(L * 0.62, Math.max(C, 0.05) * 1.2, hueToward(h, 330, 0.75)), 'bruise');
      return base(makeRamp(hex, { light: 0.62, sat: 1.15 }), PAT.ROT, { strength: rot, scale: 0.07, secondary: rotM, tertiary: bruise, dither: 0.12 });
    });
  },
  /** Living skin (civilians): warm, smooth. */
  liveSkin(hex: number): number {
    return material(`live|${h6(hex)}`, () => base(makeRamp(hex, { light: 0.6, sat: 1.12 }), PAT.FLESH, { strength: 0.3, dither: 0.1 }));
  },
  hair(hex: number): number {
    return material(`hair|${h6(hex)}`, () => base(makeRamp(hex, { light: 0.5, dark: 0.45 }), PAT.HAIR, { strength: 0.8, dither: 0.06, spec: 0.35 }));
  },
  leather(hex: number): number {
    return material(`leather|${h6(hex)}`, () => base(makeRamp(hex, { light: 0.45 }), PAT.LEATHER, { strength: 0.5, spec: 0.6, dither: 0.1 }));
  },
  /** Hi-vis fabric: neon, shadows sinking to olive (not grey), a faint weave. */
  hivis(hex: number): number {
    return material(`hivis|${h6(hex)}`, () => base(makeRamp(hex, { dark: 0.3, light: 0.4, shadowHue: 135, sat: 1.0 }), PAT.WEAVE, { strength: 0.6, dither: 0.1 }));
  },
  /** Hard hats, helmets, badges: glossy. */
  gloss(hex: number): number {
    return material(`gloss|${h6(hex)}`, () => base(makeRamp(hex, { light: 0.7 }), PAT.GLOSS, { strength: 0.6, spec: 1, dither: 0.08 }));
  },
  /** Plain ramp, no pattern (badges, trims, ID cards). */
  flat(hex: number, tag = ''): number {
    return material(`flat|${h6(hex)}|${tag}`, () => base(makeRamp(hex), PAT.NONE, { dither: 0.1 }));
  },
  /** Unlit glow (eyes, glints): one colour, no shading or outline. */
  glow(hex: number): number {
    return material(`glow|${h6(hex)}`, () => base([hex, hex, hex, hex, hex, hex], PAT.NONE, { glow: true, dither: 0 }));
  },
  blood(hex = 0x7a0c0c): number {
    return material(`blood|${h6(hex)}`, () => base(makeRamp(hex, { light: 0.45, dark: 0.3, sat: 1.15 }), PAT.WET, { strength: 0.7, spec: 0.9, dither: 0.06 }));
  },
  gore(hex = 0x7a1612): number {
    return material(`gore|${h6(hex)}`, () => base(makeRamp(hex, { light: 0.5, sat: 1.1 }), PAT.WET, { strength: 1, spec: 0.7, dither: 0.1 }));
  },
  bone(hex = 0xd8cfb0): number {
    return material(`bone|${h6(hex)}`, () => base(makeRamp(hex, { light: 0.6 }), PAT.NONE, { dither: 0.08 }));
  },
  ribs(): number {
    return material('ribs', () => base(makeRamp(0x5a0e0c, { light: 0.4 }), PAT.RIBS, { scale: 0.05, secondary: Mat.bone(), strength: 1, spec: 0.5 }));
  },
  gown(hex: number): number {
    return material(`gown|${h6(hex)}`, () => base(makeRamp(hex, { light: 0.5 }), PAT.GOWN, { strength: 0.5, scale: 0.05, dither: 0.14 }));
  },
  camo(hex: number): number {
    return material(`camo|${h6(hex)}`, () => base(makeRamp(hex), PAT.CAMO, { strength: 0.8, scale: 0.12, dither: 0.1 }));
  },
  /**
   * Reptile hide: scales + body stripes; `belly` = the underside material id,
   * `stripe` = the stripes' own colour (hex; else a darker shade of the hide).
   */
  hide(hex: number, o: { stripe?: number; belly?: number; stripes?: number; scale?: number; spots?: number } = {}): number {
    return material(`hide|${h6(hex)}|${o.stripe ?? 0}|${o.belly ?? 0}|${o.stripes ?? 0}|${o.scale ?? 0}|${o.spots ?? 0}`, () =>
      base(makeRamp(hex, { light: 0.55, sat: 1.12 }), o.spots ? PAT.SPOTS : o.stripes ? PAT.STRIPES : PAT.SCALES, {
        strength: o.spots ?? o.stripes ?? 0.6,
        scale: o.scale ?? 0.16,
        secondary: o.belly ?? 0,
        tertiary: o.stripe !== undefined ? material(`stripe|${h6(o.stripe)}`, () => base(makeRamp(o.stripe!, { light: 0.5, sat: 1.15 }), PAT.SCALES, { strength: 0.4, scale: 0.16, dither: 0.1 })) : 0,
        dither: 0.12,
        spec: 0.15,
      }),
    );
  },
  /** Riot armour / steel plates: scratched, riveted, a hard glint. */
  plate(hex: number): number {
    return material(`plate|${h6(hex)}`, () => base(makeRamp(hex, { light: 0.62, dark: 0.32, sat: 1.2 }), PAT.PLATE, { strength: 0.8, scale: 0.09, spec: 0.9, dither: 0.06 }));
  },
  /** Dark mouth interior / throat. */
  mouth(hex = 0x3a0808): number {
    return material(`mouth|${h6(hex)}`, () => base(makeRamp(hex, { light: 0.35, dark: 0.5 }), PAT.WET, { strength: 0.4, spec: 0.5, dither: 0 }));
  },
  teeth(hex = 0xe8e0c4): number {
    return material(`teeth|${h6(hex)}`, () => base(makeRamp(hex, { light: 0.7, dark: 0.55 }), PAT.NONE, { spec: 0.8, dither: 0 }));
  },
};
