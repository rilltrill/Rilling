import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Animated 3D attract scene rendered behind the menus whenever no stage is loaded.
 *
 * Two short "attract-mode" shots alternate every ~10 s, cross-faded through black:
 *  - CITY   — a slow dolly down a foggy ruined street at night. Zombie silhouettes
 *             shamble under a flickering streetlight, a wreck burns down the road,
 *             rain, and lightning over the skyline.
 *  - JUNGLE — a dusk drive along a jungle track. A raptor stands on a rock and
 *             screeches, a volcano smokes on the horizon, pterosaurs circle,
 *             fireflies drift; distant lightning.
 *
 * Self-contained on purpose: it never touches the Kit cache (Kit.disposeAll()
 * runs whenever a stage tears down). Everything is created here and released in
 * dispose(). Budget: ≈ 20–25 draw calls per shot, ≤ 4 lights, merged statics,
 * instanced crowds, zero per-frame allocations.
 */

export type BackdropTheme = 'city' | 'jungle';

// ─── tiny helpers ────────────────────────────────────────────────────────────

/** Deterministic LCG so the layout is identical every boot. */
class Lcg {
  constructor(private s: number) {}
  next() {
    this.s = (Math.imul(this.s, 1664525) + 1013904223) >>> 0;
    return this.s / 4294967296;
  }
  range(a: number, b: number) {
    return a + (b - a) * this.next();
  }
  chance(p: number) {
    return this.next() < p;
  }
}

const _m = new THREE.Matrix4();
const _m2 = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _c = new THREE.Color();
const _c2 = new THREE.Color();
const _look = new THREE.Vector3();

interface Disposable {
  dispose(): void;
}

/**
 * Collects primitives with per-vertex colours and merges them into a single
 * geometry (one draw call per material). Every source geometry is consumed.
 */
class Batch {
  private parts: THREE.BufferGeometry[] = [];

  /** Add `src` transformed by position / euler rotation / scale with a flat colour (or a vertical gradient). */
  add(
    src: THREE.BufferGeometry,
    color: number | THREE.Color,
    x = 0,
    y = 0,
    z = 0,
    rx = 0,
    ry = 0,
    rz = 0,
    sx = 1,
    sy = sx,
    sz = sx,
    bottom?: number,
  ): this {
    const g = src.index ? src.toNonIndexed() : src.clone();
    src.dispose();
    for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal') g.deleteAttribute(name);
    const pos = g.getAttribute('position') as THREE.BufferAttribute;
    const n = pos.count;
    const col = new Float32Array(n * 3);
    _c.set(color);
    if (bottom !== undefined) {
      _c2.set(bottom);
      g.computeBoundingBox();
      const bb = g.boundingBox!;
      const h = Math.max(1e-4, bb.max.y - bb.min.y);
      const tmp = new THREE.Color();
      for (let i = 0; i < n; i++) {
        tmp.copy(_c2).lerp(_c, (pos.getY(i) - bb.min.y) / h);
        col[i * 3] = tmp.r;
        col[i * 3 + 1] = tmp.g;
        col[i * 3 + 2] = tmp.b;
      }
    } else {
      for (let i = 0; i < n; i++) {
        col[i * 3] = _c.r;
        col[i * 3 + 1] = _c.g;
        col[i * 3 + 2] = _c.b;
      }
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    _e.set(rx, ry, rz, 'YXZ');
    _q.setFromEuler(_e);
    g.applyMatrix4(_m.compose(_p.set(x, y, z), _q, _s.set(sx, sy, sz)));
    _e.order = 'XYZ';
    this.parts.push(g);
    return this;
  }

  get empty() {
    return this.parts.length === 0;
  }

  build(): THREE.BufferGeometry {
    const merged = mergeGeometries(this.parts, false) ?? new THREE.BufferGeometry();
    for (const p of this.parts) p.dispose();
    this.parts = [];
    merged.computeBoundingSphere();
    return merged;
  }
}

/** Displace vertices of a (non-indexed) geometry, keeping coincident vertices together. */
function jitter(g: THREE.BufferGeometry, amount: number, rng: Lcg): THREE.BufferGeometry {
  const out = g.index ? g.toNonIndexed() : g;
  if (out !== g) g.dispose();
  const pos = out.getAttribute('position') as THREE.BufferAttribute;
  const seen = new Map<string, [number, number, number]>();
  for (let i = 0; i < pos.count; i++) {
    const key = `${pos.getX(i).toFixed(2)},${pos.getY(i).toFixed(2)},${pos.getZ(i).toFixed(2)}`;
    let d = seen.get(key);
    if (!d) {
      d = [rng.range(-amount, amount), rng.range(-amount, amount) * 0.6, rng.range(-amount, amount)];
      seen.set(key, d);
    }
    pos.setXYZ(i, pos.getX(i) + d[0], pos.getY(i) + d[1], pos.getZ(i) + d[2]);
  }
  out.computeVertexNormals();
  return out;
}

function canvasTexture(size: number, h: number, draw: (g: CanvasRenderingContext2D, w: number, h: number) => void): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = h;
  const g = c.getContext('2d')!;
  draw(g, size, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Soft additive points with per-point size / alpha / tint. */
function pointsMaterial(map: THREE.Texture, additive: boolean): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { map: { value: map }, scale: { value: 300 } },
    vertexShader: /* glsl */ `
      attribute float size;
      attribute float alpha;
      attribute vec3 tint;
      uniform float scale;
      varying float vA;
      varying vec3 vC;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = size * scale / max(0.1, -mv.z);
        gl_Position = projectionMatrix * mv;
        vA = alpha;
        vC = tint;
      }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D map;
      varying float vA;
      varying vec3 vC;
      void main() {
        vec4 t = texture2D(map, gl_PointCoord);
        gl_FragColor = vec4(vC, t.a * vA);
        #include <colorspace_fragment>
      }`,
    transparent: true,
    depthWrite: false,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
  });
}

/** A pool of soft points (smoke, flames, fireflies) updated in place every frame. */
class PointPool {
  readonly geo = new THREE.BufferGeometry();
  readonly pos: Float32Array;
  readonly size: Float32Array;
  readonly alpha: Float32Array;
  readonly tint: Float32Array;
  readonly points: THREE.Points;
  /** Per-point scratch: age, life, vx, vy, vz, seed. */
  readonly data: Float32Array;

  constructor(
    readonly count: number,
    readonly mat: THREE.ShaderMaterial,
  ) {
    this.pos = new Float32Array(count * 3);
    this.size = new Float32Array(count);
    this.alpha = new Float32Array(count);
    this.tint = new Float32Array(count * 3);
    this.data = new Float32Array(count * 6);
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('size', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('tint', new THREE.BufferAttribute(this.tint, 3).setUsage(THREE.DynamicDrawUsage));
    this.points = new THREE.Points(this.geo, mat);
    this.points.frustumCulled = false;
  }

  commit() {
    for (const k of ['position', 'size', 'alpha', 'tint']) (this.geo.getAttribute(k) as THREE.BufferAttribute).needsUpdate = true;
  }

  dispose() {
    this.geo.dispose();
  }
}

// ─── vignettes ───────────────────────────────────────────────────────────────

interface Vignette {
  scene: THREE.Scene;
  /** Restart the shot (called each time it comes on screen). */
  reset(): void;
  /** `t` = seconds into the shot, `len` = shot length. Positions the camera. */
  update(t: number, dt: number, len: number, cam: THREE.PerspectiveCamera): void;
  /** Lightning brightness 0..1 for this frame. */
  flash(k: number): void;
  /** New bolt shape/position for the next strike. */
  strike(rng: Lcg): void;
  pointMats: THREE.ShaderMaterial[];
}

interface Shared {
  own<T extends Disposable>(x: T): T;
  glowTex: THREE.Texture;
  puffTex: THREE.Texture;
  mistTex: THREE.Texture;
  bolts: THREE.BufferGeometry[];
}

function boltGeometry(rng: Lcg): THREE.BufferGeometry {
  // Jagged ribbon from the cloud base down, with one branch.
  const verts: number[] = [];
  const segment = (x0: number, y0: number, len: number, w: number, steps: number, drift: number) => {
    let x = x0;
    let y = y0;
    const pts: [number, number][] = [[x, y]];
    for (let i = 0; i < steps; i++) {
      x += rng.range(-1, 1) * drift + drift * 0.25;
      y -= len / steps;
      pts.push([x, y]);
    }
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, ay] = pts[i];
      const [bx, by] = pts[i + 1];
      const wa = w * (1 - i / pts.length);
      const wb = w * (1 - (i + 1) / pts.length);
      verts.push(ax - wa, ay, 0, bx - wb, by, 0, bx + wb, by, 0, ax - wa, ay, 0, bx + wb, by, 0, ax + wa, ay, 0);
    }
    return pts;
  };
  const main = segment(0, 0, 60, 0.9, 12, 3.2);
  const b = main[Math.floor(main.length * 0.35)];
  segment(b[0], b[1], 22, 0.45, 6, 3.6);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  return g;
}

/** Shared lightning-bolt mesh: picks one of the pre-built shapes per strike. */
function makeBolt(sh: Shared, color: number): THREE.Mesh {
  const mat = sh.own(
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
      toneMapped: false,
      side: THREE.DoubleSide,
    }),
  );
  const m = new THREE.Mesh(sh.bolts[0], mat);
  m.visible = false;
  m.frustumCulled = false;
  return m;
}

function skyDome(sh: Shared, top: number, horizon: number, bottom: number): THREE.Mesh {
  const g = sh.own(new THREE.SphereGeometry(250, 20, 14));
  const pos = g.getAttribute('position') as THREE.BufferAttribute;
  const col = new Float32Array(pos.count * 3);
  const ct = new THREE.Color(top);
  const ch = new THREE.Color(horizon);
  const cb = new THREE.Color(bottom);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i) / 250;
    if (y >= 0) c.copy(ch).lerp(ct, Math.pow(Math.min(1, y * 1.6), 0.55));
    else c.copy(ch).lerp(cb, Math.min(1, -y * 4));
    col[i * 3] = c.r;
    col[i * 3 + 1] = c.g;
    col[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const m = new THREE.Mesh(
    g,
    sh.own(new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false })),
  );
  m.renderOrder = -10;
  m.frustumCulled = false;
  return m;
}

function sprite(sh: Shared, color: number, opacity: number, scale: number, fog = false): THREE.Sprite {
  const s = new THREE.Sprite(
    sh.own(
      new THREE.SpriteMaterial({
        map: sh.glowTex,
        color,
        transparent: true,
        opacity,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        fog,
        toneMapped: false,
      }),
    ),
  );
  s.scale.setScalar(scale);
  return s;
}

/** Flickering broken streetlight: mostly on, stutters, occasional blackout burst. */
function flicker(t: number): number {
  const n = Math.sin(t * 12.9) * 0.5 + Math.sin(t * 31.7) * 0.3 + Math.sin(t * 5.1) * 0.6;
  let k = n > -0.7 ? 1 : 0.1;
  const cyc = t % 4.7;
  if (cyc > 3.7 && cyc < 4.25) k = Math.sin(t * 70) > 0.2 ? 0.9 : 0.04;
  return k;
}

// ─── CITY ────────────────────────────────────────────────────────────────────

interface Zed {
  x: number;
  z: number;
  x0: number;
  z0: number;
  yaw: number;
  speed: number;
  phase: number;
  scale: number;
  reach: number;
  lean: number;
}

function buildCity(sh: Shared): Vignette {
  const own = sh.own;
  const rng = new Lcg(1979);
  const scene = new THREE.Scene();
  const fogCol = new THREE.Color(0x161c2b);
  scene.fog = new THREE.FogExp2(fogCol.getHex(), 0.03);
  scene.background = fogCol.clone();

  const sky = skyDome(sh, 0x04060c, 0x1c2436, 0x0a0c12);
  scene.add(sky);
  const skyMat = sky.material as THREE.MeshBasicMaterial;

  const hemi = new THREE.HemisphereLight(0x5a6c96, 0x120e10, 1.1);
  scene.add(hemi);
  const moon = new THREE.DirectionalLight(0x8fa8ff, 0.5);
  moon.position.set(-30, 50, -60);
  scene.add(moon);
  const lamp = new THREE.PointLight(0xffbf73, 70, 26, 1.6);
  lamp.position.set(-3.3, 5.7, -10);
  scene.add(lamp);
  const fire = new THREE.PointLight(0xff6a22, 50, 22, 1.7);
  fire.position.set(3.6, 1.6, -24);
  scene.add(fire);

  // ── static scenery (one lit batch) ──
  const lit = new Batch();
  const glow = new Batch();
  lit.add(new THREE.PlaneGeometry(70, 240), 0x15161b, 0, 0, -90, -Math.PI / 2);
  for (const side of [-1, 1]) {
    lit.add(new THREE.BoxGeometry(3, 0.16, 240), 0x26262b, side * 6.5, 0.08, -90);
    lit.add(new THREE.BoxGeometry(0.22, 0.2, 240), 0x34343a, side * 5.05, 0.1, -90);
  }
  // road paint (dim, worn)
  for (let z = 10; z > -150; z -= 6) {
    if (rng.chance(0.15)) continue;
    lit.add(new THREE.BoxGeometry(0.16, 0.02, 2.4), 0x6d6448, 0, 0.01, z);
  }
  // potholes / cracked asphalt patches
  for (let i = 0; i < 14; i++) {
    lit.add(new THREE.CircleGeometry(rng.range(0.6, 1.6), 7), 0x0c0d10, rng.range(-4, 4), 0.012, rng.range(-90, 6), -Math.PI / 2);
  }
  // buildings
  for (const side of [-1, 1]) {
    let z = 14;
    while (z > -150) {
      const w = rng.range(6, 12);
      const h = rng.range(8, 24);
      const d = 9;
      const cz = z - w / 2;
      const cx = side * (8 + d / 2);
      const shade = rng.range(0.13, 0.2);
      const col = new THREE.Color().setRGB(shade * 1.05, shade, shade * 1.08);
      lit.add(new THREE.BoxGeometry(d, h, w), col, cx, h / 2, cz, 0, 0, 0, 1, 1, 1, col.clone().multiplyScalar(0.55).getHex());
      // storefront band + awning
      lit.add(new THREE.BoxGeometry(0.3, 0.5, w * 0.96), 0x111114, side * 8.1, 3.4, cz);
      if (rng.chance(0.5)) lit.add(new THREE.BoxGeometry(1.4, 0.1, w * 0.7), 0x2a1c1c, side * 7.4, 3.0, cz, 0, 0, side * (rng.chance(0.4) ? 0.35 : 0.12));
      // broken / jagged roofline
      if (rng.chance(0.55)) {
        const n = 1 + Math.floor(rng.range(0, 3));
        for (let i = 0; i < n; i++) {
          const bw = rng.range(1.5, w * 0.5);
          const bh = rng.range(1, 4);
          lit.add(new THREE.BoxGeometry(d * rng.range(0.4, 0.9), bh, bw), col, cx + rng.range(-2, 2), h + bh / 2 - 0.4, cz + rng.range(-w / 3, w / 3), rng.range(-0.15, 0.15), 0, rng.range(-0.2, 0.2));
        }
      }
      // water tank / antenna silhouettes
      if (rng.chance(0.25)) lit.add(new THREE.CylinderGeometry(1, 1, 2, 7), 0x1a1a1f, cx, h + 1.6, cz);
      if (rng.chance(0.3)) lit.add(new THREE.BoxGeometry(0.08, 4, 0.08), 0x1a1a1f, cx + 1, h + 2, cz);
      // windows on the street-facing face
      const faceX = side * 7.97;
      for (let wy = 4.6; wy < h - 1.2; wy += 2.6) {
        for (let wz = z - 1.2; wz > z - w + 0.8; wz -= 2.1) {
          const r = rng.next();
          if (r < 0.1) {
            const warm = rng.chance(0.75);
            const k = rng.range(0.45, 1);
            const c = warm ? new THREE.Color(0xffb35c).multiplyScalar(k) : new THREE.Color(0x8fc2ff).multiplyScalar(k);
            glow.add(new THREE.PlaneGeometry(1, 1.3), c, faceX, wy, wz, 0, -side * Math.PI / 2);
          } else if (r < 0.7) {
            lit.add(new THREE.PlaneGeometry(1, 1.3), r < 0.3 ? 0x050608 : 0x0b0c10, faceX, wy, wz, 0, -side * Math.PI / 2);
          }
        }
      }
      z -= w + (rng.chance(0.25) ? rng.range(2, 4) : 0.1);
    }
  }
  // a flickering broken neon sign (separate so it can flicker)
  const neon = new Batch();
  neon.add(new THREE.BoxGeometry(0.12, 0.5, 2.6), 0xff2a4a, 7.85, 5.2, -27);
  neon.add(new THREE.BoxGeometry(0.12, 0.5, 1.2), 0xff2a4a, 7.85, 4.5, -26.3);
  const neonMesh = new THREE.Mesh(own(neon.build()), own(new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false })));
  scene.add(neonMesh);
  const neonMat = neonMesh.material as THREE.MeshBasicMaterial;

  // street furniture: lamp posts, wrecked cars, barricades, debris
  const lampPosts: [number, number][] = [
    [5.6, 4],
    [-5.6, -10],
    [5.6, -32],
    [-5.6, -54],
  ];
  for (const [x, z] of lampPosts) {
    const s = Math.sign(x);
    lit.add(new THREE.CylinderGeometry(0.09, 0.13, 6.2, 6), 0x2b2d33, x, 3.1, z);
    lit.add(new THREE.BoxGeometry(2.4, 0.1, 0.12), 0x2b2d33, x - s * 1.1, 6.1, z);
    lit.add(new THREE.BoxGeometry(0.7, 0.18, 0.36), 0x3a3c42, x - s * 2.25, 6.0, z);
    glow.add(new THREE.BoxGeometry(0.55, 0.05, 0.26), z === -10 ? 0x000000 : 0xffd9a0, x - s * 2.25, 5.89, z);
  }
  const car = (x: number, z: number, ry: number, col: number, flipped = false) => {
    const y0 = flipped ? 1.45 : 0;
    const rz = flipped ? Math.PI : 0;
    const c = new THREE.Color(col);
    lit.add(new THREE.BoxGeometry(1.85, 0.7, 4.3), c, x, y0 + (flipped ? -0.1 : 0.55), z, 0, ry, rz);
    const cab = c.clone().multiplyScalar(0.7);
    const dx = Math.sin(ry) * -0.3;
    const dz = Math.cos(ry) * -0.3;
    lit.add(new THREE.BoxGeometry(1.6, 0.55, 2.1), cab, x + dx, flipped ? 0.35 : 1.15, z + dz, 0, ry, rz);
    for (const [wx, wz] of [
      [0.85, 1.35],
      [-0.85, 1.35],
      [0.85, -1.35],
      [-0.85, -1.35],
    ]) {
      const cx = x + Math.cos(ry) * wx + Math.sin(ry) * wz;
      const cz = z - Math.sin(ry) * wx + Math.cos(ry) * wz;
      lit.add(new THREE.CylinderGeometry(0.34, 0.34, 0.22, 8), 0x0c0c0e, cx, flipped ? 1.3 : 0.34, cz, 0, ry, Math.PI / 2);
    }
  };
  car(-3.4, 1, 0.35, 0x3d2626);
  car(3.1, -14, -0.6, 0x283444, true);
  car(3.6, -24, 0.2, 0x1f1d1a); // the burning wreck
  car(-3.6, -36, -0.25, 0x3a3a2c);
  // barricade + debris
  for (let i = 0; i < 5; i++) {
    lit.add(new THREE.BoxGeometry(1.2, 0.15, 0.1), i % 2 ? 0xb8a040 : 0x1a1a1a, -1 + i * 1.25, 0.9, -19.5, 0, 0.1, rng.range(-0.08, 0.08));
  }
  lit.add(new THREE.BoxGeometry(0.1, 0.9, 0.1), 0x2a2a2a, -1.5, 0.45, -19.5);
  lit.add(new THREE.BoxGeometry(0.1, 0.9, 0.1), 0x2a2a2a, 4.2, 0.45, -19.0);
  for (let i = 0; i < 22; i++) {
    const s = rng.range(0.25, 0.8);
    lit.add(jitter(new THREE.IcosahedronGeometry(s, 0), s * 0.3, rng), 0x26262a, rng.range(-7, 7), s * 0.3, rng.range(-60, 6), rng.range(0, 3), rng.range(0, 3), 0, 1, 0.5, 1);
  }
  // trash bags / dumpsters near the kerbs
  lit.add(new THREE.BoxGeometry(1.6, 1.2, 2.2), 0x1e3326, -6.9, 0.6, -14);
  lit.add(new THREE.BoxGeometry(1.6, 1.2, 2.2), 0x2a2018, 6.9, 0.6, -52);
  // skyline far away (unlit silhouette layer, no fog)
  const sky2 = new Batch();
  for (let x = -110; x < 110; x += rng.range(6, 14)) {
    const h = rng.range(25, 75);
    const w = rng.range(6, 14);
    sky2.add(new THREE.BoxGeometry(w, h, 6), 0x0b0e17, x, h / 2 - 5, -200);
    if (rng.chance(0.3)) sky2.add(new THREE.BoxGeometry(0.4, 12, 0.4), 0x0b0e17, x, h + 1, -200);
  }
  const skyline = new THREE.Mesh(own(sky2.build()), own(new THREE.MeshBasicMaterial({ vertexColors: true, fog: false })));
  skyline.renderOrder = -5;
  scene.add(skyline);

  const litMat = own(new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
  const glowMat = own(new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }));
  scene.add(new THREE.Mesh(own(lit.build()), litMat), new THREE.Mesh(own(glow.build()), glowMat));

  // ── the flickering lamp: bulb, volumetric cone, light pool, halo ──
  const bulbMat = own(new THREE.MeshBasicMaterial({ color: 0xffd9a0, toneMapped: false }));
  const bulb = new THREE.Mesh(own(new THREE.BoxGeometry(0.55, 0.05, 0.26)), bulbMat);
  bulb.position.set(-3.35, 5.89, -10);
  scene.add(bulb);
  const coneGeo = own(new THREE.CylinderGeometry(0.3, 3.4, 5.8, 20, 1, true));
  {
    const pos = coneGeo.getAttribute('position') as THREE.BufferAttribute;
    const col = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      const k = Math.pow((pos.getY(i) + 2.9) / 5.8, 1.6);
      col[i * 3] = 1 * k;
      col[i * 3 + 1] = 0.72 * k;
      col[i * 3 + 2] = 0.42 * k;
    }
    coneGeo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  }
  const coneMat = own(
    new THREE.MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.22,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: false,
    }),
  );
  const cone = new THREE.Mesh(coneGeo, coneMat);
  cone.position.set(-3.35, 2.95, -10);
  scene.add(cone);
  const poolMat = own(
    new THREE.MeshBasicMaterial({ map: sh.glowTex, color: 0xffb060, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }),
  );
  const pool = new THREE.Mesh(own(new THREE.PlaneGeometry(8, 8)), poolMat);
  pool.rotation.x = -Math.PI / 2;
  pool.position.set(-3.3, 0.03, -10);
  scene.add(pool);
  const halo = sprite(sh, 0xffc27a, 0.8, 4.5);
  halo.position.set(-3.35, 5.85, -10);
  scene.add(halo);
  const haloMat = halo.material as THREE.SpriteMaterial;
  // static halos on the other lamps
  for (const [x, z] of lampPosts) {
    if (z === -10) continue;
    const h = sprite(sh, 0xffc27a, 0.55, 3.6);
    h.position.set(x - Math.sign(x) * 2.25, 5.85, z);
    scene.add(h);
  }
  // moon behind the haze
  const moonDisc = sprite(sh, 0xdfe8ff, 0.9, 18);
  moonDisc.position.set(-55, 70, -190);
  const moonHalo = sprite(sh, 0x5a74b0, 0.5, 90);
  moonHalo.position.copy(moonDisc.position);
  scene.add(moonHalo, moonDisc);

  // ── fog cards (lit by the lamps, scrolling) ──
  const mistParts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 6; i++) {
    const g = new THREE.PlaneGeometry(40, 5.5);
    const uv = g.getAttribute('uv') as THREE.BufferAttribute;
    for (let j = 0; j < uv.count; j++) uv.setXY(j, uv.getX(j) * 1.6 + i * 0.37, uv.getY(j));
    g.translate(rng.range(-3, 3), 1.6 + rng.range(-0.4, 0.6), -7 - i * 8.5);
    mistParts.push(g.toNonIndexed());
    g.dispose();
  }
  const mistGeo = own(mergeGeometries(mistParts, false)!);
  for (const g of mistParts) g.dispose();
  const mistTex = sh.mistTex;
  const mistMat = own(
    new THREE.MeshLambertMaterial({ map: mistTex, color: 0x9aa6c0, transparent: true, opacity: 0.32, depthWrite: false }),
  );
  const mist = new THREE.Mesh(mistGeo, mistMat);
  mist.renderOrder = 5;
  scene.add(mist);

  // ── zombies: 4 instanced draw calls for the whole horde ──
  const ZN = 9;
  const body = new Batch();
  const skin = 0x7c8a66;
  body.add(new THREE.BoxGeometry(0.36, 0.18, 0.22), 0x2c2e36, 0, 0.92, 0);
  body.add(new THREE.BoxGeometry(0.42, 0.56, 0.25), 0x5a5048, 0, 1.2, 0.05, 0.22);
  body.add(new THREE.BoxGeometry(0.1, 0.1, 0.1), skin, 0, 1.5, 0.13, 0.4);
  body.add(new THREE.BoxGeometry(0.23, 0.27, 0.25), skin, 0.02, 1.64, 0.17, 0.35, 0, 0.15);
  body.add(new THREE.BoxGeometry(0.24, 0.07, 0.26), 0x241a12, 0.02, 1.77, 0.15, 0.35, 0, 0.15);
  const zBodyGeo = own(body.build());
  const legB = new Batch();
  legB.add(new THREE.BoxGeometry(0.15, 0.86, 0.17), 0x2c2e36, 0, -0.43, 0);
  legB.add(new THREE.BoxGeometry(0.14, 0.08, 0.26), 0x111111, 0, -0.88, 0.05);
  const zLegGeo = own(legB.build());
  const armB = new Batch();
  armB.add(new THREE.BoxGeometry(0.11, 0.34, 0.12), 0x5a5048, 0, -0.17, 0);
  armB.add(new THREE.BoxGeometry(0.095, 0.3, 0.1), skin, 0, -0.48, 0);
  armB.add(new THREE.BoxGeometry(0.09, 0.11, 0.06), skin, 0, -0.68, 0);
  const zArmGeo = own(armB.build());
  const eyeB = new Batch();
  eyeB.add(new THREE.BoxGeometry(0.045, 0.03, 0.02), 0xffffff, 0.07, 1.66, 0.305, 0.35, 0, 0.15);
  eyeB.add(new THREE.BoxGeometry(0.045, 0.03, 0.02), 0xffffff, -0.03, 1.645, 0.31, 0.35, 0, 0.15);
  const zEyeGeo = own(eyeB.build());
  const zMat = own(new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
  const zEyeMat = own(new THREE.MeshBasicMaterial({ color: new THREE.Color(0xd9ff8a).multiplyScalar(1.4), toneMapped: false }));
  const zBody = new THREE.InstancedMesh(zBodyGeo, zMat, ZN);
  const zLegs = new THREE.InstancedMesh(zLegGeo, zMat, ZN * 2);
  const zArms = new THREE.InstancedMesh(zArmGeo, zMat, ZN * 2);
  const zEyes = new THREE.InstancedMesh(zEyeGeo, zEyeMat, ZN);
  for (const im of [zBody, zLegs, zArms, zEyes]) {
    im.frustumCulled = false;
    im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.add(im);
  }
  const zeds: Zed[] = [];
  const layout: [number, number, number][] = [
    // x, z, speed (0 = idle sway)
    [-2.4, -8.5, 0.32],
    [-4.1, -11, 0],
    [-1.0, -12.5, 0.4],
    [1.1, -6.5, 0.28],
    [2.0, -17, 0.36],
    [-3.0, -15.5, 0],
    [0.3, -21, 0.3],
    [2.6, -10.5, 0],
    [-0.4, -4, 0.24],
  ];
  layout.forEach(([x, z, speed], i) => {
    zeds.push({
      x,
      z,
      x0: x,
      z0: z,
      yaw: speed === 0 ? rng.range(-0.9, 0.9) + (i % 3 === 0 ? Math.PI * 0.8 : 0) : rng.range(-0.25, 0.25),
      speed,
      phase: rng.range(0, Math.PI * 2),
      scale: rng.range(0.92, 1.1),
      reach: speed > 0 ? rng.range(0.9, 1.45) : rng.range(0.05, 0.4),
      lean: rng.range(0.05, 0.25),
    });
    const tint = new THREE.Color().setHSL(rng.range(0, 1), rng.range(0, 0.25), rng.range(0.6, 0.95));
    zBody.setColorAt(i, tint);
    zArms.setColorAt(i * 2, tint);
    zArms.setColorAt(i * 2 + 1, tint);
    zLegs.setColorAt(i * 2, tint);
    zLegs.setColorAt(i * 2 + 1, tint);
  });

  // ── fire on the wreck + rain ──
  const flameMat = own(pointsMaterial(sh.puffTex, true));
  const flames = own(new PointPool(36, flameMat));
  scene.add(flames.points);
  const smokeMat = own(pointsMaterial(sh.puffTex, false));
  const smoke = own(new PointPool(18, smokeMat));
  scene.add(smoke.points);
  const fireHalo = sprite(sh, 0xff7a2a, 0.7, 7);
  fireHalo.position.set(3.6, 1.6, -24);
  scene.add(fireHalo);
  const fireHaloMat = fireHalo.material as THREE.SpriteMaterial;
  const seedPool = (pool: PointPool, life: number) => {
    for (let i = 0; i < pool.count; i++) {
      pool.data[i * 6] = rng.range(0, life); // age
      pool.data[i * 6 + 1] = life * rng.range(0.7, 1.3);
      pool.data[i * 6 + 5] = rng.next();
    }
  };
  seedPool(flames, 0.9);
  seedPool(smoke, 4);

  const RAIN = 280;
  const rainPos = new Float32Array(RAIN * 6);
  const rainGeo = own(new THREE.BufferGeometry());
  rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPos, 3).setUsage(THREE.DynamicDrawUsage));
  const rainMat = own(new THREE.LineBasicMaterial({ color: 0x9fb4d8, transparent: true, opacity: 0.32, depthWrite: false }));
  const rain = new THREE.LineSegments(rainGeo, rainMat);
  rain.frustumCulled = false;
  scene.add(rain);
  const rainSeed = new Float32Array(RAIN * 3);
  for (let i = 0; i < RAIN; i++) {
    rainSeed[i * 3] = rng.range(-11, 11);
    rainSeed[i * 3 + 1] = rng.range(0, 12);
    rainSeed[i * 3 + 2] = rng.range(-2, -28);
  }

  const bolt = makeBolt(sh, 0xcfe0ff);
  scene.add(bolt);
  const boltMat = bolt.material as THREE.MeshBasicMaterial;

  const baseHemi = hemi.intensity;
  const fogFlash = new THREE.Color(0x58688e);

  const updateZeds = (dt: number) => {
    for (let i = 0; i < zeds.length; i++) {
      const z = zeds[i];
      const walking = z.speed > 0;
      z.phase += dt * (walking ? z.speed * 5.2 : 1.1);
      if (walking) {
        z.z += Math.cos(z.yaw) * z.speed * dt;
        z.x += Math.sin(z.yaw) * z.speed * dt;
      }
      const ph = z.phase;
      const roll = walking ? Math.sin(ph) * 0.09 : Math.sin(ph * 0.7) * 0.07;
      const bob = walking ? Math.abs(Math.cos(ph)) * 0.04 : 0;
      _e.set(z.lean + (walking ? 0.05 : Math.sin(ph * 0.5) * 0.04), z.yaw + Math.sin(ph * 0.5) * 0.08, roll);
      _q.setFromEuler(_e);
      _m.compose(_p.set(z.x, bob, z.z), _q, _s.setScalar(z.scale));
      zBody.setMatrixAt(i, _m);
      zEyes.setMatrixAt(i, _m);
      for (let side = 0; side < 2; side++) {
        const sgn = side === 0 ? 1 : -1;
        const swing = walking ? Math.sin(ph + side * Math.PI) * 0.32 : 0.02 * sgn;
        _m2.makeRotationX(swing).setPosition(sgn * 0.1, 0.9, 0);
        zLegs.setMatrixAt(i * 2 + side, _m2.premultiply(_m));
        const reach = -z.reach + Math.sin(ph * (walking ? 1 : 0.6) + side * 1.7) * (walking ? 0.12 : 0.08);
        _e.set(reach, 0, sgn * (0.12 + (walking ? 0.05 : 0.02)));
        _q.setFromEuler(_e);
        _m2.compose(_p.set(sgn * 0.27, 1.42, 0.14), _q, _s.setScalar(1));
        zArms.setMatrixAt(i * 2 + side, _m2.premultiply(_m));
      }
    }
    zBody.instanceMatrix.needsUpdate = true;
    zEyes.instanceMatrix.needsUpdate = true;
    zLegs.instanceMatrix.needsUpdate = true;
    zArms.instanceMatrix.needsUpdate = true;
  };

  const updateFire = (t: number, dt: number) => {
    for (let i = 0; i < flames.count; i++) {
      const d = flames.data;
      d[i * 6] += dt;
      if (d[i * 6] > d[i * 6 + 1]) d[i * 6] = 0;
      const k = d[i * 6] / d[i * 6 + 1];
      const seed = d[i * 6 + 5];
      flames.pos[i * 3] = 3.6 + (seed - 0.5) * 1.6 * (1 - k) + Math.sin(t * 3 + seed * 9) * 0.15 * k;
      flames.pos[i * 3 + 1] = 1.0 + k * 2.2;
      flames.pos[i * 3 + 2] = -24 + (((seed * 7) % 1) - 0.5) * 2.4 * (1 - k);
      flames.size[i] = (0.9 + seed * 0.6) * (1 - k * 0.6);
      flames.alpha[i] = Math.sin(k * Math.PI) * 0.85;
      flames.tint[i * 3] = 1;
      flames.tint[i * 3 + 1] = 0.55 - k * 0.35;
      flames.tint[i * 3 + 2] = 0.15 - k * 0.1;
    }
    flames.commit();
    for (let i = 0; i < smoke.count; i++) {
      const d = smoke.data;
      d[i * 6] += dt;
      if (d[i * 6] > d[i * 6 + 1]) d[i * 6] = 0;
      const k = d[i * 6] / d[i * 6 + 1];
      const seed = d[i * 6 + 5];
      smoke.pos[i * 3] = 3.6 + (seed - 0.5) * 0.8 + k * 2.5;
      smoke.pos[i * 3 + 1] = 2.6 + k * 8;
      smoke.pos[i * 3 + 2] = -24 - k * 1.5;
      smoke.size[i] = 1.5 + k * 5;
      smoke.alpha[i] = Math.sin(k * Math.PI) * 0.45;
      smoke.tint[i * 3] = 0.02 + (1 - k) * 0.05;
      smoke.tint[i * 3 + 1] = 0.018 + (1 - k) * 0.02;
      smoke.tint[i * 3 + 2] = 0.02;
    }
    smoke.commit();
    const f = 0.75 + Math.sin(t * 17) * 0.12 + Math.sin(t * 7.3) * 0.13;
    fire.intensity = 50 * f;
    fireHaloMat.opacity = 0.55 * f;
  };

  const updateRain = (dt: number, cam: THREE.Camera) => {
    for (let i = 0; i < RAIN; i++) {
      let y = rainSeed[i * 3 + 1] - dt * 15;
      if (y < 0) y += 12;
      rainSeed[i * 3 + 1] = y;
      const x = cam.position.x + rainSeed[i * 3];
      const z = cam.position.z + rainSeed[i * 3 + 2];
      rainPos[i * 6] = x;
      rainPos[i * 6 + 1] = y;
      rainPos[i * 6 + 2] = z;
      rainPos[i * 6 + 3] = x + 0.05;
      rainPos[i * 6 + 4] = y + 0.55;
      rainPos[i * 6 + 5] = z;
    }
    (rainGeo.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
  };

  return {
    scene,
    pointMats: [flameMat, smokeMat],
    reset() {
      for (const z of zeds) {
        z.x = z.x0;
        z.z = z.z0;
      }
    },
    update(t, dt, len, cam) {
      const p = t / len;
      const ease = p * p * (3 - 2 * p);
      cam.position.set(0.9 - ease * 1.4 + Math.sin(t * 0.37) * 0.12, 1.68 + Math.sin(t * 1.9) * 0.015, 10 - ease * 7);
      _look.set(-0.8 + Math.sin(t * 0.21) * 1.2, 1.9, -40);
      cam.lookAt(_look);
      cam.rotateZ(Math.sin(t * 0.3) * 0.012);
      const k = flicker(t + 0.7);
      lamp.intensity = 70 * k;
      bulbMat.color.setScalar(0.15 + k * 0.85);
      coneMat.opacity = 0.2 * k;
      poolMat.opacity = 0.5 * k;
      haloMat.opacity = 0.75 * k;
      neonMat.color.setScalar(flicker(t * 1.3 + 2.1) > 0.5 ? 1 : 0.18);
      mistTex.offset.x = t * 0.012;
      updateZeds(dt);
      updateFire(t, dt);
      updateRain(dt, cam);
    },
    flash(k) {
      hemi.intensity = baseHemi + k * 4;
      skyMat.color.setScalar(1 + k * 3.5);
      (scene.fog as THREE.FogExp2).color.copy(fogCol).lerp(fogFlash, k);
      (scene.background as THREE.Color).copy(fogCol).lerp(fogFlash, k);
      boltMat.opacity = k > 0.25 ? Math.min(1, k * 1.4) : 0;
      bolt.visible = k > 0.25;
    },
    strike(r) {
      bolt.geometry = sh.bolts[Math.floor(r.next() * sh.bolts.length)];
      bolt.position.set(r.range(-60, 50), 95, -185);
      bolt.scale.set(r.chance(0.5) ? 1 : -1, 1, 1);
    },
  };
}

// ─── JUNGLE ──────────────────────────────────────────────────────────────────

function buildJungle(sh: Shared): Vignette {
  const own = sh.own;
  const rng = new Lcg(65);
  const scene = new THREE.Scene();
  const fogCol = new THREE.Color(0x6a3b37);
  scene.fog = new THREE.FogExp2(fogCol.getHex(), 0.0125);
  scene.background = fogCol.clone();
  const sky = skyDome(sh, 0x1c1238, 0xf07a3a, 0x3a1a14);
  scene.add(sky);
  const skyMat = sky.material as THREE.MeshBasicMaterial;

  const hemi = new THREE.HemisphereLight(0xb07090, 0x1a1408, 1.2);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffa060, 1.6);
  sun.position.set(40, 14, -120);
  scene.add(sun);
  const lavaLight = new THREE.PointLight(0xff5a1a, 0, 120, 1.2);
  lavaLight.position.set(-62, 52, -170);
  scene.add(lavaLight);

  // sun low over the horizon
  const sunDisc = sprite(sh, 0xffe2a0, 1, 30);
  sunDisc.position.set(70, 22, -230);
  const sunHalo = sprite(sh, 0xff8a40, 0.55, 140);
  sunHalo.position.copy(sunDisc.position);
  scene.add(sunHalo, sunDisc);

  // ── volcano ──
  const volc = new Batch();
  volc.add(jitter(new THREE.CylinderGeometry(9, 62, 58, 18, 6, true), 2.6, rng), 0x3a2630, -62, 29, -175, 0, 0, 0, 1, 1, 1, 0x1a1418);
  volc.add(jitter(new THREE.CylinderGeometry(30, 70, 22, 14, 2, true), 3, rng), 0x2c1e26, -20, 9, -190, 0, 0, 0, 1, 1, 1, 0x161216);
  // far ridge line
  for (let i = 0; i < 9; i++) {
    const r = rng.range(18, 40);
    volc.add(jitter(new THREE.IcosahedronGeometry(r, 1), r * 0.15, rng), 0x2a2030, -120 + i * 34, -r * 0.45, -150 - rng.range(0, 40), 0, 0, 0, 1.6, 0.6, 1);
  }
  const volcMesh = new THREE.Mesh(own(volc.build()), own(new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true })));
  scene.add(volcMesh);
  const lava = new Batch();
  lava.add(new THREE.CircleGeometry(9.5, 14), 0xff6a20, -62, 57.6, -175, -Math.PI / 2);
  for (let i = 0; i < 6; i++) {
    // streak down the slope facing the camera (cone: r = 62 − 0.914·y)
    const a = -0.7 + i * 0.26 + rng.range(-0.08, 0.08);
    const len = rng.range(10, 24);
    const yc = 57 - len * 0.5;
    const r0 = 62 - 0.914 * yc + 0.5;
    lava.add(new THREE.BoxGeometry(rng.range(0.7, 1.3), len * 1.36, 0.5), i % 2 ? 0xff5a14 : 0xff3a0c, -62 + Math.sin(a) * r0, yc, -175 + Math.cos(a) * r0, -0.74, a, 0);
  }
  const lavaMat = own(new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false, fog: false }));
  const lavaMesh = new THREE.Mesh(own(lava.build()), lavaMat);
  scene.add(lavaMesh);
  const crater = sprite(sh, 0xff6a20, 0.7, 40);
  crater.position.set(-62, 60, -174);
  scene.add(crater);
  const craterMat = crater.material as THREE.SpriteMaterial;

  // ── ground, track, vegetation, fence ──
  const veg = new Batch();
  {
    const g = new THREE.PlaneGeometry(260, 260, 26, 26);
    const pos = g.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const away = Math.min(1, Math.abs(x) / 18);
      pos.setZ(i, away * (Math.sin(x * 0.11 + y * 0.07) * 1.6 + Math.sin(y * 0.13) * 1.2 + 1.2) - 0.1);
    }
    veg.add(g, 0x1e2414, 0, 0, -80, -Math.PI / 2);
  }
  veg.add(new THREE.PlaneGeometry(4.2, 140), 0x5a4630, 0, 0.02, -50, -Math.PI / 2);
  for (const sx of [-1, 1]) veg.add(new THREE.PlaneGeometry(0.45, 140), 0x3a2c1c, sx * 1.05, 0.03, -50, -Math.PI / 2);
  const palm = (x: number, z: number, h: number, lean: number, dir: number) => {
    const segs = 6;
    let px = x;
    let py = 0;
    for (let i = 0; i < segs; i++) {
      const sh2 = h / segs;
      const a = lean * (i / segs) * 1.3;
      veg.add(new THREE.CylinderGeometry(0.17 - i * 0.012, 0.21 - i * 0.012, sh2 * 1.05, 6), 0x2a2018, px + Math.sin(a) * sh2 * 0.5 * dir, py + sh2 * 0.5, z, 0, 0, -a * dir);
      px += Math.sin(a) * sh2 * dir;
      py += Math.cos(a) * sh2;
    }
    for (let f = 0; f < 8; f++) {
      const ry = (f / 8) * Math.PI * 2 + rng.range(-0.2, 0.2);
      const fl = rng.range(2.4, 3.4);
      const g = new THREE.ConeGeometry(0.5, fl, 3);
      g.translate(0, fl / 2, 0);
      veg.add(g, 0x1d3018, px, py, z, Math.PI / 2 + 0.5, ry, 0, 1, 1, 0.25);
    }
  };
  const bush = (x: number, z: number, s: number, col: number) => {
    veg.add(jitter(new THREE.IcosahedronGeometry(s, 0), s * 0.25, rng), col, x, s * 0.55, z, 0, rng.range(0, 3), 0, 1.2, 0.8, 1.2);
  };
  const tree = (x: number, z: number, h: number) => {
    veg.add(new THREE.CylinderGeometry(0.3, 0.5, h, 6), 0x241a12, x, h / 2, z);
    for (let i = 0; i < 4; i++) {
      const r = rng.range(1.6, 2.6);
      veg.add(jitter(new THREE.IcosahedronGeometry(r, 1), r * 0.18, rng), i === 0 ? 0x1c2a14 : 0x22301a, x + rng.range(-1.8, 1.8), h + rng.range(-0.3, 1.6), z + rng.range(-1.6, 1.6), 0, rng.range(0, 3), 0, 1, 0.7, 1);
    }
  };
  for (let z = 12; z > -110; z -= rng.range(5, 9)) {
    for (const s of [-1, 1]) {
      const x = s * rng.range(5.5, 16);
      // keep the sky clear behind the raptor's rock
      if (s > 0 && z < -4 && z > -34) {
        if (rng.chance(0.5)) bush(s * rng.range(7, 14), z, rng.range(0.8, 1.5), 0x1e3016);
        continue;
      }
      if (rng.chance(0.55) || (z > -12 && Math.abs(x) < 11)) palm(x, z, rng.range(6, 10), rng.range(0.2, 0.6), -s);
      else tree(x, z, rng.range(4, 7));
      if (rng.chance(0.8)) bush(s * rng.range(2.8, 6), z + rng.range(-3, 3), rng.range(0.6, 1.4), rng.chance(0.5) ? 0x1e3016 : 0x283a1c);
      // ferns at the track edge
      if (rng.chance(0.7)) {
        const fx = s * rng.range(2.3, 3.6);
        for (let f = 0; f < 5; f++) {
          const g = new THREE.ConeGeometry(0.22, 1.3, 3);
          g.translate(0, 0.65, 0);
          veg.add(g, 0x2c4220, fx, 0, z + rng.range(-1, 1), rng.range(0.6, 1.1), (f / 5) * Math.PI * 2, 0, 1, 1, 0.4);
        }
      }
    }
  }
  // the raptor's rock + fallen log
  veg.add(jitter(new THREE.IcosahedronGeometry(2.6, 1), 0.5, rng), 0x3a3430, 5.6, 0.6, -16, 0, 0.4, 0, 1.4, 0.95, 1.2);
  veg.add(jitter(new THREE.IcosahedronGeometry(1.6, 1), 0.35, rng), 0x332e2a, 7.6, 0.4, -14.5, 0, 1.2, 0, 1.2, 0.8, 1);
  veg.add(new THREE.CylinderGeometry(0.45, 0.55, 7, 7), 0x2e2218, 2.6, 0.4, -10, 0, 0.9, Math.PI / 2 - 0.08);
  // broken electric fence on the right: posts, sagging wires, warning sign
  for (let i = 0; i < 10; i++) {
    const z = -2 - i * 4.2;
    const fallen = i === 4 || i === 5;
    veg.add(new THREE.BoxGeometry(0.16, 3.4, 0.16), 0x45464a, 9, fallen ? 0.6 : 1.7, z, fallen ? 0.2 : 0, 0, fallen ? -1.25 : 0);
    if (!fallen && i < 9 && i !== 3) {
      for (let wy = 0; wy < 4; wy++) veg.add(new THREE.BoxGeometry(0.03, 0.03, 4.2), 0x6a6a70, 9, 0.8 + wy * 0.7, z - 2.1, 0.03, 0, 0);
    }
  }
  veg.add(new THREE.BoxGeometry(0.06, 0.8, 1.1), 0xd0a020, 8.9, 1.6, -10, 0, 0, 0.12);
  veg.add(new THREE.BoxGeometry(0.07, 0.18, 1.12), 0x111111, 8.88, 1.62, -10, 0, 0, 0.12);
  const vegMesh = new THREE.Mesh(own(veg.build()), own(new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true })));
  scene.add(vegMesh);

  // ── raptor (one mesh group, ~9 draw calls) ──
  const rMat = own(new THREE.MeshLambertMaterial({ color: 0x3a3226, flatShading: true }));
  const rDark = own(new THREE.MeshLambertMaterial({ color: 0x1e1a14, flatShading: true }));
  const rEye = own(new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffd040).multiplyScalar(1.5), toneMapped: false }));
  const raptor = new THREE.Group();
  const mk = (geo: THREE.BufferGeometry, mat: THREE.Material, parent: THREE.Object3D, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0) => {
    const m = new THREE.Mesh(own(geo), mat);
    m.position.set(x, y, z);
    m.rotation.set(rx, ry, rz);
    parent.add(m);
    return m;
  };
  const hips = new THREE.Group();
  hips.position.set(0, 1.05, 0);
  raptor.add(hips);
  const torso = mk(new THREE.SphereGeometry(0.5, 8, 6), rMat, hips, 0, 0.05, 0.25, 0, 0, 0);
  torso.scale.set(0.85, 0.8, 1.65);
  // legs: thigh + shin + foot merged per side (static pose)
  for (const sx of [-1, 1]) {
    const lb = new Batch();
    lb.add(new THREE.BoxGeometry(0.2, 0.55, 0.32), 0x3a3226, 0, -0.2, 0.02, -0.5);
    lb.add(new THREE.BoxGeometry(0.11, 0.55, 0.12), 0x302a20, 0, -0.62, -0.18, 0.55);
    lb.add(new THREE.BoxGeometry(0.1, 0.35, 0.1), 0x302a20, 0, -0.92, -0.1, -0.7);
    lb.add(new THREE.BoxGeometry(0.14, 0.06, 0.34), 0x221e18, 0, -1.03, 0.06);
    lb.add(new THREE.ConeGeometry(0.04, 0.16, 4), 0x0e0c0a, 0, -0.98, 0.17, 0.9);
    const leg = new THREE.Mesh(own(lb.build()), own(new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true })));
    leg.position.set(sx * 0.26, 0, 0.05);
    hips.add(leg);
  }
  const neck = new THREE.Group();
  neck.position.set(0, 0.25, 0.95);
  hips.add(neck);
  mk(new THREE.BoxGeometry(0.22, 0.62, 0.24), rMat, neck, 0, 0.26, 0.08, 0.55);
  const head = new THREE.Group();
  head.position.set(0, 0.56, 0.24);
  neck.add(head);
  mk(new THREE.BoxGeometry(0.26, 0.25, 0.42), rMat, head, 0, 0.04, 0.12);
  mk(new THREE.BoxGeometry(0.2, 0.16, 0.42), rMat, head, 0, 0.03, 0.5, 0.1);
  mk(new THREE.BoxGeometry(0.3, 0.05, 0.12), rDark, head, 0, 0.17, 0.1);
  const eyes = new Batch();
  eyes.add(new THREE.BoxGeometry(0.04, 0.03, 0.05), 0xffffff, 0.135, 0.1, 0.2);
  eyes.add(new THREE.BoxGeometry(0.04, 0.03, 0.05), 0xffffff, -0.135, 0.1, 0.2);
  mk(eyes.build(), rEye, head, 0, 0, 0);
  const jaw = new THREE.Group();
  jaw.position.set(0, -0.06, 0.12);
  head.add(jaw);
  mk(new THREE.BoxGeometry(0.17, 0.07, 0.48), rDark, jaw, 0, -0.02, 0.24);
  // tiny arms
  const armB = new Batch();
  for (const sx of [-1, 1]) {
    armB.add(new THREE.BoxGeometry(0.07, 0.3, 0.08), 0x302a20, sx * 0.3, -0.15, 0.85, -0.6);
    armB.add(new THREE.ConeGeometry(0.03, 0.12, 4), 0x0e0c0a, sx * 0.3, -0.3, 0.98, 2.2);
  }
  hips.add(new THREE.Mesh(own(armB.build()), own(new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }))));
  const tail1 = new THREE.Group();
  tail1.position.set(0, 0.1, -0.5);
  hips.add(tail1);
  mk(new THREE.CylinderGeometry(0.15, 0.27, 1.1, 6), rMat, tail1, 0, 0, -0.5, -Math.PI / 2 - 0.12);
  const tail2 = new THREE.Group();
  tail2.position.set(0, -0.06, -1.05);
  tail1.add(tail2);
  mk(new THREE.ConeGeometry(0.15, 1.7, 6), rMat, tail2, 0, 0, -0.8, -Math.PI / 2 - 0.05);
  raptor.position.set(5.4, 2.55, -16);
  raptor.scale.setScalar(1.25);
  scene.add(raptor);

  // ── pterosaurs circling the volcano (one instanced draw call) ──
  const pb = new Batch();
  pb.add(new THREE.BoxGeometry(0.4, 0.3, 1.6), 0x140e10, 0, 0, 0);
  pb.add(new THREE.ConeGeometry(0.15, 1, 4), 0x140e10, 0, 0.05, 1.1, Math.PI / 2);
  for (const sx of [-1, 1]) {
    const w = new THREE.BufferGeometry();
    w.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0.5, sx * 3.4, 0.9, -0.2, 0, 0, -0.5, sx * 0.2, 0, 0.5, sx * 3.4, 0.9, -0.2, 0, 0, 0.5], 3));
    w.computeVertexNormals();
    pb.add(w, 0x140e10);
  }
  const pteroMat = own(new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide }));
  const PN = 4;
  const pteros = new THREE.InstancedMesh(own(pb.build()), pteroMat, PN);
  pteros.frustumCulled = false;
  pteros.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  scene.add(pteros);

  // ── volcano smoke + fireflies ──
  const smokeMat = own(pointsMaterial(sh.puffTex, false));
  const smoke = own(new PointPool(26, smokeMat));
  scene.add(smoke.points);
  for (let i = 0; i < smoke.count; i++) {
    smoke.data[i * 6] = (i / smoke.count) * 14;
    smoke.data[i * 6 + 1] = 14;
    smoke.data[i * 6 + 5] = rng.next();
  }
  const flyMat = own(pointsMaterial(sh.glowTex, true));
  const flies = own(new PointPool(40, flyMat));
  scene.add(flies.points);
  for (let i = 0; i < flies.count; i++) {
    flies.data[i * 6] = rng.range(-9, 9);
    flies.data[i * 6 + 1] = rng.range(0.3, 2.6);
    flies.data[i * 6 + 2] = rng.range(-30, 6);
    flies.data[i * 6 + 5] = rng.next() * 10;
  }

  const bolt = makeBolt(sh, 0xf0d8ff);
  scene.add(bolt);
  const boltMat = bolt.material as THREE.MeshBasicMaterial;
  const baseHemi = hemi.intensity;
  const fogFlash = new THREE.Color(0xa080a0);

  return {
    scene,
    pointMats: [smokeMat, flyMat],
    reset() {},
    update(t, dt, len, cam) {
      const p = t / len;
      const ease = p * p * (3 - 2 * p);
      // bumpy jeep ride along the track
      cam.position.set(-0.4 + ease * 0.9 + Math.sin(t * 0.5) * 0.15, 2.05 + Math.sin(t * 6.3) * 0.025 + Math.sin(t * 2.1) * 0.03, 8 - ease * 13);
      _look.set(1.5 + Math.sin(t * 0.25) * 2 - ease * 2.5, 3.6 + ease * 0.8, -60);
      cam.lookAt(_look);
      cam.rotateZ(Math.sin(t * 1.3) * 0.008);

      // Raptor: breathe, sway tail, look around, screech at ~45 % of the shot.
      const sc = p > 0.4 && p < 0.62 ? Math.sin(((p - 0.4) / 0.22) * Math.PI) : 0;
      raptor.rotation.y = -1.2 + Math.sin(t * 0.4) * 0.08;
      hips.rotation.x = -0.08 + Math.sin(t * 2.2) * 0.02 - sc * 0.18;
      hips.position.y = 1.05 + Math.sin(t * 2.2) * 0.02;
      neck.rotation.x = -0.05 - sc * 0.3 + Math.sin(t * 1.1) * 0.05;
      neck.rotation.y = 0.55 * Math.sin(t * 0.6) * (1 - sc) + sc * 0.7;
      head.rotation.x = 0.35 - sc * 0.55;
      head.rotation.z = Math.sin(t * 3.3) * 0.08 * (1 - sc);
      jaw.rotation.x = sc * 0.8 + Math.max(0, Math.sin(t * 9)) * 0.08 * sc;
      tail1.rotation.y = Math.sin(t * 1.4) * 0.25;
      tail2.rotation.y = Math.sin(t * 1.4 - 0.8) * 0.35;
      tail1.rotation.x = 0.12 + Math.sin(t * 0.9) * 0.05;

      // Pterosaurs circle the crater.
      for (let i = 0; i < PN; i++) {
        const a = t * (0.12 + i * 0.025) + i * 1.7;
        const r = 26 + i * 9;
        _p.set(-62 + Math.cos(a) * r, 68 + i * 6 + Math.sin(t * 0.7 + i) * 3, -170 + Math.sin(a) * r * 0.6);
        _e.set(0, -a, Math.sin(a) * 0.25);
        _q.setFromEuler(_e);
        const flap = Math.sin(t * (4 + i * 0.6) + i);
        _m.compose(_p, _q, _s.set(2.2, 2.2 * flap, 2.2));
        pteros.setMatrixAt(i, _m);
      }
      pteros.instanceMatrix.needsUpdate = true;

      // Volcano breathes: crater glow + lava light pulses.
      const pulse = 0.65 + Math.sin(t * 1.3) * 0.15 + Math.max(0, Math.sin(t * 0.45)) * 0.35;
      craterMat.opacity = 0.55 * pulse;
      lavaMat.color.setScalar(0.7 + pulse * 0.4);
      lavaLight.intensity = 1800 * pulse;
      for (let i = 0; i < smoke.count; i++) {
        const d = smoke.data;
        d[i * 6] += dt;
        if (d[i * 6] > d[i * 6 + 1]) d[i * 6] -= d[i * 6 + 1];
        const k = d[i * 6] / d[i * 6 + 1];
        const seed = d[i * 6 + 5];
        smoke.pos[i * 3] = -62 + (seed - 0.5) * 6 + k * k * 55;
        smoke.pos[i * 3 + 1] = 60 + k * 48;
        smoke.pos[i * 3 + 2] = -175 + (seed - 0.5) * 6;
        smoke.size[i] = 10 + k * 34;
        smoke.alpha[i] = Math.min(1, k * 6) * (1 - k) * 0.7;
        const hot = Math.max(0, 1 - k * 3);
        smoke.tint[i * 3] = 0.035 + hot * 0.4;
        smoke.tint[i * 3 + 1] = 0.025 + hot * 0.06;
        smoke.tint[i * 3 + 2] = 0.03;
      }
      smoke.commit();
      for (let i = 0; i < flies.count; i++) {
        const d = flies.data;
        const s = d[i * 6 + 5];
        flies.pos[i * 3] = d[i * 6] + Math.sin(t * 0.6 + s) * 0.6;
        flies.pos[i * 3 + 1] = d[i * 6 + 1] + Math.sin(t * 0.9 + s * 2) * 0.3;
        flies.pos[i * 3 + 2] = d[i * 6 + 2] + Math.cos(t * 0.5 + s) * 0.6;
        flies.size[i] = 0.16;
        flies.alpha[i] = Math.max(0, Math.sin(t * 1.7 + s * 3)) * 0.95;
        flies.tint[i * 3] = 0.85;
        flies.tint[i * 3 + 1] = 1;
        flies.tint[i * 3 + 2] = 0.45;
      }
      flies.commit();
    },
    flash(k) {
      hemi.intensity = baseHemi + k * 3;
      skyMat.color.setScalar(1 + k * 1.6);
      (scene.fog as THREE.FogExp2).color.copy(fogCol).lerp(fogFlash, k);
      (scene.background as THREE.Color).copy(fogCol).lerp(fogFlash, k);
      boltMat.opacity = k > 0.25 ? Math.min(1, k * 1.3) : 0;
      bolt.visible = k > 0.25;
    },
    strike(r) {
      bolt.geometry = sh.bolts[Math.floor(r.next() * sh.bolts.length)];
      bolt.position.set(r.chance(0.5) ? r.range(-140, -90) : r.range(-30, 40), 120, -220);
      bolt.scale.set(r.chance(0.5) ? 1.4 : -1.4, 1.4, 1);
    },
  };
}

// ─── the backdrop ────────────────────────────────────────────────────────────

const SHOT = 10;
const FADE = 0.9;

export class MenuBackdrop {
  readonly camera = new THREE.PerspectiveCamera(55, 16 / 9, 0.1, 600);
  /** Called when thunder should be heard (volume 0..1). */
  onThunder: ((volume: number) => void) | null = null;
  private res: Disposable[] = [];
  private shots: Record<BackdropTheme, Vignette>;
  private current: BackdropTheme = 'city';
  private locked: BackdropTheme | null = null;
  private t = 0;
  private fadeMesh: THREE.Mesh;
  private fadeMat: THREE.MeshBasicMaterial;
  private rng = new Lcg(4242);
  private nextStrike = 2.2;
  private strikeT = -1;
  private thunderAt = -1;
  private thunderVol = 0;
  private disposed = false;
  /** Seconds since the backdrop was created (for strike scheduling). */
  private clock = 0;

  constructor() {
    const own = <T extends Disposable>(x: T): T => {
      this.res.push(x);
      return x;
    };
    const glowTex = own(
      canvasTexture(64, 64, (g, w) => {
        const gr = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
        gr.addColorStop(0, 'rgba(255,255,255,1)');
        gr.addColorStop(0.25, 'rgba(255,255,255,0.55)');
        gr.addColorStop(0.6, 'rgba(255,255,255,0.12)');
        gr.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = gr;
        g.fillRect(0, 0, w, w);
      }),
    );
    const prng = new Lcg(77);
    const puffTex = own(
      canvasTexture(64, 64, (g, w) => {
        for (let i = 0; i < 7; i++) {
          const x = w / 2 + prng.range(-10, 10);
          const y = w / 2 + prng.range(-10, 10);
          const r = prng.range(12, 22);
          const gr = g.createRadialGradient(x, y, 0, x, y, r);
          gr.addColorStop(0, 'rgba(255,255,255,0.5)');
          gr.addColorStop(1, 'rgba(255,255,255,0)');
          g.fillStyle = gr;
          g.fillRect(0, 0, w, w);
        }
      }),
    );
    const mistTex = own(
      canvasTexture(256, 64, (g, w, h) => {
        for (let i = 0; i < 40; i++) {
          const x = prng.range(0, w);
          const y = prng.range(h * 0.3, h * 0.75);
          const r = prng.range(14, 34);
          for (const dx of [-w, 0, w]) {
            const gr = g.createRadialGradient(x + dx, y, 0, x + dx, y, r);
            gr.addColorStop(0, 'rgba(255,255,255,0.32)');
            gr.addColorStop(1, 'rgba(255,255,255,0)');
            g.fillStyle = gr;
            g.fillRect(0, 0, w, h);
          }
        }
      }),
    );
    mistTex.wrapS = THREE.RepeatWrapping;
    const brng = new Lcg(9);
    const bolts = [0, 1, 2].map(() => own(boltGeometry(brng)));
    const shared: Shared = { own, glowTex, puffTex, mistTex, bolts };
    this.shots = { city: buildCity(shared), jungle: buildJungle(shared) };

    this.fadeMat = own(
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 1, depthTest: false, depthWrite: false, fog: false }),
    );
    this.fadeMesh = new THREE.Mesh(own(new THREE.PlaneGeometry(2, 2)), this.fadeMat);
    this.fadeMesh.position.z = -0.5;
    this.fadeMesh.scale.setScalar(4);
    this.fadeMesh.renderOrder = 1000;
    this.fadeMesh.frustumCulled = false;
    this.camera.add(this.fadeMesh);
    this.shots.city.reset();
  }

  get theme(): BackdropTheme {
    return this.current;
  }

  /** Lock the backdrop to one theme (null = alternate). */
  setTheme(theme: BackdropTheme | null) {
    if (theme === this.locked) return;
    this.locked = theme;
    if (theme && theme !== this.current && this.t < SHOT - FADE) this.t = SHOT - FADE; // fade out now
  }

  update(dt: number, width: number, height: number) {
    if (this.disposed) return;
    this.clock += dt;
    this.t += dt;
    if (this.t >= SHOT) {
      this.t = 0;
      this.current = this.locked ?? (this.current === 'city' ? 'jungle' : 'city');
      this.shots[this.current].reset();
      this.strikeT = -1;
    }
    const v = this.shots[this.current];
    const cam = this.camera;
    if (cam.parent !== v.scene) v.scene.add(cam);
    const aspect = width / Math.max(1, height);
    // Keep ≥ 66° of horizontal view in portrait.
    const fov = aspect < 1.25 ? (2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(66) / 2) / aspect) * 180) / Math.PI : 55;
    if (cam.aspect !== aspect || cam.fov !== fov) {
      cam.aspect = aspect;
      cam.fov = fov;
      cam.updateProjectionMatrix();
    }
    const scale = height / (2 * Math.tan(THREE.MathUtils.degToRad(fov) / 2));
    for (const m of v.pointMats) m.uniforms.scale.value = scale;
    v.update(this.t, dt, SHOT, cam);

    // Fade through black between shots.
    const fin = Math.min(1, this.t / FADE);
    const fout = Math.min(1, (SHOT - this.t) / FADE);
    this.fadeMat.opacity = 1 - Math.min(fin, fout) ** 1.5;

    // Lightning.
    this.nextStrike -= dt;
    if (this.nextStrike <= 0 && this.t > 1.2 && this.t < SHOT - 1.8) {
      this.nextStrike = this.rng.range(5.5, 10);
      this.strikeT = 0;
      v.strike(this.rng);
      this.thunderAt = this.clock + this.rng.range(0.5, 1.4);
      this.thunderVol = this.rng.range(0.25, 0.45);
    }
    let k = 0;
    if (this.strikeT >= 0) {
      this.strikeT += dt;
      const s = this.strikeT;
      // double-flash envelope
      k = s < 0.06 ? 1 : s < 0.12 ? 0.25 : s < 0.2 ? 0.95 : Math.max(0, 0.95 - (s - 0.2) * 2.2);
      if (s > 0.7) this.strikeT = -1;
    }
    v.flash(k);
    if (this.thunderAt > 0 && this.clock >= this.thunderAt) {
      this.thunderAt = -1;
      this.onThunder?.(this.thunderVol);
    }
  }

  render(renderer: THREE.WebGLRenderer) {
    if (this.disposed) return;
    renderer.render(this.shots[this.current].scene, this.camera);
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    for (const r of this.res) r.dispose();
    this.res = [];
    for (const v of Object.values(this.shots)) v.scene.clear();
  }
}
