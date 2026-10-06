import * as THREE from 'three';
import { Kit } from '../kit/ModelKit';
import type { PwAtlas, PwTile } from './atlas';
import { pwBackdropMaterial } from './material';

/**
 * PixelWorld backdrops: painted pixel-art panoramas instead of geometric skies
 * (gradient domes, sphere moons, cone mountains, box skylines).
 *
 *  - SKY: a sphere band from `el0` up to `el1` (degrees) textured with a wrap
 *    tile (u = azimuth, v = elevation), capped above `el1` by the tile's top row.
 *  - LAYERS: cylinders (skyline, mountains, volcano, horizon) with cut-out
 *    tiles, far to near; `follow` < 1 lets a layer drift a little against the
 *    camera's travel (parallax between layers), 1 = infinitely far.
 * All unlit, no fog (painted pre-hazed toward the stage's fog colour, with the
 * lowest rows fading into it), no depth writes, drawn before the scene
 * (renderOrder −3 …), never raycast. Texel density ≈ 5.7 texels a degree
 * (PW_BACKDROP_TPD: 2048 around) ≈ one texel per retro pixel.
 */

export interface PwSkySpec {
  tile: PwTile;
  /** Elevation (degrees) of the tile's bottom row and top row. */
  el0: number;
  el1: number;
  radius?: number;
  /** Azimuth (degrees, from −Z toward +X) of u = 0. */
  yaw?: number;
}

export interface PwLayerSpec {
  tile: PwTile;
  radius: number;
  el0: number;
  el1: number;
  /** Times the tile repeats around (default 1). */
  repeat?: number;
  yaw?: number;
  /** 1 = rides with the camera; < 1 = drifts (parallax). Default 1. */
  follow?: number;
  /**
   * Azimuth span (deg) of a PANEL layer (a clamp tile covering only part of the
   * horizon: a volcano, a landmark), centred on `yaw`. Default 360 (a wrap band).
   */
  span?: number;
}

const SEG = 96;

function bandGeometry(tile: PwTile, radius: number, el0: number, el1: number, repeat: number, yaw: number, sphere: boolean, rings: number, span = 360): THREE.BufferGeometry {
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  const d2r = Math.PI / 180;
  for (let j = 0; j <= rings; j++) {
    const el = el0 + ((el1 - el0) * j) / rings;
    const y = sphere ? radius * Math.sin(el * d2r) : radius * Math.tan(el * d2r);
    const rr = sphere ? radius * Math.cos(el * d2r) : radius;
    const v = (tile.h * j) / rings;
    for (let i = 0; i <= SEG; i++) {
      const a = (span < 360 ? yaw - span / 2 + (span * i) / SEG : yaw + (360 * i) / SEG) * d2r;
      // Azimuth from −Z toward +X: seen from inside, u runs to the right.
      pos.push(Math.sin(a) * rr, y, -Math.cos(a) * rr);
      uv.push(span < 360 ? (tile.w * i) / SEG : (tile.w * repeat * i) / SEG, v);
    }
  }
  for (let j = 0; j < rings; j++) {
    for (let i = 0; i < SEG; i++) {
      const a = j * (SEG + 1) + i;
      const b = a + 1;
      const c = a + SEG + 1;
      const d = c + 1;
      // Counter-clockwise seen from inside (bottom-left, bottom-right, top-right, top-left).
      idx.push(a, b, d, a, d, c);
    }
  }
  return finish(pos, uv, idx, tile);
}

function finish(pos: number[], uv: number[], idx: number[], tile: PwTile): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  const n = pos.length / 3;
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('pwUv', new THREE.Float32BufferAttribute(uv, 2));
  const rect = new Int16Array(n * 4);
  const col = new Uint8Array(n * 3).fill(255);
  for (let i = 0; i < n; i++) rect.set([tile.x, tile.y, tile.wrap ? tile.w : -tile.w, tile.h], i * 4);
  g.setAttribute('pwRect', new THREE.BufferAttribute(rect, 4));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3, true));
  g.setIndex(idx);
  return Kit.track(g);
}

/** A cap over the sky band: every vertex pinned to the tile's top row (wrapping in u). */
function capGeometry(tile: PwTile, radius: number, el: number, yaw: number): THREE.BufferGeometry {
  const pos: number[] = [0, radius, 0];
  const uv: number[] = [tile.w / 2, tile.h - 0.5];
  const idx: number[] = [];
  const d2r = Math.PI / 180;
  const y = radius * Math.sin(el * d2r);
  const rr = radius * Math.cos(el * d2r);
  for (let i = 0; i <= SEG; i++) {
    const a = (yaw + (360 * i) / SEG) * d2r;
    pos.push(Math.sin(a) * rr, y, -Math.cos(a) * rr);
    uv.push((tile.w * i) / SEG, tile.h - 0.5);
  }
  for (let i = 0; i < SEG; i++) idx.push(0, i + 1, i + 2);
  return finish(pos, uv, idx, tile);
}

export class PwBackdrop {
  readonly group = new THREE.Group();
  private layers: { mesh: THREE.Object3D; follow: number }[] = [];
  /** Where layers that drift (follow < 1) are anchored (the stage's middle). */
  readonly anchor = new THREE.Vector3();

  constructor(
    readonly atlas: PwAtlas,
    private sky: PwSkySpec | null,
    private specs: PwLayerSpec[],
  ) {
    this.group.name = 'pw-backdrop';
  }

  /** Build the meshes (the atlas must have every tile registered; it is built here). */
  build(): THREE.Group {
    this.atlas.build();
    const mat = pwBackdropMaterial(this.atlas);
    let order = -6;
    if (this.sky) {
      const s = this.sky;
      const r = s.radius ?? 330;
      const g = new THREE.Group();
      const band = new THREE.Mesh(bandGeometry(s.tile, r, s.el0, s.el1, 1, s.yaw ?? 0, true, 24), mat);
      const cap = new THREE.Mesh(capGeometry(s.tile, r, s.el1, s.yaw ?? 0), mat);
      for (const m of [band, cap]) {
        m.renderOrder = order;
        m.frustumCulled = false;
        m.raycast = () => {};
        g.add(m);
      }
      order++;
      this.group.add(g);
      this.layers.push({ mesh: g, follow: 1 });
    }
    for (const L of this.specs) {
      const m = new THREE.Mesh(bandGeometry(L.tile, L.radius, L.el0, L.el1, L.repeat ?? 1, L.yaw ?? 0, false, 4, L.span ?? 360), mat);
      m.renderOrder = order++;
      m.frustumCulled = false;
      m.raycast = () => {};
      this.group.add(m);
      this.layers.push({ mesh: m, follow: L.follow ?? 1 });
    }
    return this.group;
  }

  /** Follow the camera (call every frame with its world position). Allocation-free. */
  update(cam: THREE.Vector3) {
    for (const l of this.layers) {
      const f = l.follow;
      l.mesh.position.set(this.anchor.x + (cam.x - this.anchor.x) * f, 0, this.anchor.z + (cam.z - this.anchor.z) * f);
    }
  }
}
