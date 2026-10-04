import * as THREE from 'three';
import type { World, HitMarkerKind } from '../gameplay/World';

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

const _v = new THREE.Vector3();
const _c = new THREE.Vector3();
const _d = new THREE.Vector3();

const MARKER_COLORS: Record<HitMarkerKind, string> = {
  hit: '#ffffff',
  head: '#ff4040',
  kill: '#ffd040',
  armor: '#9ab0c0',
  penalty: '#40a0ff',
};

/**
 * Canvas layer over the 3D view for fast-changing 2D feedback: attack telegraph
 * rings, off-screen threat arrows, the tap reticle, hit markers and muzzle bursts.
 */
export class Overlay2D {
  readonly canvas: HTMLCanvasElement;
  private g: CanvasRenderingContext2D;
  private markers: Marker[] = [];
  private bursts: Burst[] = [];
  private aim = { x: 0, y: 0, t: 99 };
  private dpr = 1;
  private w = 1;
  private h = 1;
  private time = 0;

  constructor(parent: HTMLElement) {
    this.canvas = document.createElement('canvas');
    this.canvas.id = 'overlay2d';
    parent.appendChild(this.canvas);
    this.g = this.canvas.getContext('2d')!;
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.w = window.innerWidth;
    this.h = window.innerHeight;
    this.canvas.width = Math.round(this.w * this.dpr);
    this.canvas.height = Math.round(this.h * this.dpr);
    this.canvas.style.width = `${this.w}px`;
    this.canvas.style.height = `${this.h}px`;
  }

  hitMarker(x: number, y: number, kind: HitMarkerKind) {
    this.markers.push({ x, y, kind, t: 0 });
    if (this.markers.length > 30) this.markers.shift();
  }

  shot(x: number, y: number) {
    this.bursts.push({ x, y, t: 0 });
    if (this.bursts.length > 20) this.bursts.shift();
    this.aim = { x, y, t: 0 };
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
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    if (world) this.drawTelegraphs(world);
    this.drawBursts(dt);
    this.drawMarkers(dt);
    this.drawAim(dt);
  }

  private drawTelegraphs(world: World) {
    const g = this.g;
    const cam = world.camera;
    const focal = this.h / 2 / Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2);
    cam.getWorldDirection(_c);
    for (const e of world.entities) {
      const tg = e.telegraph;
      if (!tg || e.removed) continue;
      tg.anchor.getWorldPosition(_v);
      const dist = _v.distanceTo(cam.position);
      const ahead = _d.subVectors(_v, cam.position).dot(_c);
      _v.project(cam);
      const p = Math.min(1, Math.max(0, tg.progress));
      const danger = p > 0.7;
      const pulse = danger ? 0.6 + 0.4 * Math.sin(this.time * 40) : 1;
      const col = `rgba(255, ${Math.round(220 * (1 - p))}, ${Math.round(40 * (1 - p))}, ${pulse})`;
      const onScreen = ahead > 0 && Math.abs(_v.x) <= 1.05 && Math.abs(_v.y) <= 1.05;
      if (onScreen) {
        const x = (_v.x * 0.5 + 0.5) * this.w;
        const y = (-_v.y * 0.5 + 0.5) * this.h;
        const base = Math.max(18, Math.min(140, ((tg.radius ?? 0.45) / Math.max(0.5, dist)) * focal));
        const r = base * (2.4 - 1.4 * p);
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
          g.font = `${fs}px 'Black Ops One', Impact, sans-serif`;
          g.textAlign = 'center';
          g.textBaseline = 'bottom';
          g.lineWidth = 4;
          g.strokeStyle = 'rgba(0,0,0,0.85)';
          g.fillStyle = col;
          const ty = Math.max(fs + 4, y - r - 2);
          g.strokeText('!', x, ty);
          g.fillText('!', x, ty);
        }
      } else {
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
        const t = Math.min(tx, ty);
        const x = cx + sx * t;
        const y = cy + sy * t;
        g.save();
        g.translate(x, y);
        g.rotate(ang);
        g.fillStyle = col;
        g.beginPath();
        g.moveTo(18, 0);
        g.lineTo(-10, -13);
        g.lineTo(-4, 0);
        g.lineTo(-10, 13);
        g.closePath();
        g.fill();
        g.restore();
      }
    }
  }

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
      g.strokeStyle = MARKER_COLORS[m.kind];
      g.globalAlpha = 1 - k;
      g.lineWidth = m.kind === 'kill' ? 4 : 3;
      g.beginPath();
      for (const [sx, sy] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
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
}
