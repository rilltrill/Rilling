import * as THREE from 'three';
import type { QualityLevel, RetroMode } from './types';
import { RetroPass } from './RetroPass';

const QUALITY_PRESETS: Record<QualityLevel, { maxDpr: number; minDpr: number; antialias: boolean }> = {
  low: { maxDpr: 1, minDpr: 0.6, antialias: false },
  medium: { maxDpr: 1.5, minDpr: 0.75, antialias: false },
  high: { maxDpr: 2, minDpr: 1, antialias: true },
};

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
  fps = 60;

  private running = false;
  private last = 0;
  private quality: QualityLevel;
  private dpr = 1;
  private perfAccum = 0;
  private perfFrames = 0;
  private perfGoodTime = 0;
  private rafId = 0;
  private width = 1;
  private height = 1;
  /** Arcade-monitor post effect (off until configured). */
  readonly retro: RetroPass;
  private lastDt = 0;

  constructor(container: HTMLElement, quality: QualityLevel) {
    this.quality = quality;
    const preset = QUALITY_PRESETS[quality];
    this.renderer = new THREE.WebGLRenderer({
      antialias: preset.antialias,
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

    this.camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.05, 400);
    this.retro = new RetroPass(this.renderer);
    this.dpr = Math.min(window.devicePixelRatio || 1, preset.maxDpr);
    this.resize();
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

  setQuality(q: QualityLevel) {
    this.quality = q;
    this.dpr = Math.min(window.devicePixelRatio || 1, QUALITY_PRESETS[q].maxDpr);
    this.retro.configure(this.retro.mode, q);
    this.resize();
  }

  /** Switch the arcade-monitor look ('crt' | 'pixel' | 'off'). */
  setRetro(mode: RetroMode) {
    this.retro.configure(mode, this.quality);
    this.retro.scale = 1;
    // The 3D scene renders at low resolution in retro modes; the output only needs
    // enough pixels for crisp scanlines.
    this.dpr = Math.min(window.devicePixelRatio || 1, mode === 'off' ? QUALITY_PRESETS[this.quality].maxDpr : 2);
    this.resize();
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
    if (this.retro.enabled) this.retro.render(scene, camera, this.lastDt);
    else this.renderer.render(scene, camera);
  }

  /** Dynamic resolution: drop pixel ratio when frames are slow, recover when fast. */
  private trackPerf(raw: number) {
    if (raw <= 0 || raw > 0.5) return; // tab switch / hitch
    this.perfAccum += raw;
    this.perfFrames++;
    if (this.perfAccum < 1.5) return;
    const avg = this.perfAccum / this.perfFrames;
    this.fps = Math.round(1 / avg);
    const preset = QUALITY_PRESETS[this.quality];
    const deviceMax = Math.min(window.devicePixelRatio || 1, preset.maxDpr);
    if (this.retro.enabled) {
      // In retro modes the scene cost is the low-res target: scale its line count instead.
      if (avg > 1 / 45 && this.retro.scale > 0.7) this.retro.scale = +(this.retro.scale - 0.1).toFixed(2);
      else if (avg < 1 / 57 && this.retro.scale < 1) {
        this.perfGoodTime += this.perfAccum;
        if (this.perfGoodTime > 6) {
          this.retro.scale = Math.min(1, +(this.retro.scale + 0.1).toFixed(2));
          this.perfGoodTime = 0;
        }
      }
      this.perfAccum = 0;
      this.perfFrames = 0;
      return;
    }
    if (avg > 1 / 45 && this.dpr > preset.minDpr) {
      this.dpr = Math.max(preset.minDpr, +(this.dpr - 0.15).toFixed(2));
      this.perfGoodTime = 0;
      this.resize();
    } else if (avg < 1 / 57) {
      this.perfGoodTime += this.perfAccum;
      if (this.perfGoodTime > 6 && this.dpr < deviceMax) {
        this.dpr = Math.min(deviceMax, +(this.dpr + 0.1).toFixed(2));
        this.perfGoodTime = 0;
        this.resize();
      }
    } else {
      this.perfGoodTime = 0;
    }
    this.perfAccum = 0;
    this.perfFrames = 0;
  }
}
