import * as THREE from 'three';
import { Kit } from '../../kit/ModelKit';
import { glow } from './bake';
import { pixelText, textWidth } from './font';
import { S } from './surf';

/**
 * Small scenery vocabulary shared by every room: boxes from bounds, walls
 * with door/window holes, light panels, emergency beacons, vents, signs,
 * pipes, railings, plants. All materials come from `bake.ts` so rooms bake
 * down to a few draw calls.
 */

export interface Hole {
  /** Centre along the wall. */
  c: number;
  w: number;
  /** Top of the opening. */
  h: number;
  /** Bottom of the opening (windows). Default 0. */
  y?: number;
}

/** Axis-aligned box from bounds. */
export function slab(g: THREE.Object3D, m: THREE.Material, x0: number, x1: number, y0: number, y1: number, z0: number, z1: number): THREE.Mesh {
  const w = Math.abs(x1 - x0);
  const h = Math.abs(y1 - y0);
  const d = Math.abs(z1 - z0);
  return Kit.add(g, Kit.box(w, h, d), m, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
}

/** Upward-facing floor quad over [x0, x1] × [z0, z1] at height y (2 triangles; floors only show their top). */
export function floorQuad(g: THREE.Object3D, m: THREE.Material, x0: number, x1: number, z0: number, z1: number, y: number): THREE.Mesh {
  return Kit.add(g, Kit.plane(Math.abs(x1 - x0), Math.abs(z1 - z0)), m, (x0 + x1) / 2, y, (z0 + z1) / 2, -Math.PI / 2);
}

/** Flat upward-facing quad centred at (x, y, z), w × d, yawed by ry (papers, smears, puddles). */
export function decal(g: THREE.Object3D, m: THREE.Material, x: number, y: number, z: number, w: number, d: number, ry = 0): THREE.Mesh {
  return Kit.add(g, Kit.plane(w, d), m, x, y, z, -Math.PI / 2, 0, ry);
}

/** Centred box with optional yaw / pitch / roll. */
export function box(g: THREE.Object3D, m: THREE.Material, x: number, y: number, z: number, w: number, h: number, d: number, ry = 0, rx = 0, rz = 0): THREE.Mesh {
  return Kit.add(g, Kit.box(w, h, d), m, x, y, z, rx, ry, rz);
}

export function cyl(g: THREE.Object3D, m: THREE.Material, x: number, y: number, z: number, r: number, h: number, seg = 10, rx = 0, rz = 0): THREE.Mesh {
  return Kit.add(g, Kit.cyl(r, r, h, seg), m, x, y, z, rx, 0, rz);
}

/** Wall across X at z (a "transverse" wall), from x0 to x1, with openings. */
export function wallZ(g: THREE.Object3D, m: THREE.Material, z: number, x0: number, x1: number, h: number, holes: Hole[] = [], t = 0.4) {
  const hs = [...holes].sort((a, b) => a.c - b.c);
  let x = x0;
  for (const o of hs) {
    const a = o.c - o.w / 2;
    const b = o.c + o.w / 2;
    if (a > x) slab(g, m, x, a, 0, h, z - t / 2, z + t / 2);
    if (o.h < h) slab(g, m, a, b, o.h, h, z - t / 2, z + t / 2);
    if ((o.y ?? 0) > 0) slab(g, m, a, b, 0, o.y!, z - t / 2, z + t / 2);
    x = b;
  }
  if (x < x1) slab(g, m, x, x1, 0, h, z - t / 2, z + t / 2);
}

/** Wall along Z at x (a side wall), from z0 down to z1, with openings (c = z). */
export function wallX(g: THREE.Object3D, m: THREE.Material, x: number, z0: number, z1: number, h: number, holes: Hole[] = [], t = 0.4) {
  const hs = [...holes].sort((a, b) => b.c - a.c);
  let z = z0;
  for (const o of hs) {
    const a = o.c + o.w / 2;
    const b = o.c - o.w / 2;
    if (a < z) slab(g, m, x - t / 2, x + t / 2, 0, h, a, z);
    if (o.h < h) slab(g, m, x - t / 2, x + t / 2, o.h, h, b, a);
    if ((o.y ?? 0) > 0) slab(g, m, x - t / 2, x + t / 2, 0, o.y!, b, a);
    z = b;
  }
  if (z > z1) slab(g, m, x - t / 2, x + t / 2, 0, h, z1, z);
}

/** Door frame (jambs + header) around an opening in a transverse wall. */
export function frameZ(g: THREE.Object3D, m: THREE.Material, z: number, cx: number, w: number, h: number, t = 0.55) {
  slab(g, m, cx - w / 2 - 0.22, cx - w / 2, 0, h, z - t / 2, z + t / 2);
  slab(g, m, cx + w / 2, cx + w / 2 + 0.22, 0, h, z - t / 2, z + t / 2);
  slab(g, m, cx - w / 2 - 0.22, cx + w / 2 + 0.22, h, h + 0.22, z - t / 2, z + t / 2);
}

/** Door frame in a side wall at x around z = cz. */
export function frameX(g: THREE.Object3D, m: THREE.Material, x: number, cz: number, w: number, h: number, t = 0.55) {
  slab(g, m, x - t / 2, x + t / 2, 0, h, cz + w / 2, cz + w / 2 + 0.22);
  slab(g, m, x - t / 2, x + t / 2, 0, h, cz - w / 2 - 0.22, cz - w / 2);
  slab(g, m, x - t / 2, x + t / 2, h, h + 0.22, cz - w / 2 - 0.22, cz + w / 2 + 0.22);
}

/** Recessed fluorescent ceiling panel (glow) with a metal rim. */
export function lightPanel(g: THREE.Object3D, x: number, y: number, z: number, w = 1.2, d = 0.6, m: THREE.Material = glow(0xe8f0ff, 1.15), ry = 0) {
  box(g, S.metal(0x5a6068), x, y + 0.02, z, w + 0.16, 0.08, d + 0.16, ry);
  box(g, m, x, y - 0.03, z, w, 0.04, d, ry);
}

/** Wall-mounted emergency beacon (red dome uses the shared, animated strobe material). */
export function beacon(g: THREE.Object3D, strobe: THREE.Material, x: number, y: number, z: number, ry = 0) {
  const p = new THREE.Group();
  p.position.set(x, y, z);
  p.rotation.y = ry;
  g.add(p);
  box(p, S.metal(0x3a3a40), 0, 0, 0.06, 0.26, 0.16, 0.12);
  Kit.add(p, Kit.sphere(0.13, 8, 5), strobe, 0, 0.08, 0.12, 0, 0, 0, 1, 0.9, 1);
}

/** Ceiling air vent (dark slatted grate). */
export function vent(g: THREE.Object3D, x: number, y: number, z: number, w = 0.9, d = 0.9) {
  box(g, S.metal(0x8a8e94), x, y, z, w + 0.12, 0.06, d + 0.12);
  box(g, S.plain(0x0c0d10), x, y - 0.02, z, w, 0.04, d);
  for (let i = 0; i < 5; i++) box(g, S.metal(0x6a6e74), x, y - 0.05, z - d / 2 + (i + 0.5) * (d / 5), w, 0.04, 0.05);
}

/** Pixel-text sign on a backing board. Text faces +Z rotated by ry. */
export function sign(
  g: THREE.Object3D,
  text: string,
  x: number,
  y: number,
  z: number,
  ry: number,
  px: number,
  board: number,
  ink: THREE.Material,
  pad = 2,
) {
  const w = textWidth(text, px) + px * pad * 2;
  const h = px * (7 + pad * 2);
  const p = new THREE.Group();
  p.position.set(x, y, z);
  p.rotation.y = ry;
  g.add(p);
  box(p, S.plain(board), 0, 0, 0, w, h, 0.06);
  pixelText(p, text, ink, 0, 0, 0.04, px, 0, px * 0.5);
  return p;
}

/** Straight pipe between two points. */
export function pipe(g: THREE.Object3D, m: THREE.Material, a: THREE.Vector3, b: THREE.Vector3, r: number, seg = 8): THREE.Mesh {
  const len = a.distanceTo(b);
  const mesh = new THREE.Mesh(Kit.cyl(r, r, len, seg), m);
  mesh.position.copy(a).add(b).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3().subVectors(b, a).normalize());
  g.add(mesh);
  return mesh;
}

/** Metal railing from (x0, z0) to (x1, z1) at base height y. */
export function railing(g: THREE.Object3D, x0: number, z0: number, x1: number, z1: number, y: number, m: THREE.Material = S.metal(0x7a7e86)) {
  const a = new THREE.Vector3(x0, y + 1.0, z0);
  const b = new THREE.Vector3(x1, y + 1.0, z1);
  pipe(g, m, a, b, 0.04, 6);
  pipe(g, m, a.clone().setY(y + 0.5), b.clone().setY(y + 0.5), 0.025, 5);
  const len = a.distanceTo(b);
  const n = Math.max(1, Math.round(len / 1.6));
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    box(g, m, x0 + (x1 - x0) * t, y + 0.5, z0 + (z1 - z0) * t, 0.06, 1.0, 0.06);
  }
}

/** Hazard-striped floor band along X between x0 and x1 at z. */
export function hazardBand(g: THREE.Object3D, x0: number, x1: number, z: number, d = 0.4) {
  floorQuad(g, S.hazard(), x0, x1, z - d / 2, z + d / 2, 0.012);
}

/** Potted / planted palm: segmented trunk + drooping fronds. */
export function palm(g: THREE.Object3D, x: number, z: number, h: number, rng: () => number, pot = true) {
  const p = new THREE.Group();
  p.position.set(x, 0, z);
  p.rotation.y = rng() * Math.PI * 2;
  g.add(p);
  if (pot) {
    Kit.add(p, Kit.cyl(0.42, 0.32, 0.6, 8), S.stucco(0x8a5034), 0, 0.3, 0);
    Kit.add(p, Kit.cyl(0.38, 0.38, 0.06, 8), S.stucco(0x3a2a1c), 0, 0.6, 0);
  }
  const trunk = S.bark(0x6a5238);
  const segs = Math.max(3, Math.round(h / 0.7));
  let lean = (rng() - 0.5) * 0.25;
  let px = 0;
  for (let i = 0; i < segs; i++) {
    const y = (pot ? 0.6 : 0) + (i + 0.5) * (h / segs);
    px += lean * 0.12;
    Kit.add(p, Kit.cyl(0.11 - i * 0.008, 0.13 - i * 0.008, h / segs + 0.02, 6), trunk, px, y, 0, 0, 0, lean * 0.5);
  }
  lean += 0;
  const top = (pot ? 0.6 : 0) + h;
  const leaf = S.leaves(0x347a2e);
  const leafDark = S.leaves(0x255424);
  const n = 7;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rng() * 0.4;
    const f = new THREE.Group();
    f.position.set(px, top, 0);
    f.rotation.set(0, a, 0);
    p.add(f);
    const len = 1.5 + rng() * 0.8;
    // Two drooping planks per frond.
    Kit.add(f, Kit.box(0.42, 0.02, len * 0.55), i % 2 ? leaf : leafDark, 0, -0.05, len * 0.27, -0.35, 0, 0);
    Kit.add(f, Kit.box(0.34, 0.02, len * 0.5), i % 2 ? leafDark : leaf, 0, -0.38, len * 0.72, -0.9, 0, 0);
  }
  return p;
}

/** Leafy bush (jittered icosahedrons). */
export function bush(g: THREE.Object3D, x: number, z: number, s: number, seed: number, color = 0x2f6a2c) {
  const geo = Kit.jitter(Kit.ico(1, 1), 0.25, seed);
  const m = S.leaves(color);
  Kit.add(g, geo, m, x, s * 0.55, z, 0, seed, 0, s, s * 0.75, s);
  Kit.add(g, geo, S.leaves(color - 0x0a1a08), x + s * 0.6, s * 0.4, z + s * 0.3, 0, seed * 2, 0, s * 0.7, s * 0.6, s * 0.7);
}

/** Fern: fan of thin leaves. */
export function fern(g: THREE.Object3D, x: number, z: number, s: number, rng: () => number, color = 0x3a7a30) {
  const m = S.leaves(color);
  const n = 7;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rng() * 0.5;
    const len = s * (0.8 + rng() * 0.4);
    Kit.add(g, Kit.box(0.18 * s, 0.02, len), m, x + Math.sin(a) * len * 0.4, 0.25 * s, z + Math.cos(a) * len * 0.4, -0.55, a, 0);
  }
}

/** Generic crate. */
export function crate(g: THREE.Object3D, x: number, z: number, s: number, ry = 0, y = 0) {
  box(g, S.planks(0x7a5a36), x, y + s / 2, z, s, s, s, ry);
}
