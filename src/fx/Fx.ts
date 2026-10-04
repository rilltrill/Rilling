import * as THREE from 'three';
import { DecalSystem } from './Decals';
import { FxRng } from './FxRng';
import { GIB_FLAG, GibMesh } from './Gibs';
import { PFLAG, ParticleSystem, PSpec } from './Particles';
import { DF, PF, decalAtlasReady, decalAtlasTexture, particleAtlasReady, particleAtlasTexture, pumpFxAtlases } from './textures';

/** Paint the FX texture atlases now (e.g. from a loading screen); otherwise Fx paints them a few ms per frame. */
export { prewarmFxAtlases } from './textures';

export interface BloodOptions {
  color?: number;
  /** 0.5 = small spurt, 1 = normal, 2 = big burst. */
  amount?: number;
}

/** Hook the FX system uses to put 2D effects on the HUD (screen splats). */
export interface FxScreenHooks {
  splat?(color: number): void;
}

const SOFT_CAP = 1800;
const GLOW_CAP = 900;
/** One draw call regardless of size; big enough that heavy combat doesn't recycle fresh splats. */
const DECAL_CAP = 320;
const MEAT_CAP = 160;
const SHARD_CAP = 120;
/** Max decals spawned per frame (bursts of landing droplets). */
const DECAL_BUDGET = 8;
/** Ground decals float this far above the ground (above road ribbons/markings). */
const DECAL_LIFT = 0.035;
/** Bloody chunks per `gibs()` call that leave a full splat (the rest maybe a few drips). */
const GIB_SPLATS_PER_CALL = 2;
/** Liquid decal frames (splats + drips) — new ones merge into a recent one nearby. */
const LIQUID_MASK = (1 << DF.SPLAT0) | (1 << DF.SPLAT1) | (1 << DF.SPLAT2) | (1 << DF.SPLAT3) | (1 << DF.DRIPS);

interface SurfaceFx {
  dust: number;
  chip: number;
  /** Decal frame on the ground, or -1. */
  decal: number;
  tint: number;
  decalSize: number;
  sparks: number;
  chips: number;
  splinters: boolean;
}

const SURFACES: Record<string, SurfaceFx> = {
  concrete: { dust: 0xa8a49a, chip: 0x8e8a82, decal: DF.HOLE, tint: 0x5a5852, decalSize: 0.26, sparks: 2, chips: 5, splinters: false },
  metal: { dust: 0x7a7c80, chip: 0xa8aeb6, decal: DF.HOLE, tint: 0x3a3a3c, decalSize: 0.2, sparks: 7, chips: 1, splinters: false },
  dirt: { dust: 0x8a7258, chip: 0x5e4630, decal: DF.DIRT, tint: 0x3a2a1c, decalSize: 0.42, sparks: 0, chips: 8, splinters: false },
  grass: { dust: 0x7a7050, chip: 0x4e7030, decal: DF.DIRT, tint: 0x2c3018, decalSize: 0.38, sparks: 0, chips: 7, splinters: false },
  wood: { dust: 0xa88a62, chip: 0x8a6a44, decal: DF.HOLE, tint: 0x4a3420, decalSize: 0.24, sparks: 0, chips: 6, splinters: true },
  water: { dust: 0xe0f2ff, chip: 0xcfeaff, decal: -1, tint: 0, decalSize: 0, sparks: 0, chips: 0, splinters: false },
};

const _v = new THREE.Vector3();
const _n = new THREE.Vector3();
const _c = new THREE.Color();
const _c2 = new THREE.Color();
const _sp = new PSpec();
/** Terrain normal from `terrainFrame`. */
const _tn = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

/** Clamp for the estimated sprite/decal lighting. */
function clampL(x: number): number {
  return Math.min(1.6, Math.max(0.06, x));
}

/** Minmod slope limiter: the gentler of two one-sided slopes, 0 at a ridge/valley/step. */
function minmod(a: number, b: number): number {
  if (a * b <= 0) return 0;
  return Math.abs(a) < Math.abs(b) ? a : b;
}

/** Classify a colour as blood/goo (saturated red or green) from its sRGB hex. */
function liquidKind(hex: number): 'blood' | 'goo' | null {
  const r = ((hex >> 16) & 255) / 255;
  const g = ((hex >> 8) & 255) / 255;
  const b = (hex & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return null;
  const s = (max - min) / (1 - Math.abs(2 * l - 1));
  let h: number;
  if (max === r) h = ((g - b) / (max - min) + 6) % 6;
  else if (max === g) h = (b - r) / (max - min) + 2;
  else h = (r - g) / (max - min) + 4;
  h /= 6;
  if (s < 0.45) return null;
  if ((h < 0.045 || h > 0.95) && l < 0.5) return 'blood';
  if (h > 0.15 && h < 0.42 && l < 0.75) return 'goo';
  return null;
}

/** Perceived lightness of an sRGB hex (0..1). */
function lightness(hex: number): number {
  const r = ((hex >> 16) & 255) / 255;
  const g = ((hex >> 8) & 255) / 255;
  const b = (hex & 255) / 255;
  return (Math.max(r, g, b) + Math.min(r, g, b)) / 2;
}

/**
 * World-space visual effects. Everything is pooled — calling these every shot is fine.
 *
 * Draws: soft particles (smoke, dust, blood) · glow particles (fire, sparks) ·
 * ground decals (blood pools, bullet holes, scorch) · two gib meshes — at most
 * 5 draw calls, plus one shared flash light (explosions / muzzle flashes).
 */
export class Fx {
  readonly group = new THREE.Group();
  screen: FxScreenHooks = {};
  /**
   * Photosensitivity (Settings.reduceFlashes, kept in sync by World): explosion
   * light flashes are dimmer and can't re-fire faster than ~2.5×/s, the blinding
   * core sprite is toned down and muzzle flashes barely light the scene.
   */
  reduceFlashes = false;
  /** Fx clock (s) and when the last explosion light flash started (rate limit). */
  private clock = 0;
  private lastFlashAt = -Infinity;
  /** Ground height lookup (set by World). */
  groundAt: (x: number, z: number) => number = () => 0;

  private particleTex = particleAtlasTexture();
  private decalTex = decalAtlasTexture();
  /** Atlases still being painted (time-sliced) → re-upload each one once it completes. */
  private particleTexPending = !particleAtlasReady();
  private decalTexPending = !decalAtlasReady();
  private soft = new ParticleSystem(SOFT_CAP, false, this.particleTex);
  private glow = new ParticleSystem(GLOW_CAP, true, this.particleTex);
  private decals = new DecalSystem(DECAL_CAP, this.decalTex);
  private meat = new GibMesh(MEAT_CAP, 'meat');
  private shards = new GibMesh(SHARD_CAP, 'shard');
  private flashLight = new THREE.PointLight(0xffaa55, 0, 18, 2);
  private flashT = 0;
  private flashDur = 0.4;
  private flashPeak = 0;
  private muzzleT = 0;
  private muzzlePeak = 0;
  private muzzleAhead = 1.6;
  private muzzleColor = new THREE.Color();
  private explosionColor = new THREE.Color(0xffa04a);
  private camera: THREE.Camera | null = null;
  private rng = new FxRng(4242);
  private decalBudget = DECAL_BUDGET;
  // Approximate scene lighting for the lit (normal-blended) sprites and decals.
  private lights: THREE.Light[] = [];
  private lightScanT = 0;
  private readonly collectLight = (o: THREE.Object3D) => {
    if ((o as THREE.Light).isLight && o !== this.flashLight) this.lights.push(o as THREE.Light);
  };

  constructor() {
    this.group.name = 'fx';
    this.group.add(this.decals.mesh, this.meat.mesh, this.shards.mesh, this.soft.mesh, this.glow.mesh, this.flashLight);
    this.soft.onLand = (ev) => this.landSplat(ev);
    this.meat.onLand = this.shards.onLand = (ev) => this.gibLanded(ev);
    this.meat.onTrail = this.shards.onTrail = (ev) => this.gibTrail(ev);
    this.soft.lightUniform.setRGB(0.8, 0.8, 0.8);
    this.decals.lightUniform.setRGB(0.8, 0.8, 0.8);
  }

  /**
   * Give the FX system the player camera (muzzle flashes, distance LOD). Optional
   * for LOD: without it, Fx adopts the camera it is first rendered with.
   */
  attachCamera(camera: THREE.Camera) {
    this.camera = camera;
  }

  /** Must be called when the viewport height changes (keeps tiny particles visible). */
  setViewportHeight(px: number, pixelRatio: number) {
    const half = px * pixelRatio * 0.5;
    this.soft.setViewport(half);
    this.glow.setViewport(half);
  }

  // ─── Blood & gore ─────────────────────────────────────────────────────────

  /** Blood / goo burst in the direction of the shot. */
  blood(point: THREE.Vector3, dir: THREE.Vector3 | null, o: BloodOptions = {}) {
    const amount = Math.max(0.1, o.amount ?? 1);
    const hex = o.color ?? 0x8a0a0a;
    const r = this.rng;
    const lod = this.lod(point);
    const floor = this.groundAt(point.x, point.z);
    const height = point.y - floor;
    const stains = lightness(hex) < 0.7;
    const kind = liquidKind(hex);
    _c.setHex(hex);
    const dx = dir?.x ?? 0;
    const dy = dir?.y ?? 0;
    const dz = dir?.z ?? 0;
    const sz = 0.9 + amount * 0.35;

    // Impact burst: dense puffs that bloom out of the wound towards the camera.
    for (let i = 0; i < 2; i++) {
      _sp.reset().pos(point).color(_c, i === 0 ? 1.25 : 0.8);
      _sp.vel(-dx * 0.8 + r.spread(0.4), 0.3 + r.spread(0.3), -dz * 0.8 + r.spread(0.4));
      _sp.frame = PF.SMOKE;
      _sp.size(0.18 * sz, (i === 0 ? 0.75 : 0.55) * sz);
      _sp.life = i === 0 ? 0.26 : 0.18;
      _sp.alpha = 1;
      _sp.drag = 6;
      _sp.fadeIn = 0.02;
      _sp.fadeOut = 0.25;
      _sp.rot = r.next() * 6.28;
      this.soft.spawn(_sp);
    }

    // Streaks: fast stretched droplets, mostly out of the exit side plus back-spatter.
    const nStreak = Math.round((6 + 6 * amount) * lod);
    for (let i = 0; i < nStreak; i++) {
      const through = !dir || r.chance(0.55);
      const k = through ? r.range(2.5, 6.5) : -r.range(1.5, 3.5);
      _sp.reset().pos(point).color(_c, r.range(0.75, 1.25));
      _sp.vel(dx * k + r.spread(1.8), dy * k + r.range(0.6, 3.2), dz * k + r.spread(1.8));
      _sp.frame = PF.DROP;
      _sp.stretch = 0.06;
      _sp.size(r.range(0.05, 0.09) * sz, r.range(0.03, 0.05) * sz);
      _sp.life = r.range(0.45, 0.85);
      _sp.grav = 11;
      _sp.drag = 1.2;
      _sp.fadeIn = 0.01;
      _sp.fadeOut = 0.75;
      _sp.flags = PFLAG.DIE_ON_FLOOR;
      _sp.floor = floor;
      this.soft.spawn(_sp);
    }

    // Round droplets, slower, arcing down.
    const nDrop = Math.round((6 + 8 * amount) * lod);
    for (let i = 0; i < nDrop; i++) {
      const k = r.range(0.3, 2.4);
      _sp.reset().pos(point).color(_c, r.range(0.7, 1.2));
      _sp.vel(dx * k + r.spread(1.9), r.range(0.4, 3.4), dz * k + r.spread(1.9));
      _sp.frame = PF.DROP;
      _sp.size(r.range(0.07, 0.15) * sz, r.range(0.04, 0.08) * sz);
      _sp.life = r.range(0.55, 1.0);
      _sp.grav = 10;
      _sp.drag = 1.1;
      _sp.fadeIn = 0.01;
      _sp.fadeOut = 0.8;
      _sp.flags = PFLAG.DIE_ON_FLOOR;
      _sp.floor = floor;
      this.soft.spawn(_sp);
    }

    // Mist: a translucent cloud that hangs for a moment.
    const nMist = Math.max(1, Math.round((1.5 + amount * 1.5) * lod));
    for (let i = 0; i < nMist; i++) {
      _sp.reset().pos(point).color(_c, kind === 'goo' ? 1 : 1.3);
      _sp.vel(dx * r.range(0.3, 1.2) + r.spread(0.5), r.range(0.0, 0.5), dz * r.range(0.3, 1.2) + r.spread(0.5));
      _sp.frame = PF.SMOKE;
      // Cap mist growth so big bursts don't read as dark smoke balls.
      const msz = Math.min(sz, 1.25);
      _sp.size(r.range(0.25, 0.35) * msz, r.range(0.8, 1.2) * msz);
      _sp.life = r.range(0.45, 0.8);
      _sp.alpha = 0.5;
      _sp.drag = 3.5;
      _sp.grav = 0.4;
      _sp.fadeIn = 0.05;
      _sp.fadeOut = 0.25;
      _sp.rot = r.next() * 6.28;
      _sp.rotV = r.spread(1.5);
      this.soft.spawn(_sp);
    }

    if (stains) {
      // Heavy drops that leave a splat where they land (small spurts only sometimes).
      const carriers = amount >= 1.4 ? 2 : amount >= 0.9 || r.chance(0.5) ? 1 : 0;
      for (let i = 0; i < carriers; i++) {
        const k = r.range(0.8, 2.2);
        _sp.reset().pos(point).color(_c);
        _sp.vel(dx * k + r.spread(1.2), r.range(0.5, 2.0), dz * k + r.spread(1.2));
        _sp.frame = PF.DROP;
        _sp.size(0.07 * sz);
        _sp.life = 3;
        _sp.grav = 10;
        _sp.drag = 0.6;
        _sp.fadeIn = 0.01;
        _sp.fadeOut = 0.95;
        _sp.flags = PFLAG.DIE_ON_FLOOR | PFLAG.LAND_EVENT;
        _sp.floor = floor;
        _sp.tag = r.range(0.55, 0.85) * (0.7 + amount * 0.45);
        this.soft.spawn(_sp);
      }
      // Low hits (crawlers, limbs hitting the ground) splat immediately.
      if (height < 1.0 && amount >= 0.25) {
        this.splatDecal(point.x + dx * 0.25, floor, point.z + dz * 0.25, _c.r, _c.g, _c.b, r.range(0.6, 0.9) * (0.6 + amount * 0.5), -1, 0.28);
      }
    }

    if (amount >= 1.2) this.gibs(point, hex, Math.round(amount * 2));
  }

  /** Physical chunks that bounce on the ground. */
  gibs(point: THREE.Vector3, color: number, count = 4, size = 0.09) {
    const r = this.rng;
    const floor = this.groundAt(point.x, point.z);
    const kind = liquidKind(color);
    const bloody = kind !== null;
    const n = Math.min(24, Math.max(0, Math.round(count)));
    // Only a couple of chunks per burst leave a real splat (they'd all land in the same
    // spot anyway); some of the rest leave drip spots. Keeps the decal ring from churning.
    let splats = bloody ? Math.min(GIB_SPLATS_PER_CALL, Math.ceil(n / 3)) : 0;
    for (let i = 0; i < n; i++) {
      // Gore is mostly lumpy meat; other colours (skin, bone, glass, clods) a mix with shards.
      const meat = bloody ? r.chance(0.8) : r.chance(0.5);
      const s = size * r.range(0.6, 1.5);
      let flags = 0;
      if (bloody) {
        flags = GIB_FLAG.BLOODY;
        if (splats > 0 && s >= size * 0.8) {
          flags |= GIB_FLAG.SPLAT;
          splats--;
        } else if (r.chance(0.25)) flags |= GIB_FLAG.DRIP;
      }
      let sx = s * r.range(0.75, 1.3);
      const sy = s * r.range(0.6, 1.05);
      let sz = s * r.range(0.75, 1.35);
      if (!meat) {
        // Shards/splinters are long and thin.
        sz *= r.range(1.3, 2.4);
        sx *= r.range(0.5, 0.8);
      }
      _c.setHex(color).multiplyScalar(r.range(0.72, 1.1));
      (meat ? this.meat : this.shards).spawn(
        point,
        r.spread(2.6),
        r.range(2.2, 5.4),
        r.spread(2.6),
        _c,
        sx,
        sy,
        sz,
        bloody ? r.range(4, 7) : r.range(2.8, 4.5),
        floor,
        flags,
        r,
      );
    }
  }

  // ─── Impacts ──────────────────────────────────────────────────────────────

  /** Metal spark spray (armour hits, bullet ricochets). */
  sparks(point: THREE.Vector3, normal: THREE.Vector3 | null, count = 8) {
    const r = this.rng;
    const lod = this.lod(point);
    const floor = this.groundAt(point.x, point.z);
    // Hot flash at the contact point.
    _sp.reset().pos(point).rgb0(2.2, 1.8, 1.2).rgb1(1.6, 0.8, 0.3);
    _sp.frame = PF.GLOW;
    _sp.size(0.32, 0.5);
    _sp.life = 0.08;
    _sp.fadeIn = 0.01;
    _sp.fadeOut = 0.2;
    this.glow.spawn(_sp);
    _sp.frame = PF.STAR;
    _sp.size(0.3, 0.42);
    _sp.rot = r.next() * 6.28;
    _sp.life = 0.06;
    this.glow.spawn(_sp);

    const n = Math.max(1, Math.round(count * lod));
    for (let i = 0; i < n; i++) {
      const ember = i % 4 === 3;
      _v.set(r.spread(3), r.range(0.5, 4), r.spread(3));
      if (normal) _v.addScaledVector(normal, r.range(1.5, 5));
      if (ember) _v.multiplyScalar(0.5);
      _sp.reset().pos(point).vel(_v.x, _v.y, _v.z);
      _sp.rgb0(2.4, 1.9, 1.1).rgb1(1.5, 0.4, 0.06);
      _sp.frame = PF.STREAK;
      _sp.stretch = ember ? 0.025 : 0.035;
      _sp.size(r.range(0.022, 0.04));
      _sp.life = ember ? r.range(0.6, 1.0) : r.range(0.15, 0.42);
      _sp.grav = 9.8;
      _sp.drag = ember ? 0.6 : 1.4;
      _sp.fadeIn = 0.01;
      _sp.fadeOut = 0.45;
      _sp.flags = PFLAG.BOUNCE;
      _sp.floor = floor;
      this.glow.spawn(_sp);
    }
  }

  /** Bullet hitting scenery. */
  impact(point: THREE.Vector3, normal: THREE.Vector3 | null, surface: string = 'concrete') {
    let S = SURFACES[surface] ?? SURFACES.concrete;
    const r = this.rng;
    const lod = this.lod(point);
    const nrm = normal ? _n.copy(normal) : _n.copy(UP);
    if (nrm.lengthSq() < 1e-6) nrm.copy(UP);
    nrm.normalize();
    const floor = this.groundAt(point.x, point.z);
    const onGround = nrm.y > 0.7 && Math.abs(point.y - floor) < 0.3;

    if (surface === 'water') {
      // Only the water itself splashes; rocks, trees and vehicles standing in it
      // get a plain (wet-dirt) hit instead of a ripple ring floating in the air.
      if (onGround) {
        this.splash(point, lod);
        return;
      }
      S = SURFACES.dirt;
    }

    // Dust puff blown out along the normal.
    _c.setHex(S.dust);
    const nPuff = surface === 'metal' ? 1 : 3;
    for (let i = 0; i < nPuff; i++) {
      const k = i === 2 ? r.range(1.8, 2.6) : r.range(0.4, 1.3);
      _sp.reset().color(_c, r.range(0.85, 1.1));
      _sp.x = point.x + nrm.x * 0.05;
      _sp.y = point.y + nrm.y * 0.05;
      _sp.z = point.z + nrm.z * 0.05;
      _sp.vel(nrm.x * k + r.spread(0.3), nrm.y * k + r.range(0.1, 0.5), nrm.z * k + r.spread(0.3));
      _sp.frame = PF.SMOKE;
      _sp.size(r.range(0.12, 0.2), r.range(0.6, 0.95));
      _sp.life = r.range(0.55, 1.0);
      _sp.alpha = 0.65;
      _sp.drag = 3.2;
      _sp.grav = -0.3;
      _sp.fadeIn = 0.04;
      _sp.fadeOut = 0.25;
      _sp.rot = r.next() * 6.28;
      _sp.rotV = r.spread(2);
      this.soft.spawn(_sp);
    }

    // Chips / clods / splinters.
    _c.setHex(S.chip);
    const nChip = Math.round(S.chips * lod);
    for (let i = 0; i < nChip; i++) {
      _v.set(r.spread(1.4), r.range(1, 3.2), r.spread(1.4)).addScaledVector(nrm, r.range(1.5, 4.2));
      _sp.reset().pos(point).vel(_v.x, _v.y, _v.z).color(_c, r.range(0.7, 1.2));
      if (S.splinters && r.chance(0.6)) {
        _sp.frame = PF.STREAK;
        _sp.stretch = 0.03;
        _sp.size(r.range(0.025, 0.04));
      } else {
        _sp.frame = PF.CHIP;
        _sp.size(r.range(0.04, 0.075));
        _sp.rot = r.next() * 6.28;
        _sp.rotV = r.spread(18);
      }
      _sp.life = r.range(0.45, 0.9);
      _sp.grav = 12;
      _sp.drag = 1.2;
      _sp.fadeIn = 0.01;
      _sp.fadeOut = 0.7;
      _sp.flags = PFLAG.BOUNCE;
      _sp.floor = floor;
      this.soft.spawn(_sp);
    }

    if (S.sparks > 0 && (surface === 'metal' || r.chance(0.5))) this.sparks(point, nrm, S.sparks);

    if (onGround && S.decal >= 0 && this.decalBudget > 0) {
      this.decalBudget--;
      _c.setHex(S.tint);
      // The ground ray reports a flat "up" normal: follow the actual terrain slope.
      let lift = 0;
      if (nrm.y > 0.999) lift = this.terrainFrame(point.x, point.z, floor, 0.25);
      else _tn.copy(nrm);
      this.decals.add(
        point.x + _tn.x * DECAL_LIFT,
        floor + lift + _tn.y * DECAL_LIFT,
        point.z + _tn.z * DECAL_LIFT,
        _tn.x,
        _tn.y,
        _tn.z,
        S.decalSize * r.range(0.8, 1.25),
        r.next() * 6.28,
        _c.r,
        _c.g,
        _c.b,
        0.9,
        r.range(14, 20),
        S.decal,
        0.05,
      );
    } else if (!onGround && (surface === 'metal' || surface === 'concrete')) {
      // Wall hit: a brief glowing pock mark (no persistent decal — walls may move).
      _sp.reset().rgb0(1.6, 0.7, 0.2).rgb1(0.6, 0.12, 0.02);
      _sp.x = point.x + nrm.x * 0.02;
      _sp.y = point.y + nrm.y * 0.02;
      _sp.z = point.z + nrm.z * 0.02;
      _sp.frame = PF.GLOW;
      _sp.size(0.14, 0.08);
      _sp.life = 0.35;
      _sp.fadeIn = 0.01;
      _sp.fadeOut = 0.1;
      this.glow.spawn(_sp);
    }
  }

  /** Puff of dust (spawns, landings, footfalls of big monsters). */
  dust(point: THREE.Vector3, scale = 1, color = 0x8a7f6c) {
    const r = this.rng;
    const lod = this.lod(point);
    const s = Math.max(0.05, scale);
    const n = Math.min(26, Math.round((4 + 8 * s) * lod));
    _c.setHex(color);
    const lifeK = Math.min(1.6, 0.8 + s * 0.3);
    for (let i = 0; i < n; i++) {
      const a = r.next() * Math.PI * 2;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      const sp = r.range(0.7, 2.3) * Math.sqrt(s);
      _sp.reset().color(_c, r.range(0.82, 1.12));
      _sp.x = point.x + ca * 0.25 * s;
      _sp.y = point.y + 0.12 + r.range(0, 0.2) * s;
      _sp.z = point.z + sa * 0.25 * s;
      _sp.vel(ca * sp, r.range(0.15, 0.9), sa * sp);
      _sp.frame = PF.SMOKE;
      _sp.size(r.range(0.3, 0.5) * s, r.range(0.9, 1.5) * s);
      _sp.life = r.range(0.7, 1.3) * lifeK;
      _sp.alpha = 0.5;
      _sp.drag = 2.6;
      _sp.grav = -0.15;
      _sp.fadeIn = 0.1;
      _sp.fadeOut = 0.3;
      _sp.rot = r.next() * 6.28;
      _sp.rotV = r.spread(1.2);
      this.soft.spawn(_sp);
    }
    if (s >= 0.8) {
      const floor = this.groundAt(point.x, point.z);
      const nc = Math.round(3 * s * lod);
      _c2.copy(_c).multiplyScalar(0.7);
      for (let i = 0; i < nc; i++) {
        _sp.reset().pos(point).vel(r.spread(2.2) * s, r.range(1.5, 3.5), r.spread(2.2) * s).color(_c2, r.range(0.8, 1.1));
        _sp.y += 0.1;
        _sp.frame = PF.CHIP;
        _sp.size(r.range(0.04, 0.08));
        _sp.rot = r.next() * 6.28;
        _sp.rotV = r.spread(14);
        _sp.life = r.range(0.6, 1.0);
        _sp.grav = 12;
        _sp.fadeIn = 0.01;
        _sp.fadeOut = 0.7;
        _sp.flags = PFLAG.BOUNCE;
        _sp.floor = floor;
        this.soft.spawn(_sp);
      }
    }
  }

  // ─── Explosions ───────────────────────────────────────────────────────────

  /** Fireball + shockwave + smoke column + debris + scorch + light flash. */
  explosion(point: THREE.Vector3, scale = 1) {
    const r = this.rng;
    const s = Math.max(0.2, scale);
    const sq = Math.sqrt(s);
    const floor = this.groundAt(point.x, point.z);
    const height = point.y - floor;

    // Light flash (reduced flashing: dimmer, slower decay, and a chain of blasts
    // keeps one decaying flash instead of re-strobing the scene every 0.3 s).
    const calm = this.reduceFlashes;
    if (!calm || this.clock - this.lastFlashAt >= 0.4 || this.flashT <= 0) {
      this.lastFlashAt = this.clock;
      this.flashLight.position.copy(point);
      this.flashLight.position.y += 1;
      this.flashLight.distance = 14 + 10 * s;
      this.flashLight.decay = 1.6;
      this.flashDur = (0.35 + 0.15 * s) * (calm ? 1.6 : 1);
      this.flashT = this.flashDur;
      this.flashPeak = (40 + 40 * s) * (calm ? 0.3 : 1);
      this.muzzleT = 0;
    }

    // Blinding core.
    const core = calm ? 0.55 : 1;
    _sp.reset().pos(point).rgb0(2.0 * core, 1.7 * core, 1.2 * core).rgb1(1.3 * core, 0.6 * core, 0.2 * core);
    _sp.frame = PF.GLOW;
    _sp.size(1.2 * s, 3.6 * s);
    _sp.life = 0.14;
    _sp.fadeIn = 0.01;
    _sp.fadeOut = 0.15;
    this.glow.spawn(_sp);

    // Fireball: ragged flame blobs expanding and cooling (white-yellow → orange → deep red).
    const nFire = Math.round(9 + 7 * s);
    for (let i = 0; i < nFire; i++) {
      _v.set(r.spread(1), r.range(-0.2, 1), r.spread(1)).normalize();
      const k = r.range(1.8, 5.5) * sq;
      _sp.reset();
      _sp.x = point.x + _v.x * 0.35 * s;
      _sp.y = point.y + _v.y * 0.35 * s + 0.1 * s;
      _sp.z = point.z + _v.z * 0.35 * s;
      _sp.vel(_v.x * k, _v.y * k + r.range(0.5, 2) * sq, _v.z * k);
      _sp.rgb0(1.9, 1.15, 0.45).rgb1(0.55, 0.1, 0.03);
      _sp.alpha = 0.95;
      _sp.occlude = 0.55;
      _sp.frame = PF.FLAME;
      _sp.size(r.range(0.5, 0.8) * s, r.range(1.5, 2.4) * s);
      _sp.life = r.range(0.4, 0.8);
      _sp.delay = i < nFire - 4 ? 0 : r.range(0.04, 0.14);
      _sp.drag = 4.5;
      _sp.grav = -2.5;
      _sp.fadeIn = 0.04;
      _sp.fadeOut = 0.4;
      _sp.rot = r.next() * 6.28;
      _sp.rotV = r.spread(2.5);
      this.glow.spawn(_sp);
    }

    // Shockwave: a flat ring racing across the ground + a quick air ring.
    if (height < 3) {
      _sp.reset().rgb0(1.8, 1.3, 0.8).rgb1(1.0, 0.5, 0.2);
      _sp.x = point.x;
      _sp.y = floor + 0.08;
      _sp.z = point.z;
      _sp.frame = PF.RING;
      _sp.flags = PFLAG.FLAT;
      _sp.size(0.6 * s, 9 * s);
      _sp.life = 0.42;
      _sp.alpha = 0.85;
      _sp.fadeIn = 0.01;
      _sp.fadeOut = 0.15;
      this.glow.spawn(_sp);
      // Dust skirt kicked out along the ground.
      const nSkirt = Math.round(8 + 6 * s);
      _c.setRGB(0.42, 0.38, 0.33);
      for (let i = 0; i < nSkirt; i++) {
        const a = (i / nSkirt) * Math.PI * 2 + r.spread(0.3);
        const sp = r.range(4, 7.5) * sq;
        _sp.reset().color(_c, r.range(0.8, 1.15));
        _sp.x = point.x + Math.cos(a) * 0.5 * s;
        _sp.y = floor + 0.3 * s;
        _sp.z = point.z + Math.sin(a) * 0.5 * s;
        _sp.vel(Math.cos(a) * sp, r.range(0.3, 1.2), Math.sin(a) * sp);
        _sp.frame = PF.SMOKE;
        _sp.size(0.6 * s, r.range(1.6, 2.4) * s);
        _sp.life = r.range(1.0, 1.7);
        _sp.alpha = 0.55;
        _sp.drag = 2.8;
        _sp.grav = -0.2;
        _sp.fadeIn = 0.05;
        _sp.fadeOut = 0.3;
        _sp.rot = r.next() * 6.28;
        _sp.rotV = r.spread(0.8);
        this.soft.spawn(_sp);
      }
    }
    _sp.reset().pos(point).rgb0(1.4, 1.2, 1.0).rgb1(0.8, 0.5, 0.3);
    _sp.frame = PF.RING;
    _sp.size(0.5 * s, 6 * s);
    _sp.life = 0.24;
    _sp.alpha = 0.45;
    _sp.fadeIn = 0.01;
    _sp.fadeOut = 0.1;
    this.glow.spawn(_sp);

    // Smoke column: dark, fire-lit at first, rising and spreading as the fire dies.
    // (Growth is capped for huge blasts like the bomb so the view stays readable.)
    const nSmoke = Math.round(6 + 5 * Math.min(s, 1.6));
    const ss = Math.min(s, 1.1 + 0.3 * s);
    for (let i = 0; i < nSmoke; i++) {
      const g = r.range(0.07, 0.12);
      _sp.reset();
      _sp.x = point.x + r.spread(0.6) * ss;
      _sp.y = point.y + r.range(0, 0.8) * ss;
      _sp.z = point.z + r.spread(0.6) * ss;
      _sp.vel(r.spread(1.2) * sq, r.range(1.4, 3.6) * sq, r.spread(1.2) * sq);
      _sp.rgb0(g * 2.0, g * 1.5, g * 1.15).rgb1(g * 1.7, g * 1.65, g * 1.6);
      _sp.frame = PF.SMOKE;
      _sp.size(r.range(0.8, 1.2) * ss, r.range(2.6, 3.8) * ss);
      _sp.life = r.range(2.2, 3.8) * Math.min(1.4, sq);
      _sp.delay = r.range(0.05, 0.3);
      _sp.alpha = r.range(0.6, 0.8);
      _sp.drag = 1.0;
      _sp.grav = -0.5;
      _sp.fadeIn = 0.08;
      _sp.fadeOut = 0.35;
      _sp.rot = r.next() * 6.28;
      _sp.rotV = r.spread(0.6);
      this.soft.spawn(_sp);
    }

    // Embers flung out on arcs, bouncing on the ground.
    const nEmber = Math.round(8 + 8 * s);
    for (let i = 0; i < nEmber; i++) {
      _sp.reset().pos(point).vel(r.spread(6) * sq, r.range(3, 9) * sq, r.spread(6) * sq);
      _sp.rgb0(2.6, 1.6, 0.5).rgb1(1.2, 0.25, 0.02);
      _sp.frame = PF.STREAK;
      _sp.stretch = 0.03;
      _sp.size(r.range(0.035, 0.065));
      _sp.life = r.range(0.7, 1.5);
      _sp.grav = 9.8;
      _sp.drag = 0.7;
      _sp.fadeIn = 0.01;
      _sp.fadeOut = 0.55;
      _sp.flags = PFLAG.BOUNCE;
      _sp.floor = floor;
      this.glow.spawn(_sp);
    }

    // Flying debris chunks (some still glowing hot → ember trails).
    const nDebris = Math.round(4 + 3 * Math.min(s, 1.6));
    for (let i = 0; i < nDebris; i++) {
      const hot = i % 2 === 0;
      const sz = 0.12 * Math.min(s, 1.2) * r.range(0.6, 1.3);
      _c.setHex(hot ? 0x5a4636 : 0x4a443e).multiplyScalar(r.range(0.75, 1.15));
      this.shards.spawn(
        point,
        r.spread(5) * sq,
        r.range(3.5, 8) * sq,
        r.spread(5) * sq,
        _c,
        sz * r.range(0.7, 1),
        sz * r.range(0.6, 0.9),
        sz * r.range(1.1, 1.8),
        r.range(3, 5),
        floor,
        hot ? GIB_FLAG.HOT : 0,
        r,
      );
    }

    // Scorch mark, tilted to the terrain (and lifted over any bulge) so hills don't swallow it.
    if (height < 2.5) {
      const size = r.range(2.8, 3.6) * s;
      const lift = this.terrainFrame(point.x, point.z, floor, size * 0.3);
      const k = DECAL_LIFT + 0.002;
      this.decals.add(point.x + _tn.x * k, floor + lift + _tn.y * k, point.z + _tn.z * k, _tn.x, _tn.y, _tn.z, size, r.next() * 6.28, 0.045, 0.04, 0.035, 0.92, r.range(24, 30), DF.SCORCH, 0.12);
    }
  }

  /** Destroyed object fragments. */
  debris(point: THREE.Vector3, color: number) {
    const r = this.rng;
    const floor = this.groundAt(point.x, point.z);
    for (let i = 0; i < 6; i++) {
      const meat = r.chance(0.3);
      const s = 0.12 * r.range(0.6, 1.4);
      _c.setHex(color).multiplyScalar(r.range(0.7, 1.15));
      (meat ? this.meat : this.shards).spawn(
        point,
        r.spread(3),
        r.range(2.2, 5),
        r.spread(3),
        _c,
        s * r.range(0.6, 1.1),
        s * r.range(0.5, 0.9),
        s * (meat ? r.range(0.8, 1.2) : r.range(1.3, 2.4)),
        r.range(2.8, 4.5),
        floor,
        0,
        r,
      );
    }
    _c.setHex(color);
    for (let i = 0; i < 8; i++) {
      _sp.reset().pos(point).vel(r.spread(3), r.range(1.5, 4.5), r.spread(3)).color(_c, r.range(0.7, 1.15));
      _sp.frame = PF.CHIP;
      _sp.size(r.range(0.04, 0.08));
      _sp.rot = r.next() * 6.28;
      _sp.rotV = r.spread(16);
      _sp.life = r.range(0.6, 1.1);
      _sp.grav = 12;
      _sp.drag = 0.8;
      _sp.fadeIn = 0.01;
      _sp.fadeOut = 0.7;
      _sp.flags = PFLAG.BOUNCE;
      _sp.floor = floor;
      this.soft.spawn(_sp);
    }
    this.dust(point, 0.6, color);
  }

  /** Twinkly burst for pickups. */
  sparkle(point: THREE.Vector3, color: number) {
    const r = this.rng;
    _c.setHex(color);
    _sp.reset().pos(point).color(_c, 2.2);
    _sp.frame = PF.GLOW;
    _sp.size(0.3, 1.1);
    _sp.life = 0.25;
    _sp.fadeIn = 0.01;
    _sp.fadeOut = 0.2;
    this.glow.spawn(_sp);
    _sp.frame = PF.RING;
    _sp.size(0.2, 1.6);
    _sp.life = 0.32;
    _sp.alpha = 0.8;
    this.glow.spawn(_sp);
    for (let i = 0; i < 18; i++) {
      const a = r.next() * Math.PI * 2;
      const b = r.spread(1.4);
      _v.set(Math.cos(a) * Math.cos(b), Math.sin(b), Math.sin(a) * Math.cos(b)).multiplyScalar(r.range(1.5, 3.5));
      _sp.reset().pos(point).vel(_v.x, _v.y, _v.z);
      _sp.r0 = _c.r * 2.4 + 0.4;
      _sp.g0 = _c.g * 2.4 + 0.4;
      _sp.b0 = _c.b * 2.4 + 0.4;
      _sp.r1 = _c.r * 1.4;
      _sp.g1 = _c.g * 1.4;
      _sp.b1 = _c.b * 1.4;
      _sp.frame = i % 3 === 0 ? PF.STAR : PF.GLOW;
      _sp.size(i % 3 === 0 ? r.range(0.16, 0.26) : r.range(0.08, 0.14), 0.03);
      _sp.rot = r.next() * 6.28;
      _sp.rotV = r.spread(5);
      _sp.life = r.range(0.45, 0.85);
      _sp.grav = 1;
      _sp.drag = 2.5;
      _sp.fadeIn = 0.02;
      _sp.fadeOut = 0.5;
      this.glow.spawn(_sp);
    }
    for (let i = 0; i < 6; i++) {
      _sp.reset().vel(r.spread(0.3), r.range(0.6, 1.4), r.spread(0.3)).color(_c, 1.8);
      _sp.x = point.x + r.spread(0.3);
      _sp.y = point.y + r.spread(0.2);
      _sp.z = point.z + r.spread(0.3);
      _sp.frame = PF.GLOW;
      _sp.size(0.07, 0.03);
      _sp.life = r.range(0.8, 1.2);
      _sp.drag = 0.5;
      _sp.fadeOut = 0.4;
      this.glow.spawn(_sp);
    }
  }

  /**
   * Short warm light burst near the camera when the player fires (lights up
   * nearby ground and enemies, very visible at night). Needs the camera: call
   * `attachCamera` (otherwise it only works once Fx has adopted the render camera).
   * `strength` ≈ 1 for a pistol, 1.6 shotgun/magnum, 0.7 SMG. `ahead` is how far
   * in front of the eye the light sits: keep the default on foot; for a vehicle
   * mounted gun use ~3.5 (and strength ~0.35) so the hood / gun model in the lower
   * screen isn't washed out on every shot.
   */
  muzzleFlash(strength = 1, color = 0xffb35a, ahead = 1.6) {
    if (!this.camera || this.flashT > 0.08) return;
    this.muzzleT = 0.07;
    this.muzzlePeak = 16 * Math.max(0, strength) * (this.reduceFlashes ? 0.35 : 1);
    this.muzzleAhead = Math.max(0.5, ahead);
    this.muzzleColor.setHex(color);
    this.flashLight.color.copy(this.muzzleColor);
    this.flashLight.distance = 26;
    this.flashLight.decay = 1.2;
    this.placeMuzzleLight();
  }

  /** Liquid splat on the "camera lens" (handled by HUD). */
  screenSplat(color: number) {
    this.screen.splat?.(color);
  }

  update(dt: number) {
    this.clock += dt;
    if (this.particleTexPending || this.decalTexPending) this.pumpAtlases();
    if (!this.camera) this.camera = this.soft.lastCamera ?? this.glow.lastCamera;
    this.decalBudget = DECAL_BUDGET;
    this.updateLighting(dt);
    // Gibs first (they spawn trail particles/decals), then particles (landing → decals), then decals.
    this.meat.update(dt);
    this.shards.update(dt);
    this.soft.update(dt);
    this.glow.update(dt);
    this.decals.update(dt);

    if (this.flashT > 0) {
      this.flashT = Math.max(0, this.flashT - dt);
      const k = this.flashT / this.flashDur;
      this.flashLight.color.copy(this.explosionColor);
      this.flashLight.intensity = this.flashPeak * k * k;
    } else if (this.muzzleT > 0) {
      this.muzzleT = Math.max(0, this.muzzleT - dt);
      const k = this.muzzleT / 0.07;
      this.placeMuzzleLight();
      this.flashLight.intensity = this.muzzlePeak * Math.sqrt(k);
    } else this.flashLight.intensity = 0;
  }

  clear() {
    this.soft.clear();
    this.glow.clear();
    this.decals.clear();
    this.meat.clear();
    this.shards.clear();
    this.flashT = 0;
    this.muzzleT = 0;
    this.flashLight.intensity = 0;
  }

  dispose() {
    this.soft.dispose();
    this.glow.dispose();
    this.decals.dispose();
    this.meat.dispose();
    this.shards.dispose();
    this.particleTex.dispose();
    this.decalTex.dispose();
    this.lights.length = 0;
    this.camera = null;
  }

  // ─── Internals ────────────────────────────────────────────────────────────

  private pumpAtlases() {
    pumpFxAtlases(3);
    if (this.particleTexPending && particleAtlasReady()) {
      this.particleTexPending = false;
      this.particleTex.needsUpdate = true;
    }
    if (this.decalTexPending && decalAtlasReady()) {
      this.decalTexPending = false;
      this.decalTex.needsUpdate = true;
    }
  }

  /** 1 near the camera → 0.45 far away (fewer particles where nobody can see them). */
  private lod(p: THREE.Vector3): number {
    return this.lodAt(p.x, p.y, p.z);
  }

  private lodAt(x: number, y: number, z: number): number {
    if (!this.camera) return 1;
    const c = this.camera.position;
    const dx = x - c.x;
    const dy = y - c.y;
    const dz = z - c.z;
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
    return Math.min(1, Math.max(0.45, 1.25 - d / 45));
  }

  /**
   * Terrain normal at (x, z) into `_tn`, from `groundAt` differences over ±h. The
   * minmod limiter makes steps (curbs, pads, bridge ends), ridges and valleys read
   * as flat instead of as steep fake slopes. Returns how far a flat decal of
   * half-size ~h must be lifted to clear gentle curvature (bulges between the samples).
   */
  private terrainFrame(x: number, z: number, y0: number, h: number): number {
    const g = this.groundAt;
    const xl = g(x - h, z);
    const xr = g(x + h, z);
    const zl = g(x, z - h);
    const zr = g(x, z + h);
    const sx = minmod(y0 - xl, xr - y0);
    const sz = minmod(y0 - zl, zr - y0);
    _tn.set(-sx / h, 1, -sz / h).normalize();
    // Terrain above the tilted plane at the samples (valleys, concave slopes). Capped
    // small: a big residual is usually a step like a curb, where a large lift would
    // leave the decal hovering over the low side.
    const e = Math.max(xl - (y0 - sx), xr - (y0 + sx), zl - (y0 - sz), zr - (y0 + sz));
    return e > 0 ? Math.min(e, 0.12, h * 0.15) : 0;
  }

  private placeMuzzleLight() {
    const cam = this.camera;
    if (!cam) return;
    // Just ahead of the eye, slightly right/low (where the gun would be) — lights the
    // ground around the player and puts a warm kick on enemies in front.
    this.flashLight.position.set(0.25, -0.1, -this.muzzleAhead).applyMatrix4(cam.matrixWorld);
  }

  private splash(point: THREE.Vector3, lod: number) {
    const r = this.rng;
    _c.setHex(SURFACES.water.chip);
    const n = Math.round(9 * lod);
    for (let i = 0; i < n; i++) {
      _sp.reset().pos(point).vel(r.spread(0.9), r.range(2, 4.6), r.spread(0.9)).color(_c, r.range(0.9, 1.15));
      _sp.frame = PF.DROP;
      _sp.stretch = 0.04;
      _sp.size(r.range(0.03, 0.06));
      _sp.life = r.range(0.5, 0.9);
      _sp.grav = 11;
      _sp.drag = 0.6;
      _sp.fadeIn = 0.01;
      _sp.fadeOut = 0.8;
      _sp.flags = PFLAG.DIE_ON_FLOOR;
      _sp.floor = point.y - 0.02;
      this.soft.spawn(_sp);
    }
    _sp.reset().color(_c, 1.2);
    _sp.x = point.x;
    _sp.y = point.y + 0.02;
    _sp.z = point.z;
    _sp.frame = PF.RING;
    _sp.flags = PFLAG.FLAT;
    _sp.size(0.12, 1.1);
    _sp.life = 0.7;
    _sp.alpha = 0.7;
    _sp.fadeIn = 0.02;
    _sp.fadeOut = 0.2;
    this.soft.spawn(_sp);
    _sp.reset().pos(point).color(_c, 1.1);
    _sp.frame = PF.SMOKE;
    _sp.size(0.15, 0.6);
    _sp.life = 0.5;
    _sp.alpha = 0.5;
    _sp.drag = 3;
    _sp.vy = 0.8;
    _sp.fadeOut = 0.3;
    this.soft.spawn(_sp);
  }

  /** A blood drop landed (LAND_EVENT particle): leave a splat. ev = [x, floor, z, r, g, b, size]. */
  private landSplat(ev: Float32Array) {
    this.splatDecal(ev[0], ev[1], ev[2], ev[3], ev[4], ev[5], ev[6], -1, 0.28);
  }

  /**
   * Liquid decal on the ground (frame -1 = a random splat shape). A new mark close to a
   * fresh one of the same colour thickens that one instead (pools build up under a
   * body without filling the decal ring).
   */
  private splatDecal(x: number, floor: number, z: number, r: number, g: number, b: number, size: number, frame: number, spread: number) {
    if (this.decalBudget <= 0) return;
    const drips = frame === DF.DRIPS;
    const near = this.decals.findNear(x, z, Math.max(0.3, size * 0.45), 3, LIQUID_MASK, r, g, b);
    if (near >= 0) {
      this.decals.grow(near, drips ? 1.03 : 1.08, 1.1);
      return;
    }
    this.decalBudget--;
    const rng = this.rng;
    const lift = this.terrainFrame(x, z, floor, Math.max(0.2, size * 0.35));
    this.decals.add(
      x + _tn.x * DECAL_LIFT,
      floor + lift + _tn.y * DECAL_LIFT,
      z + _tn.z * DECAL_LIFT,
      _tn.x,
      _tn.y,
      _tn.z,
      size,
      rng.next() * 6.28,
      r,
      g,
      b,
      drips ? 0.9 : 0.94,
      rng.range(17, 23),
      frame >= 0 ? frame : rng.int(DF.SPLAT0, DF.SPLAT3),
      spread,
    );
  }

  /** A chunk's first floor contact. ev = [x, floor, z, r, g, b, size, flags]. */
  private gibLanded(ev: Float32Array) {
    const flags = ev[7];
    const x = ev[0];
    const floor = ev[1];
    const z = ev[2];
    const size = ev[6];
    if (flags & GIB_FLAG.SPLAT) {
      this.splatDecal(x, floor, z, ev[3], ev[4], ev[5], Math.min(0.75, Math.max(0.25, size * 5)), -1, 0.18);
    } else if (flags & GIB_FLAG.DRIP) {
      this.splatDecal(x, floor, z, ev[3], ev[4], ev[5], Math.min(0.42, Math.max(0.22, size * 4)), DF.DRIPS, 0.12);
    } else if (flags & GIB_FLAG.HOT) {
      // Hot debris thuds down with a little puff of smoke.
      _sp.reset().vel(0, 0.4, 0).rgb0(0.25, 0.23, 0.21).rgb1(0.3, 0.3, 0.3);
      _sp.x = x;
      _sp.y = floor + 0.1;
      _sp.z = z;
      _sp.frame = PF.SMOKE;
      _sp.size(0.2, 0.7);
      _sp.life = 0.9;
      _sp.alpha = 0.5;
      _sp.drag = 2;
      _sp.grav = -0.2;
      _sp.fadeOut = 0.3;
      this.soft.spawn(_sp);
    }
  }

  /** Trail tick of a flying chunk. ev = [x, y, z, vx, vy, vz, r, g, b, flags, floor]. */
  private gibTrail(ev: Float32Array) {
    const rng = this.rng;
    const flags = ev[9];
    const x = ev[0];
    const y = ev[1];
    const z = ev[2];
    if (flags & GIB_FLAG.BLOODY) {
      // Far away the drops would be sub-pixel specks (they read as grey dots): skip.
      if (this.lodAt(x, y, z) < 0.8) return;
      // Short falling streaks (stretched along velocity), a bit brighter than the
      // chunk so they read as blood rather than dark specks against the sky.
      const k = 1.35;
      _sp.reset().vel(ev[3] * 0.15 + rng.spread(0.3), ev[4] * 0.15, ev[5] * 0.15 + rng.spread(0.3));
      _sp.rgb0(ev[6] * k, ev[7] * k, ev[8] * k).rgb1(ev[6] * k, ev[7] * k, ev[8] * k);
      _sp.x = x;
      _sp.y = y;
      _sp.z = z;
      _sp.frame = PF.DROP;
      _sp.stretch = 0.04;
      _sp.size(rng.range(0.045, 0.065), 0.035);
      _sp.life = rng.range(0.4, 0.65);
      _sp.grav = 9;
      _sp.fadeIn = 0.01;
      _sp.fadeOut = 0.7;
      _sp.flags = PFLAG.DIE_ON_FLOOR;
      _sp.floor = ev[10];
      this.soft.spawn(_sp);
    } else if (flags & GIB_FLAG.HOT) {
      _sp.reset().vel(ev[3] * 0.1, ev[4] * 0.1, ev[5] * 0.1).rgb0(1.6, 0.8, 0.25).rgb1(0.7, 0.12, 0.02);
      _sp.x = x;
      _sp.y = y;
      _sp.z = z;
      _sp.frame = PF.GLOW;
      _sp.size(0.22, 0.1);
      _sp.life = 0.22;
      _sp.alpha = 0.8;
      _sp.fadeIn = 0.01;
      _sp.fadeOut = 0.2;
      this.glow.spawn(_sp);
      _sp.reset().vel(rng.spread(0.2), 0.4, rng.spread(0.2)).rgb0(0.16, 0.15, 0.14).rgb1(0.3, 0.3, 0.3);
      _sp.x = x;
      _sp.y = y;
      _sp.z = z;
      _sp.frame = PF.SMOKE;
      _sp.size(0.4, 0.8);
      _sp.life = rng.range(0.6, 0.9);
      _sp.alpha = 0.35;
      _sp.drag = 1.5;
      _sp.grav = -0.3;
      _sp.rot = rng.next() * 6.28;
      _sp.rotV = rng.spread(1);
      _sp.fadeIn = 0.05;
      _sp.fadeOut = 0.2;
      this.soft.spawn(_sp);
    }
  }

  /** Estimate how lit a sprite would be from the scene's ambient/hemisphere/sun lights. */
  private updateLighting(dt: number) {
    this.lightScanT -= dt;
    if (this.lightScanT <= 0) {
      this.lightScanT = 1.5;
      let root: THREE.Object3D = this.group;
      while (root.parent) root = root.parent;
      this.lights.length = 0;
      if (root !== this.group) root.traverse(this.collectLight);
    }
    const ls = this.lights;
    if (ls.length === 0) return;
    let sr = 0,
      sg = 0,
      sb = 0,
      ur = 0,
      ug = 0,
      ub = 0;
    for (let i = 0; i < ls.length; i++) {
      const l = ls[i];
      if (!l.visible) continue;
      const I = l.intensity;
      const c = l.color;
      if ((l as THREE.HemisphereLight).isHemisphereLight) {
        const gc = (l as THREE.HemisphereLight).groundColor;
        sr += (c.r * 0.7 + gc.r * 0.3) * I;
        sg += (c.g * 0.7 + gc.g * 0.3) * I;
        sb += (c.b * 0.7 + gc.b * 0.3) * I;
        ur += c.r * I;
        ug += c.g * I;
        ub += c.b * I;
      } else if ((l as THREE.AmbientLight).isAmbientLight) {
        sr += c.r * I;
        sg += c.g * I;
        sb += c.b * I;
        ur += c.r * I;
        ug += c.g * I;
        ub += c.b * I;
      } else if ((l as THREE.DirectionalLight).isDirectionalLight) {
        sr += c.r * I * 0.55;
        sg += c.g * I * 0.55;
        sb += c.b * I * 0.55;
        ur += c.r * I * 0.7;
        ug += c.g * I * 0.7;
        ub += c.b * I * 0.7;
      }
    }
    // Fire light spills onto the smoke for a moment.
    const f = this.flashT > 0 ? (this.flashT / this.flashDur) * Math.min(2, this.flashPeak / 40) : 0;
    const k = 1 / Math.PI;
    this.soft.lightUniform.setRGB(clampL(sr * k + f * 0.4), clampL(sg * k + f * 0.22), clampL(sb * k + f * 0.08));
    this.decals.lightUniform.setRGB(clampL(ur * k), clampL(ug * k), clampL(ub * k));
  }
}
