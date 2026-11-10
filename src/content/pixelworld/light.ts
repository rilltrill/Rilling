import * as THREE from 'three';
import { PW_PAL_DEEP, PW_PAL_W } from './canvas';
import { MONITOR, MONITOR_LEVELS, MONITOR_TOP } from '../../core/RetroPass';

/**
 * PIXEL-ART LIGHT (docs/PIXELWORLD2.md §5): how light, fog and the arcade monitor reach a painted
 * texel. The first pass multiplied the painted colour by a smooth Lambert term, blended fog in and
 * left the result to the monitor pass (tone curve, 15-bit colour, ordered dither): walls read as lit
 * 3D planes, shadows went grey-black and no colour on screen was a colour anyone had painted.
 *
 *  1. STEPS. The light arriving at a texel — the irradiance the stage's lights give the facet, as
 *     the multiplier the first pass applied to the paint (irradiance / π × the material's gain) —
 *     moves the texel a WHOLE NUMBER OF TONES along its own palette row:
 *       steps = round(mood.steps × log2(luminance / mood.pivot)), kept inside mood.lo … mood.hi,
 *     and the colour is the row's entry at painted tone + steps. Light at the pivot shows the paint
 *     exactly as painted. Where the light has a gradient (a lamp's pool, the torch's cone) the edge
 *     between two bands is ordered-dithered over `mood.edge` frame pixels, with the pattern in
 *     TEXEL space at the level being drawn (glued to the surface: it cannot crawl); an evenly lit
 *     facet has no dither at all — never a screen-door over a wall.
 *  2. TINT. The colour of the light (a red emergency lamp, fire, neon, a blue night sky) multiplies
 *     the looked-up colour, but as flat as the bands: the chroma is taken where the light is exactly
 *     as strong as the band says (the facet's even light — sky, ground, sun or moon — plus just
 *     enough of the local lights: torch, lamps, fire), so a ring of light is one colour, and
 *     `mood.tint` scales how far it leans. `mood.white` is the light the paint was painted for (its
 *     chroma tints nothing); `mood.shade` is what everything the light does not reach leans toward.
 *  3. FOG is `mood.fogBands` bands toward the colour everything else fades to (the scene fog as the
 *     monitor shows it), with a dithered edge on the frame grid (a band's edge sits still on the
 *     screen while the camera travels; scenery passes through it like through a layer of a 2D
 *     backdrop).
 *  4. PALETTE-TRUE OUTPUT. The result is snapped to the monitor's own colour lattice and written as
 *     the scene value its tone curve maps there, flagged in alpha (`MONITOR`: exposure, levels,
 *     flag), so the pass shows it unchanged and does not dither it — unless something transparent
 *     was drawn over the pixel (rain, smoke, glass), which is then dithered as ever; a stepped light
 *     pool that is itself paint can ask to stay on whole colours (`pwLightOverlay`).
 *
 * Glow texels take no light: their painted colour, moved by the material's glow gain in whole steps.
 * Vertex colours (the tint of a NEUTRAL tile) multiply after the lookup, as they did.
 *
 * This file is the model: the per-stage parameters (`PwMood`), the GLSL every lit PixelWorld
 * material shares, and its arithmetic again in TypeScript for the unit tests.
 */

export interface PwMood {
  /**
   * The light at which paint shows as painted: the luminance of (irradiance / π × gain), i.e. of the
   * factor the first pass multiplied the paint by. Lower = a brighter stage.
   */
  pivot: number;
  /** Tone steps per stop (doubling) of light. A painted tone is 1.2–1.8 stops from the next. */
  steps: number;
  /** Fewest steps (≤ 0) light can take a texel down: how deep the unlit corners of the stage go. */
  lo: number;
  /** Most steps (≥ 0) light can take a texel up: where a lamp's core stops bleaching the paint. */
  hi: number;
  /** Width of the dithered edge between two bands of light, frame pixels (0 = a hard edge). */
  edge: number;
  /** How far the light's colour tints the paint: 0 not at all … 1 as a coloured light would. */
  tint: number;
  /** The light the stage's paint is painted for (sRGB hex; its chroma tints nothing). Default white. */
  white: number;
  /**
   * What shadows lean toward (sRGB hex; its chroma multiplies a texel taken one step down by half,
   * two or more steps down in full; white = nothing). The night's blue-violet, a sunset's violet,
   * a ward's teal: the stage's grade of everything the light does not reach, over what the light's
   * own colour already does — pale colours, a saturated one drowns the paint.
   */
  shade: number;
  /** Bands of fog between clear and the fog colour. */
  fogBands: number;
  /** Width of the dithered edge between two fog bands, frame pixels. */
  fogEdge: number;
}

export const PW_MOOD_DEFAULT: PwMood = { pivot: 0.5, steps: 0.75, lo: -2, hi: 2, edge: 5, tint: 0.6, white: 0xffffff, shade: 0xffffff, fogBands: 6, fogEdge: 4 };

/** The uniforms of one mood (shared by every material made under it: a tweak shows at once). */
export interface PwMoodUniforms {
  mood: PwMood;
  uPwMood: { value: THREE.Vector4 };
  uPwMood2: { value: THREE.Vector4 };
  uPwWhite: { value: THREE.Vector3 };
  uPwShade: { value: THREE.Vector3 };
}

const _c = new THREE.Color();

function writeMood(u: PwMoodUniforms) {
  const m = u.mood;
  u.uPwMood.value.set(m.pivot, m.steps, m.lo, m.hi);
  u.uPwMood2.value.set(m.edge, m.tint, m.fogBands, m.fogEdge);
  // Only the chroma of the white point and of the shade counts: how bright is the pivot's business.
  // (The light is divided by the white point: a saturated one must not divide by nothing.)
  u.uPwWhite.value.fromArray(pwChroma(m.white).map((v) => Math.max(v, 0.05)));
  u.uPwShade.value.fromArray(pwChroma(m.shade));
}

/** The chroma of a colour (sRGB hex): linear rgb scaled to luminance 1. */
export function pwChroma(hex: number): [number, number, number] {
  _c.setHex(hex);
  const y = Math.max(1e-4, pwLuma(_c.r, _c.g, _c.b));
  return [_c.r / y, _c.g / y, _c.b / y];
}

function moodUniforms(mood: PwMood): PwMoodUniforms {
  const u: PwMoodUniforms = { mood, uPwMood: { value: new THREE.Vector4() }, uPwMood2: { value: new THREE.Vector4() }, uPwWhite: { value: new THREE.Vector3() }, uPwShade: { value: new THREE.Vector3() } };
  writeMood(u);
  return u;
}

/** `&pwmood=pivot:0.3,steps:1` (look-dev): values laid over every mood a stage sets. */
let override: Partial<PwMood> = {};
let current = moodUniforms({ ...PW_MOOD_DEFAULT });

/**
 * Set the mood of the PixelWorld materials made from here on (a stage calls it before it builds
 * its materials; what is left out is `PW_MOOD_DEFAULT`). Returns its uniforms.
 */
export function pwMood(mood: Partial<PwMood> = {}): PwMoodUniforms {
  current = moodUniforms({ ...PW_MOOD_DEFAULT, ...mood, ...override });
  return current;
}

/** The mood materials are being made under. */
export function pwMoodNow(): PwMoodUniforms {
  return current;
}

/** Look-dev: change the current mood in place (every material made under it follows on the next frame). */
export function pwMoodTweak(patch: Partial<PwMood>): PwMood {
  Object.assign(current.mood, patch);
  writeMood(current);
  return current.mood;
}

/** Boot: `flag` is the `pwmood` URL parameter (`key:value,…`), applied over every stage's mood. */
export function pwMoodBoot(flag: string | null) {
  override = {};
  if (!flag) return;
  for (const kv of flag.split(',')) {
    const [k, v] = kv.split(':');
    // (Numbers as JavaScript reads them: `shade:0xb0a8e0` works.)
    if (k in PW_MOOD_DEFAULT && v !== undefined && Number.isFinite(Number(v))) (override as Record<string, number>)[k] = Number(v);
  }
}

/**
 * Ramp-step light on / off (`&pwlight=0`: the materials light paint as the first pass did —
 * palette colour × Lambert, smooth fog, the monitor's tone curve and dither — for A/B captures).
 * Read when a material is MADE.
 */
let lightOn = true;
export function pwLight(on: boolean) {
  lightOn = on;
}
export function pwLightOn(): boolean {
  return lightOn;
}

// ─── The arithmetic (TypeScript twins of the GLSL below: unit tests) ───────────────────────────

/** Widest dithered edge, in steps: beyond it a steep gradient would dither whole bands away. */
export const PW_EDGE_MAX = 0.75;
/** Most the direct light is scaled by when a band's chroma is taken (see `pwBandChroma`). */
export const PW_LAMBDA_MAX = 8;

export function pwLuma(r: number, g: number, b: number): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * The dither's thresholds, in (0, 1), mean 0.5 — the GLSL `pwBayer`: the 2 × 2 ordered pattern,
 * i.e. a quarter of the texels, a checker, three quarters. An edge between two bands made of these
 * three reads as hand dither; a finer matrix reads as a gradient.
 */
export function pwBayer(x: number, y: number): number {
  return ((((x ^ y) & 1) << 1) + (y & 1) + 0.5) / 4;
}

/**
 * Tone steps for light of luminance `y` under `mood`. `th` is the texel's threshold (`pwBayer`),
 * `slope` how fast the light changes across the frame there (steps a pixel, the shader's
 * `fwidth`): the dithered edge is `mood.edge` pixels wide, so an evenly lit facet (slope 0) simply
 * rounds.
 */
export function pwLightSteps(y: number, mood: PwMood, th = 0.5, slope = 0): number {
  const sf = mood.steps * Math.log2(Math.max(y, 1e-4) / mood.pivot);
  const zone = Math.min(slope * mood.edge, PW_EDGE_MAX);
  return Math.max(mood.lo, Math.min(mood.hi, Math.floor(sf + 0.5 + (th - 0.5) * zone)));
}

/** The light (luminance) a number of steps stands for: the middle of its band. */
export function pwStepLight(steps: number, mood: PwMood): number {
  return mood.pivot * Math.pow(2, steps / mood.steps);
}

/** Tone steps of a glow texel under the material's glow gain (whole steps, never dithered). */
export function pwGlowSteps(gain: number, mood: PwMood): number {
  return Math.floor(mood.steps * Math.log2(Math.max(gain, 1e-3)) + 0.5);
}

/** Palette column of a texel painted at `tone` and moved `steps` by light. */
export function pwLitColumn(tone: number, steps: number): number {
  return Math.max(0, Math.min(PW_PAL_W - 1, PW_PAL_DEEP + tone + steps));
}

/**
 * The tint of a band: the chroma (luminance 1) of the facet's even light `ei` (sky, ground, sun)
 * plus as much of the local light `ed` (torch, lamps) as makes the band's own light `yq` — the same
 * for every texel of the band wherever the lamp's falloff puts it — raised to `mood.tint`. Linear
 * rgb in, a multiplier out.
 */
export function pwBandChroma(ei: readonly number[], ed: readonly number[], yq: number, mood: PwMood): [number, number, number] {
  const yi = pwLuma(ei[0], ei[1], ei[2]);
  const yd = pwLuma(ed[0], ed[1], ed[2]);
  const lam = Math.max(0, Math.min(PW_LAMBDA_MAX, (yq - yi) / Math.max(yd, 1e-4)));
  const e = [ei[0] + lam * ed[0], ei[1] + lam * ed[1], ei[2] + lam * ed[2]];
  const ye = pwLuma(e[0], e[1], e[2]);
  if (ye < 1e-4) return [1, 1, 1];
  const f = (v: number) => Math.pow(Math.max(0.2, Math.min(3, v / ye)), mood.tint);
  return [f(e[0]), f(e[1]), f(e[2])];
}

/** How much of the mood's shade a texel `steps` from its painted tone takes (the exponent of its chroma). */
export function pwShadeAmount(steps: number): number {
  return Math.min(Math.max(-steps, 0), 2) * 0.5;
}

/** Fog band (0 … 1 in `bands` steps) of fog factor `f`; `th` / `slope` as in `pwLightSteps` (slope in bands a pixel). */
export function pwFogBand(f: number, mood: PwMood, th = 0.5, slope = 0): number {
  const n = Math.max(1, mood.fogBands);
  const zone = Math.min(slope * mood.fogEdge, PW_EDGE_MAX);
  return Math.max(0, Math.min(n, Math.floor(f * n + 0.5 + (th - 0.5) * zone))) / n;
}

/** The monitor's tone curve (core/RetroPass.ts: the fitted ACES) and its inverse, per channel. */
export function pwAces(x: number): number {
  return Math.max(0, Math.min(1, (x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14)));
}
export function pwInvAces(y: number): number {
  y = Math.max(0, Math.min(1, y));
  const A = 2.51 - 2.43 * y;
  const B = 0.03 - 0.59 * y;
  const C = -0.14 * y;
  return (-B + Math.sqrt(B * B - 4 * A * C)) / (2 * A);
}
export function pwToSrgb(c: number): number {
  return c < 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
}
export function pwToLinear(c: number): number {
  return c < 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/** A display value (sRGB, 0 … 1) on the monitor's lattice: its level (0 … `MONITOR_TOP`). */
export function pwLattice(d: number): number {
  return Math.min(MONITOR_TOP, Math.floor(Math.max(0, d) * MONITOR_LEVELS + 0.5));
}

/** The scene value the monitor pass shows as lattice level `n` at `exposure`. */
export function pwSceneFor(n: number, exposure: number): number {
  return pwInvAces(pwToLinear(n / MONITOR_LEVELS)) / exposure;
}

/** What the monitor shows for scene value `x` (levels, unrounded: the pass dithers and floors it). */
export function pwMonitorLevel(x: number, exposure: number): number {
  return pwToSrgb(pwAces(x * exposure)) * MONITOR_LEVELS;
}

/**
 * The display colour (sRGB hex) the monitor shows for a scene colour that goes through its tone
 * curve — a backdrop's paint, the scene fog: what to match when a palette-true surface must meet
 * one (not snapped to the lattice).
 */
export function pwFilmHex(hex: number, exposure = 1.05): number {
  _c.setHex(hex);
  const q = (v: number) => Math.round(pwToSrgb(pwAces(v * exposure)) * 255);
  return (q(_c.r) << 16) | (q(_c.g) << 8) | q(_c.b);
}

// ─── GLSL ──────────────────────────────────────────────────────────────────────────────────────

/** Tone curve, transfer functions, thresholds and the lattice: shared by every PixelWorld shader that writes a pixel. */
export const PW_MONITOR_GLSL = /* glsl */ `
  uniform vec4 uPwMon; // exposure of the monitor's tone curve (0: drawn straight to the canvas), colour levels, top level, alpha flag
  vec3 pwAces(vec3 x) {
    const float a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14;
    return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
  }
  vec3 pwInvAces(vec3 y) {
    const float a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14;
    y = clamp(y, 0.0, 1.0);
    vec3 A = a - c * y;
    vec3 B = b - d * y;
    vec3 C = -e * y;
    return (-B + sqrt(B * B - 4.0 * A * C)) / (2.0 * A);
  }
  vec3 pwToSrgb(vec3 c) {
    return mix(c * 12.92, 1.055 * pow(max(c, vec3(0.0)), vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
  }
  vec3 pwToLinear(vec3 c) {
    return mix(c / 12.92, pow((max(c, vec3(0.0)) + 0.055) / 1.055, vec3(2.4)), step(0.04045, c));
  }
  // The dither: 2 x 2 ordered thresholds in (0, 1), mean 0.5 (a quarter of the texels, a checker, three quarters).
  float pwBayer(ivec2 p) {
    return (float((((p.x ^ p.y) & 1) << 1) + (p.y & 1)) + 0.5) / 4.0;
  }
  // A display colour (sRGB) snapped to the monitor's lattice, as the scene value the pass shows there.
  vec3 pwToScene(vec3 d) {
    d = clamp(d, 0.0, 1.0);
    if (uPwMon.y > 0.0) d = min(floor(d * uPwMon.y + 0.5), uPwMon.z) / uPwMon.y;
    // (Straight to the canvas: this is written after three's own output transform, as the display colour.)
    return uPwMon.x > 0.0 ? pwInvAces(pwToLinear(d)) / uPwMon.x : d;
  }
  // A scene colour that goes through the monitor's tone curve (a backdrop, a sprite), moved onto the
  // lattice colour nearest what the pass would show: the same picture without its ordered dither.
  vec3 pwFilmSnap(vec3 x) {
    if (uPwMon.x <= 0.0 || uPwMon.y <= 0.0) return x;
    vec3 n = floor(pwToSrgb(pwAces(max(x, vec3(0.0)) * uPwMon.x)) * uPwMon.y + 0.5);
    return pwInvAces(pwToLinear(n / uPwMon.y)) / uPwMon.x;
  }
`;

/** Declarations of the lit materials (after `PW_FETCH`). */
export const PW_LIGHT_DECL = /* glsl */ `
  ${PW_MONITOR_GLSL}
  uniform vec4 uPwMood;  // pivot, steps a stop, fewest, most
  uniform vec4 uPwMood2; // band edge (frame px), tint, fog bands, fog edge (frame px)
  uniform vec3 uPwWhite;
  uniform vec3 uPwShade;
  const vec3 PW_LUM = vec3(0.2126, 0.7152, 0.0722);
`;

/**
 * The lit materials' colour, after the lights have been summed over a WHITE surface
 * (`reflectedLight`: irradiance / π). In: `pwRT` (ramp, tone), `pwGlowK` (1 = a glow texel), `pwQ`
 * (the texel's coords at the level drawn, for the dither), `pwTint` (vertex colour), `uPwGain`,
 * `uPwGlow`. Out: `gl_FragColor`.
 */
export const PW_LIGHT_OUT = /* glsl */ `
  {
    // Two groups of light: what is the same all over a facet (sky and ground, the sun or the moon) and
    // what falls off across it (the torch, lamps, fire, a muzzle flash). three.js sums the sun with
    // the lamps, so it is taken out again here.
    vec3 pwSun = vec3(0.0);
    #if NUM_DIR_LIGHTS > 0
      for (int i = 0; i < NUM_DIR_LIGHTS; i++) pwSun += saturate(dot(normal, directionalLights[i].direction)) * directionalLights[i].color;
      pwSun *= RECIPROCAL_PI;
    #endif
    vec3 pwEi = (reflectedLight.indirectDiffuse + pwSun) * uPwGain / uPwWhite;
    vec3 pwEd = max(reflectedLight.directDiffuse - pwSun, vec3(0.0)) * uPwGain / uPwWhite;
    float pwYi = dot(pwEi, PW_LUM);
    float pwYd = dot(pwEd, PW_LUM);
    float pwSf = uPwMood.y * log2(max(pwYi + pwYd, 1e-4) / uPwMood.x);
    // The band's edge: dithered over a fixed number of frame pixels where the light has a gradient,
    // none on an evenly lit facet.
    float pwZone = min(fwidth(pwSf) * uPwMood2.x, ${PW_EDGE_MAX.toFixed(2)});
    float pwSt = clamp(floor(pwSf + 0.5 + (pwBayer(pwQ) - 0.5) * pwZone), uPwMood.z, uPwMood.w);
    if (pwGlowK > 0.5) pwSt = floor(uPwMood.y * log2(max(uPwGlow, 1e-3)) + 0.5);
    vec3 pwC = texelFetch(uPwPal, ivec2(clamp(${PW_PAL_DEEP} + pwRT.y + int(pwSt), 0, ${PW_PAL_W - 1}), pwRT.x), 0).rgb;
    if (pwGlowK < 0.5) {
      // The band's own tint: the facet's even light + as much of the local light as makes the band's light
      // (one colour for the whole ring, wherever the lamp's falloff puts the texel inside it).
      float pwYq = uPwMood.x * exp2(pwSt / uPwMood.y);
      float pwLam = clamp((pwYq - pwYi) / max(pwYd, 1e-4), 0.0, ${PW_LAMBDA_MAX.toFixed(1)});
      vec3 pwEq = pwEi + pwLam * pwEd;
      float pwYe = dot(pwEq, PW_LUM);
      vec3 pwCh = pwYe < 1e-4 ? vec3(1.0) : pow(clamp(pwEq / pwYe, 0.2, 3.0), vec3(uPwMood2.y));
      // … and the stage's shade over what the light does not reach: half of it one step down, all of it from two.
      pwC *= pwCh * pwTint * pow(uPwShade, vec3(min(max(-pwSt, 0.0), 2.0) * 0.5));
    }
    vec3 pwD = pwToSrgb(pwC);
    float pwFb = 0.0;
    #ifdef USE_FOG
      #ifdef FOG_EXP2
        float pwFf = 1.0 - exp(-fogDensity * fogDensity * vFogDepth * vFogDepth);
      #else
        float pwFf = smoothstep(fogNear, fogFar, vFogDepth);
      #endif
      pwFf *= uPwMood2.z;
      float pwFz = min(fwidth(pwFf) * uPwMood2.w, ${PW_EDGE_MAX.toFixed(2)});
      pwFb = clamp(floor(pwFf + 0.5 + (pwBayer(ivec2(gl_FragCoord.xy)) - 0.5) * pwFz), 0.0, uPwMood2.z) / uPwMood2.z;
      // What everything else fades to: the scene fog as the monitor shows it (three hands it over in
      // the output space when there is no monitor pass).
      pwD = mix(pwD, uPwMon.x > 0.0 ? pwToSrgb(pwAces(fogColor * uPwMon.x)) : fogColor, pwFb);
    #endif
    gl_FragColor = vec4(pwToScene(pwD), uPwMon.w);
    #ifdef PW_DEBUG
      if (uPwDebug > 4.5) {
        // steps: violet -3 and under, blue -2, cyan -1, green 0 (as painted), yellow +1, orange +2, red +3 and over; glow white.
        // light: the luminance of the light in stops, -8 … +4 on the green channel (tools read it back).
        // fog: the band, clear (red) to the fog colour (blue).
        float s = pwSt;
        pwDbg = uPwDebug > 6.5 ? vec3(1.0 - pwFb, pwFb < 1.0 ? 0.0 : 0.5, 1.0)
          : pwGlowK > 0.5 ? vec3(uPwDebug > 5.5 ? 0.0 : 1.0)
          : uPwDebug > 5.5 ? vec3(1.0, clamp((log2(max(pwYi + pwYd, 1e-4)) + 8.0) / 12.0, 0.0, 1.0), 0.0)
          : s < -2.5 ? vec3(0.45, 0.0, 1.0) : s < -1.5 ? vec3(0.0, 0.25, 1.0) : s < -0.5 ? vec3(0.0, 0.8, 1.0) : s < 0.5 ? vec3(0.0, 1.0, 0.25)
          : s < 1.5 ? vec3(1.0, 1.0, 0.0) : s < 2.5 ? vec3(1.0, 0.5, 0.0) : vec3(1.0, 0.0, 0.0);
      }
    #endif
  }
`;

/** The uniforms `PW_LIGHT_DECL` declares, for a material made under the current mood. */
export function pwLightUniforms(mood: PwMoodUniforms = current): Record<string, { value: unknown }> {
  return { uPwMood: mood.uPwMood, uPwMood2: mood.uPwMood2, uPwWhite: mood.uPwWhite, uPwShade: mood.uPwShade, uPwMon: MONITOR.uPwMon };
}

/**
 * A stepped LIGHT overlay (a painted pool of lamp light blended over the ground, a neon wash on a
 * wall): make it leave the alpha of what it is drawn over alone. A palette-true pixel under it then
 * keeps its flag (`MONITOR`) and the monitor pass rounds the lit pixel to a whole colour — flat
 * rings of light — instead of dithering it like the rain, smoke and glass that go over the world.
 * Only for overlays that are paint (flat steps): a soft gradient would band. Returns `m`.
 */
export function pwLightOverlay<T extends THREE.Material>(m: T): T {
  if (m.blending !== THREE.CustomBlending) {
    // The same colour blend three.js would have set up, spelt out so the alpha can differ.
    const additive = m.blending === THREE.AdditiveBlending;
    m.blending = THREE.CustomBlending;
    m.blendEquation = THREE.AddEquation;
    m.blendSrc = m.premultipliedAlpha ? THREE.OneFactor : THREE.SrcAlphaFactor;
    m.blendDst = additive ? THREE.OneFactor : THREE.OneMinusSrcAlphaFactor;
  }
  m.blendSrcAlpha = THREE.ZeroFactor;
  m.blendDstAlpha = THREE.OneFactor;
  return m;
}

/**
 * Turn a three.js Lambert fragment shader whose `<map_fragment>` has become a PixelWorld fetch
 * (it must leave `pwRT`, `pwGlowK`, `pwQ` set and `diffuseColor` alone under `PW_LIGHT`) into a
 * ramp-step one: the lights are summed over a white surface, then `PW_LIGHT_OUT` writes the pixel.
 */
export function pwLightPatch(fragmentShader: string): string {
  return fragmentShader
    .replace('#include <color_fragment>', '#ifdef PW_LIGHT\n  vec3 pwTint = vColor.rgb;\n#else\n  #include <color_fragment>\n#endif')
    .replace('#include <fog_fragment>', `#ifdef PW_LIGHT\n${PW_LIGHT_OUT}\n#else\n  #include <fog_fragment>\n#endif`);
}
