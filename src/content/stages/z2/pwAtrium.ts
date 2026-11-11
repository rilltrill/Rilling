import * as THREE from 'three';
import type { PwBatch } from '../../pixelworld/batch';
import { PW_TPM } from '../../pixelworld/canvas';
import { hash2 } from '../../pixelworld/surfaces';
import { z2FleshTile, z2MarbleTile, z2StonePanelTile, z2WallpaperTile } from '../../pixelworld/z2surfaces';
import { z2CopingTile, z2FleshDrape } from '../../pixelworld/z2objects';
import { z2LightPool, z2PoolTexture } from '../../pixelworld/z2bay';
import { bannerModule, bigClock, cafeFront, sconceModule, columnTile, directoryBoard, doorwayModule, elevatorBank, fasciaTile, dripTile, glassRailTile, membraneTile, officeWindow, pustuleDecal, skylightTile, veinTile } from '../../pixelworld/z2atrium';
import { d1ShaftMaterial } from '../../pixelworld/d1Shafts';
import { B } from './layout';
import type { Z2PixelWorld } from './pixel';
import { lay, NX, NZ, own, X, Y, Z, type Pick, type PickQuery, type TagCtx, type Z2Registry } from './pwCore';

/**
 * ST. MERCY HOSPITAL in PIXEL WORLD — the ATRIUM and the boss arena (beats
 * 26–29): its composed walls, the glass balustrades, the veins and the pool,
 * the fountain's coping, the moon shafts.
 */

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
const _o = new THREE.Vector3();
const _p = new THREE.Vector3();
const _mm = new THREE.Matrix4();
const _q = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];

/**
 * The Patient Zero atrium, composed and lit: the elevator bank and the
 * directory on the back wall, a café on the right, a stopped clock and lit
 * office windows above, anniversary banners hanging from the top balconies,
 * the pool's red glow on the marble.
 */
function atriumDressing(pw: Z2PixelWorld, b: PwBatch) {
  const a = pw.atlas;
  const Bf = B;
  // Back wall (x = 22, facing +x): elevators, the directory, a stopped clock, office windows.
  lay(b, _mm.identity(), _o.set(22.17, Bf, -128 + 1.875), NZ, Y, 3.75, 3.25, elevatorBank(a));
  lay(b, _mm, _o.set(22.17, Bf + 1.0, -116.5 + 0.625), NZ, Y, 1.25, 1.6, directoryBoard(a));
  lay(b, _mm, _o.set(22.16, 4.5 + 1.35, -127 + 0.75), NZ, Y, 1.5, 1.5, bigClock(a));
  for (const [y, z, k] of [[4.5, -115, 0], [4.5, -132, 1], [9, -113.5, 2], [9, -129, 3]] as const) {
    const lit = hash2(k, 5, 23) > 0.35;
    lay(b, _mm, _o.set(22.165, y + 1.4, z + 0.7), NZ, Y, 1.4, 0.8, officeWindow(a, lit ? 0xd8c890 : 0x2a3434, k & 1));
  }
  // Sconces along the balcony walls (a rhythm of warm lights on every level; a few dead).
  for (const ly of [0, 4.5, 9]) {
    for (let x = 26; x < 49; x += 6.5) {
      for (const [z, f, dx] of [[-106 - 0.17, -1, 1.3], [-136 + 0.17, 1, 3.3]] as const) {
        const lit = hash2(Math.round(x * 2), Math.round(ly * 2) + f, 29) > 0.3;
        const sx = x + dx;
        if (f < 0) lay(b, _mm, _o.set(sx + 0.15, ly + 2.0, z - 0.01), NX, Y, 0.3, 0.44, sconceModule(a, lit));
        else lay(b, _mm, _o.set(sx - 0.15, ly + 2.0, z + 0.01), X, Y, 0.3, 0.44, sconceModule(a, lit));
      }
    }
  }
  // Right wall (z = -136, facing +z): the café, its shutter half down.
  lay(b, _mm, _o.set(45, Bf, -135.82), X, Y, 5, 3, cafeFront(a));
  // Banners from the top balconies' fascias (both faces).
  let k = 0;
  for (const x of [29.5, 43]) {
    for (const [z, f] of [[-109.62, -1], [-132.38, 1]] as const) {
      const t = bannerModule(a, k++ & 1);
      if (f < 0) {
        lay(b, _mm, _o.set(x + 0.5, 5.0, z), NX, Y, 1, 3.5, t);
        lay(b, _mm, _o.set(x - 0.5, 5.0, z + 0.02), X, Y, 1, 3.5, t);
      } else {
        lay(b, _mm, _o.set(x - 0.5, 5.0, z), X, Y, 1, 3.5, t);
        lay(b, _mm, _o.set(x + 0.5, 5.0, z - 0.02), NX, Y, 1, 3.5, t);
      }
    }
  }
  // The pool's red glow on the marble round the fountain.
  pw.job!.pools.push([0xff3a1a, 35, Bf + 0.013, -121, 20, 20, 0.42]);
}

/**
 * The moonlight shafts under the skylight (additive cylinders): hard-edged
 * rays in stepped strengths instead of pale slabs, and a cold stepped pool
 * where each meets the floor.
 */
export function paintShafts(g: THREE.Object3D) {
  const mat = d1ShaftMaterial(0x7a98d8, 0.16);
  const tex = z2PoolTexture();
  const pools: THREE.Mesh[] = [];
  g.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    m.material = mat;
    const h = (m.geometry as THREE.CylinderGeometry).parameters?.height ?? 18;
    const x = m.position.x + Math.sin(m.rotation.z) * (h / 2);
    pools.push(z2LightPool(tex, 0x6a88c8, x, B + 0.014, m.position.z, 6.5, 6.5, 0.32));
  });
  for (const p of pools) g.add(p);
}

/**
 * The fountain's coping (a torus): the stone tile laid round the ring with
 * the geometry's own (u round the ring, v round the tube) coordinates, and
 * flesh spilling over the rim in a few places.
 */
function coping(pw: Z2PixelWorld, b: PwBatch, m: THREE.Mesh, rel: THREE.Matrix4) {
  const geo = m.geometry as THREE.TorusGeometry;
  const { radius: R, tube: r } = geo.parameters;
  const t = z2CopingTile(pw.atlas, 0x8a867a);
  const reps = Math.max(1, Math.round((2 * Math.PI * R * PW_TPM) / t.w));
  const pos = geo.getAttribute('position');
  const uv = geo.getAttribute('uv');
  const idx = geo.index!;
  b.setMatrix(null);
  for (let i = 0; i + 2 < idx.count; i += 3) {
    const ia = idx.getX(i);
    const ib = idx.getX(i + 1);
    const ic = idx.getX(i + 2);
    _a.fromBufferAttribute(pos, ia).applyMatrix4(rel);
    _b.fromBufferAttribute(pos, ib).applyMatrix4(rel);
    _c.fromBufferAttribute(pos, ic).applyMatrix4(rel);
    b.tri(_a, _b, _c, t, [uv.getX(ia) * reps * t.w, uv.getY(ia) * t.h, uv.getX(ib) * reps * t.w, uv.getY(ib) * t.h, uv.getX(ic) * reps * t.w, uv.getY(ic) * t.h]);
  }
  // Flesh spilling over the rim: slanted flaps from the top of the coping down its outer side.
  _p.setFromMatrixPosition(rel);
  const top = _p.y + r;
  for (let k = 0; k < 7; k++) {
    const ang = 0.4 + k * 0.93 + hash2(k, 3, 17) * 0.4;
    const c = Math.cos(ang);
    const sn = Math.sin(ang);
    const tx = -sn;
    const tz = c;
    const w = 0.7 + hash2(k, 4, 17) * 0.5;
    const ri = R - 0.05;
    const ro = R + r + 0.06;
    _q[0].set(_p.x + c * ro + tx * (w / 2), _p.y - 0.24, _p.z + sn * ro + tz * (w / 2));
    _q[1].set(_p.x + c * ro - tx * (w / 2), _p.y - 0.24, _p.z + sn * ro - tz * (w / 2));
    _q[2].set(_p.x + c * ri - tx * (w / 2), top + 0.02, _p.z + sn * ri - tz * (w / 2));
    _q[3].set(_p.x + c * ri + tx * (w / 2), top + 0.02, _p.z + sn * ri + tz * (w / 2));
    const d = z2FleshDrape(pw.atlas, k % 3);
    b.quad(_q[0], _q[1], _q[2], _q[3], d, [0, 0, d.w, 0, d.w, d.h, 0, d.h]);
  }
}

/** The atrium's tagged objects. */
function handleAtrium(tc: TagCtx): boolean | undefined {
  const { pw, o, b, m, info, hsh } = tc;
  const a = pw.atlas;
  switch (info.kind) {
    case 'poolDrop':
      return true;
    case 'glassRail': {
      // Bay by bay (posts every 2.5 m): most panes clean, the odd crack, smear or empty frame.
      const len = info.len as number;
      const n = Math.max(1, Math.round(len / 2.5));
      const bw = len / n;
      for (let i = 0; i < n; i++) {
        const h = hash2(i, Math.round(m.elements[12] * 3 + m.elements[13] * 5), Math.round(m.elements[14] * 3));
        const t = glassRailTile(a, h < 0.32 ? 0 : h < 0.62 ? 1 : h < 0.76 ? 2 : h < 0.9 ? 3 : 4);
        const s0 = -len / 2 + i * bw;
        if (info.along) {
          lay(b, m, _o.set(s0, -0.5, 0.017), X, Y, bw, 1.0, t);
          lay(b, m, _o.set(-s0, -0.5, -0.017), NX, Y, bw, 1.0, t);
        } else {
          lay(b, m, _o.set(0.017, -0.5, -s0), NZ, Y, bw, 1.0, t);
          lay(b, m, _o.set(-0.017, -0.5, s0), Z, Y, bw, 1.0, t);
        }
      }
      return true;
    }
    case 'doorway': {
      const t = doorwayModule(a, hsh > 0.82 ? 1 : hsh > 0.55 ? 2 : 0);
      if ((info.face as number) < 0) lay(b, m, _o.set(0.8, -1.2, -0.026), NX, Y, 1.6, 2.4, t);
      else lay(b, m, _o.set(-0.8, -1.2, 0.026), X, Y, 1.6, 2.4, t);
      return true;
    }
    case 'officeWin': {
      const col = ((o as THREE.Mesh).material as THREE.MeshBasicMaterial).color.getHex();
      lay(b, m, _o.set(0.7, -0.4, -0.021), NX, Y, 1.4, 0.8, officeWindow(a, col, hsh > 0.6 ? 1 : 0));
      return true;
    }
    case 'skylight': {
      const p = ((o as THREE.Mesh).geometry as THREE.BoxGeometry).parameters;
      lay(b, m, _o.set(-p.width / 2, -0.026, -p.depth / 2), X, Z, p.width, p.depth, skylightTile(a));
      return true;
    }
    case 'vein': {
      // Bold ribbons radiating from the pool (0.6–1 m wide: the arena's framing lines), u stretched once across.
      const len = info.len as number;
      const w = Math.max(0.6, (info.w as number) * 3.2);
      const hexV = ((o as THREE.Mesh).material as THREE.MeshLambertMaterial).color.getHex();
      b.setMatrix(m);
      b.rect(_o.set(-w / 2, 0.041 + (pw.nDecal++ % 3) * 0.002, len / 2 + 0.15), X, NZ, w, len + 0.3, veinTile(a, hexV === 0x4a1212 ? 0x6a1a1a : 0x8a2a26), { u0: 0, v0: Math.floor(hsh * 64), uScale: 1 / w });
      b.setMatrix(null);
      return true;
    }
    case 'veinNode': {
      _p.setFromMatrixPosition(m);
      const r = Math.max(0.35, (info.r as number) * 1.9);
      b.rect(_o.set(_p.x - r, _p.y + 0.05, _p.z + r), X, NZ, r * 2, r * 2, pustuleDecal(a));
      return true;
    }
    case 'drip': {
      const len = info.len as number;
      const hexV = ((o as THREE.Mesh).material as THREE.MeshLambertMaterial).color.getHex();
      const t = dripTile(a, hexV);
      lay(b, m, _o.set(-0.18, -len / 2, 0.062), X, Y, 0.36, len, t);
      lay(b, m, _o.set(0.18, -len / 2, -0.062), NX, Y, 0.36, len, t);
      return true;
    }
    case 'membrane': {
      const p = ((o as THREE.Mesh).geometry as THREE.BoxGeometry).parameters;
      const t = membraneTile(a, 0x4a1212);
      lay(b, m, _o.set(-p.width / 2, -0.85, 0.102), X, Y, p.width, 1.1, t);
      lay(b, m, _o.set(p.width / 2, -0.85, -0.102), NX, Y, p.width, 1.1, t);
      return false;
    }
    default:
      return undefined;
  }
}

/** The atrium's own surfaces: marble, wallpaper, stone panels, columns, balcony fascias, flesh. */
function pickAtrium(pw: Z2PixelWorld, q: PickQuery): Pick | null | undefined {
  const a = pw.atlas;
  const { hex, face } = q;
  switch (q.preset) {
    case 'stucco|1|0.65':
      return hex === 0xc8c8be ? own(fasciaTile(a, hex)) : undefined;
    case 'wallpaper|1|0.4':
      return hex === 0x8e8670 ? own(z2WallpaperTile(a, { hex })) : undefined;
    case 'concrete|1|0.8':
      if (hex === 0x4e4a44 && face === 'side') return own(z2StonePanelTile(a, { hex }));
      if (hex === 0xa8a89e && face === 'side') return own(columnTile(a, hex));
      return undefined;
    case 'checker|0.32|0.36':
      return own(z2MarbleTile(a, { a: 0x77736a, b: 0x4e4a44 }));
    case 'hide|1.3|0.75':
    case 'hide|2.2|0.45':
      return own(z2FleshTile(a, { hex }));
    default:
      return undefined;
  }
}

export function registerAtrium(reg: Z2Registry) {
  reg.tag(['poolDrop', 'glassRail', 'doorway', 'officeWin', 'skylight', 'vein', 'veinNode', 'drip', 'membrane'], handleAtrium);
  reg.pick(pickAtrium);
  // The fountain's coping (a torus).
  reg.mesh(({ pw, b, mesh, mat, rel }) => {
    if (mesh.geometry.type !== 'TorusGeometry' || mat.color.getHex() !== 0x8a867a) return false;
    coping(pw, b, mesh, rel);
    return true;
  });
  reg.dress(['atrium'], (pw, b) => atriumDressing(pw, b));
}
