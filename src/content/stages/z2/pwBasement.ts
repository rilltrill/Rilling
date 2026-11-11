import * as THREE from 'three';
import { ConvexGeometry } from 'three/examples/jsm/geometries/ConvexGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Kit } from '../../kit/ModelKit';
import { pwRect, type PwTile } from '../../pixelworld/atlas';
import type { PwBatch } from '../../pixelworld/batch';
import { PW_TPM } from '../../pixelworld/canvas';
import { pwMaterial } from '../../pixelworld/material';
import { NEUTRAL_HEX } from '../../pixelworld/retexture';
import { hash2 } from '../../pixelworld/surfaces';
import { z2BlockTile, z2ConcreteTile, z2FloorTileTile, z2GlazedTile, z2TerrazzoTile, z2TreadTile } from '../../pixelworld/z2surfaces';
import { z2PlankModule, z2RubbleTile } from '../../pixelworld/z2objects';
import { puddleDecal } from '../../pixelworld/z2decals';
import { drawerFace } from '../../pixelworld/z2modules';
import type { Z2PixelWorld } from './pixel';
import { GLAZED, lay, neutral, NZ, own, X, Y, type Pick, type PickQuery, type TagCtx, type Z2Registry } from './pwCore';

/**
 * ST. MERCY HOSPITAL in PIXEL WORLD — the BASEMENT shell (beats 16–25): the
 * stairwell, the morgue, corridors B / C, the boiler wall and the theatre —
 * their walls, floors, treads, the cold-storage banks, the wall that bursts.
 */

const _a = new THREE.Vector3();
const _o = new THREE.Vector3();
const _p = new THREE.Vector3();
const _rel = new THREE.Matrix4();
const _inv = new THREE.Matrix4();
const _col = new THREE.Color();

/**
 * The boiler wall's KEEP OUT: its classic crack strokes become boards nailed
 * across the blocks (grain, nail heads, a cast shadow), at their angles.
 */
function boards(pw: Z2PixelWorld, g: THREE.Group, b: PwBatch) {
  let keep = false;
  g.traverse((o) => {
    if (o.userData.pw?.kind === 'text' && o.userData.pw.text === 'KEEP OUT') keep = true;
  });
  if (!keep) return;
  _inv.copy(g.matrixWorld).invert();
  let k = 0;
  for (const c of [...g.children]) {
    const m = c as THREE.Mesh;
    if (!m.isMesh || (m.material as THREE.MeshLambertMaterial).color?.getHex() !== 0x1a1a18) continue;
    const len = (m.geometry as THREE.BoxGeometry).parameters.width;
    _rel.multiplyMatrices(_inv, m.matrixWorld);
    const L = Math.min(1.6, Math.max(1.1, len * 1.4));
    const t = z2PlankModule(pw.atlas, k++ % 2);
    lay(b, _rel, _o.set(-L / 2, -0.17, 0.014 + k * 0.002), X, Y, L, 10 / PW_TPM, t, { sub: { x: 0, y: 0, w: Math.round(L * PW_TPM), h: 10 } });
    g.remove(m);
  }
}

/**
 * The boiler wall's blocks (flyers when the brute bursts it; never hit
 * boxes): each block's faces painted on its own triangles — the wall's
 * painted block face across the front and back (continuous over the wall:
 * u / v from the block's place in it), the broken core on its edges.
 */
export function paintWall(pw: Z2PixelWorld, w: { pieces: THREE.Mesh[] } | null) {
  if (!w || !pw.atlas.built) return;
  const mat = pwMaterial(pw.atlas);
  const core = z2RubbleTile(pw.atlas);
  for (const p of w.pieces) {
    const lm = p.material as THREE.MeshLambertMaterial;
    const face = pw.pickFor('brick', 'brick|1.25|0.5', lm.color.getHex(), 'side');
    if (!face) continue;
    // (Tracked: once the burst swaps in the chunk, nothing in the scene holds this one.)
    const g = (p.geometry = Kit.track(p.geometry.clone()));
    const pos = g.getAttribute('position');
    const nrm = g.getAttribute('normal');
    const n = pos.count;
    const uv = new Float32Array(n * 2);
    const rect = new Int16Array(n * 4);
    const col = new Uint8Array(n * 3);
    _col.setHex(face.tint);
    for (let i = 0; i < n; i++) {
      _a.fromBufferAttribute(pos, i);
      const front = Math.abs(nrm.getZ(i)) > 0.7;
      const t = front ? face.tile : core;
      // Wall coordinates: the block's place in the wall (holder frame) + its own offset.
      const wx = _a.x + p.position.x;
      const wy = _a.y + p.position.y;
      uv[i * 2] = (front ? (nrm.getZ(i) > 0 ? wx : -wx) : nrm.getX(i) !== 0 ? _a.z * Math.sign(nrm.getX(i)) : wx) * PW_TPM;
      uv[i * 2 + 1] = (Math.abs(nrm.getY(i)) > 0.7 ? _a.z : wy) * PW_TPM;
      rect.set(pwRect(t, true), i * 4);
      if (front) col.set([Math.round(_col.r * 255), Math.round(_col.g * 255), Math.round(_col.b * 255)], i * 3);
      else col.set([255, 255, 255], i * 3);
    }
    g.setAttribute('pwUv', new THREE.BufferAttribute(uv, 2));
    g.setAttribute('pwRect', new THREE.BufferAttribute(rect, 4));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3, true));
    p.material = mat;
    // What flies when the brute bursts it (`burstWall` swaps it in): the block broken off
    // (corners chipped away, painted brick face, rubble core on every break).
    p.userData.pwChunk = wallChunk(pw, p, w.pieces.indexOf(p), face.tile, core, _col);
  }
}

/**
 * A chipped wall block: the convex hull of the block's corners with about half of them
 * knocked off at uneven depths (and every block a little smaller than its slot), so the
 * burst throws broken masonry rather than cubes. Front / back faces keep the wall's
 * painted block face (continuous u / v as in the wall), every break shows the rubble core.
 */
function wallChunk(pw: Z2PixelWorld, p: THREE.Mesh, i: number, face: PwTile, core: PwTile, tint: THREE.Color): THREE.BufferGeometry {
  const bp = (p.geometry as THREE.BoxGeometry).parameters;
  const hx = (bp?.width ?? 1) / 2;
  const hy = (bp?.height ?? 1) / 2;
  const hz = (bp?.depth ?? 0.3) / 2;
  // Cracked through: two convex halves either side of a slanted break (a few cm apart, they
  // fly as one), each with chipped corners.
  const s1 = (hash2(i, 12, 84) - 0.5) * hx * 0.7;
  const s2 = (hash2(i, 13, 85) - 0.5) * hx * 0.7;
  const gap = 0.025;
  const half = (side: -1 | 1): THREE.BufferGeometry => {
    const pts: THREE.Vector3[] = [];
    let k = side < 0 ? 0 : 8;
    for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
      const h = hash2(i, k, 77);
      const ax = hx * (0.15 + 0.3 * hash2(i, k, 78));
      const ay = hy * (0.22 + 0.4 * hash2(i, k, 79));
      const az = hz * (0.3 + 0.5 * hash2(i, k, 80));
      const sx = side;
      if (h < 0.6) {
        pts.push(new THREE.Vector3(sx * (hx - ax), sy * hy, sz * hz), new THREE.Vector3(sx * hx, sy * (hy - ay), sz * hz), new THREE.Vector3(sx * hx, sy * hy, sz * (hz - az)));
      } else pts.push(new THREE.Vector3(sx * hx, sy * hy, sz * hz));
      k++;
      // The break: the slanted cut, a little rough (one point set back from it).
      const cx = (sy > 0 ? s1 : s2) + side * gap;
      pts.push(new THREE.Vector3(cx, sy * hy, sz * hz));
    }
    const mid = (s1 + s2) / 2 + side * (gap + hx * 0.12 * hash2(i, side + 20, 86));
    pts.push(new THREE.Vector3(mid, (hash2(i, side + 22, 87) - 0.5) * hy, hz), new THREE.Vector3(mid, (hash2(i, side + 24, 88) - 0.5) * hy, -hz));
    for (const q of pts) q.multiplyScalar(0.92);
    return new ConvexGeometry(pts);
  };
  const g = mergeGeometries([half(-1), half(1)], false)!;
  const pos = g.getAttribute('position');
  const nrm = g.getAttribute('normal');
  const n = pos.count;
  const uv = new Float32Array(n * 2);
  const rect = new Int16Array(n * 4);
  const col = new Uint8Array(n * 3);
  for (let v = 0; v < n; v++) {
    _a.fromBufferAttribute(pos, v);
    const nz = nrm.getZ(v);
    const front = Math.abs(nz) > 0.85;
    const t = front ? face : core;
    const wx = _a.x + p.position.x;
    const wy = _a.y + p.position.y;
    uv[v * 2] = (front ? (nz > 0 ? wx : -wx) : Math.abs(nrm.getX(v)) > Math.abs(nrm.getY(v)) ? _a.z + wy : wx + _a.z) * PW_TPM;
    uv[v * 2 + 1] = (front ? wy : Math.abs(nrm.getY(v)) > 0.7 ? _a.z : wy) * PW_TPM;
    rect.set(pwRect(t, true), v * 4);
    if (front) col.set([Math.round(tint.r * 255), Math.round(tint.g * 255), Math.round(tint.b * 255)], v * 3);
    else col.set([255, 255, 255], v * 3);
  }
  g.setAttribute('pwUv', new THREE.BufferAttribute(uv, 2));
  g.setAttribute('pwRect', new THREE.BufferAttribute(rect, 4));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3, true));
  Kit.track(g);
  return g;
}

/** The basement's tagged objects. */
function handleBasement(tc: TagCtx): boolean | undefined {
  const { pw, o, b, m, info } = tc;
  const a = pw.atlas;
  switch (info.kind) {
    case 'puddle': {
      if (!info.indoor) return undefined;
      _p.setFromMatrixPosition(m);
      b.rect(_o.set(_p.x - 1, _p.y + 0.004 + (pw.nDecal++ % 3) * 0.001, _p.z + 0.625), X, NZ, 2, 1.25, puddleDecal(a, 2));
      return true;
    }
    case 'morgueWall': {
      const cols = info.cols as number;
      const rows = info.rows as number;
      const skip = new Set(info.skip as string[]);
      const w = cols * 0.78;
      // Drop the classic door boxes, handles and cards (the big cabinet box and the open slots stay).
      for (const c of [...o.children]) {
        const mt = (c as THREE.Mesh).material as THREE.MeshLambertMaterial | undefined;
        if (c === o.children[0]) continue;
        if (mt?.color?.getHex() === 0x0b0f10) continue;
        o.remove(c);
      }
      for (let cc = 0; cc < cols; cc++) {
        for (let r = 0; r < rows; r++) {
          if (skip.has(`${cc},${r}`)) continue;
          const cx = -w / 2 + 0.39 + cc * 0.78;
          const cy = 0.61 + r * 0.72;
          lay(b, m, _o.set(cx - 0.34, cy - 0.31, 0.012), X, Y, 0.68, 0.62, drawerFace(a, Math.floor(hash2(cc, r, 7) * 3)));
        }
      }
      return false;
    }
    case 'step': {
      const w = info.w as number;
      const h = info.h as number;
      lay(b, m, _o.set(-w / 2, h / 2 + 0.003, 0.15), X, NZ, w, 0.3, z2TreadTile(a, { hex: 0x6a6c66 }));
      return false;
    }
    case 'nosing':
      return true;
    default:
      return undefined;
  }
}

/** The basement's own surfaces: painted block, the morgue's and the theatre's glazed tiles, quarry tile, terrazzo, concrete. */
function pickBasement(pw: Z2PixelWorld, q: PickQuery): Pick | null | undefined {
  const a = pw.atlas;
  const { hex } = q;
  switch (q.preset) {
    case 'tiles|1.2|0.62':
      return BASEMENT_GLAZED.has(hex) ? own(z2GlazedTile(a, { hex, ...GLAZED[hex] })) : undefined;
    case 'brick|1.25|0.5':
      if (hex === 0x3f5a4e || hex === 0x6a6c66) return own(z2BlockTile(a, { hex }));
      return neutral(z2BlockTile(a, { hex: NEUTRAL_HEX }), hex);
    case 'concrete|1|0.8':
      return neutral(z2ConcreteTile(a, { hex: NEUTRAL_HEX, joints: true }), hex);
    case 'tiles|0.5|0.85':
      return own(z2FloorTileTile(a, { hex }));
    case 'asphalt|1.6|0.6':
      return own(z2TerrazzoTile(a, { hex, chips: [0x3a6a5a, 0xd8dcd0] }));
    default:
      return undefined;
  }
}

/** The morgue's and the theatre's wall tiles (the clinic's wainscots are pwShell's). */
const BASEMENT_GLAZED = new Set([0x587478, 0x9fb2b4, 0x2a6a56, 0x3a7462]);

export function registerBasement(reg: Z2Registry) {
  reg.tag(['puddle', 'morgueWall', 'step', 'nosing'], handleBasement);
  reg.pick(pickBasement);
  reg.into(boards);
  // The boiler wall's broken cores (laid when it is painted, after the build).
  reg.prebuild((pw) => void z2RubbleTile(pw.atlas), 1);
}
