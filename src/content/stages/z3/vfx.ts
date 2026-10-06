import * as THREE from 'three';
import { Kit } from '../../kit/ModelKit';
import { FLAME, pwSpriteMaterial, spriteGeometry, spriteTick, type Z3FxAtlas } from '../../pixelworld/z3fx';

/**
 * Burning wrecks: every fire on the interstate shares two instanced meshes —
 * additive flame tongues and lit smoke puffs. Only the emitters nearest the
 * camera are drawn. Animation is a pure function of time (no per-particle
 * state), so it's allocation-free and costs two draw calls in total.
 */
export interface FireEmitter {
  pos: THREE.Vector3;
  /** Flame size multiplier (1 ≈ a burning car). */
  size: number;
  /** Smoke amount 0..1. */
  smoke: number;
  on: boolean;
  seed: number;
  /** Optional flicker accent for the fire light. */
  dist: number;
}

const FLAMES_PER = 7;
const PUFFS_PER = 7;
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _c = new THREE.Color();
const FLAME_A = new THREE.Color(0xffe08a);
const FLAME_B = new THREE.Color(0xff6a1a);
const FLAME_C = new THREE.Color(0xb0200a);
const SMOKE_A = new THREE.Color(0x40363c);
const SMOKE_B = new THREE.Color(0x7a6a74);
const SMOKE_FIRE = new THREE.Color(0x9a4a30);
const SMOKE_PURPLE = new THREE.Color(0x5a4660);

const byDist = (a: FireEmitter, b: FireEmitter) => a.dist - b.dist;

function fract(x: number) {
  return x - Math.floor(x);
}

export class FireField {
  readonly group = new THREE.Group();
  readonly emitters: FireEmitter[] = [];
  private flames: THREE.InstancedMesh;
  private smoke: THREE.InstancedMesh;
  private near: FireEmitter[] = [];
  /** ART: PIXEL WORLD: flames / smoke as painted sprites (set by `pixelArt`). */
  private sprites = false;

  constructor(
    private maxEmitters = 14,
    private range = 120,
  ) {
    const flameMat = Kit.track(
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.85,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
        fog: false,
      }),
    );
    const smokeMat = Kit.track(
      new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.48, depthWrite: false, flatShading: true }),
    );
    // Chunky dithered billows (projected in each puff's own unit space, so the
    // texture rides with the puff instead of swimming through it).
    Kit.applyTexture(smokeMat, 'stucco', 2.2, 0.7);
    this.flames = new THREE.InstancedMesh(Kit.cone(0.42, 1.3, 5), flameMat, maxEmitters * FLAMES_PER);
    this.smoke = new THREE.InstancedMesh(Kit.ico(1, 1), smokeMat, maxEmitters * PUFFS_PER);
    for (const im of [this.flames, this.smoke]) {
      im.frustumCulled = false;
      im.count = 0;
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      im.setColorAt(0, _c.set(0xffffff));
      im.instanceColor!.setUsage(THREE.DynamicDrawUsage);
    }
    this.smoke.renderOrder = 1;
    this.flames.renderOrder = 2;
    this.group.add(this.smoke, this.flames);
  }

  /**
   * ART: PIXEL WORLD: the flames become hand-drawn animated flame sprites and the smoke pixel
   * puffs (camera-facing, cut-out: the same two draws, no sorting). Call after building, before
   * the first update.
   */
  pixelArt(fx: Z3FxAtlas) {
    const n = this.flames.count;
    void n;
    const flames = new THREE.InstancedMesh(spriteGeometry(true), pwSpriteMaterial(fx.atlas, fx.flame[0], { frames: FLAME.frames, fps: 12, glow: true }), this.maxEmitters * 3);
    const smoke = new THREE.InstancedMesh(spriteGeometry(false), pwSpriteMaterial(fx.atlas, fx.puff, { cells: 3, gain: 1.7 }), this.maxEmitters * PUFFS_PER);
    for (const im of [flames, smoke]) {
      im.frustumCulled = false;
      im.count = 0;
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      im.setColorAt(0, _c.set(0xffffff));
      im.instanceColor!.setUsage(THREE.DynamicDrawUsage);
    }
    smoke.renderOrder = 1;
    flames.renderOrder = 2;
    this.group.remove(this.flames, this.smoke);
    this.flames = flames;
    this.smoke = smoke;
    this.group.add(smoke, flames);
    this.sprites = true;
  }

  add(pos: THREE.Vector3, size = 1, smoke = 1, on = true): FireEmitter {
    const e: FireEmitter = { pos: pos.clone(), size, smoke, on, seed: (this.emitters.length * 0.618) % 1, dist: 0 };
    this.emitters.push(e);
    return e;
  }

  /** Nearest burning emitter to `p` (for the fire light), or null. */
  nearest(): FireEmitter | null {
    return this.near[0] ?? null;
  }

  update(t: number, cam: THREE.Vector3) {
    const near = this.near;
    near.length = 0;
    const r2 = this.range * this.range;
    for (const e of this.emitters) {
      if (!e.on) continue;
      const d2 = e.pos.distanceToSquared(cam);
      if (d2 > r2) continue;
      e.dist = d2;
      near.push(e);
    }
    near.sort(byDist);
    if (near.length > this.maxEmitters) near.length = this.maxEmitters;

    let fi = 0;
    let si = 0;
    if (this.sprites) {
      spriteTick(this.flames.material as THREE.Material, t);
      _q.identity();
    }
    for (const e of near) {
      const s = e.size;
      if (this.sprites) {
        // Three flame sprites per fire: a tall centre and two lower side tongues (out of step).
        for (let i = 0; i < 3; i++) {
          const side = i === 0 ? 0 : i === 1 ? -1 : 1;
          const w = (i === 0 ? 1.25 : 0.85) * s;
          const h = (w * FLAME.h) / FLAME.w * (1 + 0.06 * Math.sin(t * 7 + i + e.seed * 9));
          _p.set(e.pos.x + side * 0.45 * s, e.pos.y - 0.25 * s, e.pos.z + side * 0.2 * s);
          _s.set(w, h, 1);
          _m.compose(_p, _q, _s);
          this.flames.setMatrixAt(fi, _m);
          this.flames.setColorAt(fi, _c.setRGB(1, 1, 1));
          fi++;
        }
      }
      for (let i = 0; i < (this.sprites ? 0 : FLAMES_PER); i++) {
        const ph = fract(t * (1.5 + (i % 3) * 0.23) + i / FLAMES_PER + e.seed);
        const a = i * 2.39996 + e.seed * 6.28;
        const rad = (0.15 + 0.42 * ((i * 37) % 7) / 7) * s;
        const sway = Math.sin(t * 3.1 + i + e.seed * 9) * 0.12 * s;
        _p.set(e.pos.x + Math.cos(a) * rad + sway, e.pos.y + ph * 0.9 * s, e.pos.z + Math.sin(a) * rad);
        const k = Math.sin(ph * Math.PI);
        const sc = s * (0.45 + 0.75 * (1 - ph)) * (0.7 + 0.3 * k);
        _s.set(sc * 0.9, sc * (1.1 + 0.5 * Math.sin(t * 13 + i * 1.7)), sc * 0.9);
        _e.set(Math.sin(t * 4 + i) * 0.15, a, Math.cos(t * 3.3 + i) * 0.15);
        _q.setFromEuler(_e);
        _m.compose(_p, _q, _s);
        this.flames.setMatrixAt(fi, _m);
        if (ph < 0.45) _c.copy(FLAME_A).lerp(FLAME_B, ph / 0.45);
        else _c.copy(FLAME_B).lerp(FLAME_C, (ph - 0.45) / 0.55);
        this.flames.setColorAt(fi, _c);
        fi++;
      }
      if (e.smoke <= 0) continue;
      for (let j = 0; j < PUFFS_PER; j++) {
        const ph = fract(t * 0.16 + j / PUFFS_PER + e.seed * 0.37);
        const ss = Math.pow(s, 0.7);
        const h = 1.2 * s + ph * 10 * ss * e.smoke;
        const drift = ph * ph * 6 * ss;
        _p.set(e.pos.x + drift * 0.8 + Math.sin(j * 3.1 + t * 0.4) * 0.4 * s, e.pos.y + h, e.pos.z + drift * 0.35);
        const grow = ss * (0.5 + ph * 1.7) * e.smoke;
        const fade = ph < 0.1 ? ph / 0.1 : ph > 0.8 ? (1 - ph) / 0.2 : 1;
        _s.setScalar(Math.max(0.001, grow * fade * (this.sprites ? 2.3 : 1)));
        _e.set(j * 0.7 + t * 0.1, j * 1.3, 0);
        _q.setFromEuler(_e);
        _m.compose(_p, _q, _s);
        this.smoke.setMatrixAt(si, _m);
        _c.copy(SMOKE_A).lerp(SMOKE_B, ph);
        this.smoke.setColorAt(si, _c);
        si++;
      }
    }
    this.flames.count = fi;
    this.smoke.count = si;
    this.flames.instanceMatrix.needsUpdate = true;
    this.smoke.instanceMatrix.needsUpdate = true;
    if (this.flames.instanceColor) this.flames.instanceColor.needsUpdate = true;
    if (this.smoke.instanceColor) this.smoke.instanceColor.needsUpdate = true;
  }
}

/**
 * Giant smoke columns rising from the burning city on the horizon. Lives in the
 * camera-following sky group, so it never gets closer however far you drive.
 */
export class Plumes {
  mesh: THREE.InstancedMesh;
  private sprites = false;
  private bases: THREE.Vector3[] = [];
  private sizes: number[] = [];
  private readonly per = 22;

  constructor(bases: { pos: THREE.Vector3; size: number }[]) {
    const mat = Kit.track(new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.5, depthWrite: false, fog: false, flatShading: true }));
    Kit.applyTexture(mat, 'stucco', 1.6, 0.6);
    this.mesh = new THREE.InstancedMesh(Kit.ico(1, 1), mat, bases.length * this.per);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -1;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.setColorAt(0, _c.set(0xffffff));
    for (const b of bases) {
      this.bases.push(b.pos.clone());
      this.sizes.push(b.size);
    }
  }

  /** ART: PIXEL WORLD: the columns as painted pixel puffs (same instances, cut-out sprites). Returns the new mesh. */
  pixelArt(fx: Z3FxAtlas): THREE.InstancedMesh {
    const m = new THREE.InstancedMesh(spriteGeometry(false), pwSpriteMaterial(fx.atlas, fx.puff, { cells: 3, gain: 0.95, fog: false }), this.mesh.count || this.bases.length * this.per);
    m.frustumCulled = false;
    m.renderOrder = -1;
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    m.setColorAt(0, _c.set(0xffffff));
    m.instanceColor!.setUsage(THREE.DynamicDrawUsage);
    this.mesh.parent?.add(m);
    this.mesh.parent?.remove(this.mesh);
    this.mesh = m;
    this.sprites = true;
    return m;
  }

  update(t: number) {
    let n = 0;
    for (let b = 0; b < this.bases.length; b++) {
      const base = this.bases[b];
      const s = this.sizes[b];
      for (let j = 0; j < this.per; j++) {
        const ph = fract(t * 0.02 + j / this.per + b * 0.31);
        const h = ph * 110 * s;
        _p.set(base.x + ph * ph * 70 * s, base.y + h, base.z + ph * ph * 20 * s);
        const fade = ph < 0.08 ? ph / 0.08 : ph > 0.8 ? (1 - ph) / 0.2 : 1;
        _s.setScalar(Math.max(0.01, (7 + ph * 30) * s * fade * (this.sprites ? 2.3 : 1)));
        _s.y *= 0.8;
        _e.set(j, b + j * 0.5, 0);
        _q.setFromEuler(_e);
        _m.compose(_p, _q, _s);
        this.mesh.setMatrixAt(n, _m);
        // Fire-lit underside, cooler purple tops.
        _c.copy(SMOKE_FIRE).lerp(SMOKE_PURPLE, Math.min(1, ph * 1.6));
        this.mesh.setColorAt(n, _c);
        n++;
      }
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}

