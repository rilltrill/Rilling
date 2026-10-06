import * as THREE from 'three';
import { Kit } from '../../kit/ModelKit';
import { Rng } from '../../../core/Rng';
import type { World } from '../../../gameplay/World';
import { skyClouds } from './retro';

const _v = new THREE.Vector3();
const _c = new THREE.Color();
const smooth = (k: number) => k * k * (3 - 2 * k);
const _m = new THREE.Matrix4();
const SPLASHES = 48;

export const STORM = {
  fog: 0x212b3e,
  fogFlash: 0x6a7aa0,
  skyTop: 0x0b0f18,
  skyHorizon: 0x2c3754,
  hemiSky: 0x7f93c8,
  hemiGround: 0x485040,
  hemi: 1.85,
  moon: 0x9fb0e0,
  moonI: 1.0,
};

/**
 * The thunderstorm: a cloudy night dome, wind-driven rain streaks following
 * the camera (one LineSegments draw call) and lightning — a jagged bolt on the
 * horizon, delayed thunder and a soft-edged brightening of the sky, fog and
 * hemisphere fill.
 *
 * Photosensitivity (WCAG 2.3.1): a strike brightens the scene at most twice —
 * a ~40 ms rise and a slow decay, then optionally one weaker echo (≤ 50 %)
 * ≥ 0.22 s later that barely re-brightens the still-decaying first pulse — and
 * any strike within 3 s of the last flash (scripted set pieces included) shows
 * only its bolt and thunder. A bolt is drawn at most once per 1.25 s (a strike
 * sooner than that is thunder only), so the storm never exceeds 2 flashes/s.
 * Automatic strikes are 7–13 s apart.
 *
 * Settings.reduceFlashes ("calm"): no full-screen brightening — the sky and
 * fill lights swell gently (~25 % of the normal peak, a 0.3 s rise and a ~1 s
 * fade, no echo pulse) and the bolt is drawn dimmer with soft edges; the
 * thunder is unchanged.
 */
export class Storm {
  readonly group = new THREE.Group();
  private skyMat: THREE.MeshBasicMaterial;
  private sky: THREE.Mesh;
  /** Scrolling offset of the textured cloud layer (driven by the wind). */
  private cloudOff = { value: new THREE.Vector2() };
  private rain: THREE.LineSegments;
  private rainMat: THREE.LineBasicMaterial;
  private rainSeeds: Float32Array;
  private rainPos: Float32Array;
  private readonly rainN: number;
  private bolts: THREE.Mesh[] = [];
  private boltMat: THREE.MeshBasicMaterial;
  private rng = new Rng(4242);
  private t = 0;
  private next = 4;
  /** Pulse schedule of the current flash: start times + strengths (≤ 2 pulses). */
  private pulseT = [0, 0];
  private pulseK = [0, 0];
  private pulseN = 0;
  /** Time of the last scene-brightening flash (−∞ = never). */
  private lastFlash = -1e9;
  /** Time the last bolt was drawn (−∞ = never). */
  private lastBolt = -1e9;
  /** The current flash uses the soft reduced-flashing envelope. */
  private calm = false;
  /** Peak opacity of the current bolt. */
  private boltPeak = 1;
  /** Seconds the current bolt has been visible (< 0 = none). */
  private boltAge = -1;
  /** 0..1 current flash brightness (read by the environment for its own accents). */
  flash = 0;
  private fogBase = new THREE.Color(STORM.fog);
  private fogHi = new THREE.Color(STORM.fogFlash);
  private hemiSkyBase = new THREE.Color(STORM.hemiSky);
  private hemiSkyHi = new THREE.Color(0xd8e4ff);
  /** Multiplier on the automatic lightning rate (0 = scripted only). */
  rate = 1;
  /** Wind gust value fed to the foliage shader (−0.3..0.9). */
  gust = 0;
  private gustT = 0;
  private gustTarget = 0;
  /** Ground splashes: expanding ripples around the camera (one instanced draw call). */
  private splash: THREE.InstancedMesh;
  private splashT = new Float32Array(SPLASHES);
  private splashP = new Float32Array(SPLASHES * 3);
  /** Ground height lookup (set by the environment). */
  groundAt: (x: number, z: number) => number = () => 0;

  constructor(
    private hemi: THREE.HemisphereLight,
    private moon: THREE.DirectionalLight,
    private fog: THREE.Fog,
    quality: number,
  ) {
    // ── Sky dome with painted cloud masses (lit up by lightning) ──
    const r = 300;
    const geo = Kit.track(new THREE.SphereGeometry(r, 28, 14));
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const cols: number[] = [];
    const top = new THREE.Color(STORM.skyTop);
    const hor = new THREE.Color(STORM.skyHorizon);
    const fogC = new THREE.Color(STORM.fog);
    const cloudLo = new THREE.Color(0x1a2132);
    const cloudHi = new THREE.Color(0x3a4560);
    for (let i = 0; i < pos.count; i++) {
      _v.set(pos.getX(i), pos.getY(i), pos.getZ(i)).normalize();
      const y = _v.y;
      if (y < 0.02) {
        _c.copy(fogC);
      } else {
        _c.copy(hor).lerp(top, Math.pow(Math.min(1, y * 1.3), 0.6));
        // Billowing cloud masses: cheap layered sines on the direction.
        const a = Math.atan2(_v.x, _v.z);
        const n =
          Math.sin(a * 5 + y * 9) * 0.5 +
          Math.sin(a * 11 - y * 17 + 1.3) * 0.3 +
          Math.sin(a * 23 + y * 31 + 0.7) * 0.2;
        const k = THREE.MathUtils.clamp(n * 0.5 + 0.5, 0, 1) * (1 - Math.min(1, y * 1.1)) * 0.9;
        _c.lerp(k > 0.5 ? cloudHi : cloudLo, Math.abs(k - 0.5) * 1.4);
        if (y < 0.12) _c.lerp(fogC, 1 - y / 0.12);
      }
      cols.push(_c.r, _c.g, _c.b);
    }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    this.skyMat = skyClouds(
      Kit.track(new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false })),
      { name: 'stucco', scale: 1, strength: 0.65 },
      this.cloudOff,
      0.5,
    );
    this.sky = new THREE.Mesh(geo, this.skyMat);
    this.sky.renderOrder = -2;
    this.sky.frustumCulled = false;
    this.group.add(this.sky);

    // ── Lightning bolts (a few jagged ribbons, shown one at a time) ──
    this.boltMat = Kit.track(
      new THREE.MeshBasicMaterial({ color: new THREE.Color(0xdfe8ff).multiplyScalar(2.2), toneMapped: false, fog: false, transparent: true, opacity: 1, depthWrite: false, side: THREE.DoubleSide }),
    );
    for (let b = 0; b < 3; b++) {
      const bolt = new THREE.Mesh(this.boltGeometry(b + 1), this.boltMat);
      bolt.visible = false;
      bolt.renderOrder = -1;
      bolt.frustumCulled = false;
      this.bolts.push(bolt);
      this.group.add(bolt);
    }

    // ── Rain ──
    const n = quality >= 2 ? 900 : quality >= 1 ? 700 : 450;
    this.rainN = n;
    this.rainSeeds = new Float32Array(n * 3);
    this.rainPos = new Float32Array(n * 6);
    const rr = new Rng(77);
    for (let i = 0; i < n * 3; i++) this.rainSeeds[i] = rr.next();
    const rg = Kit.track(new THREE.BufferGeometry());
    rg.setAttribute('position', new THREE.BufferAttribute(this.rainPos, 3).setUsage(THREE.DynamicDrawUsage));
    this.rainMat = Kit.track(
      new THREE.LineBasicMaterial({ color: 0xaebfe0, transparent: true, opacity: 0.32, depthWrite: false, fog: true }),
    );
    this.rain = new THREE.LineSegments(rg, this.rainMat);
    this.rain.frustumCulled = false;
    this.rain.renderOrder = 4;
    this.group.add(this.rain);

    const ring = Kit.track(new THREE.RingGeometry(0.06, 0.1, 10).rotateX(-Math.PI / 2));
    this.splash = new THREE.InstancedMesh(
      ring,
      Kit.track(new THREE.MeshBasicMaterial({ color: 0xa8bce0, transparent: true, opacity: 0.45, depthWrite: false, fog: true })),
      SPLASHES,
    );
    this.splash.frustumCulled = false;
    this.splash.renderOrder = 3;
    for (let i = 0; i < SPLASHES; i++) this.splashT[i] = rr.next() * 0.4;
    this.group.add(this.splash);
  }

  /**
   * ART: PIXEL WORLD — a painted panorama replaces the dome (hidden here; the environment flashes it
   * with `flash`) and the strikes draw painted forks: the bolts keep their placement / timing, only
   * their card and material change.
   */
  usePixelSky(boltMat: THREE.MeshBasicMaterial, boltGeometry: (i: number) => THREE.BufferGeometry) {
    this.sky.visible = false;
    // Ground splashes: dim storm-blue ripples, not white rings scattered over the road (the
    // telegraph rings must stay the only bright ellipses on the ground).
    const sm = this.splash.material as THREE.MeshBasicMaterial;
    sm.color.setHex(0x6a7ea4);
    sm.opacity = 0.26;
    this.boltMat = boltMat;
    this.bolts.forEach((b, i) => {
      b.geometry = boltGeometry(i);
      b.material = boltMat;
    });
  }

  /** Jagged bolt from the clouds down to the horizon (local space, ~120 m tall). */
  private boltGeometry(seed: number): THREE.BufferGeometry {
    const r = new Rng(seed * 31 + 5);
    const pos: number[] = [];
    const branch = (x: number, y: number, len: number, w: number, depth: number) => {
      let cx = x;
      let cy = y;
      const steps = Math.round(len / 9);
      for (let i = 0; i < steps; i++) {
        const nx = cx + r.spread(9);
        const ny = cy - r.range(6, 11);
        // Quad from (cx,cy) to (nx,ny) with width w.
        pos.push(cx - w, cy, 0, cx + w, cy, 0, nx + w, ny, 0);
        pos.push(cx - w, cy, 0, nx + w, ny, 0, nx - w, ny, 0);
        if (depth < 2 && r.chance(0.22)) branch(nx, ny, len * 0.35, w * 0.55, depth + 1);
        cx = nx;
        cy = ny;
      }
    };
    branch(0, 120, 125, 0.9, 0);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    return Kit.track(g);
  }

  /**
   * Trigger lightning now. `close` = a near strike (stronger, immediate thunder).
   * `dir` = optional world-space direction (from the camera) to place the bolt.
   */
  strike(world: World, close = false, dir?: THREE.Vector3) {
    const r = this.rng;
    const calm = !!world.settings.reduceFlashes;
    // At most one scene flash per 3 s; a strike inside that window is bolt + thunder only.
    const bright = this.t - this.lastFlash >= 3;
    if (bright) {
      const peak = close ? 1 : r.range(0.55, 0.8);
      const echo = r.chance(close ? 0.7 : 0.45);
      this.lastFlash = this.t;
      this.calm = calm;
      this.pulseN = 1;
      this.pulseT[0] = this.t;
      // Reduced flashing: a gentle swell instead of a white-out, no echo.
      this.pulseK[0] = calm ? peak * 0.25 : peak;
      if (echo && !calm) {
        this.pulseN = 2;
        this.pulseT[1] = this.t + r.range(0.22, 0.32);
        this.pulseK[1] = peak * r.range(0.35, 0.5);
      }
    }
    // Bolt on the horizon, in front of the camera (or toward `dir`) — at most one per 1.25 s.
    if (this.t - this.lastBolt >= 1.25) {
      this.lastBolt = this.t;
      const bolt = this.bolts[r.int(0, this.bolts.length - 1)];
      for (const b of this.bolts) b.visible = false;
      const cam = world.camera.position;
      if (dir) _v.copy(dir).setY(0).normalize();
      else {
        world.camera.getWorldDirection(_v).setY(0).normalize();
        _v.applyAxisAngle(THREE.Object3D.DEFAULT_UP, r.spread(0.9));
      }
      const dist = close ? 120 : r.range(170, 230);
      bolt.position.set(cam.x + _v.x * dist, close ? -20 : r.range(-10, 20), cam.z + _v.z * dist);
      bolt.lookAt(cam.x, bolt.position.y, cam.z);
      bolt.scale.setScalar(close ? 1.6 : r.range(0.9, 1.4));
      bolt.visible = true;
      this.boltAge = 0;
      this.boltPeak = calm ? 0.4 : 1;
      // Fades in from zero (never a frame at a stale full opacity before update runs).
      this.boltMat.opacity = 0;
    }
    const delay = close ? 0.05 : r.range(0.5, 1.6);
    const vol = close ? 1 : r.range(0.55, 0.85);
    world.later(delay, () => world.audio.play('thunder', { volume: vol, vary: 0.15, pitch: close ? 0.9 : 1 }));
    if (close) world.rig.shake(0.25);
    this.next = Math.max(this.next, this.t + r.range(7, 13));
  }

  update(dt: number, world: World) {
    this.t += dt;
    const cam = world.camera.position;
    this.group.position.set(0, 0, 0);
    this.sky.position.set(cam.x, 0, cam.z);

    // Automatic lightning.
    if (this.rate > 0 && this.t >= this.next) this.strike(world);

    // Flash envelope: ~40 ms rise, then a soft ~0.45 s decay (no hard strobe edges).
    // Reduced flashing: a 0.3 s swell and a ~1 s fade (never reads as a flash).
    let f = 0;
    const calm = this.calm;
    for (let i = 0; i < this.pulseN; i++) {
      const a = this.t - this.pulseT[i];
      if (a < 0 || a > (calm ? 2.5 : 1.2)) continue;
      const e = calm ? (a < 0.3 ? smooth(a / 0.3) : Math.exp(-(a - 0.3) * 2.2)) : a < 0.04 ? a / 0.04 : Math.exp(-(a - 0.04) * 5);
      f = Math.max(f, this.pulseK[i] * e);
    }
    this.flash = f;
    // The bolt itself fades on its own clock (also shown for flash-less strikes).
    if (this.boltAge >= 0) {
      this.boltAge += dt;
      const a = this.boltAge;
      const rise = this.boltPeak < 1 ? 0.12 : 0.03;
      this.boltMat.opacity = this.boltPeak * (a < rise ? a / rise : Math.min(1, 1.3 * Math.exp(-(a - rise) * 6)));
      if (a > 0.5 + rise) {
        this.boltAge = -1;
        for (const b of this.bolts) b.visible = false;
      }
    }
    this.hemi.intensity = STORM.hemi + f * 1.4;
    this.hemi.color.copy(this.hemiSkyBase).lerp(this.hemiSkyHi, f * 0.8);
    this.moon.intensity = STORM.moonI + f * 0.9;
    this.fog.color.copy(this.fogBase).lerp(this.fogHi, f * 0.4);
    this.skyMat.color.setScalar(1 + f * 1.5);

    // Gusts for the foliage.
    this.gustT -= dt;
    if (this.gustT <= 0) {
      this.gustT = this.rng.range(1.5, 4);
      this.gustTarget = this.rng.range(-0.2, 0.9);
    }
    this.gust += (this.gustTarget - this.gust) * Math.min(1, dt * 1.2);
    // Storm clouds race across the sky with the wind.
    this.cloudOff.value.x += dt * (0.05 + this.gust * 0.04);
    this.cloudOff.value.y += dt * 0.025;

    // Rain: world-anchored grid wrapped around the camera so streaks don't swim when turning.
    const half = 15;
    const W = half * 2;
    const H = 16;
    const fall = 19;
    const slantX = 0.18 + this.gust * 0.12;
    const slantZ = 0.1;
    const len = 0.85;
    const p = this.rainPos;
    const s = this.rainSeeds;
    for (let i = 0; i < this.rainN; i++) {
      const sx = s[i * 3];
      const sy = s[i * 3 + 1];
      const sz = s[i * 3 + 2];
      const x = cam.x + ((((sx * W - cam.x) % W) + W) % W) - half;
      const z = cam.z + ((((sz * W - cam.z) % W) + W) % W) - half;
      const y = cam.y - 5 + ((((sy * H - this.t * fall * (0.85 + sx * 0.3)) % H) + H) % H);
      const j = i * 6;
      p[j] = x;
      p[j + 1] = y;
      p[j + 2] = z;
      p[j + 3] = x + slantX * len;
      p[j + 4] = y + len;
      p[j + 5] = z + slantZ * len;
    }
    (this.rain.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    this.rainMat.opacity = 0.3 + f * 0.25;

    // Splashes: respawn ahead of / around the camera on the ground, expand and vanish.
    world.camera.getWorldDirection(_v);
    const sp = this.splashP;
    for (let i = 0; i < SPLASHES; i++) {
      this.splashT[i] -= dt;
      if (this.splashT[i] <= 0) {
        this.splashT[i] = 0.32 + this.rng.next() * 0.12;
        const dist = 2.5 + this.rng.next() * 13;
        const a = (this.rng.next() - 0.5) * 1.6;
        const ca = Math.cos(a);
        const sa = Math.sin(a);
        const x = cam.x + (_v.x * ca - _v.z * sa) * dist;
        const z = cam.z + (_v.x * sa + _v.z * ca) * dist;
        sp[i * 3] = x;
        sp[i * 3 + 1] = this.groundAt(x, z) + 0.05;
        sp[i * 3 + 2] = z;
      }
      const k = 1 - this.splashT[i] / 0.44;
      const sc = k > 0.9 ? 0.0001 : 0.6 + k * 2.6;
      _m.makeScale(sc, 1, sc).setPosition(sp[i * 3], sp[i * 3 + 1], sp[i * 3 + 2]);
      this.splash.setMatrixAt(i, _m);
    }
    this.splash.instanceMatrix.needsUpdate = true;
  }
}
