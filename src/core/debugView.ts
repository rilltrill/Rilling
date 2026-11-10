/**
 * PixelWorld debug views (`&pwdebug=mag|lvl|tone|ramp|steps|light|fog`: look-dev and the audit
 * script, never in a player's build path — without the flag nothing below is
 * compiled into any shader).
 *
 *  - `mag`: how many FRAME PIXELS the widest side of one stored texel covers
 *    (green ≤ 1.25, yellow ≤ 1.5, orange ≤ 2, red > 2): the density check of
 *    the art bible (docs/PIXELWORLD2.md §3). Measured per texel axis from the
 *    screen derivatives, not from the level pick's `rho` — on a road seen at a
 *    grazing angle `rho` follows the squeezed axis and would call a texel three
 *    pixels wide "fine".
 *  - `lvl`: the same scale for the texel actually DRAWN (the level texel: on a
 *    foreshortened plane a coarse level is picked from the squeezed axis and
 *    drawn wide along the other one).
 *  - `tone`: the painted tone of each texel (0 blue … 5 orange, glow magenta).
 *  - `ramp`: a hue per ramp id (which material a texel belongs to).
 *  - `steps`: how many tones the light moves each texel along its ramp (violet −3
 *    and under, blue −2, cyan −1, green 0 = as painted, yellow +1, orange +2,
 *    red +3 and over; glow texels white): the bands of content/pixelworld/light.ts.
 *  - `light`: the light itself before it is cut into steps — its luminance in
 *    stops, −8 … +4 on the green channel over full red (dark red = dark, yellow =
 *    bright): tools read a stage's light levels back from it to set its mood.
 *  - `fog`: the fog band of each texel, clear (magenta) to all fog (blue).
 *
 * Everything that is not PixelWorld paint (the cast, classic scenery, backdrops)
 * shows BLACK: the materials write their view colour × `PW_DEBUG_KEY` into the
 * HDR scene target and the monitor pass (`RetroPass`) keeps only what is brighter
 * than anything the game draws, at its own hue — so rain, light pools and smoke
 * blended over a surface do not tint the view either. View colours therefore
 * always have their largest channel at 1. Without the monitor pass (or without a
 * float target) the views are drawn as they are and the rest of the scene stays.
 *
 * The flag only COMPILES the views; `pwDebugSet` (tools: `window.__pwDebug`)
 * switches between them and the game as it is, on the same frozen frame.
 */

export const PW_DEBUG_VIEWS = ['off', 'mag', 'lvl', 'tone', 'ramp', 'steps', 'light', 'fog'] as const;
export type PwDebugView = (typeof PW_DEBUG_VIEWS)[number];

/** Scale of a view colour in the scene target (the monitor pass shows only pixels above `PW_DEBUG_FLOOR`). */
export const PW_DEBUG_KEY = 4096;
export const PW_DEBUG_FLOOR = 64;

export const pwDebug = {
  /** The views are compiled into the PixelWorld materials and the monitor pass (set once, at boot). */
  compiled: false,
  /** Shared uniform: index into `PW_DEBUG_VIEWS` (0 = the game as it is). */
  view: { value: 0 },
  /** Shared uniform: `PW_DEBUG_KEY` while the monitor pass decodes it, else 1. */
  gain: { value: 1 },
};

/** Boot: `flag` is the `pwdebug` URL parameter (null / '0' / 'off' = no debug views at all). */
export function pwDebugBoot(flag: string | null) {
  if (!flag || flag === '0' || flag === 'off') return;
  pwDebug.compiled = true;
  pwDebugSet(flag as PwDebugView);
}

/** Show a view (anything unknown = the game as it is). No-op unless compiled in. */
export function pwDebugSet(view: PwDebugView | string) {
  pwDebug.view.value = Math.max(0, PW_DEBUG_VIEWS.indexOf(view as PwDebugView));
}

/**
 * For materials that draw painted texels (compiled only with the flag): declarations for a
 * fragment shader (`pwDbg` = the fragment's view colour, black unless set), and the final write
 * that replaces the shaded colour. Shared by every material that draws painted texels.
 */
export const PW_DEBUG_DECL = /* glsl */ `
  #ifdef PW_DEBUG
    uniform float uPwDebug;
    uniform float uPwDebugGain;
    vec3 pwDbg = vec3(0.0);
    // Frame pixels across the widest side of one stored texel (\`pu\`: texel coords, \`s\` stored texels
    // per unit of it), on the density scale; in the \`lvl\` view, of the texel that is drawn (\`lv\`: its
    // level along u and along v).
    vec3 pwDbgMag(vec2 pu, float s, ivec2 lv) {
      vec2 g = vec2(length(vec2(dFdx(pu.x), dFdy(pu.x))), length(vec2(dFdx(pu.y), dFdy(pu.y)))) * s;
      vec2 side = (uPwDebug > 1.5 ? exp2(vec2(lv)) : vec2(1.0)) / max(g, vec2(1e-5));
      float px = max(side.x, side.y);
      return px <= 1.25 ? vec3(0.0, 1.0, 0.0) : px <= 1.5 ? vec3(1.0, 1.0, 0.0) : px <= 2.0 ? vec3(1.0, 0.5, 0.0) : vec3(1.0, 0.0, 0.0);
    }
  #endif
`;
const PW_DEBUG_OUT = /* glsl */ `
  #ifdef PW_DEBUG
    if (uPwDebug > 0.5) gl_FragColor = vec4(pwDbg * uPwDebugGain, 1.0);
  #endif
`;

/** Add the debug views to a material's defines / uniforms (nothing unless they are compiled in). */
export function pwDebugSetup(defines: Record<string, string>, uniforms: Record<string, { value: unknown }>) {
  if (!pwDebug.compiled) return;
  defines.PW_DEBUG = '';
  uniforms.uPwDebug = pwDebug.view;
  uniforms.uPwDebugGain = pwDebug.gain;
}

/** The debug views' final write, after everything a three.js fragment shader does to its colour. */
export function pwDebugPatch(fragmentShader: string): string {
  return fragmentShader.replace('#include <dithering_fragment>', `#include <dithering_fragment>\n${PW_DEBUG_OUT}`);
}
