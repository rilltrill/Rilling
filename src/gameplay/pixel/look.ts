/**
 * PIXEL CAST 2 — the look presets (docs/PIXELWORLD2.md §9).
 *
 * The cast is drawn as FLAT, DRAWN, 2D sprites: flat ramp tones, one designed
 * shadow shape, coloured ink, corners. Three candidate recipes are switchable
 * (`&castlook=a|b|c`), plus `0`: the look before this work (contour shading that
 * follows the blended field's normal, dithered bands, a multiplied stage tint),
 * kept as the saved version and as the baseline of every comparison.
 *
 *   0  CONTOUR      the first PIXEL CAST look (legacy shaders, legacy painters).
 *   a  STRICT CEL   two flat tones + ink: base and one bold shadow tone, a dark
 *                   coloured ink line on the silhouette and on every interior
 *                   edge, no highlights, no texture, no rim.
 *   b  CEL+ACCENTS  base / one shadow shape / small highlight accents on what
 *                   shines; lighter interior lines; selective outline (the lit
 *                   edge takes a lighter line); a cool rim in dark stages only.
 *   c  DRAWN        as b, plus designed material texture (twill hatching on
 *                   denim, weave ticks in cloth shadow, scale rows, strand
 *                   ticks in hair) and a coloured light rim in every stage.
 *
 * One style is active for the whole page (painters read `PixelFigure.cel`, the
 * GPU passes read `castStyle()`); look-dev tools switch it live. Pure data: safe
 * in node tests (they select a preset with the `CASTLOOK` environment variable,
 * read once when this module loads).
 */

export type CastLookId = '0' | 'a' | 'b' | 'c';

export interface CastStyle {
  id: CastLookId;
  name: string;
  /** 0 = legacy contour shading; 1 strict cel, 2 cel + accents, 3 drawn & textured. */
  cel: 0 | 1 | 2 | 3;
  /** Ramp step of the lit base tone (0..5). */
  base: number;
  /** Steps the ONE shadow tone sits below the base. */
  shadow: number;
  /** Steps an interior line (material seams, creases) sits below the local tone. */
  line: number;
  /** Highlight accents on materials that shine (steps above the base; 0 = none). */
  hi: number;
  /** Exterior ink: multiplier of the local ramp's darkest step (smaller = blacker). */
  ink: number;
  /** Selective outline: a lit top / left edge takes a lighter, coloured line. */
  selOut: boolean;
  /** Inner contours (a nearer layer over a farther one) as full ink (else the local darkest step). */
  inkInside: boolean;
  /** Chroma gain on every ramp colour (the cast is a step more saturated than the world). */
  sat: number;
  /** Designed material texture in the paint pass (0 none, 1 = hatching / weave / scales). */
  texture: 0 | 1;
  /** Coloured light rim: 0 never, 1 dark stages only, 2 every stage. */
  rim: 0 | 1 | 2;
  /** Shadow band width as a share of the local radius. */
  band: number;
  /** Contact shadow under the feet: 0 legacy two-tone blob, 1 flat pixel ellipse, 2 core + dithered skirt. */
  ground: 0 | 1 | 2;
}

export const CAST_STYLES: Record<CastLookId, CastStyle> = {
  '0': { id: '0', name: 'CONTOUR (before)', cel: 0, base: 3, shadow: 1, line: 1, hi: 0, ink: 0.42, selOut: true, inkInside: false, sat: 1, texture: 0, rim: 1, band: 0, ground: 0 },
  a: { id: 'a', name: 'A STRICT CEL', cel: 1, base: 3, shadow: 2, line: 3, hi: 0, ink: 0.5, selOut: false, inkInside: true, sat: 1.22, texture: 0, rim: 0, band: 0.62, ground: 1 },
  b: { id: 'b', name: 'B CEL + ACCENTS', cel: 2, base: 3, shadow: 2, line: 1, hi: 2, ink: 0.72, selOut: true, inkInside: false, sat: 1.18, texture: 0, rim: 1, band: 0.55, ground: 2 },
  c: { id: 'c', name: 'C DRAWN + TEXTURED', cel: 3, base: 3, shadow: 2, line: 1, hi: 2, ink: 0.72, selOut: true, inkInside: false, sat: 1.14, texture: 1, rim: 2, band: 0.55, ground: 2 },
};

/** The preset used when nothing selects one (`&castlook=`, `CASTLOOK`). */
export const DEFAULT_CAST_LOOK: CastLookId = '0';

export function isCastLook(v: unknown): v is CastLookId {
  return v === '0' || v === 'a' || v === 'b' || v === 'c';
}

function envLook(): CastLookId {
  // Node tests: `CASTLOOK=a npx vitest run …` (no `process` in the browser).
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
 * `content/pixelworld`; match these to it per stage). Nothing here multiplies a
 * grey tint over the figures: light moves a whole figure by whole tone steps
 * along its own ramps (so it sinks toward each ramp's violet end and stays
 * saturated) and draws a 1-pixel coloured rim on the side facing the light.
 */
export interface CastStageLight {
  /** Whole tone steps added to every lit tone (−1 = a night stage; never below −1: the game reads first). */
  step: number;
  /** Rim colour (sRGB hex) and strength 0..1 (how much of the edge texel it replaces). */
  rim: number;
  rimAmount: number;
  /** Screen-space direction TOWARD the rim light (x right, y up). */
  rimDir: readonly [number, number];
  /** Contact shadow colour (sRGB hex: the stage's deepest shadow tone) and opacity of its core. */
  ground: number;
  groundAlpha: number;
  /** Share of the scenery's fog the cast takes (figures stay legible down the street). */
  fog: number;
}

const DAY: CastStageLight = { step: 0, rim: 0xfff0c0, rimAmount: 0.85, rimDir: [-0.6, 0.8], ground: 0x1c1830, groundAlpha: 0.5, fog: 0.5 };
const NIGHT: CastStageLight = { step: -1, rim: 0x9cc4ff, rimAmount: 0.9, rimDir: [0.8, 0.6], ground: 0x0e0c1e, groundAlpha: 0.6, fog: 0.5 };

/** Per stage id (`StageDef.id`); stages not listed fall back to DAY / NIGHT by how dark their fog is. */
export const CAST_STAGE_LIGHT: Record<string, CastStageLight> = {
  // z1: night street — sodium lamps and neon behind, a cold moon rim from the right.
  z1: { ...NIGHT, rim: 0x9cc4ff },
  // z2: hospital — failing fluorescent tubes overhead: no step down, a pale green-white top rim.
  z2: { step: 0, rim: 0xd8ffe8, rimAmount: 0.8, rimDir: [0.2, 1], ground: 0x12202a, groundAlpha: 0.5, fog: 0.5 },
  // z3: dusk bridge — fires behind the horde: an orange rim from the right, one step down.
  z3: { step: -1, rim: 0xffb060, rimAmount: 0.9, rimDir: [0.9, 0.4], ground: 0x1a1024, groundAlpha: 0.55, fog: 0.5 },
  // d1: day jungle — sun through the canopy from the upper left.
  d1: { ...DAY, rim: 0xfff2b0 },
  // d2: lab / greenhouse — cool skylight from above.
  d2: { step: 0, rim: 0xc8f4ff, rimAmount: 0.8, rimDir: [0.3, 1], ground: 0x101c28, groundAlpha: 0.5, fog: 0.5 },
  // d3: storm night — lightning-blue rim, one step down.
  d3: { ...NIGHT, rim: 0xb8d0ff },
};

/** The stage light for `stageId`; `dark` (0 day .. 1 night, from the stage's fog) picks the fallback. */
export function castStageLight(stageId: string | undefined, dark: number): CastStageLight {
  return (stageId && CAST_STAGE_LIGHT[stageId]) || (dark > 0.5 ? NIGHT : DAY);
}
