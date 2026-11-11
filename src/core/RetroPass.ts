import * as THREE from 'three';
import type { QualityLevel, RetroMode } from './types';
import { PW_DEBUG_FLOOR, PW_DEBUG_KEY, pwDebug } from './debugView';

/** Vertical resolution of the arcade "board" per quality level (Sega Model 2 ran at 384 lines). */
const LINES: Record<QualityLevel, number> = { low: 224, medium: 288, high: 360 };
/** Lowest line-count multiplier dynamic resolution may use. */
export const RETRO_MIN_SCALE = 0.7;
/** Exposure of the monitor's tone curve (the renderer's `toneMappingExposure`: Engine sets it once). */
export const MONITOR_EXPOSURE = 1.05;
/** Colour levels a channel of the monitor (15-bit colour: 0 … 31). */
export const MONITOR_LEVELS = 31;
/**
 * The brightest level a palette-true pixel is written at. The top level needs a scene value of 6.9
 * (the tone curve's shoulder), which the CRT's phosphor bloom would spread over its neighbours as no
 * tone-mapped paint ever did; one level under it (247 of 255) needs 2.1.
 */
export const MONITOR_TOP = 30;
/** Alpha a palette-true pixel is written with (its flag: see `MONITOR`). */
const EXACT_ALPHA = 128 / 255;

/**
 * What a material that writes PALETTE-TRUE pixels needs to know of the pass its pixel goes through
 * (content/pixelworld/light.ts): a shared uniform — x the exposure of the tone curve the pass will
 * apply (0: there is no pass, the frame goes straight to the canvas), y its colour levels (0: no
 * lattice), z the top level such a pixel may take, w the alpha to write. Such a material snaps its
 * display colour to the lattice and writes the scene value the curve maps there, with `w` as its
 * alpha: the pass ROUNDS a pixel that still carries that alpha to its nearest level instead of
 * dithering it. In the half-float target the value survives so exactly that rounding and dithering
 * give the same colour anyway; an 8-bit target cannot hold it that finely, there the flag is what
 * keeps the ordered dither off painted art. Anything transparent drawn over the pixel changes its
 * alpha with its colour (normal and additive blending both do), so rain, smoke, glass and glows are
 * dithered over the world as ever — except an overlay made not to (`pwLightOverlay`: a stepped
 * light pool, which is paint), whose pixels stay flagged and land on whole colours.
 */
export const MONITOR = { uPwMon: { value: new THREE.Vector4(0, 0, MONITOR_TOP, 1) } };

const _css = new THREE.Vector2();
const _out = new THREE.Vector2();

const VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const FRAG = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D tScene;
  uniform vec2 uRes;      // low-res scene size in pixels
  uniform vec2 uOut;      // output size in device pixels
  uniform float uCrt;     // 0 = pixel mode, 1 = full CRT
  uniform float uExposure;
  uniform float uLevels;  // colour levels per channel after quantisation
  uniform float uTime;
  uniform float uExact;   // alpha of the pixels to round, not dither (palette-true ones: see MONITOR)
  #ifdef PW_DEBUG
    uniform float uPwDebug;
  #endif

  vec3 aces(vec3 x) {
    const float a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14;
    return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
  }
  vec3 toSRGB(vec3 c) {
    return mix(c * 12.92, 1.055 * pow(max(c, vec3(0.0)), vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
  }
  float bayer4(vec2 p) {
    vec2 q = mod(floor(p), 4.0);
    float i = q.x + q.y * 4.0;
    // 4x4 Bayer matrix flattened.
    if (i < 1.0) return 0.0; if (i < 2.0) return 8.0; if (i < 3.0) return 2.0; if (i < 4.0) return 10.0;
    if (i < 5.0) return 12.0; if (i < 6.0) return 4.0; if (i < 7.0) return 14.0; if (i < 8.0) return 6.0;
    if (i < 9.0) return 3.0; if (i < 10.0) return 11.0; if (i < 11.0) return 1.0; if (i < 12.0) return 9.0;
    if (i < 13.0) return 15.0; if (i < 14.0) return 7.0; if (i < 15.0) return 13.0; return 5.0;
  }
  vec2 curve(vec2 uv) {
    uv = uv * 2.0 - 1.0;
    vec2 o = abs(uv.yx) / vec2(7.0, 5.0);
    uv += uv * o * o * uCrt;
    return uv * 0.5 + 0.5;
  }
  vec4 sampleScene(vec2 uv) {
    vec2 cell = (floor(uv * uRes) + 0.5) / uRes;
    return texture2D(tScene, cell);
  }
  void main() {
    vec2 uv = curve(vUv);
    if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
      gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
      return;
    }
    vec2 px = uv * uRes;
    #ifdef PW_DEBUG
      // A PixelWorld debug view (core/debugView.ts): only the keyed pixels, at their own hue; the rest black.
      if (uPwDebug > 0.5) {
        vec3 k = sampleScene(uv).rgb;
        float m = max(k.r, max(k.g, k.b));
        gl_FragColor = vec4(m >= ${PW_DEBUG_FLOOR.toFixed(1)} ? k / m : vec3(0.0), 1.0);
        return;
      }
    #endif
    // Slight convergence error toward the edges (CRT only).
    vec2 ca = (uv - 0.5) * (0.9 * uCrt) / uRes;
    vec3 col;
    vec4 here = sampleScene(uv);
    col.r = sampleScene(uv + ca).r;
    col.g = here.g;
    col.b = sampleScene(uv - ca).b;
    // Cheap phosphor bloom: bright neighbours bleed a little.
    vec2 o = 1.5 / uRes;
    vec3 n = sampleScene(uv + vec2(o.x, 0.0)).rgb + sampleScene(uv - vec2(o.x, 0.0)).rgb +
             sampleScene(uv + vec2(0.0, o.y)).rgb + sampleScene(uv - vec2(0.0, o.y)).rgb;
    vec3 bloom = max(n * 0.25 - 0.55, 0.0);
    col = aces((col + bloom * 0.6 * uCrt) * uExposure);
    col = toSRGB(col);
    // 15-bit-era colour depth with ordered dithering on the low-res grid.
    float th = (bayer4(px) + 0.5) / 16.0 - 0.5;
    // (A palette-true pixel, flagged in alpha, is rounded to its level: no dither over painted art.)
    if (abs(here.a - uExact) < 0.003) th = 0.0;
    col = clamp(floor(col * uLevels + 0.5 + th) / uLevels, 0.0, 1.0);
    if (uCrt > 0.0) {
      // Scanlines: each low-res row is a bright beam with darker gaps.
      float f = fract(px.y);
      float beam = 0.62 + 0.38 * sin(f * 3.14159265);
      float rowsPerPx = uRes.y / uOut.y;
      beam = mix(beam, 1.0, clamp(rowsPerPx * 1.5 - 0.5, 0.0, 1.0)); // fade out when too dense to resolve
      // Aperture-grille mask at output resolution (very subtle).
      float m = mod(gl_FragCoord.x, 3.0);
      vec3 mask = vec3(m < 1.0 ? 1.0 : 0.94, m >= 1.0 && m < 2.0 ? 1.0 : 0.94, m >= 2.0 ? 1.0 : 0.94);
      // Vignette.
      vec2 v = uv * (1.0 - uv.yx);
      float vig = pow(clamp(v.x * v.y * 18.0, 0.0, 1.0), 0.22);
      // Faint rolling refresh band.
      float roll = 1.0 + 0.015 * sin(uv.y * 3.0 - uTime * 1.7);
      col *= beam * mask * vig * roll * 1.16;
    }
    gl_FragColor = vec4(col, 1.0);
  }
`;

/**
 * Arcade-monitor post process: renders the scene into a small render target
 * (nearest-filtered, no anti-aliasing) and upscales it with dithered colour
 * quantisation and optional CRT scanlines / curvature / bloom.
 * Rendering at ~288 lines is also much cheaper on phones.
 */
export class RetroPass {
  mode: RetroMode = 'off';
  /** Multiplier on the line count (dynamic resolution). */
  scale = 1;
  private rt: THREE.WebGLRenderTarget | null = null;
  private scene = new THREE.Scene();
  private cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private mat: THREE.ShaderMaterial;
  private quality: QualityLevel = 'medium';
  private hdr = false;
  private time = 0;

  constructor(private renderer: THREE.WebGLRenderer) {
    this.mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: {
        tScene: { value: null },
        uRes: { value: new THREE.Vector2(1, 1) },
        uOut: { value: new THREE.Vector2(1, 1) },
        uCrt: { value: 1 },
        uExposure: { value: 1.05 },
        uLevels: { value: MONITOR_LEVELS },
        uTime: { value: 0 },
        uExact: { value: 0 },
        uPwDebug: pwDebug.view,
      },
      defines: pwDebug.compiled ? { PW_DEBUG: '' } : {},
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.mat);
    quad.frustumCulled = false;
    this.scene.add(quad);
    const ext = renderer.extensions;
    this.hdr = !!(ext.has('EXT_color_buffer_half_float') || ext.has('EXT_color_buffer_float')) && !RetroPass.force8;
    this.mat.uniforms.uExact.value = EXACT_ALPHA;
  }

  /** `&pwrt=8` (tests of the fallback): the scene target is 8-bit even where half-float is there. */
  static force8 = false;

  get enabled() {
    return this.mode !== 'off';
  }

  configure(mode: RetroMode, quality: QualityLevel) {
    this.mode = mode;
    this.quality = quality;
    this.mat.uniforms.uCrt.value = mode === 'crt' ? 1 : 0;
    this.link();
  }

  /** Tell the palette-true materials what their pixels go through (`MONITOR`). */
  private link() {
    if (this.mode === 'off') MONITOR.uPwMon.value.set(0, 0, MONITOR_TOP, 1);
    else MONITOR.uPwMon.value.set(this.renderer.toneMappingExposure, MONITOR_LEVELS, MONITOR_TOP, EXACT_ALPHA);
  }

  /** Low-res target size for an output of (w, h) CSS pixels. */
  targetSize(w: number, h: number) {
    const lines = Math.round(LINES[this.quality] * this.scale);
    const short = Math.min(w, h);
    // Portrait: keep the same pixel size as landscape would have on this screen.
    const ratio = lines / short;
    return { width: Math.max(64, Math.round(w * ratio)), height: Math.max(64, Math.round(h * ratio)) };
  }

  /**
   * The low-res scene target for the renderer's current size (created or
   * resized as needed). Also bound by Engine.precompile so shader programs are
   * built for the state they are drawn in.
   */
  ensureTarget(): THREE.WebGLRenderTarget {
    const css = this.renderer.getSize(_css);
    const { width, height } = this.targetSize(css.x, css.y);
    if (!this.rt || this.rt.width !== width || this.rt.height !== height) {
      this.rt?.dispose();
      this.rt = new THREE.WebGLRenderTarget(width, height, {
        type: this.hdr ? THREE.HalfFloatType : THREE.UnsignedByteType,
        minFilter: THREE.NearestFilter,
        magFilter: THREE.NearestFilter,
        depthBuffer: true,
        stencilBuffer: false,
        generateMipmaps: false,
      });
      this.rt.texture.colorSpace = THREE.LinearSRGBColorSpace;
    }
    return this.rt;
  }

  render(scene: THREE.Scene, camera: THREE.Camera, dt: number) {
    const r = this.renderer;
    const out = r.getDrawingBufferSize(_out);
    const rt = this.ensureTarget();
    this.time += dt;
    const u = this.mat.uniforms;
    u.tScene.value = rt.texture;
    u.uRes.value.set(rt.width, rt.height);
    u.uOut.value.copy(out);
    u.uTime.value = this.time;
    u.uExposure.value = r.toneMappingExposure;
    this.link();
    // (Debug views are keyed through the float target; an 8-bit one would clamp the key away.)
    if (pwDebug.compiled) pwDebug.gain.value = this.hdr ? PW_DEBUG_KEY : 1;
    r.setRenderTarget(rt);
    r.clear();
    r.render(scene, camera);
    r.setRenderTarget(null);
    r.render(this.scene, this.cam);
  }

  dispose() {
    this.rt?.dispose();
    this.rt = null;
    this.mat.dispose();
  }
}
