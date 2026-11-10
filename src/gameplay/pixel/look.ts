/**
 * PIXEL CAST 2 — the cast look (docs/PIXELWORLD2.md §9, docs/ARCHITECTURE.md
 * "PIXEL CAST 2").
 *
 * The cast is drawn as FLAT, DRAWN, 2D sprites: flat ramp fields in THREE tones
 * (base, one shadow step, small light shapes one step up), a dark coloured ink
 * line round the silhouette, lighter lines inside, highlights only on what
 * shines. Two looks exist:
 *
 *   0  CONTOUR  the first PIXEL CAST look (legacy shaders, legacy painters),
 *               kept untouched as the saved version and the baseline.
 *   b  CEL      the look under work (round one's preset B plus the grafts the
 *               judges asked for from A and C; A and C themselves are retired).
 *
 * One style is active for the whole page (painters read `PixelFigure.cel`, the
 * GPU passes read `castStyle()`); look-dev tools switch it live. Pure data: safe
 * in node tests (they select a look with the `CASTLOOK` environment variable,
 * read once when this module loads).
 */

export type CastLookId = '0' | 'b';

export interface CastStyle {
  id: CastLookId;
  name: string;
  /** 0 = legacy contour shading; 2 = the flat cel look (painters branch on `PixelFigure.cel > 0`). */
  cel: 0 | 2;
  /** Ramp step of the lit base tone (0..5). */
  base: number;
  /** Steps the shadow tone sits below the base (deep recesses add one more). */
  shadow: number;
  /** Steps an interior line (material seams, part lines) sits below the local tone. */
  line: number;
  /** Highlight accents on materials that shine (steps above the base; 0 = none). */
  hi: number;
  /** Exterior ink: multiplier of the local ramp's line colour (smaller = blacker). */
  ink: number;
  /** Width of the automatic form shadow band as a share of a primitive's mean radius (painters may switch it off). */
  band: number;
  /** Contact shadow under the feet: 0 legacy two-tone blob, 1 flat pixel ellipse (a dashed skirt where the stage asks). */
  ground: 0 | 1;
  /** Figures under this many retro pixels tall are drawn in two tones with fewer interior lines. */
  small: number;
  /** Figures at least this tall get full dark ink where a limb crosses the trunk. */
  big: number;
}

export const CAST_STYLES: Record<CastLookId, CastStyle> = {
  '0': { id: '0', name: 'CONTOUR (before)', cel: 0, base: 3, shadow: 1, line: 1, hi: 0, ink: 0.42, band: 0, ground: 0, small: 45, big: 110 },
  b: { id: 'b', name: 'CEL', cel: 2, base: 3, shadow: 1, line: 1, hi: 2, ink: 0.5, band: 0.5, ground: 1, small: 70, big: 110 },
};

/** The look used when nothing selects one (`&castlook=`, `CASTLOOK`). */
export const DEFAULT_CAST_LOOK: CastLookId = '0';

export function isCastLook(v: unknown): v is CastLookId {
  return v === '0' || v === 'b';
}

function envLook(): CastLookId {
  // Node tests: `CASTLOOK=b npx vitest run …` (no `process` in the browser).
  const p = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process;
  const v = p?.env?.CASTLOOK?.toLowerCase();
  return isCastLook(v) ? v : DEFAULT_CAST_LOOK;
}

let current: CastStyle = CAST_STYLES[envLook()];
let version = 0;

/** The active style. */
export function castStyle(): CastStyle {
  return current;
}

/** Changes whenever the style is switched (sprite caches repaint). */
export function castStyleVersion(): number {
  return version;
}

export function setCastLook(id: CastLookId) {
  if (current.id === id) return;
  current = CAST_STYLES[id];
  version++;
}

// ─── Stage light: how the cast answers a stage's mood ────────────────────────

/**
 * The cast's response to a stage's light, as a SMALL set of named parameters
 * (the world's own light model — whole ramp steps, banded fog — is built in
 * `content/pixelworld`; these are to be matched to it per stage). Nothing here
 * multiplies a grey tint over the figures and nothing outlines them with light:
 * a stage moves a whole figure by whole tone steps along its own ramps (so it
 * sinks toward each ramp's violet end and stays saturated) and may add short
 * drawn light accents on the top edges that face a strong coloured source.
 */
export interface CastStageLight {
  /** Whole tone steps added to every tone (−1 = a night stage; never below −1: the game reads first). */
  step: number;
  /**
   * The darkest base tone that still follows the stage's step-down (display luma 0..1): a
   * material under it (a dark suit on a night street) keeps its own tones, so figures stay
   * brighter than what is behind them.
   */
  floor: number;
  /**
   * Light accent: colour (sRGB hex) of a strong coloured source and how much of it tints the
   * accent texels (0 = no accents in this stage). Accents are short: only silhouette texels
   * on the figure's outer hull whose edge faces `accentDir`, never a line down a limb.
   */
  accent: number;
  accentAmount: number;
  /** Screen-space direction TOWARD the accent light (x right, y up). */
  accentDir: readonly [number, number];
  /** Contact shadow colour (sRGB hex: the stage's deepest shadow tone) and its opacity. */
  ground: number;
  groundAlpha: number;
  /** Wet ground: the contact shadow ends in a skirt of broken horizontal dashes. */
  skirt: boolean;
  /** Share of the scenery's fog the cast takes (figures stay legible down the street). */
  fog: number;
}

const DAY: CastStageLight = { step: 0, floor: 0.12, accent: 0xfff0c0, accentAmount: 0, accentDir: [-0.5, 0.86], ground: 0x1c1830, groundAlpha: 0.5, skirt: false, fog: 0.5 };
const NIGHT: CastStageLight = { step: -1, floor: 0.24, accent: 0x9cc4ff, accentAmount: 0, accentDir: [0.5, 0.86], ground: 0x0e0c1e, groundAlpha: 0.6, skirt: false, fog: 0.5 };

/** Per stage id (`StageDef.id`); stages not listed fall back to DAY / NIGHT by how dark their fog is. */
export const CAST_STAGE_LIGHT: Record<string, CastStageLight> = {
  // z1: night street, wet asphalt — sodium lamps and neon overhead: a step down, warm accents from above.
  z1: { ...NIGHT, accent: 0xffc070, accentAmount: 0.5, accentDir: [0.25, 0.97], skirt: true },
  // z2: hospital — failing fluorescent tubes: no step down, no coloured source.
  z2: { step: 0, floor: 0.17, accent: 0xd8ffe8, accentAmount: 0, accentDir: [0, 1], ground: 0x12202a, groundAlpha: 0.5, skirt: false, fog: 0.5 },
  // z3: dusk bridge — fires behind the horde: a step down, orange accents from the upper right.
  z3: { step: -1, floor: 0.24, accent: 0xff9a48, accentAmount: 0.6, accentDir: [0.6, 0.8], ground: 0x1a1024, groundAlpha: 0.55, skirt: false, fog: 0.5 },
  // d1: day jungle — even daylight.
  d1: { ...DAY },
  // d2: lab / greenhouse — cool skylight, no coloured source.
  d2: { step: 0, floor: 0.14, accent: 0xc8f4ff, accentAmount: 0, accentDir: [0, 1], ground: 0x101c28, groundAlpha: 0.5, skirt: false, fog: 0.5 },
  // d3: storm night, wet ground — a step down; lightning-blue accents from above.
  d3: { ...NIGHT, accent: 0xb8d0ff, accentAmount: 0.45, accentDir: [-0.2, 0.98], skirt: true },
};

/** The stage light for `stageId`; `dark` (0 day .. 1 night, from the stage's fog) picks the fallback. */
export function castStageLight(stageId: string | undefined, dark: number): CastStageLight {
  return (stageId && CAST_STAGE_LIGHT[stageId]) || (dark > 0.5 ? NIGHT : DAY);
}
