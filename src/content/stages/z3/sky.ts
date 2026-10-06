import * as THREE from 'three';
import { Kit } from '../../kit/ModelKit';
import { EnvKit } from '../../kit/EnvKit';
import { Rng } from '../../../core/Rng';
import { M, bake } from './bake';
import { Plumes } from './vfx';

/**
 * Dusk backdrop that follows the camera (so it sits "at infinity" however far
 * the truck drives): orange→purple gradient dome, a low sun with halo, an
 * additive horizon glow (sunset ahead, fire-glow behind), the burning city
 * skyline the player is escaping, hill silhouettes and giant smoke plumes.
 */

export const SKY = {
  top: 0x1f1546,
  horizon: 0xc46a5a,
  bottom: 0x2a1824,
  fog: 0xa65a54,
};

/** Unit direction (world) toward the setting sun: ahead and a little right. */
export const SUN_DIR = new THREE.Vector3(0.38, 0.07, -1).normalize();
/** Unit direction toward the burning city: behind, a little left. */
export const CITY_DIR = new THREE.Vector3(-0.2, 0, 1).normalize();

const R = 300;

function azOf(v: THREE.Vector3) {
  return Math.atan2(v.x, v.z);
}

/** Additive glow ring around the horizon (vertex-coloured, black = no glow). */
function glowRing(): THREE.Mesh {
  const seg = 72;
  const rows = [-12, 0, 10, 26, 50, 90];
  const pos: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  const sunAz = azOf(SUN_DIR);
  const cityAz = azOf(CITY_DIR);
  const cSun = new THREE.Color(0xff9a4a);
  const cCity = new THREE.Color(0xff3a12);
  const c = new THREE.Color();
  for (let i = 0; i <= seg; i++) {
    const a = (i / seg) * Math.PI * 2;
    const dSun = Math.abs(Math.atan2(Math.sin(a - sunAz), Math.cos(a - sunAz)));
    const dCity = Math.abs(Math.atan2(Math.sin(a - cityAz), Math.cos(a - cityAz)));
    const kSun = Math.pow(Math.max(0, Math.cos(dSun * 0.62)), 3);
    const kCity = Math.pow(Math.max(0, Math.cos(dCity * 0.75)), 4);
    for (let r = 0; r < rows.length; r++) {
      const y = rows[r];
      const hSun = y < 0 ? 0.5 : Math.exp(-y / 22);
      const hCity = y < 0 ? 0.6 : Math.exp(-y / 14);
      c.setRGB(0, 0, 0);
      c.r += cSun.r * kSun * hSun * 0.95 + cCity.r * kCity * hCity * 0.8;
      c.g += cSun.g * kSun * hSun * 0.95 + cCity.g * kCity * hCity * 0.8;
      c.b += cSun.b * kSun * hSun * 0.95 + cCity.b * kCity * hCity * 0.8;
      pos.push(Math.sin(a) * R * 0.97, y, Math.cos(a) * R * 0.97);
      col.push(c.r, c.g, c.b);
    }
  }
  const n = rows.length;
  for (let i = 0; i < seg; i++) {
    for (let r = 0; r < n - 1; r++) {
      const a = i * n + r;
      const b = (i + 1) * n + r;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const g = Kit.track(new THREE.BufferGeometry());
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  const m = new THREE.Mesh(
    g,
    Kit.track(
      new THREE.MeshBasicMaterial({
        vertexColors: true,
        blending: THREE.AdditiveBlending,
        transparent: true,
        depthWrite: false,
        fog: false,
        side: THREE.DoubleSide,
        toneMapped: false,
      }),
    ),
  );
  m.frustumCulled = false;
  m.renderOrder = -1;
  return m;
}

/** Jagged hill silhouette band at radius `r` between azimuths a0..a1. */
function hills(rng: Rng, r: number, a0: number, a1: number, hMin: number, hMax: number, color: number): THREE.Mesh {
  const pos: number[] = [];
  const steps = Math.max(8, Math.round(((a1 - a0) / (Math.PI * 2)) * 90));
  let h = rng.range(hMin, hMax);
  const pts: [number, number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const a = a0 + ((a1 - a0) * i) / steps;
    h += rng.spread((hMax - hMin) * 0.35);
    h = Math.min(hMax, Math.max(hMin, h));
    pts.push([Math.sin(a) * r, h, Math.cos(a) * r]);
  }
  for (let i = 0; i < pts.length - 1; i++) {
    const p = pts[i];
    const q = pts[i + 1];
    // Quad from y = -30 up to the ridge (two triangles, facing the centre).
    pos.push(p[0], -30, p[2], q[0], -30, q[2], p[0], p[1], p[2]);
    pos.push(q[0], -30, q[2], q[0], q[1], q[2], p[0], p[1], p[2]);
  }
  const g = Kit.track(new THREE.BufferGeometry());
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return new THREE.Mesh(g, M.glow(color, 1, ...SIL_TEX));
}

/**
 * Silhouette texture: big soft noise blobs (≈1.5 m texels at ~280 m, about one
 * arcade pixel) at low strength — breaks up the flat cut-outs without shimmering.
 */
const SIL_TEX = ['stucco', 0.026, 0.5] as const;

/** Burning city skyline (silhouettes + lit windows + rooftop fires). */
function skyline(rng: Rng): THREE.Group {
  const g = new THREE.Group();
  const cityAz = azOf(CITY_DIR);
  const sil = [M.glow(0x1a1120, 1, ...SIL_TEX), M.glow(0x211526, 1, ...SIL_TEX), M.glow(0x2a1a30, 1, ...SIL_TEX)];
  const win = [M.glow(0xffc070, 1), M.glow(0xffa050, 1), M.glow(0xe8e0c0, 0.8)];
  const fire = [M.glow(0xff7a20, 1.4), M.glow(0xffb040, 1.5), M.glow(0xff4a10, 1.3)];
  for (let i = 0; i < 64; i++) {
    const off = rng.spread(1.0) * rng.range(0.4, 1);
    const az = cityAz + off;
    const centre = 1 - Math.abs(off);
    const dist = rng.range(262, 288);
    const w = rng.range(8, 22);
    const h = rng.range(14, 30) + centre * rng.range(10, 70);
    const b = new THREE.Group();
    b.position.set(Math.sin(az) * dist, -4, Math.cos(az) * dist);
    b.rotation.y = az;
    g.add(b);
    Kit.add(b, Kit.box(w, h, 10), rng.pick(sil), 0, h / 2, 0);
    if (rng.chance(0.35)) Kit.add(b, Kit.box(w * 0.6, h * 0.25, 8), rng.pick(sil), rng.spread(w * 0.15), h + h * 0.12, 0);
    if (rng.chance(0.25)) Kit.add(b, Kit.box(0.6, rng.range(8, 16), 0.6), sil[0], rng.spread(w * 0.3), h + 6, 0);
    // Windows facing the camera (the group faces +Z → we look at its -Z face).
    const cols = Math.floor(w / 2.6);
    const rows = Math.floor(h / 3.2);
    for (let r = 1; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (!rng.chance(0.12)) continue;
        // Windows/fires are single quads facing the camera (−Z side of the block).
        Kit.add(b, Kit.plane(1.1, 1.2), rng.pick(win), -w / 2 + 1.3 + c * 2.6, r * 3.2, -5.05, 0, Math.PI, 0);
      }
    }
    if (rng.chance(0.4)) {
      const fh = rng.range(2, 6);
      const fy = h * rng.range(0.5, 1);
      Kit.add(b, Kit.plane(w * rng.range(0.3, 0.8), fh), rng.pick(fire), rng.spread(w * 0.2), fy, -5.1, 0, Math.PI, 0);
    }
  }
  // Glowing fire line along the base of the city.
  for (let i = 0; i < 18; i++) {
    const az = cityAz + rng.spread(0.95);
    const dist = rng.range(250, 262);
    const fb = new THREE.Group();
    fb.position.set(Math.sin(az) * dist, -2, Math.cos(az) * dist);
    fb.rotation.y = az;
    g.add(fb);
    Kit.add(fb, Kit.plane(rng.range(12, 30), rng.range(3, 8)), rng.pick(fire), 0, 0, 0, 0, Math.PI, 0);
  }
  return g;
}

/** Smoke column bases: over the city, plus a few nearer wrecks burning far off either side. */
function plumeBases(rng: Rng): { pos: THREE.Vector3; size: number }[] {
  const cityAz = azOf(CITY_DIR);
  const bases: { pos: THREE.Vector3; size: number }[] = [];
  for (let i = 0; i < 6; i++) {
    const az = cityAz + rng.spread(0.9);
    const d = rng.range(240, 270);
    bases.push({ pos: new THREE.Vector3(Math.sin(az) * d, 20, Math.cos(az) * d), size: rng.range(0.6, 1.1) });
  }
  for (const az of [cityAz + 1.9, cityAz - 2.2, cityAz + 2.8]) {
    bases.push({ pos: new THREE.Vector3(Math.sin(az) * 230, 0, Math.cos(az) * 230), size: 0.45 });
  }
  return bases;
}

export class DuskSky {
  readonly group = new THREE.Group();
  private plumes: Plumes;
  private sun: THREE.Group;

  /** `painted`: ART: PIXEL WORLD paints the sky, sun, hills and city (z3/pixel.ts) — only the smoke columns are built here. */
  constructor(painted = false) {
    const rng = new Rng(3301);
    const g = this.group;
    g.name = 'z3-sky';
    this.sun = new THREE.Group();
    if (painted) {
      this.plumes = new Plumes(plumeBases(rng));
      g.add(this.plumes.mesh);
      return;
    }
    const dome = EnvKit.sky(SKY.top, SKY.horizon, SKY.bottom, 330);
    // Painted-sky streaks: huge soft blobs at low strength (the dome follows the
    // camera, so they never swim). The dome's material is its own tracked instance.
    const domeMat = dome.material as THREE.MeshBasicMaterial;
    if (!domeMat.userData.shared) Kit.applyTexture(domeMat, 'stucco', 0.014, 0.3);
    g.add(dome);
    g.add(glowRing());

    // Sun: hot disc + soft halos.
    this.sun.position.copy(SUN_DIR).multiplyScalar(R * 0.95);
    this.sun.lookAt(0, 0, 0);
    const disc = Kit.add(this.sun, Kit.track(new THREE.CircleGeometry(9, 24)), Kit.glow(0xffe0a0, 1.25), 0, 0, 0);
    disc.renderOrder = -1;
    for (const [r, o] of [
      [20, 0.35],
      [42, 0.16],
    ] as const) {
      const h = Kit.add(
        this.sun,
        Kit.track(new THREE.CircleGeometry(r, 24)),
        Kit.glow(0xff9a50, 1, true, o),
        0,
        0,
        -0.5,
      );
      h.renderOrder = -1;
    }
    g.add(this.sun);

    // Silhouettes: hills all around (closer = darker), city behind.
    const land = new THREE.Group();
    const cityAz = azOf(CITY_DIR);
    land.add(hills(rng, R * 0.99, cityAz + 1.1, cityAz + Math.PI * 2 - 1.1, 6, 26, 0x4a2a40));
    land.add(hills(rng, R * 0.985, cityAz + 1.6, cityAz + Math.PI * 2 - 1.6, 2, 12, 0x3a2234));
    land.add(hills(rng, R * 0.995, cityAz - 1.3, cityAz + 1.3, 4, 14, 0x3a2236));
    land.add(skyline(rng));
    bake(land);
    for (const m of land.children) {
      (m as THREE.Mesh).frustumCulled = false;
      m.renderOrder = -1;
    }
    g.add(land);

    // Smoke columns over the city.
    this.plumes = new Plumes(plumeBases(rng));
    g.add(this.plumes.mesh);
  }

  update(t: number, cam: THREE.Vector3) {
    this.group.position.copy(cam);
    this.plumes.update(t);
  }
}
