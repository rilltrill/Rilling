import * as THREE from 'three';
import { Kit } from '../../kit/ModelKit';
import { Rng } from '../../../core/Rng';
import { EnvKit } from '../../kit/EnvKit';
import { applyRetroArray, bakeMerge, texGlow, type RetroParams } from './bake';

/**
 * Cheap atmospheric effects for MAIN STREET: fake light pools and volumetric
 * lamp beams (one instanced draw call each), fire plumes with embers + smoke,
 * light rain and the night sky. Everything is created per stage and tracked.
 */

let radialTex: THREE.DataTexture | null = null;

/** Soft radial falloff texture (white centre → transparent edge). */
export function radialTexture(): THREE.DataTexture {
  if (radialTex && radialTex.userData.alive) return radialTex;
  const n = 64;
  const data = new Uint8Array(n * n * 4);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const dx = (x + 0.5) / n - 0.5;
      const dy = (y + 0.5) / n - 0.5;
      const r = Math.min(1, Math.sqrt(dx * dx + dy * dy) * 2);
      const a = Math.pow(1 - r, 1.8);
      const i = (y * n + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = 255;
      data[i + 3] = Math.round(a * 255);
    }
  }
  const t = new THREE.DataTexture(data, n, n, THREE.RGBAFormat);
  t.needsUpdate = true;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearFilter;
  t.userData.alive = true;
  const dispose = t.dispose.bind(t);
  t.dispose = () => {
    t.userData.alive = false;
    radialTex = null;
    dispose();
  };
  radialTex = Kit.track(t);
  return radialTex;
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();
const _c = new THREE.Color();
const _e = new THREE.Euler();

interface PoolDef {
  x: number;
  y: number;
  z: number;
  r: number;
  color: number;
  k: number;
  /** Vertical decal (on a wall) facing this yaw instead of lying flat. */
  wallYaw?: number;
}

/** Additive soft light decals on the ground ("fake" light pools under lamps, signs, fires). */
export class LightPools {
  private defs: PoolDef[] = [];

  add(x: number, z: number, r: number, color: number, k = 1, y = 0.035): number {
    this.defs.push({ x, y, z, r, color, k });
    return this.defs.length - 1;
  }

  /** Base colour of instance i (for runtime flicker). */
  colorOf(i: number): { color: number; k: number } {
    return this.defs[i];
  }

  /** Glow splashed on a wall (neon spill). */
  addWall(x: number, y: number, z: number, r: number, color: number, yaw: number, k = 1) {
    this.defs.push({ x, y, z, r, color, k, wallYaw: yaw });
  }

  /**
   * `surface` gives the retro texture of whatever each pool lands on: the pool is
   * multiplied by the same world-space pixel texture, so lit asphalt / stone keeps
   * its pattern instead of washing out under a flat additive splash. `map`
   * replaces the soft radial falloff and `light` screens the pool over what it
   * lands on (ART: PIXEL WORLD: stepped pixel rings).
   */
  build(surface?: (x: number, z: number, wall: boolean) => RetroParams, map?: THREE.Texture, light = false): THREE.InstancedMesh {
    const mat = Kit.track(
      new THREE.MeshBasicMaterial({
        map: map ?? radialTexture(),
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
        fog: true,
      }),
    );
    if (light) {
      // Screen the pool over the surface (dst + pool × (1 − dst)): full colour on black asphalt (the
      // neon wash still reads), less on lit texels — the painted pattern under a lamp keeps showing
      // instead of washing out under a flat additive disc.
      mat.blending = THREE.CustomBlending;
      mat.blendEquation = THREE.AddEquation;
      mat.blendSrc = THREE.OneMinusDstColorFactor;
      mat.blendDst = THREE.OneFactor;
      mat.premultipliedAlpha = true;
    }
    const geo = Kit.track(new THREE.PlaneGeometry(1, 1));
    const n = Math.max(1, this.defs.length);
    if (surface) {
      const ret = new Float32Array(n * 4);
      this.defs.forEach((d, i) => ret.set(surface(d.x, d.z, d.wallYaw !== undefined), i * 4));
      geo.setAttribute('retro', new THREE.InstancedBufferAttribute(ret, 4));
      applyRetroArray(mat);
    }
    const mesh = new THREE.InstancedMesh(geo, mat, n);
    this.defs.forEach((d, i) => {
      if (d.wallYaw !== undefined) _e.set(0, d.wallYaw, 0);
      else _e.set(-Math.PI / 2, 0, 0);
      _q.setFromEuler(_e);
      _s.set(d.r * 2, d.r * 2, 1);
      _m.compose(_p.set(d.x, d.y, d.z), _q, _s);
      mesh.setMatrixAt(i, _m);
      mesh.setColorAt(i, _c.setHex(d.color).multiplyScalar(d.k));
    });
    mesh.count = this.defs.length;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
    mesh.renderOrder = 2;
    mesh.name = 'lightPools';
    return mesh;
  }
}

/** Vertical cone geometry with a brightness gradient baked in vertex colours (bright at the top). */
function beamGeometry(): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(0.22, 1.0, 1, 14, 4, true);
  g.translate(0, -0.5, 0); // apex at origin, extends down to y = -1
  const pos = g.attributes.position as THREE.BufferAttribute;
  const col: number[] = [];
  for (let i = 0; i < pos.count; i++) {
    const k = 1 + pos.getY(i); // 1 at top … 0 at bottom
    const a = Math.pow(k, 1.6) * 0.95 + 0.05;
    col.push(a, a, a);
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return Kit.track(g);
}

interface BeamDef {
  x: number;
  y: number;
  z: number;
  len: number;
  radius: number;
  color: number;
  k: number;
  rx: number;
  ry: number;
}

/** Volumetric light shafts (street lamps, floodlights). One instanced draw call. */
export class LightBeams {
  private defs: BeamDef[] = [];

  /** Cone hanging from (x, y, z) down by `len`; tilt with rx (radians) around yaw ry. */
  add(x: number, y: number, z: number, len: number, radius: number, color: number, k = 1, rx = 0, ry = 0): number {
    this.defs.push({ x, y, z, len, radius, color, k, rx, ry });
    return this.defs.length - 1;
  }

  colorOf(i: number): { color: number; k: number } {
    return this.defs[i];
  }

  build(): THREE.InstancedMesh {
    const mat = Kit.track(
      new THREE.MeshBasicMaterial({
        vertexColors: true,
        transparent: true,
        opacity: 0.075,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
        toneMapped: false,
        fog: true,
      }),
    );
    const mesh = new THREE.InstancedMesh(beamGeometry(), mat, Math.max(1, this.defs.length));
    this.defs.forEach((d, i) => {
      _e.set(d.rx, d.ry, 0, 'YXZ');
      _q.setFromEuler(_e);
      _s.set(d.radius, d.len, d.radius);
      _m.compose(_p.set(d.x, d.y, d.z), _q, _s);
      mesh.setMatrixAt(i, _m);
      mesh.setColorAt(i, _c.setHex(d.color).multiplyScalar(d.k));
    });
    mesh.count = this.defs.length;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
    mesh.renderOrder = 3;
    mesh.name = 'lightBeams';
    return mesh;
  }
}

// ─── Particles ──────────────────────────────────────────────────────────────

/** CPU-driven point cloud with per-point RGBA (alpha via vertex colours). */
class Cloud {
  readonly points: THREE.Points;
  readonly pos: Float32Array;
  readonly col: Float32Array;
  readonly vel: Float32Array;
  readonly life: Float32Array;
  readonly max: Float32Array;

  constructor(readonly n: number, size: number, additive: boolean) {
    this.pos = new Float32Array(n * 3);
    this.col = new Float32Array(n * 4);
    this.vel = new Float32Array(n * 3);
    this.life = new Float32Array(n);
    this.max = new Float32Array(n).fill(1);
    const g = Kit.track(new THREE.BufferGeometry());
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    const m = Kit.track(
      new THREE.PointsMaterial({
        size,
        map: radialTexture(),
        vertexColors: true,
        transparent: true,
        depthWrite: false,
        blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
        toneMapped: !additive,
        sizeAttenuation: true,
      }),
    );
    this.points = new THREE.Points(g, m);
    this.points.frustumCulled = false;
  }

  flush() {
    (this.points.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (this.points.geometry.attributes.color as THREE.BufferAttribute).needsUpdate = true;
  }
}

export interface FireOptions {
  /** Flame footprint scale (1 ≈ a burning car). */
  scale?: number;
  embers?: number;
  smoke?: number;
  light?: THREE.PointLight | null;
  lightBase?: number;
  /** Footprint half-extent for flame placement. */
  spreadX?: number;
  spreadZ?: number;
  seed?: number;
}

/**
 * Flickering flames (glow cones), rising embers and a smoke column.
 * Position the `group` in the world. `active` toggles everything.
 */
export class FirePlume {
  readonly group = new THREE.Group();
  private flames: THREE.Mesh[] = [];
  private base: number[] = [];
  private embers: Cloud;
  private smoke: Cloud;
  private rng: Rng;
  private t = 0;
  active = true;
  private o: Required<Omit<FireOptions, 'light'>> & { light: THREE.PointLight | null };

  constructor(o: FireOptions = {}) {
    this.o = { scale: 1, embers: 26, smoke: 12, light: null, lightBase: 30, spreadX: 0.7, spreadZ: 1.4, seed: 5, ...o };
    this.rng = new Rng(this.o.seed);
    const s = this.o.scale;
    const outer = Kit.glow(0xff5a12, 1.35);
    const inner = Kit.glow(0xffc24a, 1.6);
    const n = Math.min(5, Math.round(3 + 2 * s));
    for (let i = 0; i < n; i++) {
      const isInner = i % 2 === 1;
      const r = (isInner ? 0.22 : 0.36) * s * this.rng.range(0.8, 1.2);
      const h = (isInner ? 0.9 : 1.3) * s * this.rng.range(0.8, 1.3);
      const m = Kit.add(this.group, Kit.cone(r, h, 5), isInner ? inner : outer, this.rng.spread(this.o.spreadX * s), h / 2, this.rng.spread(this.o.spreadZ * s));
      m.userData.h = h;
      this.flames.push(m);
      this.base.push(this.rng.next() * 10);
    }
    this.embers = new Cloud(this.o.embers, 0.09 * Math.sqrt(s), true);
    this.smoke = new Cloud(this.o.smoke, 2.6 * s, false);
    for (let i = 0; i < this.o.embers; i++) this.embers.life[i] = this.rng.next() * 2;
    for (let i = 0; i < this.o.smoke; i++) this.smoke.life[i] = this.rng.next() * 4;
    this.group.add(this.embers.points, this.smoke.points);
    if (this.o.light) this.group.add(this.o.light);
  }

  update(dt: number) {
    this.group.visible = this.active;
    if (!this.active) {
      if (this.o.light) this.o.light.intensity = 0;
      return;
    }
    this.t += dt;
    const t = this.t;
    const s = this.o.scale;
    for (let i = 0; i < this.flames.length; i++) {
      const f = this.flames[i];
      const b = this.base[i];
      const k = 0.75 + 0.25 * Math.sin(t * 13 + b) + 0.12 * Math.sin(t * 29 + b * 2.3);
      f.scale.set(1 + 0.12 * Math.sin(t * 17 + b), k, 1 + 0.12 * Math.cos(t * 15 + b));
      f.position.y = (f.userData.h as number) * k * 0.5;
      f.rotation.z = Math.sin(t * 3 + b) * 0.12;
    }
    if (this.o.light) {
      this.o.light.intensity = this.o.lightBase * (0.78 + 0.16 * Math.sin(t * 21) + 0.1 * Math.sin(t * 47 + 1.3));
    }
    // Embers rise and drift.
    const e = this.embers;
    for (let i = 0; i < e.n; i++) {
      e.life[i] -= dt;
      const j = i * 3;
      if (e.life[i] <= 0) {
        e.max[i] = e.life[i] = this.rng.range(1.2, 2.6);
        e.pos[j] = this.rng.spread(this.o.spreadX * s);
        e.pos[j + 1] = this.rng.range(0.4, 1.2) * s;
        e.pos[j + 2] = this.rng.spread(this.o.spreadZ * s);
        e.vel[j] = this.rng.spread(0.5);
        e.vel[j + 1] = this.rng.range(1.2, 2.6) * Math.sqrt(s);
        e.vel[j + 2] = this.rng.spread(0.5);
      }
      e.pos[j] += (e.vel[j] + Math.sin(t * 2 + i) * 0.4) * dt;
      e.pos[j + 1] += e.vel[j + 1] * dt;
      e.pos[j + 2] += e.vel[j + 2] * dt;
      const a = Math.min(1, e.life[i] / e.max[i]) * (0.6 + 0.4 * Math.sin(t * 20 + i * 7));
      const c = i * 4;
      e.col[c] = 1;
      e.col[c + 1] = 0.55 + 0.3 * a;
      e.col[c + 2] = 0.2;
      e.col[c + 3] = a;
    }
    e.flush();
    // Smoke column.
    const m = this.smoke;
    for (let i = 0; i < m.n; i++) {
      m.life[i] -= dt;
      const j = i * 3;
      if (m.life[i] <= 0) {
        m.max[i] = m.life[i] = this.rng.range(3, 5);
        m.pos[j] = this.rng.spread(0.5 * s);
        m.pos[j + 1] = 1.4 * s;
        m.pos[j + 2] = this.rng.spread(0.8 * s);
        m.vel[j] = 0.25 + this.rng.spread(0.2);
        m.vel[j + 1] = this.rng.range(1.0, 1.6);
        m.vel[j + 2] = this.rng.spread(0.2);
      }
      m.pos[j] += m.vel[j] * dt;
      m.pos[j + 1] += m.vel[j + 1] * dt;
      m.pos[j + 2] += m.vel[j + 2] * dt;
      const k = m.life[i] / m.max[i];
      const a = Math.sin(k * Math.PI) * 0.42;
      const c = i * 4;
      const g = 0.07 + (1 - k) * 0.05;
      m.col[c] = g;
      m.col[c + 1] = g;
      m.col[c + 2] = g * 1.1;
      m.col[c + 3] = a;
    }
    m.flush();
  }
}

/** Light drizzle around the camera: line streaks wrapped in a box that follows it. */
export class Rain {
  readonly mesh: THREE.LineSegments;
  private seeds: Float32Array;
  private pos: Float32Array;
  private readonly n: number;
  private t = 0;

  constructor(n = 420, readonly half = 14, readonly height = 11) {
    this.n = n;
    this.seeds = new Float32Array(n * 3);
    this.pos = new Float32Array(n * 6);
    const r = new Rng(77);
    for (let i = 0; i < n; i++) {
      this.seeds[i * 3] = r.next();
      this.seeds[i * 3 + 1] = r.next();
      this.seeds[i * 3 + 2] = r.next();
    }
    const g = Kit.track(new THREE.BufferGeometry());
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    const m = Kit.track(new THREE.LineBasicMaterial({ color: 0x9fb2d8, transparent: true, opacity: 0.3, depthWrite: false, fog: true }));
    this.mesh = new THREE.LineSegments(g, m);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 4;
  }

  update(dt: number, cam: THREE.Vector3) {
    this.t += dt;
    const H = this.height;
    const W = this.half * 2;
    const fall = 9;
    for (let i = 0; i < this.n; i++) {
      const sx = this.seeds[i * 3];
      const sy = this.seeds[i * 3 + 1];
      const sz = this.seeds[i * 3 + 2];
      // World-anchored grid wrapped around the camera so streaks don't swim when turning.
      const x = cam.x + ((((sx * W - cam.x) % W) + W) % W) - this.half;
      const z = cam.z + ((((sz * W - cam.z) % W) + W) % W) - this.half;
      const y = cam.y - 3 + ((((sy * H - this.t * fall * (0.85 + sx * 0.3)) % H) + H) % H);
      const j = i * 6;
      this.pos[j] = x;
      this.pos[j + 1] = y;
      this.pos[j + 2] = z;
      this.pos[j + 3] = x + 0.04;
      this.pos[j + 4] = y + 0.55;
      this.pos[j + 5] = z + 0.02;
    }
    (this.mesh.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
  }
}

/** Night sky group (dome, moon + halo, stars, distant skyline). Follows the camera on XZ. */
export function nightSky(moonDir: THREE.Vector3, horizon: number, top: number): THREE.Group {
  const g = new THREE.Group();
  g.name = 'sky';
  // Dome.
  const r = 300;
  const geo = Kit.track(new THREE.SphereGeometry(r, 16, 12));
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const cols: number[] = [];
  const ch = new THREE.Color(horizon);
  const ct = new THREE.Color(top);
  const cm = new THREE.Color(0x3a3450);
  const c = new THREE.Color();
  const md = moonDir.clone().normalize();
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.set(pos.getX(i), pos.getY(i), pos.getZ(i)).normalize();
    const y = v.y;
    if (y >= 0) c.copy(ch).lerp(ct, Math.pow(Math.min(1, y * 1.4), 0.55));
    else c.copy(ch);
    // Faint glow around the moon.
    const near = Math.max(0, v.dot(md));
    c.lerp(cm, Math.pow(near, 8) * 0.6);
    cols.push(c.r, c.g, c.b);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  const dome = new THREE.Mesh(
    geo,
    Kit.track(new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false })),
  );
  dome.renderOrder = -2;
  dome.frustumCulled = false;
  g.add(dome);

  // Moon disc + halo.
  const moonPos = md.clone().multiplyScalar(250);
  // Mottled 'rock' maria on the self-lit disc.
  const moon = Kit.add(g, Kit.sphere(5.5, 16, 10), texGlow(0xe6ecff, 1.05, 'rock', 0.35, 0.4), moonPos.x, moonPos.y, moonPos.z);
  moon.renderOrder = -1;
  // Craters.
  const crater = Kit.glow(0xb9c2dc, 1.0);
  for (const [dx, dy, s] of [[-1.5, 1.2, 1.3], [1.8, -0.9, 1.0], [0.3, -2.1, 0.7], [1.5, 2.1, 0.6]] as const) {
    const cm2 = Kit.add(g, Kit.sphere(s, 8, 6), crater, 0, 0, 0);
    cm2.position.copy(moonPos).addScaledVector(md, -4.2);
    const right = new THREE.Vector3().crossVectors(md, new THREE.Vector3(0, 1, 0)).normalize();
    const up = new THREE.Vector3().crossVectors(right, md).normalize();
    cm2.position.addScaledVector(right, dx).addScaledVector(up, dy);
    cm2.scale.set(1, 1, 0.3);
    cm2.lookAt(moonPos.clone().multiplyScalar(2));
    cm2.renderOrder = -1;
  }
  // Moon + craters → one draw call.
  {
    const mg = new THREE.Group();
    for (const o of [...g.children]) if (o !== dome) mg.add(o);
    bakeMerge(mg);
    g.add(mg);
  }
  const halo = new THREE.Mesh(
    Kit.plane(70, 70),
    Kit.track(
      new THREE.MeshBasicMaterial({
        map: radialTexture(),
        color: new THREE.Color(0x6f80c0),
        transparent: true,
        opacity: 0.55,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        fog: false,
      }),
    ),
  );
  halo.position.copy(md).multiplyScalar(270);
  halo.lookAt(0, 0, 0);
  halo.renderOrder = -1;
  g.add(halo);

  // Stars.
  const rng = new Rng(31);
  const sp: number[] = [];
  for (let i = 0; i < 260; i++) {
    const a = rng.next() * Math.PI * 2;
    const y = 0.15 + Math.pow(rng.next(), 0.7) * 0.85;
    const rr = Math.sqrt(1 - y * y);
    sp.push(Math.cos(a) * rr * 280, y * 280, Math.sin(a) * rr * 280);
  }
  const sg = Kit.track(new THREE.BufferGeometry());
  sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
  const stars = new THREE.Points(sg, Kit.track(new THREE.PointsMaterial({ color: 0xc8d4ff, size: 1.6, sizeAttenuation: false, fog: false, transparent: true, opacity: 0.8, depthWrite: false })));
  stars.renderOrder = -1;
  stars.frustumCulled = false;
  g.add(stars);

  // Distant skyline silhouettes with a few lit windows.
  const sky = new THREE.Group();
  const sil = Kit.mat(0x0c0f18, { fog: false });
  const win = Kit.glow(0xc89a5a, 0.35);
  for (let i = 0; i < 70; i++) {
    const a = (i / 70) * Math.PI * 2 + rng.spread(0.03);
    const d = rng.range(200, 240);
    const w = rng.range(8, 22);
    const h = rng.range(10, 38) * (rng.chance(0.1) ? 1.8 : 1);
    const b = Kit.add(sky, Kit.box(w, h, w * 0.6), sil, Math.cos(a) * d, h / 2 - 4, Math.sin(a) * d);
    b.rotation.y = -a + Math.PI / 2;
    const nw = Math.floor(h / 6);
    for (let k = 0; k < nw; k++) {
      if (!rng.chance(0.35)) continue;
      const wy = 2 + k * 5 + rng.range(0, 2);
      const lx = rng.spread(w * 0.35);
      const wm = Kit.add(sky, Kit.box(1.2, 1.2, 0.3), win, 0, 0, 0);
      wm.position.set(Math.cos(a) * (d - w * 0.3) + Math.sin(a) * lx, wy - 4, Math.sin(a) * (d - w * 0.3) - Math.cos(a) * lx);
      wm.rotation.y = -a + Math.PI / 2;
    }
  }
  // A water tower on the edge of town.
  const wt = new THREE.Group();
  for (const [lx, lz] of [[-3, -3], [3, -3], [-3, 3], [3, 3]]) Kit.add(wt, Kit.box(0.6, 22, 0.6), sil, lx, 11, lz);
  Kit.add(wt, Kit.cyl(6, 6, 7, 12), sil, 0, 25, 0);
  Kit.add(wt, Kit.cone(6.4, 4, 12), sil, 0, 30.5, 0);
  Kit.add(wt, Kit.box(0.8, 0.8, 0.3), Kit.glow(0xff3020, 1.4), 0, 33, 0);
  wt.position.set(-150, -4, -170);
  sky.add(wt);
  for (const m of EnvKit.mergeStatic(sky)) {
    m.renderOrder = -1;
    m.frustumCulled = false;
  }
  g.add(sky);
  return g;
}
