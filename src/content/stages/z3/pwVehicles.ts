import * as THREE from 'three';
import type { PwAtlas, PwTile } from '../../pixelworld/atlas';
import { tintFor, type PwBatch } from '../../pixelworld/batch';
import { hash2 } from '../../pixelworld/surfaces';
import {
  z3BumperTile, z3BurntShell, z3CarGlassSide, z3CarNose, z3CarPaintSide, z3CarPaintTop, z3CarScreen, z3CarShadow, z3CarSideDetail, z3CarTail, z3TyreTile, z3WheelFace,
  type CarDims,
} from '../../pixelworld/z3cars';
import { box, cylinder } from './pwShapes';
import type { PwCarRecord } from './props';

/**
 * HIGHWAY TO HELL vehicles in ART: PIXEL WORLD, rebuilt from what `car()`
 * recorded (its dimensions, paint, state): the body box with the paint layer
 * (tinted per car) and the detail layer over it, the cabin as a real
 * greenhouse (raked windscreen and rear window, a narrower roof), bumpers,
 * wheels with tread and hubcaps, an open door, the police livery. Burnt-out
 * wrecks get their charred shell, empty windows and bare rims. Lit lamps are
 * glow texels in the nose / tail (the classic glow boxes go), the police
 * light bar stays classic.
 */

const _v = new THREE.Vector3();
const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
/** Detail layer offset off the paint (m). */
const OFF = 0.012;

export class Z3Vehicles {
  private sides = new Map<number, PwTile>();
  readonly top: PwTile;
  readonly burnt: PwTile;
  readonly tyre: PwTile[];
  readonly wheel: PwTile[];
  readonly bumper: PwTile[];
  readonly shadow: PwTile;
  readonly screen: PwTile[];

  constructor(readonly atlas: PwAtlas) {
    const a = atlas;
    this.top = z3CarPaintTop(a);
    this.burnt = z3BurntShell(a);
    this.tyre = [z3TyreTile(a), z3TyreTile(a, true)];
    this.wheel = [z3WheelFace(a, 0), z3WheelFace(a, 1), z3WheelFace(a, 2)];
    this.bumper = [z3BumperTile(a, false), z3BumperTile(a, true)];
    this.shadow = z3CarShadow(a);
    this.screen = [0, 1, 2, 3].map((v) => z3CarScreen(a, v));
  }

  private paintSide(h: number): PwTile {
    let t = this.sides.get(h);
    if (!t) this.sides.set(h, (t = z3CarPaintSide(this.atlas, h)));
    return t;
  }

  /**
   * Paint one car (the `car()` group: faces +Z, ground at y = 0) into `b` in the group's frame.
   * `ground`: a batch in world space for its contact shadow (static cars only).
   */
  car(b: PwBatch, g: THREE.Object3D, r: PwCarRecord, ground: PwBatch | null) {
    g.updateMatrixWorld(true);
    b.setMatrix(g.matrixWorld);
    const a = this.atlas;
    const kind = r.kind === 4 ? 0 : r.kind;
    const d: CarDims = { len: r.len, w: r.w, bodyH: r.bodyH, cabH: r.cabH, cabLen: r.cabLen };
    const burnt = r.burnt;
    const p = g.getWorldPosition(_v);
    const hv = hash2(Math.round(p.x * 3), Math.round(p.z * 3), 21);
    const y0 = r.baseY;
    const y1 = y0 + r.bodyH;
    const L = r.len / 2;
    const W = r.w / 2;
    const paintHex = r.police ? 0xe8e8e8 : r.color;
    const pSide = burnt ? this.burnt : this.paintSide(Math.max(4, Math.round(r.bodyH * 32)));
    const tint = (t: PwTile) => (t.neutral !== undefined ? { tintRGB: tintFor(t, paintHex) } : {});
    // ── Body: paint layer.
    box(b, 0, (y0 + y1) / 2, 0, r.w, r.bodyH, r.len, { px: pSide, nx: pSide, pz: burnt ? this.burnt : this.top, nz: burnt ? this.burnt : this.top, py: burnt ? this.burnt : this.top }, {}, burnt ? {} : tint(pSide));
    // ── Detail layer just outside it.
    const det = z3CarSideDetail(a, kind, d, burnt ? 1 : r.police ? 2 : hv > 0.45 ? 1 : 0);
    const detL = r.police && !burnt ? z3CarSideDetail(a, kind, d, 3) : det;
    box(b, 0, (y0 + y1) / 2, 0, r.w + OFF * 2, r.bodyH, r.len, { px: det, nx: detL }, { px: {}, nx: { flipU: true } });
    // Nose / tail (the van's nose module covers its lower front).
    const nose = z3CarNose(a, kind, d, r.lit, burnt);
    const tail = z3CarTail(a, kind, d, r.lit, burnt);
    const noseH = kind === 3 ? 0.9 : r.bodyH;
    b.rect(V(-W, y0, L + OFF), new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), r.w, noseH, nose);
    b.rect(V(W, y0, -L - OFF), new THREE.Vector3(-1, 0, 0), new THREE.Vector3(0, 1, 0), r.w, r.bodyH, tail);
    if (kind === 3) {
      // Van windscreen high on the front, the courier stripe down both sides.
      b.rect(V(-W * 0.92, y1 - 0.78, L + OFF), new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), r.w * 0.92, 0.62, this.screen[burnt ? 3 : 0]);
      if (r.stripe && !burnt) {
        const st = this.top;
        const sy = y0 + r.bodyH * 0.45 - 0.11;
        const z0 = -0.5 - r.len * 0.3;
        for (const s of [1, -1]) {
          const o = V(s * (W + OFF * 2), sy, s > 0 ? z0 + r.len * 0.6 : z0);
          b.rect(o, new THREE.Vector3(0, 0, -s), new THREE.Vector3(0, 1, 0), r.len * 0.6, 0.22, st, { tintRGB: tintFor(st, r.stripe) });
        }
      }
    } else {
      // ── Cabin greenhouse: raked windscreen, rear window, narrower roof.
      const zb0 = r.cabZ - r.cabLen / 2;
      const zb1 = r.cabZ + r.cabLen / 2;
      const front = r.cabLen * (kind === 2 ? 0.2 : kind === 1 ? 0.3 : 0.28);
      const rear = r.cabLen * (kind === 2 ? 0.06 : kind === 1 ? 0.1 : 0.22);
      const wb = r.w * 0.43;
      const wt = r.w * 0.38;
      const yt = y1 + r.cabH;
      const zt0 = zb0 + rear;
      const zt1 = zb1 - front;
      const glass = z3CarGlassSide(a, kind, d, burnt);
      const gw = glass.w;
      const gh = glass.h;
      // Right side (+x): u from the nose (zb1) toward the tail.
      b.quad(V(wb, y1, zb1), V(wb, y1, zb0), V(wt, yt, zt0), V(wt, yt, zt1), glass, [0, 0, gw, 0, gw - (rear / r.cabLen) * gw, gh, (front / r.cabLen) * gw, gh]);
      b.quad(V(-wb, y1, zb0), V(-wb, y1, zb1), V(-wt, yt, zt1), V(-wt, yt, zt0), glass, [gw, 0, 0, 0, (front / r.cabLen) * gw, gh, gw - (rear / r.cabLen) * gw, gh]);
      const scr = this.screen[burnt ? 3 : hv > 0.8 ? 1 : 0];
      b.quad(V(-wb, y1, zb1), V(wb, y1, zb1), V(wt, yt, zt1), V(-wt, yt, zt1), scr, [0, 0, 48, 0, 48, 24, 0, 24]);
      b.quad(V(wb, y1, zb0), V(-wb, y1, zb0), V(-wt, yt, zt0), V(wt, yt, zt0), this.screen[burnt ? 3 : 2], [0, 0, 48, 0, 48, 24, 0, 24]);
      // Roof.
      const roof = burnt ? this.burnt : this.top;
      const rt = burnt ? {} : tint(roof);
      b.rect(V(-wt, yt, zt1), new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, -1), wt * 2, zt1 - zt0, roof, rt);
      if (r.police) {
        // Light bar base (the red / blue lamps stay classic glows).
        box(b, 0, yt + 0.05, r.cabZ, 1.2, 0.1, 0.3, { px: this.bumper[1], nx: this.bumper[1], pz: this.bumper[1], nz: this.bumper[1], py: this.bumper[1] });
      }
    }
    // ── Bumpers.
    const bt = burnt ? this.burnt : this.bumper[hv > 0.5 || kind === 2 ? 1 : 0];
    for (const z of [L + 0.03, -L - 0.03]) box(b, 0, y0 + 0.12, z, r.w + 0.04, 0.18, 0.14, { px: bt, nx: bt, pz: bt, nz: bt, py: bt });
    // ── Wheels: tread round, hubcap on the outer face.
    const wz = L - 0.85;
    for (const s of [-1, 1]) {
      for (const z of [wz, -wz]) {
        const x = s * (W - 0.08);
        cylinder(b, V(x - s * 0.13, r.wheelR, z), V(x + s * 0.13, r.wheelR, z), r.wheelR, r.wheelR, 8, this.tyre[burnt ? 1 : 0], { capB: this.wheel[burnt ? 2 : hv > 0.6 ? 1 : 0] });
      }
    }
    // ── Open door: its outer skin (paint + detail) swung out.
    if (r.door && kind !== 3) {
      const s = r.door;
      const m = new THREE.Matrix4().compose(V(s * (W + 0.45), y0 + (r.bodyH + r.cabH * 0.8) / 2, r.cabZ + 0.55), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, s * 0.9, 0)), V(1, 1, 1));
      const prev = b.matrix.clone();
      b.setMatrix(prev.clone().multiply(m));
      const dh = r.bodyH + r.cabH * 0.8;
      box(b, 0, 0, 0, 0.08, dh, 1.05, { px: pSide, nx: pSide, pz: pSide, nz: pSide, py: pSide }, {}, burnt ? {} : tint(pSide));
      const gl = z3CarGlassSide(a, kind, d, burnt);
      for (const sx of [1, -1]) b.rect(V(sx * 0.045, dh / 2 - r.cabH * 0.75, sx > 0 ? 0.5 : -0.5), new THREE.Vector3(0, 0, -sx), new THREE.Vector3(0, 1, 0), 1.0, r.cabH * 0.7, gl, { sub: { x: 0, y: 0, w: Math.round(gl.w / 2), h: gl.h } });
      b.setMatrix(prev);
    }
    b.setMatrix(null);
    // Contact shadow (or the scorch under a burnt wreck) on the road.
    if (ground) {
      const q = new THREE.Quaternion();
      g.getWorldQuaternion(q);
      const fwd = V(0, 0, 1).applyQuaternion(q);
      const yaw = Math.atan2(-fwd.x, -fwd.z);
      const up = V(0, 1, 0).applyQuaternion(q);
      if (up.y > 0.5) this.decal(ground, p, r.w + 0.5, r.len + 0.4, yaw, this.shadow, p.y + 0.011);
    }
  }

  /** A flat ground decal at a world point (`yaw`: the rect's length runs along −Z rotated by yaw). */
  decal(b: PwBatch, p: THREE.Vector3, w: number, l: number, yaw: number, tile: PwTile, y = 0.012) {
    const ax = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
    const az = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
    const o = new THREE.Vector3(p.x, y, p.z).addScaledVector(ax, -w / 2).addScaledVector(az, -l / 2);
    b.rect(o, ax, az, w, l, tile);
  }

  /** Classic meshes of a car to remove: all but the police light-bar glows. */
  static classicParts(g: THREE.Object3D, r: PwCarRecord): THREE.Object3D[] {
    const out: THREE.Object3D[] = [];
    const roofY = r.baseY + r.bodyH + r.cabH * 0.5;
    for (const c of g.children) {
      const m = c as THREE.Mesh;
      if (!m.isMesh) continue;
      const glow = (m.material as THREE.MeshBasicMaterial).isMeshBasicMaterial === true;
      if (glow && m.position.y > roofY) continue;
      out.push(m);
    }
    return out;
  }
}
