import * as THREE from 'three';
import type { World, HitMarkerKind } from '../gameplay/World';
import type { Entity } from '../gameplay/Entity';

interface Marker {
  x: number;
  y: number;
  kind: HitMarkerKind;
  t: number;
}

interface Burst {
  x: number;
  y: number;
  t: number;
}

/** One projected attack telegraph (reused every frame — no allocations). */
interface Tele {
  onScreen: boolean;
  /** Screen position (CSS px) when on screen, else the edge-arrow anchor. */
  x: number;
  y: number;
  /** Ring radius at rest (CSS px) and current radius. */
  base: number;
  r: number;
  /** Wind-up progress 0..1. */
  p: number;
  /** Edge-arrow angle (radians, screen space). */
  ang: number;
}

const _v = new THREE.Vector3();
const _c = new THREE.Vector3();
const _d = new THREE.Vector3();

const MARKER_COLORS: Record<HitMarkerKind, string> = {
  hit: '#ffffff',
  head: '#ff3030',
  kill: '#ffe000',
  armor: '#9ab0c0',
  penalty: '#2ee6ff',
};
const DIAG: readonly (readonly [number, number])[] = [
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
];
/** Edge-arrow outline (dart pointing +x), CSS px. */
const ARROW: readonly (readonly [number, number])[] = [
  [18, 0],
  [-10, -13],
  [-4, 0],
  [-10, 13],
];
/** Arcade palette for the wind-up ring: yellow → orange → red. */
const RING_STEPS = ['#ffe000', '#ff8a00', '#ff2020'];

/**
 * Canvas layer over the 3D view for fast-changing 2D feedback: attack telegraph
 * rings, off-screen threat arrows, the tap reticle, hit markers and muzzle bursts.
 *
 * With the retro monitor on, it draws on the same low-resolution grid as the 3D
 * scene (`setPixelGrid`) using hard-edged pixel primitives (stepped circles,
 * Bresenham lines, scanline-filled polygons) and is upscaled with
 * `image-rendering: pixelated`, so rings and reticles have the same chunky
 * pixels as the world. Otherwise it draws smooth vector shapes at device resolution.
 */
export class Overlay2D {
  readonly canvas: HTMLCanvasElement;
  private g: CanvasRenderingContext2D;
  private markers: Marker[] = [];
  private bursts: Burst[] = [];
  private aim = { x: 0, y: 0, t: 99 };
  /** Canvas pixels per CSS pixel. */
  private kx = 1;
  private ky = 1;
  private w = 1;
  private h = 1;
  private time = 0;
  /** Retro grid size in canvas pixels (0 = full resolution). */
  private gridW = 0;
  private gridH = 0;
  private tele: Tele = { onScreen: false, x: 0, y: 0, base: 0, r: 0, p: 0, ang: 0 };
  private polyX = [0, 0, 0, 0];
  private polyY = [0, 0, 0, 0];
  private xs: number[] = [0, 0, 0, 0, 0, 0, 0, 0];

  constructor(parent: HTMLElement) {
    this.canvas = document.createElement('canvas');
    this.canvas.id = 'overlay2d';
    parent.appendChild(this.canvas);
    this.g = this.canvas.getContext('2d')!;
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  get pixelated() {
    return this.gridW > 0;
  }

  /**
   * Draw on a low-res pixel grid of `w` × `h` canvas pixels (the retro pass's
   * target size), or at full device resolution when `w` is 0.
   */
  setPixelGrid(w: number, h: number) {
    w = Math.max(0, Math.round(w));
    h = Math.max(0, Math.round(h));
    if (w === this.gridW && h === this.gridH) return;
    this.gridW = w;
    this.gridH = w > 0 ? h : 0;
    this.canvas.classList.toggle('pixelated', w > 0);
    this.resize();
  }

  resize() {
    this.w = Math.max(1, window.innerWidth);
    this.h = Math.max(1, window.innerHeight);
    if (this.gridW > 0) {
      this.canvas.width = this.gridW;
      this.canvas.height = this.gridH;
      this.kx = this.gridW / this.w;
      this.ky = this.gridH / this.h;
    } else {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      this.canvas.width = Math.round(this.w * dpr);
      this.canvas.height = Math.round(this.h * dpr);
      this.kx = this.ky = dpr;
    }
    this.canvas.style.width = `${this.w}px`;
    this.canvas.style.height = `${this.h}px`;
    this.g.imageSmoothingEnabled = false;
  }

  hitMarker(x: number, y: number, kind: HitMarkerKind) {
    const m = this.markers.length >= 30 ? this.markers.shift()! : ({} as Marker);
    m.x = x;
    m.y = y;
    m.kind = kind;
    m.t = 0;
    this.markers.push(m);
  }

  shot(x: number, y: number) {
    const b = this.bursts.length >= 20 ? this.bursts.shift()! : ({} as Burst);
    b.x = x;
    b.y = y;
    b.t = 0;
    this.bursts.push(b);
    this.aim.x = x;
    this.aim.y = y;
    this.aim.t = 0;
  }

  /** Keep the reticle visible while a finger is held (auto fire). */
  holdAim(x: number, y: number) {
    this.aim.x = x;
    this.aim.y = y;
    this.aim.t = Math.min(this.aim.t, 0.05);
  }

  clear() {
    this.markers.length = 0;
    this.bursts.length = 0;
    this.g.setTransform(1, 0, 0, 1, 0, 0);
    this.g.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  draw(world: World | null, dt: number) {
    const g = this.g;
    this.time += dt;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, this.canvas.width, this.canvas.height);
    // Smooth mode draws in CSS px through a DPR transform; pixel mode in raw canvas pixels.
    if (!this.pixelated) g.setTransform(this.kx, 0, 0, this.ky, 0, 0);
    g.globalAlpha = 1;
    if (world) this.drawTelegraphs(world);
    this.drawBursts(dt);
    this.drawMarkers(dt);
    this.drawAim(dt);
    g.globalAlpha = 1;
  }

  // ─── Telegraphs ───────────────────────────────────────────────────────────

  private drawTelegraphs(world: World) {
    const cam = world.camera;
    const focal = this.h / 2 / Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2);
    cam.getWorldDirection(_c);
    const ents = world.entities;
    for (let i = 0; i < ents.length; i++) {
      const e = ents[i];
      if (!e.telegraph || e.removed) continue;
      this.project(e, world, focal);
      if (this.pixelated) this.pixelTelegraph(this.tele);
      else this.smoothTelegraph(this.tele);
    }
  }

  /** Fill `this.tele` for an entity's telegraph. */
  private project(e: Entity, world: World, focal: number) {
    const tg = e.telegraph!;
    const cam = world.camera;
    const t = this.tele;
    tg.anchor.getWorldPosition(_v);
    const dist = _v.distanceTo(cam.position);
    const ahead = _d.subVectors(_v, cam.position).dot(_c);
    _v.project(cam);
    t.p = Math.min(1, Math.max(0, tg.progress));
    t.onScreen = ahead > 0 && Math.abs(_v.x) <= 1.05 && Math.abs(_v.y) <= 1.05;
    if (t.onScreen) {
      t.x = (_v.x * 0.5 + 0.5) * this.w;
      t.y = (-_v.y * 0.5 + 0.5) * this.h;
      t.base = Math.max(18, Math.min(140, ((tg.radius ?? 0.45) / Math.max(0.5, dist)) * focal));
      t.r = t.base * (2.4 - 1.4 * t.p);
      return;
    }
    // Edge arrow pointing toward the off-screen threat.
    let dx = _v.x;
    let dy = _v.y;
    if (ahead <= 0) {
      dx = -dx;
      dy = -dy;
    }
    const ang = Math.atan2(-dy, dx);
    const m = 34;
    const cx = this.w / 2;
    const cy = this.h / 2;
    const sx = Math.cos(ang);
    const sy = Math.sin(ang);
    const tx = sx !== 0 ? (cx - m) / Math.abs(sx) : Infinity;
    const ty = sy !== 0 ? (cy - m) / Math.abs(sy) : Infinity;
    const k = Math.min(tx, ty);
    t.x = cx + sx * k;
    t.y = cy + sy * k;
    t.ang = ang;
  }

  private smoothTelegraph(t: Tele) {
    const g = this.g;
    const p = t.p;
    const danger = p > 0.7;
    const pulse = danger ? 0.6 + 0.4 * Math.sin(this.time * 40) : 1;
    const col = `rgba(255, ${Math.round(220 * (1 - p))}, ${Math.round(40 * (1 - p))}, ${pulse})`;
    if (!t.onScreen) {
      g.save();
      g.translate(t.x, t.y);
      g.rotate(t.ang);
      g.fillStyle = col;
      g.beginPath();
      for (let i = 0; i < ARROW.length; i++) {
        if (i === 0) g.moveTo(ARROW[i][0], ARROW[i][1]);
        else g.lineTo(ARROW[i][0], ARROW[i][1]);
      }
      g.closePath();
      g.fill();
      g.restore();
      return;
    }
    const { x, y, base, r } = t;
    g.lineWidth = 3 + p * 3;
    g.strokeStyle = col;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.stroke();
    // Inner lock-on ticks.
    g.lineWidth = 2;
    for (let i = 0; i < 4; i++) {
      const a = i * (Math.PI / 2) + this.time * 2;
      g.beginPath();
      g.moveTo(x + Math.cos(a) * base * 0.55, y + Math.sin(a) * base * 0.55);
      g.lineTo(x + Math.cos(a) * base * 0.95, y + Math.sin(a) * base * 0.95);
      g.stroke();
    }
    if (danger) {
      g.fillStyle = `rgba(255,40,40,${0.12 * pulse})`;
      g.beginPath();
      g.arc(x, y, base, 0, Math.PI * 2);
      g.fill();
    }
    if (p > 0.55) {
      // "!" above the ring: this one is about to hit you.
      const fs = Math.round(Math.max(18, Math.min(34, base * 0.5)));
      g.font = `${fs}px 'Press Start 2P', 'Black Ops One', Impact, monospace`;
      g.textAlign = 'center';
      g.textBaseline = 'bottom';
      g.lineWidth = 4;
      g.strokeStyle = 'rgba(0,0,0,0.85)';
      g.fillStyle = col;
      const ty = Math.max(fs + 4, y - r - 2);
      g.strokeText('!', x, ty);
      g.fillText('!', x, ty);
    }
  }

  private pixelTelegraph(t: Tele) {
    const g = this.g;
    const p = t.p;
    const step = p < 0.4 ? 0 : p < 0.7 ? 1 : 2;
    // Arcade blink instead of an alpha pulse once it's about to land.
    const lit = step < 2 || ((this.time * 14) | 0) % 2 === 0;
    const col = lit ? RING_STEPS[step] : '#ffffff';
    if (!t.onScreen) {
      this.pxPoly(t.x, t.y, t.ang, '#000', 1);
      this.pxPoly(t.x, t.y, t.ang, col, 0);
      return;
    }
    const cx = Math.round(t.x * this.kx);
    const cy = Math.round(t.y * this.ky);
    const k = this.kx;
    const r = Math.max(4, Math.round(t.r * k));
    const base = Math.max(3, Math.round(t.base * k));
    const thick = 2 + step; // thickens as the strike gets closer
    if (step === 2 && lit) {
      g.globalAlpha = 0.28;
      this.pxDisc(cx, cy, base, '#ff2020');
      g.globalAlpha = 1;
    }
    // Black keyline under the coloured ring keeps it readable on any background.
    this.pxRing(cx, cy, r + 1, thick + 2, '#000');
    this.pxRing(cx, cy, r, thick, col);
    // Lock-on ticks (rotating).
    g.fillStyle = col;
    g.beginPath();
    for (let i = 0; i < 4; i++) {
      const a = i * (Math.PI / 2) + this.time * 2;
      const c = Math.cos(a);
      const s = Math.sin(a);
      this.pxLine(cx + c * base * 0.55, cy + s * base * 0.55, cx + c * base * 0.95, cy + s * base * 0.95, 2);
    }
    g.fill();
    if (p > 0.55) {
      // "!" above the ring (6u tall); near the top edge it slides down so it's never cut off.
      const u = Math.max(2, Math.round(base / 9));
      this.pxBang(cx, Math.max(6 * u + 3, cy - r - 3), u, col);
    }
  }

  // ─── Bursts / markers / reticle ───────────────────────────────────────────

  private drawBursts(dt: number) {
    const g = this.g;
    for (let i = this.bursts.length - 1; i >= 0; i--) {
      const b = this.bursts[i];
      b.t += dt;
      const k = b.t / 0.14;
      if (k >= 1) {
        this.bursts.splice(i, 1);
        continue;
      }
      if (this.pixelated) {
        const cx = Math.round(b.x * this.kx);
        const cy = Math.round(b.y * this.ky);
        const r = Math.round((6 + k * 26) * this.kx);
        this.pxRing(cx, cy, r, k < 0.5 ? 2 : 1, k < 0.35 ? '#ffffff' : k < 0.7 ? '#ffe000' : '#ff8a00');
        if (k < 0.4) this.pxDisc(cx, cy, Math.max(2, Math.round(6 * this.kx)), k < 0.2 ? '#ffffff' : '#fff2a0');
        continue;
      }
      g.strokeStyle = `rgba(255, 230, 160, ${1 - k})`;
      g.lineWidth = 3 * (1 - k) + 1;
      g.beginPath();
      g.arc(b.x, b.y, 6 + k * 26, 0, Math.PI * 2);
      g.stroke();
      if (k < 0.4) {
        g.fillStyle = `rgba(255, 245, 210, ${0.8 * (1 - k / 0.4)})`;
        g.beginPath();
        g.arc(b.x, b.y, 7, 0, Math.PI * 2);
        g.fill();
      }
    }
  }

  private drawMarkers(dt: number) {
    const g = this.g;
    for (let i = this.markers.length - 1; i >= 0; i--) {
      const m = this.markers[i];
      m.t += dt;
      const life = m.kind === 'kill' ? 0.35 : 0.22;
      const k = m.t / life;
      if (k >= 1) {
        this.markers.splice(i, 1);
        continue;
      }
      const s = (m.kind === 'kill' ? 16 : m.kind === 'head' ? 13 : 10) * (1 + k * 0.4);
      if (this.pixelated) {
        const cx = m.x * this.kx;
        const cy = m.y * this.ky;
        const ss = s * this.kx;
        const t = m.kind === 'kill' ? 2 : 1;
        g.globalAlpha = k < 0.6 ? 1 : 1 - (k - 0.6) / 0.4;
        for (let pass = 0; pass < 2; pass++) {
          // Black keyline first (one pixel fatter), then the colour.
          g.fillStyle = pass === 0 ? '#000' : MARKER_COLORS[m.kind];
          g.beginPath();
          for (let d = 0; d < DIAG.length; d++) {
            const sx = DIAG[d][0];
            const sy = DIAG[d][1];
            this.pxLine(cx + sx * ss * 0.45, cy + sy * ss * 0.45, cx + sx * ss, cy + sy * ss, t + (pass === 0 ? 2 : 0));
          }
          g.fill();
        }
        g.globalAlpha = 1;
        continue;
      }
      g.strokeStyle = MARKER_COLORS[m.kind];
      g.globalAlpha = 1 - k;
      g.lineWidth = m.kind === 'kill' ? 4 : 3;
      g.beginPath();
      for (let d = 0; d < DIAG.length; d++) {
        const sx = DIAG[d][0];
        const sy = DIAG[d][1];
        g.moveTo(m.x + sx * s * 0.45, m.y + sy * s * 0.45);
        g.lineTo(m.x + sx * s, m.y + sy * s);
      }
      g.stroke();
      g.globalAlpha = 1;
    }
  }

  private drawAim(dt: number) {
    const a = this.aim;
    a.t += dt;
    if (a.t > 0.6) return;
    const g = this.g;
    const alpha = 1 - a.t / 0.6;
    if (this.pixelated) {
      const cx = Math.round(a.x * this.kx);
      const cy = Math.round(a.y * this.ky);
      const r = Math.max(5, Math.round(14 * this.kx));
      const arm = Math.max(3, Math.round(8 * this.kx));
      g.globalAlpha = Math.min(1, alpha * 1.6);
      for (let pass = 0; pass < 2; pass++) {
        const o = pass === 0 ? 1 : 0;
        g.fillStyle = pass === 0 ? '#000' : '#ffffff';
        g.beginPath();
        // Crosshair arms (straddling the ring).
        g.rect(cx - r - arm / 2 - o, cy - o, arm + 2 * o, 1 + 2 * o);
        g.rect(cx + r - arm / 2 - o, cy - o, arm + 2 * o, 1 + 2 * o);
        g.rect(cx - o, cy - r - arm / 2 - o, 1 + 2 * o, arm + 2 * o);
        g.rect(cx - o, cy + r - arm / 2 - o, 1 + 2 * o, arm + 2 * o);
        g.fill();
        this.pxRing(cx, cy, r + o, 1 + 2 * o, pass === 0 ? '#000' : '#ffffff');
      }
      g.globalAlpha = 1;
      return;
    }
    g.strokeStyle = `rgba(255,255,255,${0.85 * alpha})`;
    g.lineWidth = 2;
    const r = 14;
    g.beginPath();
    g.arc(a.x, a.y, r, 0, Math.PI * 2);
    g.moveTo(a.x - r - 6, a.y);
    g.lineTo(a.x - r + 5, a.y);
    g.moveTo(a.x + r - 5, a.y);
    g.lineTo(a.x + r + 6, a.y);
    g.moveTo(a.x, a.y - r - 6);
    g.lineTo(a.x, a.y - r + 5);
    g.moveTo(a.x, a.y + r - 5);
    g.lineTo(a.x, a.y + r + 6);
    g.stroke();
  }

  // ─── Pixel primitives (canvas pixels, integer-aligned rects: no anti-aliasing) ──

  /** Stepped circle outline: `thick` pixels wide, outer radius `r`. */
  private pxRing(cx: number, cy: number, r: number, thick: number, color: string) {
    const g = this.g;
    const ro2 = (r + 0.5) * (r + 0.5);
    const ri = r - thick;
    const ri2 = ri > 0 ? (ri + 0.5) * (ri + 0.5) : -1;
    // Only rows that land on the canvas (big rings are often mostly off screen).
    const y0 = Math.max(-r, -cy);
    const y1 = Math.min(r, this.canvas.height - 1 - cy);
    g.fillStyle = color;
    g.beginPath();
    for (let dy = y0; dy <= y1; dy++) {
      const xo = Math.floor(Math.sqrt(Math.max(0, ro2 - dy * dy)));
      const inner = ri2 - dy * dy;
      if (inner <= 0) {
        g.rect(cx - xo, cy + dy, xo * 2 + 1, 1);
        continue;
      }
      const xi = Math.floor(Math.sqrt(inner));
      const span = xo - xi;
      if (span <= 0) continue;
      g.rect(cx - xo, cy + dy, span, 1);
      g.rect(cx + xi + 1, cy + dy, span, 1);
    }
    g.fill();
  }

  private pxDisc(cx: number, cy: number, r: number, color: string) {
    const g = this.g;
    const r2 = (r + 0.5) * (r + 0.5);
    const y0 = Math.max(-r, -cy);
    const y1 = Math.min(r, this.canvas.height - 1 - cy);
    g.fillStyle = color;
    g.beginPath();
    for (let dy = y0; dy <= y1; dy++) {
      const xo = Math.floor(Math.sqrt(Math.max(0, r2 - dy * dy)));
      g.rect(cx - xo, cy + dy, xo * 2 + 1, 1);
    }
    g.fill();
  }

  /** Bresenham line of `t`×`t` squares, appended to the current path. */
  private pxLine(x0: number, y0: number, x1: number, y1: number, t: number) {
    const g = this.g;
    let x = Math.round(x0);
    let y = Math.round(y0);
    const xe = Math.round(x1);
    const ye = Math.round(y1);
    const dx = Math.abs(xe - x);
    const dy = -Math.abs(ye - y);
    const sx = x < xe ? 1 : -1;
    const sy = y < ye ? 1 : -1;
    let err = dx + dy;
    const h = (t / 2) | 0;
    for (let n = 0; n < 512; n++) {
      g.rect(x - h, y - h, t, t);
      if (x === xe && y === ye) break;
      const e2 = 2 * err;
      if (e2 >= dy) {
        err += dy;
        x += sx;
      }
      if (e2 <= dx) {
        err += dx;
        y += sy;
      }
    }
  }

  /** Scanline-filled edge arrow at (x, y) CSS px, rotated by `ang`; `grow` px fatter (keyline). */
  private pxPoly(x: number, y: number, ang: number, color: string, grow: number) {
    const g = this.g;
    const c = Math.cos(ang);
    const s = Math.sin(ang);
    const sc = this.kx * (1 + grow * 0.14);
    let minY = Infinity;
    let maxY = -Infinity;
    for (let i = 0; i < ARROW.length; i++) {
      const ax = ARROW[i][0];
      const ay = ARROW[i][1];
      this.polyX[i] = x * this.kx + (ax * c - ay * s) * sc;
      this.polyY[i] = y * this.ky + (ax * s + ay * c) * sc;
      minY = Math.min(minY, this.polyY[i]);
      maxY = Math.max(maxY, this.polyY[i]);
    }
    g.fillStyle = color;
    g.beginPath();
    const n = ARROW.length;
    for (let py = Math.floor(minY); py <= Math.ceil(maxY); py++) {
      const yc = py + 0.5;
      let cnt = 0;
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        const y0 = this.polyY[i];
        const y1 = this.polyY[j];
        if ((y0 <= yc && y1 > yc) || (y1 <= yc && y0 > yc)) {
          this.xs[cnt++] = this.polyX[i] + ((yc - y0) / (y1 - y0)) * (this.polyX[j] - this.polyX[i]);
        }
      }
      // Tiny insertion sort (≤ 4 crossings).
      for (let i = 1; i < cnt; i++) {
        const v = this.xs[i];
        let j = i - 1;
        while (j >= 0 && this.xs[j] > v) {
          this.xs[j + 1] = this.xs[j];
          j--;
        }
        this.xs[j + 1] = v;
      }
      for (let i = 0; i + 1 < cnt; i += 2) {
        const a = Math.round(this.xs[i]);
        const b = Math.round(this.xs[i + 1]);
        if (b > a) g.rect(a, py, b - a, 1);
      }
    }
    g.fill();
  }

  /** Blocky "!" with a black keyline, bottom-centred at (cx, by). */
  private pxBang(cx: number, by: number, u: number, color: string) {
    const g = this.g;
    const x = cx - Math.floor(u / 2);
    const barH = u * 4;
    const top = by - barH - u * 2;
    g.fillStyle = '#000';
    g.fillRect(x - 1, top - 1, u + 2, barH + 2);
    g.fillRect(x - 1, by - u - 1, u + 2, u + 2);
    g.fillStyle = color;
    g.fillRect(x, top, u, barH);
    g.fillRect(x, by - u, u, u);
  }
}
