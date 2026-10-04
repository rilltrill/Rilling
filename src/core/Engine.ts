import * as THREE from 'three';
import type { QualityLevel, RetroMode } from './types';
import { RetroPass, RETRO_MIN_SCALE } from './RetroPass';
import { ResolutionGovernor } from './Resolution';

export const QUALITY_PRESETS: Record<QualityLevel, { maxDpr: number; minDpr: number; antialias: boolean }> = {
  low: { maxDpr: 1, minDpr: 0.6, antialias: false },
  medium: { maxDpr: 1.5, minDpr: 0.75, antialias: false },
  high: { maxDpr: 2, minDpr: 1, antialias: true },
};

/**
 * Output pixel ratio of the arcade-monitor pass (CRT / PIXEL). The 3D scene is
 * drawn into a small target either way; the output only needs enough device
 * pixels per scanline (≥ ~2.5) for even scanlines and pixel edges.
 */
const RETRO_DPR: Record<QualityLevel, number> = { low: 1.5, medium: 2, high: 2 };
/** Dynamic resolution: retro output DPR floor and step; clean-mode DPR step. */
const RETRO_MIN_DPR = 1;
const RETRO_DPR_STEP = 0.25;
const DPR_STEP = 0.15;
/** Retro line-scale ladder (1 → RETRO_MIN_SCALE). */
const SCALE_STEP = 0.1;

/** The single output-DPR rule (quality × display mode × device), used everywhere. */
export function outputDpr(quality: QualityLevel, retro: RetroMode, deviceDpr = 1): number {
  const cap = retro === 'off' ? QUALITY_PRESETS[quality].maxDpr : RETRO_DPR[quality];
  return Math.min(deviceDpr > 0 ? deviceDpr : 1, cap);
}

/**
 * Dynamic-resolution ladder for a quality/display mode: level → (retro line
 * scale, output DPR). Retro modes first drop scene lines (the expensive part),
 * then the output pass DPR; clean mode drops the DPR.
 */
export function resolutionLevel(quality: QualityLevel, retro: RetroMode, deviceDpr: number, level: number): { scale: number; dpr: number; maxLevel: number } {
  const top = outputDpr(quality, retro, deviceDpr);
  if (retro !== 'off') {
    const scaleSteps = Math.round((1 - RETRO_MIN_SCALE) / SCALE_STEP);
    const dprSteps = Math.max(0, Math.ceil((top - RETRO_MIN_DPR) / RETRO_DPR_STEP - 1e-6));
    const l = Math.min(Math.max(0, level), scaleSteps + dprSteps);
    const scale = +(1 - SCALE_STEP * Math.min(l, scaleSteps)).toFixed(2);
    const dpr = Math.max(Math.min(top, RETRO_MIN_DPR), +(top - RETRO_DPR_STEP * Math.max(0, l - scaleSteps)).toFixed(2));
    return { scale, dpr, maxLevel: scaleSteps + dprSteps };
  }
  const min = Math.min(top, QUALITY_PRESETS[quality].minDpr);
  const steps = Math.max(0, Math.ceil((top - min) / DPR_STEP - 1e-6));
  const l = Math.min(Math.max(0, level), steps);
  return { scale: 1, dpr: Math.max(min, +(top - DPR_STEP * l).toFixed(2)), maxLevel: steps };
}

/**
 * Owns the WebGL renderer, the main camera and the frame loop.
 * Includes dynamic resolution scaling so slower phones keep a playable frame rate.
 */
export class Engine {
  readonly renderer: THREE.WebGLRenderer;
  readonly camera: THREE.PerspectiveCamera;
  readonly canvas: HTMLCanvasElement;
  /** Called every animation frame with the clamped delta in seconds. */
  onFrame: (dt: number) => void = () => {};
  /** The GPU dropped the WebGL context (iOS memory pressure…) / gave it back. */
  onContextLost: () => void = () => {};
  onContextRestored: () => void = () => {};
  /** True while the WebGL context is lost (nothing can be drawn). */
  contextLost = false;
  fps = 60;

  private running = false;
  private last = 0;
  private quality: QualityLevel;
  private dpr = 1;
  private rafId = 0;
  private width = 1;
  private height = 1;
  /** Arcade-monitor post effect (off until configured). */
  readonly retro: RetroPass;
  private lastDt = 0;
  private readonly governor = new ResolutionGovernor();

  /**
   * `retro`: the display mode the game boots with. MSAA only helps the clean
   * mode (retro modes draw into a non-multisampled low-res target), so the
   * context is created without it in CRT/PIXEL (switching needs a reload).
   */
  constructor(container: HTMLElement, quality: QualityLevel, retro: RetroMode = 'off') {
    this.quality = quality;
    const preset = QUALITY_PRESETS[quality];
    this.renderer = new THREE.WebGLRenderer({
      antialias: preset.antialias && retro === 'off',
      powerPreference: 'high-performance',
      alpha: false,
      stencil: false,
      preserveDrawingBuffer: false,
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = false;
    // The retro pass renders twice per frame; count stats per frame, not per render call.
    this.renderer.info.autoReset = false;
    this.canvas = this.renderer.domElement;
    this.canvas.id = 'game-canvas';
    container.appendChild(this.canvas);
    // three.js preventDefault()s the loss (so a restore can happen) and stops drawing;
    // the game needs to know so it can pause instead of playing on blind.
    this.canvas.addEventListener('webglcontextlost', () => {
      this.contextLost = true;
      this.onContextLost();
    });
    this.canvas.addEventListener('webglcontextrestored', () => {
      this.contextLost = false;
      this.onContextRestored();
    });

    this.camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.05, 400);
    this.retro = new RetroPass(this.renderer);
    this.retro.configure(retro, quality);
    this.resetResolution();
    window.addEventListener('resize', () => this.resize());
    window.addEventListener('orientationchange', () => setTimeout(() => this.resize(), 150));
    window.visualViewport?.addEventListener('resize', () => this.resize());
  }

  get size() {
    return { width: this.width, height: this.height };
  }

  get pixelRatio() {
    return this.dpr;
  }

  /** Current dynamic-resolution level (0 = full quality). */
  get resolutionLevel() {
    return this.governor.level;
  }

  setQuality(q: QualityLevel) {
    this.quality = q;
    this.retro.configure(this.retro.mode, q);
    this.resetResolution();
  }

  /** Switch the arcade-monitor look ('crt' | 'pixel' | 'off'). */
  setRetro(mode: RetroMode) {
    this.retro.configure(mode, this.quality);
    this.resetResolution();
  }

  /** Full quality for the current settings (also undoes dynamic-resolution steps). */
  private resetResolution() {
    const lv = resolutionLevel(this.quality, this.retro.mode, window.devicePixelRatio || 1, 0);
    this.governor.reset(lv.maxLevel);
    this.applyLevel(0, true);
  }

  private applyLevel(level: number, force = false) {
    const lv = resolutionLevel(this.quality, this.retro.mode, window.devicePixelRatio || 1, level);
    this.retro.scale = lv.scale;
    if (force || lv.dpr !== this.dpr) {
      this.dpr = lv.dpr;
      this.resize();
    }
  }

  resize() {
    const w = Math.max(1, window.innerWidth);
    const h = Math.max(1, window.innerHeight);
    this.width = w;
    this.height = h;
    this.renderer.setPixelRatio(this.dpr);
    this.renderer.setSize(w, h, false);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    const aspect = w / h;
    this.camera.aspect = aspect;
    // Keep at least ~78° of horizontal view so portrait / narrow screens still see the action.
    const baseV = 58;
    const minH = 78;
    const hFromV = (2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(baseV) / 2) * aspect) * 180) / Math.PI;
    this.camera.fov =
      hFromV < minH
        ? (2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(minH) / 2) / aspect) * 180) / Math.PI
        : baseV;
    this.camera.updateProjectionMatrix();
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    const tick = (now: number) => {
      if (!this.running) return;
      this.rafId = requestAnimationFrame(tick);
      const raw = (now - this.last) / 1000;
      this.last = now;
      const dt = Math.min(Math.max(raw, 0), 1 / 20);
      this.lastDt = dt;
      this.trackPerf(raw);
      this.renderer.info.reset();
      this.onFrame(dt);
    };
    this.rafId = requestAnimationFrame(tick);
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.rafId);
  }

  render(scene: THREE.Scene, camera: THREE.Camera = this.camera) {
    if (this.contextLost) return;
    if (this.retro.enabled) this.retro.render(scene, camera, this.lastDt);
    else this.renderer.render(scene, camera);
  }

  /**
   * Compile the shader programs `objects` need, in the same GL state `render()`
   * uses (the retro target bound in CRT/PIXEL: program variants depend on the
   * render target's colour space and tone mapping). `scene` supplies the lights
   * and fog. Lets a stage pay for its compiles behind a loading card instead of
   * stuttering when each enemy type first appears.
   */
  precompile(objects: THREE.Object3D, scene: THREE.Scene, camera: THREE.Camera = this.camera) {
    if (this.contextLost) return;
    const r = this.renderer;
    const prev = r.getRenderTarget();
    try {
      r.setRenderTarget(this.retro.enabled ? this.retro.ensureTarget() : null);
      r.compile(objects, camera, scene);
    } finally {
      r.setRenderTarget(prev);
    }
  }

  /** Dynamic resolution: drop resolution when frames are slow (and it helps), recover when fast. */
  private trackPerf(raw: number) {
    const changed = this.governor.sample(raw);
    this.fps = this.governor.fps;
    if (changed) this.applyLevel(this.governor.level);
  }
}
