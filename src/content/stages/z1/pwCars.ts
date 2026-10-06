import * as THREE from 'three';
import type { PwAtlas, PwTile } from '../../pixelworld/atlas';
import { tintFor, type PwBatch, type PwRectOpts } from '../../pixelworld/batch';
import { z1CarTiles, type Z1CarTiles } from '../../pixelworld/z1cars';
import { hash2 } from '../../pixelworld/surfaces';
import type { CarOptions } from './props';

/**
 * MAIN STREET cars in ART: PIXEL WORLD: every car part `car()` tagged
 * (`userData.pwPart`) is re-emitted with painted car modules (z1cars.ts) in
 * its own frame — sides with seams, arches and the specular band, the nose
 * with grille and lamps, the tail with lights and plate, glass with the sky in
 * it, tyres with tread and hubcaps — tinted per paint job; the burnt wrecks get
 * their scorched shells. Glowing parts (lit head / tail lights, police light
 * bars) stay classic (they flash or glow); the grille box and hub caps are
 * painted into the nose / wheel faces instead.
 */

const X = new THREE.Vector3(1, 0, 0);
const Y = new THREE.Vector3(0, 1, 0);
const Z = new THREE.Vector3(0, 0, 1);
const NX = new THREE.Vector3(-1, 0, 0);
const NZ = new THREE.Vector3(0, 0, -1);
const _o = new THREE.Vector3();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
const _p = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _e = new THREE.Euler();
const _m = new THREE.Matrix4();

type Face = 'px' | 'nx' | 'py' | 'pz' | 'nz';

export class Z1Cars {
  readonly t: Z1CarTiles;
  constructor(atlas: PwAtlas) {
    this.t = z1CarTiles(atlas);
  }

  /** Paint every car under `root`; returns the classic meshes it replaced (remove them). */
  convert(b: PwBatch, root: THREE.Object3D): THREE.Object3D[] {
    const cars: THREE.Object3D[] = [];
    root.traverse((o) => {
      if (o.userData.pwCar) cars.push(o);
    });
    const drop: THREE.Object3D[] = [];
    for (const g of cars) {
      g.updateMatrixWorld(true);
      const o = g.userData.pwCar as CarOptions;
      const parts: THREE.Mesh[] = [];
      g.traverse((m) => {
        if ((m as THREE.Mesh).isMesh && m.userData.pwPart) parts.push(m as THREE.Mesh);
      });
      const v = hash2(Math.round(g.position.x * 10), Math.round(g.position.z * 10), 5) > 0.55 ? 1 : 0;
      const paintHex = o.police ? 0x18191f : o.color;
      for (const m of parts) if (this.part(b, m, o, v, paintHex)) drop.push(m);
      this.extras(b, g, o, paintHex, v);
    }
    b.setMatrix(null);
    return drop;
  }

  /**
   * What breaks the box: the dark contact shadow it sits in (cars stop floating),
   * wing mirrors, an aerial on the rear fender, mud flaps behind the wheels.
   */
  private extras(b: PwBatch, g: THREE.Object3D, o: CarOptions, paintHex: number, v: number) {
    const t = this.t;
    g.matrixWorld.decompose(_p, _q, _s);
    _e.setFromQuaternion(_q, 'YXZ');
    // Contact shadow on the ground (upright cars only), in the car's yaw.
    if (Math.abs(_e.x) < 0.2 && Math.abs(_e.z) < 0.2) {
      _m.makeRotationY(_e.y).setPosition(_p.x, 0.022, _p.z);
      b.setMatrix(_m);
      b.rect(_o.set(-1.25, 0, 2.6), X, NZ, 2.5, 5.2, t.shadow);
    }
    b.setMatrix(g.matrixWorld);
    const tint = { tintRGB: tintFor(t.mirror, paintHex) };
    // Mirrors on the door tops by the A-pillars (a face each way and one seen from the side).
    for (const sx of [-1, 1]) {
      const x = sx * 1.0;
      b.rect(_o.set(x - 0.12, 0.98, 0.7), X, Y, 0.24, 0.18, t.mirror, tint);
      b.rect(_o.set(x + 0.12, 0.98, 0.7), NX, Y, 0.24, 0.18, t.mirror, { ...tint, flipU: true });
      b.rect(_o.set(x, 0.98, 0.82), Z, Y, 0.12, 0.18, t.mirror, { ...tint, sub: { x: 0, y: 0, w: 4, h: 6 } });
      b.rect(_o.set(x, 0.98, 0.58), NZ, Y, 0.12, 0.18, t.mirror, { ...tint, sub: { x: 0, y: 0, w: 4, h: 6 } });
    }
    if (!o.burnt) {
      // The aerial on the rear fender (crossed), mud flaps behind the rear wheels.
      const ax = v ? 0.72 : -0.72;
      b.rect(_o.set(ax - 0.03, 0.93, -1.95), X, Y, 0.06, 0.85, t.aerial);
      b.rect(_o.set(ax, 0.93, -1.98), Z, Y, 0.06, 0.85, t.aerial);
      for (const sx of [-1, 1]) {
        b.rect(_o.set(sx * 0.86 - 0.13, 0.06, -1.86), X, Y, 0.26, 0.28, t.flap);
        b.rect(_o.set(sx * 0.86 + 0.13, 0.06, -1.86), NX, Y, 0.26, 0.28, t.flap);
      }
    }
    b.setMatrix(null);
  }

  /** Emit one part; false = keep the classic mesh (glows). */
  private part(b: PwBatch, m: THREE.Mesh, o: CarOptions, v: number, paintHex: number): boolean {
    const t = this.t;
    const part = m.userData.pwPart as string;
    const glow = (m.material as THREE.MeshBasicMaterial).isMeshBasicMaterial === true;
    if ((part === 'head' || part === 'tail') && glow) return false;
    if (part === 'grille' || part === 'hub') return true;
    b.setMatrix(m.matrixWorld);
    const burnt = !!o.burnt;
    const tint = (tile: PwTile): PwRectOpts => (tile.neutral !== undefined ? { tintRGB: tintFor(tile, paintHex) } : {});
    if (part === 'wheel') {
      const g = m.geometry as THREE.CylinderGeometry;
      this.wheel(b, g.parameters.radiusTop, g.parameters.height, burnt ? t.burnt.wheel : t.wheel);
      return true;
    }
    const p = (m.geometry as THREE.BoxGeometry).parameters;
    const box = (faces: Partial<Record<Face, PwTile | null>>, sub?: Partial<Record<Face, PwRectOpts['sub']>>) => {
      for (const f of Object.keys(faces) as Face[]) {
        const tile = faces[f];
        if (tile) this.face(b, p.width, p.height, p.depth, f, tile, { ...tint(tile), sub: sub?.[f] });
      }
    };
    const paint = t.paint;
    switch (part) {
      case 'body': {
        const side = burnt ? t.burnt.side : t.side[v];
        box({ px: side, nx: side, pz: burnt ? t.burnt.metal : t.front, nz: burnt ? t.burnt.metal : t.back, py: burnt ? t.burnt.top : t.top });
        break;
      }
      case 'hood':
        box({ py: burnt ? t.burnt.hood : o.wrecked ? t.hoodWreck : t.hood, px: paint, nx: paint, pz: paint });
        break;
      case 'roof':
        box({ py: burnt ? t.burnt.roof : t.roof, px: paint, nx: paint, pz: paint, nz: paint });
        break;
      case 'glass': {
        const s = burnt ? t.burnt.glass : t.glassSide;
        const f = burnt ? t.burnt.glass : o.wrecked ? t.glassCracked : t.glassFront;
        box({ px: s, nx: s, pz: f, nz: burnt ? t.burnt.glass : t.glassFront, py: f });
        break;
      }
      case 'pillar':
        box({ px: paint, nx: paint, py: paint, pz: paint, nz: paint });
        break;
      case 'police':
        box({ px: t.police, nx: t.police });
        break;
      case 'lightbase':
      case 'bumper': {
        const c = burnt ? t.burnt.metal : t.chrome;
        box({ px: c, nx: c, py: c, pz: c, nz: c });
        break;
      }
      case 'head':
        box({ pz: t.lamp, px: t.chrome, nx: t.chrome, py: t.chrome });
        break;
      case 'tail':
        box({ nz: t.tail, px: t.chrome, nx: t.chrome, py: t.chrome });
        break;
      case 'door': {
        // Outer skin: the front-door stretch of the side module; inner: the trim panel.
        const side = burnt ? t.burnt.side : t.side[v];
        const outer = m.parent!.position.x > 0 ? 'px' : 'nx';
        const inner = outer === 'px' ? 'nx' : 'px';
        box({ [outer]: side, [inner]: t.doorIn, py: paint, pz: paint, nz: paint } as Partial<Record<Face, PwTile>>, { [outer]: { x: 42, y: 0, w: 34, h: 20 } });
        break;
      }
      case 'doorGlass': {
        const g = burnt ? t.burnt.glass : t.glassSide;
        box({ px: g, nx: g }, { px: { x: 2, y: 1, w: 29, h: 14 }, nx: { x: 2, y: 1, w: 29, h: 14 } });
        break;
      }
      default:
        box({ px: paint, nx: paint, py: paint, pz: paint, nz: paint });
    }
    return true;
  }

  /** One face of a box centred on the origin (current batch matrix), u from the car's front. */
  private face(b: PwBatch, w: number, h: number, d: number, f: Face, tile: PwTile, opts: PwRectOpts) {
    const hx = w / 2;
    const hy = h / 2;
    const hz = d / 2;
    if (f === 'px') b.rect(_o.set(hx, -hy, hz), NZ, Y, d, h, tile, opts);
    else if (f === 'nx') b.rect(_o.set(-hx, -hy, -hz), Z, Y, d, h, tile, { ...opts, flipU: !tile.wrap && tile !== this.t.police });
    else if (f === 'pz') b.rect(_o.set(-hx, -hy, hz), X, Y, w, h, tile, opts);
    else if (f === 'nz') b.rect(_o.set(hx, -hy, -hz), NX, Y, w, h, tile, opts);
    else b.rect(_o.set(-hx, hy, hz), X, NZ, w, d, tile, opts);
  }

  /** A wheel (cylinder along its local Y): tread round the side, the painted hubcap on both faces. */
  private wheel(b: PwBatch, r: number, h: number, cap: PwTile) {
    const seg = 12;
    const tire = this.t.tire;
    const circ = 2 * Math.PI * r * 32;
    for (let i = 0; i < seg; i++) {
      const a0 = (i / seg) * Math.PI * 2;
      const a1 = ((i + 1) / seg) * Math.PI * 2;
      const u0 = (i / seg) * circ;
      const u1 = ((i + 1) / seg) * circ;
      // Side quad (outward, counter-clockwise seen from outside).
      _a.set(Math.sin(a0) * r, -h / 2, Math.cos(a0) * r);
      _b.set(Math.sin(a1) * r, -h / 2, Math.cos(a1) * r);
      _c.set(Math.sin(a1) * r, h / 2, Math.cos(a1) * r);
      const d = new THREE.Vector3(Math.sin(a0) * r, h / 2, Math.cos(a0) * r);
      b.quad(_a.clone(), _b.clone(), _c.clone(), d, tire, [u0, 0, u1, 0, u1, 16, u0, 16]);
      // Caps: fans with the hubcap module mapped across the disc.
      const W = cap.w;
      const uv = (x: number, z: number) => [((x / r) * 0.5 + 0.5) * W, ((z / r) * 0.5 + 0.5) * W];
      const [ua, va] = uv(Math.sin(a0) * r, Math.cos(a0) * r);
      const [ub, vb] = uv(Math.sin(a1) * r, Math.cos(a1) * r);
      const cu = W / 2;
      b.tri(new THREE.Vector3(0, h / 2, 0), new THREE.Vector3(Math.sin(a0) * r, h / 2, Math.cos(a0) * r), new THREE.Vector3(Math.sin(a1) * r, h / 2, Math.cos(a1) * r), cap, [cu, cu, ua, va, ub, vb]);
      b.tri(new THREE.Vector3(0, -h / 2, 0), new THREE.Vector3(Math.sin(a1) * r, -h / 2, Math.cos(a1) * r), new THREE.Vector3(Math.sin(a0) * r, -h / 2, Math.cos(a0) * r), cap, [cu, cu, ub, vb, ua, va]);
    }
  }
}
