/**
 * Restricted sprite palettes for ART: SPRITES — one per campaign, built as
 * hue-shifted ramps the way 90s sprite artists built theirs: every ramp runs
 * from a cool, desaturated shadow (hue pulled toward blue-violet) through a
 * saturated midtone to a warm, pale highlight (hue pulled toward yellow).
 *
 * Colours are display colours (what the player sees after tone mapping), as
 * linear sRGB; the sprite bake maps each texel to the nearest entry in OKLab.
 * Pure maths (no DOM / GL): safe in node tests.
 */

export type PaletteId = 'zombie' | 'dino';

/** Most colours a palette may hold (the bake shader's uniform array size). */
export const PALETTE_MAX = 64;

interface Ramp {
  /** Midtone hue (OKLCH degrees). */
  h: number;
  /** Peak chroma (OKLCH). */
  c: number;
  /** Steps from dark to light. */
  n: number;
  /** Lightness range (OKLab L). */
  l0?: number;
  l1?: number;
  /** Hue shift toward cool shadows / warm highlights (0..1). */
  shift?: number;
}

/**
 * DEAD ZONE: sickly greens, bruise purples, blood reds, nicotine skin, denim and
 * scrubs, asphalt greys. PRIMAL ISLAND: ochres, olives, jungle greens, teals,
 * rust, khaki and ranger-shirt blues.
 */
const RAMPS: Record<PaletteId, Ramp[]> = {
  zombie: [
    { h: 255, c: 0.018, n: 9, l0: 0.12, l1: 0.97, shift: 0.3 }, // cool greys (asphalt, steel, bone)
    { h: 55, c: 0.075, n: 8, l0: 0.2, l1: 0.93 }, // skin / flesh
    { h: 128, c: 0.085, n: 7, l0: 0.2, l1: 0.9 }, // sickly green (rotting skin, scrubs)
    { h: 100, c: 0.07, n: 6, l0: 0.22, l1: 0.86 }, // olive / khaki
    { h: 25, c: 0.17, n: 7, l0: 0.18, l1: 0.82 }, // blood red
    { h: 330, c: 0.09, n: 6, l0: 0.16, l1: 0.8 }, // bruise purple / magenta
    { h: 250, c: 0.1, n: 7, l0: 0.16, l1: 0.86 }, // denim / cop blue
    { h: 60, c: 0.05, n: 6, l0: 0.18, l1: 0.78 }, // brown leather / hair
    { h: 92, c: 0.14, n: 5, l0: 0.45, l1: 0.95 }, // hazard yellow / pus
    { h: 195, c: 0.07, n: 2, l0: 0.4, l1: 0.78 }, // hospital teal
  ],
  dino: [
    { h: 250, c: 0.016, n: 8, l0: 0.12, l1: 0.97, shift: 0.3 }, // greys (rock, steel, teeth)
    { h: 78, c: 0.1, n: 7, l0: 0.22, l1: 0.92 }, // ochre / sand
    { h: 112, c: 0.08, n: 7, l0: 0.2, l1: 0.88 }, // olive hide
    { h: 145, c: 0.1, n: 7, l0: 0.18, l1: 0.86 }, // jungle green
    { h: 190, c: 0.07, n: 6, l0: 0.2, l1: 0.86 }, // teal
    { h: 38, c: 0.13, n: 7, l0: 0.18, l1: 0.84 }, // rust / raptor red
    { h: 55, c: 0.07, n: 6, l0: 0.25, l1: 0.92 }, // skin
    { h: 245, c: 0.1, n: 6, l0: 0.18, l1: 0.84 }, // ranger blue / night
    { h: 22, c: 0.17, n: 5, l0: 0.2, l1: 0.72 }, // blood
    { h: 300, c: 0.08, n: 4, l0: 0.18, l1: 0.7 }, // shadow violet
  ],
};

/** OKLCH → linear sRGB (clipped into gamut by reducing chroma). */
export function oklchToLinear(L: number, C: number, hDeg: number): [number, number, number] {
  const h = (hDeg * Math.PI) / 180;
  for (let c = C; ; c *= 0.85) {
    const a = c * Math.cos(h);
    const b = c * Math.sin(h);
    const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
    const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
    const s_ = L - 0.0894841775 * a - 1.291485548 * b;
    const l = l_ * l_ * l_;
    const m = m_ * m_ * m_;
    const s = s_ * s_ * s_;
    const r = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
    const g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
    const bl = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s;
    const ok = r >= -1e-4 && g >= -1e-4 && bl >= -1e-4 && r <= 1.0001 && g <= 1.0001 && bl <= 1.0001;
    if (ok || c < 1e-3) return [Math.min(1, Math.max(0, r)), Math.min(1, Math.max(0, g)), Math.min(1, Math.max(0, bl))];
  }
}

/** Linear sRGB → OKLab. */
export function linearToOklab(r: number, g: number, b: number): [number, number, number] {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

/** Rotate hue `h` toward `target` by `t` (0..1) along the short way round. */
function hueToward(h: number, target: number, t: number): number {
  let d = ((target - h + 540) % 360) - 180;
  return h + d * t;
}

/**
 * The palette for a campaign: `PALETTE_MAX` colours or fewer, as linear sRGB
 * triplets (display space). Always includes near-black.
 */
export function buildPalette(id: PaletteId): Float32Array {
  const out: number[] = [0.004, 0.004, 0.008];
  for (const r of RAMPS[id]) {
    const l0 = r.l0 ?? 0.2;
    const l1 = r.l1 ?? 0.9;
    const shift = r.shift ?? 1;
    for (let i = 0; i < r.n; i++) {
      const t = r.n === 1 ? 0.5 : i / (r.n - 1);
      const L = l0 + (l1 - l0) * t;
      // Chroma peaks just below the middle of the ramp; ends desaturate.
      const C = r.c * Math.max(0.25, 1 - Math.pow((t - 0.45) / 0.75, 2));
      // Shadows lean blue-violet, highlights lean yellow.
      const h = t < 0.45 ? hueToward(r.h, 275, (0.45 - t) * 0.3 * shift) : hueToward(r.h, 85, (t - 0.45) * 0.4 * shift);
      out.push(...oklchToLinear(L, C, h));
    }
  }
  const n = Math.min(PALETTE_MAX, out.length / 3);
  return new Float32Array(out.slice(0, n * 3));
}
