import * as THREE from 'three';
import { Rng } from '../core/Rng';

export interface BloodOptions {
  color?: number;
  /** 0.5 = small spurt, 1 = normal, 2 = big burst. */
  amount?: number;
}

/** Hook the FX system uses to put 2D effects on the HUD (screen splats). */
export interface FxScreenHooks {
  splat?(color: number): void;
}

const MAX_PARTICLES = 1400;
const MAX_CHUNKS = 160;

const VERT = /* glsl */ `
  attribute float aSize;
  attribute float aAlpha;
  attribute vec3 aColor;
  varying float vAlpha;
  varying vec3 vColor;
  uniform float uScale;
  void main() {
    vAlpha = aAlpha;
    vColor = aColor;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aSize * uScale / max(0.1, -mv.z);
    gl_Position = projectionMatrix * mv;
  }
`;
const FRAG = /* glsl */ `
  varying float vAlpha;
  varying vec3 vColor;
  uniform float uSoft;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float d = length(c) * 2.0;
    if (d > 1.0) discard;
    float a = vAlpha * mix(1.0, 1.0 - d * d, uSoft);
    gl_FragColor = vec4(vColor, a);
  }
`;

class ParticlePool {
  readonly points: THREE.Points;
  private pos: Float32Array;
  private vel = new Float32Array(MAX_PARTICLES * 3);
  private col: Float32Array;
  private size: Float32Array;
  private alpha: Float32Array;
  private life = new Float32Array(MAX_PARTICLES);
  private maxLife = new Float32Array(MAX_PARTICLES);
  private baseSize = new Float32Array(MAX_PARTICLES);
  private grav = new Float32Array(MAX_PARTICLES);
  private drag = new Float32Array(MAX_PARTICLES);
  private grow = new Float32Array(MAX_PARTICLES);
  private cursor = 0;
  private geo: THREE.BufferGeometry;
  readonly mat: THREE.ShaderMaterial;

  constructor(additive: boolean) {
    this.pos = new Float32Array(MAX_PARTICLES * 3);
    this.col = new Float32Array(MAX_PARTICLES * 3);
    this.size = new Float32Array(MAX_PARTICLES);
    this.alpha = new Float32Array(MAX_PARTICLES);
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aColor', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
    this.mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: { uScale: { value: 300 }, uSoft: { value: additive ? 1 : 0.35 } },
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(this.geo, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
  }

  emit(
    p: THREE.Vector3,
    v: THREE.Vector3,
    color: THREE.Color,
    size: number,
    life: number,
    gravity: number,
    drag: number,
    grow = 0,
  ) {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % MAX_PARTICLES;
    const i3 = i * 3;
    this.pos[i3] = p.x;
    this.pos[i3 + 1] = p.y;
    this.pos[i3 + 2] = p.z;
    this.vel[i3] = v.x;
    this.vel[i3 + 1] = v.y;
    this.vel[i3 + 2] = v.z;
    this.col[i3] = color.r;
    this.col[i3 + 1] = color.g;
    this.col[i3 + 2] = color.b;
    this.life[i] = life;
    this.maxLife[i] = life;
    this.baseSize[i] = size;
    this.size[i] = size;
    this.alpha[i] = 1;
    this.grav[i] = gravity;
    this.drag[i] = drag;
    this.grow[i] = grow;
  }

  update(dt: number) {
    for (let i = 0; i < MAX_PARTICLES; i++) {
      if (this.life[i] <= 0) {
        if (this.size[i] !== 0) {
          this.size[i] = 0;
          this.alpha[i] = 0;
        }
        continue;
      }
      this.life[i] -= dt;
      const i3 = i * 3;
      const dr = Math.exp(-this.drag[i] * dt);
      this.vel[i3] *= dr;
      this.vel[i3 + 1] = this.vel[i3 + 1] * dr - this.grav[i] * dt;
      this.vel[i3 + 2] *= dr;
      this.pos[i3] += this.vel[i3] * dt;
      this.pos[i3 + 1] += this.vel[i3 + 1] * dt;
      this.pos[i3 + 2] += this.vel[i3 + 2] * dt;
      const k = Math.max(0, this.life[i] / this.maxLife[i]);
      this.alpha[i] = Math.min(1, k * 2.2);
      this.size[i] = this.baseSize[i] * (1 + this.grow[i] * (1 - k));
    }
    for (const name of ['position', 'aColor', 'aSize', 'aAlpha']) {
      (this.geo.attributes[name] as THREE.BufferAttribute).needsUpdate = true;
    }
  }

  clear() {
    this.life.fill(0);
    this.size.fill(0);
    this.alpha.fill(0);
  }

  dispose() {
    this.geo.dispose();
    this.mat.dispose();
  }
}

/** Physics chunks (gore bits, debris, shell casings) via a single InstancedMesh. */
class ChunkPool {
  readonly mesh: THREE.InstancedMesh;
  private pos: THREE.Vector3[] = [];
  private vel: THREE.Vector3[] = [];
  private rot: THREE.Euler[] = [];
  private spin: THREE.Vector3[] = [];
  private life = new Float32Array(MAX_CHUNKS);
  private scale = new Float32Array(MAX_CHUNKS);
  private floor = new Float32Array(MAX_CHUNKS);
  private cursor = 0;
  private dummy = new THREE.Object3D();

  constructor() {
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const mat = new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true });
    this.mesh = new THREE.InstancedMesh(geo, mat, MAX_CHUNKS);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    for (let i = 0; i < MAX_CHUNKS; i++) {
      this.pos.push(new THREE.Vector3());
      this.vel.push(new THREE.Vector3());
      this.rot.push(new THREE.Euler());
      this.spin.push(new THREE.Vector3());
      this.mesh.setColorAt(i, new THREE.Color(0xffffff));
      this.dummy.scale.setScalar(0);
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(i, this.dummy.matrix);
    }
  }

  emit(p: THREE.Vector3, v: THREE.Vector3, color: THREE.Color, size: number, life: number, floorY: number, rng: Rng) {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % MAX_CHUNKS;
    this.pos[i].copy(p);
    this.vel[i].copy(v);
    this.rot[i].set(rng.next() * 6, rng.next() * 6, rng.next() * 6);
    this.spin[i].set(rng.spread(12), rng.spread(12), rng.spread(12));
    this.life[i] = life;
    this.scale[i] = size;
    this.floor[i] = floorY;
    this.mesh.setColorAt(i, color);
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  update(dt: number) {
    for (let i = 0; i < MAX_CHUNKS; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      const v = this.vel[i];
      const p = this.pos[i];
      v.y -= 14 * dt;
      p.addScaledVector(v, dt);
      if (p.y < this.floor[i] + this.scale[i] * 0.5) {
        p.y = this.floor[i] + this.scale[i] * 0.5;
        v.y = Math.abs(v.y) * 0.3;
        v.x *= 0.6;
        v.z *= 0.6;
        this.spin[i].multiplyScalar(0.6);
      }
      const r = this.rot[i];
      r.x += this.spin[i].x * dt;
      r.y += this.spin[i].y * dt;
      r.z += this.spin[i].z * dt;
      this.dummy.position.copy(p);
      this.dummy.rotation.copy(r);
      const s = this.scale[i] * Math.min(1, this.life[i] * 2);
      this.dummy.scale.setScalar(Math.max(0, s));
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(i, this.dummy.matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  clear() {
    this.life.fill(0);
    this.dummy.scale.setScalar(0);
    this.dummy.updateMatrix();
    for (let i = 0; i < MAX_CHUNKS; i++) this.mesh.setMatrixAt(i, this.dummy.matrix);
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  dispose() {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
    this.mesh.dispose();
  }
}

const _v = new THREE.Vector3();
const _p = new THREE.Vector3();
const _c = new THREE.Color();
const _c2 = new THREE.Color();

/**
 * World-space visual effects. Everything is pooled — calling these every shot is fine.
 */
export class Fx {
  readonly group = new THREE.Group();
  private normal = new ParticlePool(false);
  private glow = new ParticlePool(true);
  private chunks = new ChunkPool();
  private flashLight = new THREE.PointLight(0xffaa55, 0, 18, 2);
  private flashT = 0;
  private rng = new Rng(4242);
  screen: FxScreenHooks = {};
  /** Ground height lookup (set by World). */
  groundAt: (x: number, z: number) => number = () => 0;

  constructor() {
    this.group.name = 'fx';
    this.group.add(this.normal.points, this.glow.points, this.chunks.mesh, this.flashLight);
  }

  /** Must be called when the viewport height changes (keeps particle size consistent). */
  setViewportHeight(px: number, pixelRatio: number) {
    const s = px * pixelRatio * 0.5;
    this.normal.mat.uniforms.uScale.value = s;
    this.glow.mat.uniforms.uScale.value = s;
  }

  /** Blood / goo burst in the direction of the shot. */
  blood(point: THREE.Vector3, dir: THREE.Vector3 | null, o: BloodOptions = {}) {
    const amount = o.amount ?? 1;
    _c.setHex(o.color ?? 0x8a0a0a);
    const r = this.rng;
    const n = Math.round(10 * amount);
    for (let i = 0; i < n; i++) {
      _v.set(r.spread(1.6), r.range(0.6, 2.6), r.spread(1.6));
      if (dir) _v.addScaledVector(dir, r.range(1, 3.5));
      _c2.copy(_c).multiplyScalar(r.range(0.6, 1.25));
      this.normal.emit(point, _v, _c2, r.range(0.05, 0.13) * (0.8 + amount * 0.3), r.range(0.4, 0.8), 9, 1.5);
    }
    // Mist puff.
    for (let i = 0; i < 3; i++) {
      _v.set(r.spread(0.4), r.range(0.1, 0.5), r.spread(0.4));
      this.normal.emit(point, _v, _c, r.range(0.25, 0.4) * amount, 0.35, 0, 3, 1.5);
    }
    if (amount >= 1.2) this.gibs(point, o.color ?? 0x8a0a0a, Math.round(amount * 2));
  }

  /** Physical chunks that bounce on the ground. */
  gibs(point: THREE.Vector3, color: number, count = 4, size = 0.09) {
    const r = this.rng;
    const floor = this.groundAt(point.x, point.z);
    for (let i = 0; i < count; i++) {
      _v.set(r.spread(2.5), r.range(2, 5), r.spread(2.5));
      _c.setHex(color).multiplyScalar(r.range(0.7, 1.1));
      this.chunks.emit(point, _v, _c, size * r.range(0.6, 1.4), r.range(1.5, 3), floor, r);
    }
  }

  /** Metal spark spray (armour hits, bullet ricochets). */
  sparks(point: THREE.Vector3, normal: THREE.Vector3 | null, count = 8) {
    const r = this.rng;
    for (let i = 0; i < count; i++) {
      _v.set(r.spread(3), r.range(0.5, 4), r.spread(3));
      if (normal) _v.addScaledVector(normal, r.range(1, 4));
      _c.setHSL(r.range(0.08, 0.14), 1, r.range(0.55, 0.8));
      this.glow.emit(point, _v, _c, r.range(0.03, 0.06), r.range(0.15, 0.4), 12, 2);
    }
  }

  /** Bullet hitting scenery. */
  impact(point: THREE.Vector3, normal: THREE.Vector3 | null, surface: string = 'concrete') {
    const r = this.rng;
    const col = surface === 'grass' ? 0x4a6a2a : surface === 'dirt' ? 0x6b5236 : surface === 'wood' ? 0x7a5a3a : surface === 'water' ? 0xbfe4ff : 0x8a8a84;
    for (let i = 0; i < 6; i++) {
      _v.set(r.spread(1.2), r.range(0.8, 2.5), r.spread(1.2));
      if (normal) _v.addScaledVector(normal, r.range(0.5, 2));
      _c.setHex(col).multiplyScalar(r.range(0.7, 1.2));
      this.normal.emit(point, _v, _c, r.range(0.05, 0.12), r.range(0.3, 0.7), 8, 2);
    }
    _c.setHex(col);
    this.normal.emit(point, _v.set(0, 0.4, 0), _c, 0.35, 0.5, 0, 2, 2);
    if (surface === 'metal' || surface === 'concrete') this.sparks(point, normal, 3);
  }

  /** Puff of dust (spawns, landings, footfalls of big monsters). */
  dust(point: THREE.Vector3, scale = 1, color = 0x8a7f6c) {
    const r = this.rng;
    const n = Math.round(10 * scale);
    for (let i = 0; i < n; i++) {
      const a = r.next() * Math.PI * 2;
      _v.set(Math.cos(a) * r.range(0.8, 2.2) * scale, r.range(0.2, 0.9), Math.sin(a) * r.range(0.8, 2.2) * scale);
      _p.copy(point);
      _p.y += 0.1;
      _c.setHex(color).multiplyScalar(r.range(0.8, 1.15));
      this.normal.emit(_p, _v, _c, r.range(0.3, 0.6) * scale, r.range(0.6, 1.1), -0.3, 2.5, 2);
    }
  }

  /** Fireball + smoke + debris + light flash. */
  explosion(point: THREE.Vector3, scale = 1) {
    const r = this.rng;
    for (let i = 0; i < 26 * scale; i++) {
      _v.set(r.spread(5), r.range(0, 5), r.spread(5)).multiplyScalar(scale);
      _c.setHSL(r.range(0.02, 0.12), 1, r.range(0.5, 0.7));
      this.glow.emit(point, _v, _c, r.range(0.5, 1.1) * scale, r.range(0.25, 0.55), -1, 3, 1.2);
    }
    for (let i = 0; i < 14 * scale; i++) {
      _v.set(r.spread(2.5), r.range(1, 3.5), r.spread(2.5)).multiplyScalar(scale);
      _c.setScalar(r.range(0.08, 0.2));
      this.normal.emit(point, _v, _c, r.range(0.8, 1.4) * scale, r.range(0.9, 1.6), -0.6, 1.8, 2.5);
    }
    this.gibs(point, 0x2b2622, Math.round(6 * scale), 0.14 * scale);
    this.sparks(point, null, Math.round(14 * scale));
    this.flashLight.position.copy(point);
    this.flashLight.position.y += 1;
    this.flashT = 0.35;
  }

  /** Destroyed object fragments. */
  debris(point: THREE.Vector3, color: number) {
    this.gibs(point, color, 6, 0.12);
    this.dust(point, 0.6, color);
  }

  /** Twinkly burst for pickups. */
  sparkle(point: THREE.Vector3, color: number) {
    const r = this.rng;
    _c.setHex(color);
    for (let i = 0; i < 24; i++) {
      const a = r.next() * Math.PI * 2;
      const b = r.spread(1.4);
      _v.set(Math.cos(a) * Math.cos(b), Math.sin(b), Math.sin(a) * Math.cos(b)).multiplyScalar(r.range(1.5, 3.5));
      this.glow.emit(point, _v, _c, r.range(0.08, 0.16), r.range(0.4, 0.8), 1, 2.5);
    }
  }

  /** Liquid splat on the "camera lens" (handled by HUD). */
  screenSplat(color: number) {
    this.screen.splat?.(color);
  }

  update(dt: number) {
    this.normal.update(dt);
    this.glow.update(dt);
    this.chunks.update(dt);
    if (this.flashT > 0) {
      this.flashT = Math.max(0, this.flashT - dt);
      this.flashLight.intensity = (this.flashT / 0.35) * 60;
    } else this.flashLight.intensity = 0;
  }

  clear() {
    this.normal.clear();
    this.glow.clear();
    this.chunks.clear();
    this.flashT = 0;
    this.flashLight.intensity = 0;
  }

  dispose() {
    this.normal.dispose();
    this.glow.dispose();
    this.chunks.dispose();
  }
}
