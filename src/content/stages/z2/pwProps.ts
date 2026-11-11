import * as THREE from 'three';
import { pwRect, type PwTile } from '../../pixelworld/atlas';
import { planarUv, type PwBatch } from '../../pixelworld/batch';
import { PW_TPM } from '../../pixelworld/canvas';
import { pwMaterial } from '../../pixelworld/material';
import { NEUTRAL_HEX } from '../../pixelworld/retexture';
import { grateTile, hash2, hazardTile } from '../../pixelworld/surfaces';
import { z2BloodTile, z2CurtainTile, z2EnamelTile, z2LinenTile, z2PlainTile, z2SteelTile, z2VeneerTile } from '../../pixelworld/z2surfaces';
import { z2CylTile, z2FireDoorLeaf, z2PedestalFace } from '../../pixelworld/z2objects';
import { z2InstrumentsDecal, z2SterileField } from '../../pixelworld/z2bay';
import { bloodPoolDecal, drainDecal } from '../../pixelworld/z2decals';
import { bedBoard, bedHeadUnit, clockFace, shelfFront, emergencyLampFace, extinguisherMod, monitorFace, tvBroadcast, vendingFront, whiteboardFace, xrayFace, doorLeaf } from '../../pixelworld/z2modules';
import { bedsideSprite, binSprite, bodyBagSprite, coneSprite, drumSprite, filingSprite, corpseSprite, crashCartSprite, ivSprite, laundrySprite, potSprite, trolleySprite, wheelchairSprite } from '../../pixelworld/z2props';
import { anesthesiaFront, autopsyTop, chairBack, chairEdge, chairSeat, chairShell, counterFront, deadArmSprite, drapeTop, hemTile, openCavity, sheetTile, toeTag } from '../../pixelworld/z2furniture';
import type { Z2PixelWorld } from './pixel';
import { isGlow, lay, neutral, NX, NZ, own, tintHex, X, Y, Z, type Pick, type PickQuery, type TagCtx, type Z2Registry } from './pwCore';

/**
 * ST. MERCY HOSPITAL in PIXEL WORLD — FURNITURE and PROPS of the whole stage:
 * gurneys, beds, counters, chairs, vending machines, shelves, tables, the
 * billboard props, wall fixtures, the fire doors; the breakable doors and the
 * cylinders painted on their own triangles; and the generic materials.
 */

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
const _n = new THREE.Vector3();
const _e1 = new THREE.Vector3();
const _e2 = new THREE.Vector3();
const _col = new THREE.Color();
const _base = new THREE.Color();
const _o = new THREE.Vector3();
const _p = new THREE.Vector3();
const _mm = new THREE.Matrix4();
const _t4 = new THREE.Matrix4();
const _r4 = new THREE.Matrix4();
const _q = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];

/** Blood colours (C.blood, C.bloodFresh, C.bloodDark, the flesh-dark smears). */
const BLOOD_HEX = new Set([0x5c0909, 0x7e0d0d, 0x3a0505]);


/**
 * A body under a sheet, head to foot (gurney frame: head at z −0.52, feet at
 * z 0.86, the sheet at y 0.97): sections [z, height above the sheet, half
 * width] for the draped mounds (head, then shoulders → chest → hips → knees →
 * toes pushing the sheet up → the end).
 */
const BODY_HEAD = [[-0.66, 0.07, 0.06], [-0.62, 0.15, 0.12], [-0.5, 0.18, 0.14], [-0.4, 0.13, 0.1], [-0.36, 0.06, 0.06]];
const BODY_TORSO = [[-0.38, 0.02, 0.12], [-0.3, 0.15, 0.24], [-0.05, 0.18, 0.24], [0.25, 0.14, 0.22], [0.5, 0.09, 0.18], [0.7, 0.07, 0.15], [0.8, 0.14, 0.15], [0.88, 0.11, 0.12], [0.92, 0.01, 0.1]];

// ─── Breakable doors (Destructibles: re-painted in place, hit boxes untouched) ──

/**
 * Re-paint a baked door model in place: every Lambert mesh keeps its
 * triangles (the Destructible's hit boxes stay exactly the classic ones) and
 * gets PixelWorld attributes — the faces looking along ±z show the painted
 * leaf projected through them (slab, kick plate, window and handle all line
 * up with it), the edges a tinted enamel. (`ox`, `oy`: the leaf's origin in
 * the model's frame — 0, 0 for the classic hinge frame.)
 */
export function paintDoor(pw: Z2PixelWorld, root: THREE.Object3D, w: number, h: number, color: number, ox = 0, oy = 0) {
  if (!pw.atlas.built) return;
  const leaf = doorLeaf(pw.atlas, color);
  const edge = z2EnamelTile(pw.atlas, { hex: NEUTRAL_HEX });
  const edgeTint = new THREE.Color(tintHex(color, NEUTRAL_HEX));
  const mat = pwMaterial(pw.atlas);
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || (m.material as THREE.Material).userData.pixelWorld || !(m.material as THREE.MeshLambertMaterial).isMeshLambertMaterial) return;
    const g = m.geometry;
    if (g.index) return;
    const pos = g.getAttribute('position');
    const n = pos.count;
    const uv = new Float32Array(n * 2);
    const rect = new Int16Array(n * 4);
    const col = new Uint8Array(n * 3);
    for (let i = 0; i + 2 < n; i += 3) {
      _a.fromBufferAttribute(pos, i);
      _b.fromBufferAttribute(pos, i + 1);
      _c.fromBufferAttribute(pos, i + 2);
      _e1.subVectors(_b, _a);
      _e2.subVectors(_c, _a);
      _n.crossVectors(_e1, _e2).normalize();
      const front = Math.abs(_n.z) > 0.7;
      for (let k = 0; k < 3; k++) {
        const v = i + k;
        const p = k === 0 ? _a : k === 1 ? _b : _c;
        if (front) {
          // Leaf texels across the face (the back face mirrored so the hinge side matches).
          const u = ((p.x - ox) / w) * leaf.w;
          uv[v * 2] = _n.z > 0 ? u : leaf.w - u;
          uv[v * 2 + 1] = ((p.y - oy) / h) * leaf.h;
          rect.set(pwRect(leaf, false), v * 4);
          col.set([255, 255, 255], v * 3);
        } else {
          const [pu, pv] = planarUv(p, _n, PW_TPM);
          uv[v * 2] = pu;
          uv[v * 2 + 1] = pv;
          rect.set(pwRect(edge, true), v * 4);
          col.set([Math.round(edgeTint.r * 255), Math.round(edgeTint.g * 255), Math.round(edgeTint.b * 255)], v * 3);
        }
      }
    }
    g.setAttribute('pwUv', new THREE.BufferAttribute(uv, 2));
    g.setAttribute('pwRect', new THREE.BufferAttribute(rect, 4));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3, true));
    m.material = mat;
  });
}

/**
 * The gas / oxygen cylinders (Destructibles: every mesh is a hit box) painted
 * on their own triangles: the body wrapped in its cylinder tile (u round the
 * turn, v up), the shoulder / valve / base an enamel in their baked colour.
 */
export function paintTank(pw: Z2PixelWorld, root: THREE.Object3D, kind: 'gas' | 'oxygen') {
  if (!pw.atlas.built) return;
  const body = z2CylTile(pw.atlas, kind, kind === 'gas' ? 0xc22a1e : 0x1f8a3c);
  const enamel = z2EnamelTile(pw.atlas, { hex: NEUTRAL_HEX });
  const y0 = kind === 'gas' ? 0.02 : 0.025;
  const y1 = kind === 'gas' ? 1.22 : 1.175;
  const mat = pwMaterial(pw.atlas);
  _base.setHex(NEUTRAL_HEX);
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || !(m.material as THREE.MeshLambertMaterial).isMeshLambertMaterial || (m.material as THREE.Material).userData.pixelWorld) return;
    const g = m.geometry;
    const pos = g.getAttribute('position');
    const col0 = g.getAttribute('color');
    const n = pos.count;
    const uv = new Float32Array(n * 2);
    const rect = new Int16Array(n * 4);
    const col = new Uint8Array(n * 3);
    const index = g.index;
    const tris = index ? index.count : n;
    for (let i = 0; i + 2 < tris; i += 3) {
      const v = [index ? index.getX(i) : i, index ? index.getX(i + 1) : i + 1, index ? index.getX(i + 2) : i + 2];
      _a.fromBufferAttribute(pos, v[0]);
      _b.fromBufferAttribute(pos, v[1]);
      _c.fromBufferAttribute(pos, v[2]);
      _e1.subVectors(_b, _a);
      _e2.subVectors(_c, _a);
      _n.crossVectors(_e1, _e2).normalize();
      const cy = (_a.y + _b.y + _c.y) / 3;
      const side = Math.abs(_n.y) < 0.5 && cy > y0 && cy < y1;
      const us = [0, 0, 0];
      for (let kk = 0; kk < 3; kk++) {
        const p = kk === 0 ? _a : kk === 1 ? _b : _c;
        us[kk] = ((Math.atan2(p.x, p.z) / (Math.PI * 2)) + 1) % 1 * body.w;
      }
      if (Math.max(...us) - Math.min(...us) > body.w / 2) for (let kk = 0; kk < 3; kk++) if (us[kk] < body.w / 2) us[kk] += body.w;
      for (let kk = 0; kk < 3; kk++) {
        const vi = v[kk];
        const p = kk === 0 ? _a : kk === 1 ? _b : _c;
        if (side) {
          uv[vi * 2] = us[kk];
          uv[vi * 2 + 1] = (p.y - y0) * PW_TPM;
          rect.set(pwRect(body, true), vi * 4);
          col.set([255, 255, 255], vi * 3);
        } else {
          const [pu, pv] = planarUv(p, _n, PW_TPM);
          uv[vi * 2] = pu;
          uv[vi * 2 + 1] = pv;
          rect.set(pwRect(enamel, true), vi * 4);
          if (col0) _col.setRGB(col0.getX(vi), col0.getY(vi), col0.getZ(vi));
          else _col.copy((m.material as THREE.MeshLambertMaterial).color);
          col.set([Math.round(Math.min(1, _col.r / _base.r) * 255), Math.round(Math.min(1, _col.g / _base.g) * 255), Math.round(Math.min(1, _col.b / _base.b) * 255)], vi * 3);
        }
      }
    }
    g.setAttribute('pwUv', new THREE.BufferAttribute(uv, 2));
    g.setAttribute('pwRect', new THREE.BufferAttribute(rect, 4));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3, true));
    m.material = mat;
  });
}

/**
 * A draped mound (a body under a sheet) in frame `m`: hexagonal sections
 * [z, height above `base`, half width] joined by quads, the ends capped;
 * the sheet tile mapped at world scale across and along it. `zf` maps the
 * section z (gurney frame) into the object's frame.
 */
function mound(b: PwBatch, m: THREE.Matrix4, tile: PwTile, base: number, secs: number[][], zf: (z: number) => number) {
  const XS = [-1, -0.75, -0.4, 0.4, 0.75, 1];
  const YS = [0, 0.7, 1, 1, 0.7, 0];
  const pt = (s: number[], i: number, out: THREE.Vector3) => out.set(XS[i] * s[2], base + YS[i] * s[1], zf(s[0]));
  b.setMatrix(m);
  for (let k = 0; k + 1 < secs.length; k++) {
    const s0 = secs[k];
    const s1 = secs[k + 1];
    const v0 = zf(s0[0]) * PW_TPM;
    const v1 = zf(s1[0]) * PW_TPM;
    let ua = 0;
    let ub = 0;
    for (let i = 0; i + 1 < XS.length; i++) {
      pt(s0, i, _q[0]);
      pt(s1, i, _q[1]);
      pt(s1, i + 1, _q[2]);
      pt(s0, i + 1, _q[3]);
      const la = _q[0].distanceTo(_q[3]) * PW_TPM;
      const lb = _q[1].distanceTo(_q[2]) * PW_TPM;
      b.quad(_q[0], _q[1], _q[2], _q[3], tile, [ua, v0, ub, v1, ub + lb, v1, ua + la, v0]);
      ua += la;
      ub += lb;
    }
  }
  // End caps (fans): the first faces −z, the last +z.
  for (const [s, rev] of [[secs[0], false], [secs[secs.length - 1], true]] as const) {
    for (let i = 1; i + 1 < XS.length; i++) {
      pt(s, 0, _q[0]);
      pt(s, rev ? i + 1 : i, _q[1]);
      pt(s, rev ? i : i + 1, _q[2]);
      b.tri(_q[0], _q[1], _q[2], tile, [_q[0].x * PW_TPM, _q[0].y * PW_TPM, _q[1].x * PW_TPM, _q[1].y * PW_TPM, _q[2].x * PW_TPM, _q[2].y * PW_TPM]);
    }
  }
  b.setMatrix(null);
}

/** Furniture, fixtures and props. */
function handleProps(tc: TagCtx): boolean | undefined {
  const { pw, o, b, m, info, hsh } = tc;
  const a = pw.atlas;
  switch (info.kind) {
    case 'monitor': {
      const t = monitorFace(a, info.on as boolean, info.color as number);
      lay(b, m, _o.set(-0.22, 0.01, 0.062), X, Y, 14 / PW_TPM, 10 / PW_TPM, t);
      for (const c of [...o.children]) if (isGlow(c) || c.position.z > 0.05) o.remove(c);
      return false;
    }
    case 'clock':
      lay(b, m, _o.set(-13 / 64, -13 / 64, 0.058), X, Y, 13 / PW_TPM, 13 / PW_TPM, clockFace(a));
      return true;
    case 'whiteboard':
      lay(b, m, _o.set(-25 / PW_TPM, -16 / PW_TPM, 0.035), X, Y, 50 / PW_TPM, 32 / PW_TPM, whiteboardFace(a));
      return true;
    case 'elamp':
      lay(b, m, _o.set(-0.125, -0.2, 0.075), X, Y, 8 / PW_TPM, 8 / PW_TPM, emergencyLampFace(a));
      return true;
    case 'fireExt':
      lay(b, m, _o.set(-6 / PW_TPM, -0.07, 0.03), X, Y, 12 / PW_TPM, 36 / PW_TPM, extinguisherMod(a));
      return true;
    case 'tv':
      lay(b, m, _o.set(-0.75, -0.44, 0.06), X, Y, 1.5, 28 / PW_TPM, tvBroadcast(a));
      for (const c of [...o.children]) if (isGlow(c) || c.type === 'Group') o.remove(c);
      return false;
    case 'xray':
      lay(b, m, _o.set(-0.66, -0.44, 0.03), X, Y, 42 / PW_TPM, 28 / PW_TPM, xrayFace(a, info.v as number));
      return true;
    case 'xrayFilm':
      return true;
    case 'vending': {
      const t = vendingFront(a, info.color as number, info.lit as boolean, (info.color as number) === 0x2a4a9a ? 1 : 0);
      lay(b, m, _o.set(-0.5, 0, 0.428), X, Y, 1.0, 62 / PW_TPM, t);
      // Keep the cabinet (re-painted); the front's classic details go.
      for (const c of [...o.children]) if (c.position.z > 0.42 || isGlow(c)) o.remove(c);
      return false;
    }
    case 'wheelchair':
    case 'iv':
    case 'bin':
    case 'crashCart':
    case 'laundryCart':
    case 'trolley':
    case 'plant':
    case 'bedside':
    case 'filing':
    case 'drum':
    case 'cone': {
      const t =
        info.kind === 'wheelchair' ? wheelchairSprite(a, info.tipped as boolean)
        : info.kind === 'iv' ? ivSprite(a, (info.liquid as number) === 0x9a1a1a || (info.liquid as number) === 0xa82020)
        : info.kind === 'bin' ? binSprite(a, info.tipped as boolean)
        : info.kind === 'crashCart' ? crashCartSprite(a)
        : info.kind === 'laundryCart' ? laundrySprite(a)
        : info.kind === 'trolley' ? trolleySprite(a)
        : info.kind === 'plant' ? potSprite(a)
        : info.kind === 'bedside' ? bedsideSprite(a)
        : info.kind === 'filing' ? filingSprite(a)
        : info.kind === 'drum' ? drumSprite(a)
        : coneSprite(a);
      _p.setFromMatrixPosition(m);
      _p.y -= (info.foot as number | undefined) ?? 0;
      pw.bills.add(_p.x, _p.y, _p.z, t, t.h / PW_TPM, { flip: hsh > 0.5 });
      return true;
    }
    case 'coneBase':
      return true;
    case 'fireDoor': {
      // Leaf 0.06 × 2.75 × 1.7 from z 0.03 (hinge at z 0): painted on both faces (hinges on the hinge
      // side); the classic vision panel box goes (the wired glass is in the leaf).
      for (const c of [...o.children]) if (((c as THREE.Mesh).material as THREE.MeshLambertMaterial | undefined)?.color?.getHex() === 0x101414) o.remove(c);
      const t = z2FireDoorLeaf(a, 0x9a2a22);
      lay(b, m, _o.set(0.032, 0, 1.73), NZ, Y, 1.7, 2.75, t);
      lay(b, m, _o.set(-0.032, 0, 0.03), Z, Y, 1.7, 2.75, t, { flipU: true });
      return false;
    }
    case 'bed': {
      lay(b, m, _o.set(-0.5, 0.42, 1.047), X, Y, 1.0, 0.45, bedBoard(a, true));
      lay(b, m, _o.set(-0.5, 0.4, -0.988), X, Y, 1.0, 0.78, bedBoard(a, false));
      // Against the wall (yaw 0 / π): the bed-head gas and power unit on the wall behind it.
      const yaw = Math.atan2(m.elements[8], m.elements[10]);
      if (Math.abs(Math.sin(yaw)) < 0.05) lay(b, m, _o.set(-0.81, 1.2, -1.064), X, Y, 52 / PW_TPM, 0.5, bedHeadUnit(a));
      return false;
    }
    case 'shelf': {
      // (The tagged mesh's origin is the box centre: 1.1 × 2.0 × 0.45, front at local +z.)
      lay(b, m, _o.set(-0.55, -1.0, 0.228), X, Y, 1.1, 2.0, shelfFront(a, info.v as number));
      return false;
    }
    case 'chairs': {
      const hex = info.color as number;
      const n = info.n as number;
      const missing = info.missing as number[];
      // The classic cushions go (boxes in the chairs' cloth); the steel beam and legs stay.
      for (const c of [...o.children]) if (((c as THREE.Mesh).material as THREE.MeshLambertMaterial | undefined)?.color?.getHex() === hex) o.remove(c);
      const w = 0.56;
      const x0 = (-(n - 1) * w) / 2;
      const edge = chairEdge(a, hex);
      const side = z2LinenTile(a, { hex });
      const shell = chairShell(a);
      for (let i = 0; i < n; i++) {
        if (missing.includes(i)) continue;
        const cx = x0 + i * w;
        const v = Math.floor(hash2(Math.round(m.elements[12] * 5) + i * 7, Math.round(m.elements[14] * 5), 71) * 5);
        b.setMatrix(m);
        b.box(cx, 0.45, 0.02, 0.5, 0.06, 0.46, { py: chairSeat(a, hex, v === 3 ? 1 : v === 4 ? 2 : 0), pz: edge, px: side, nx: side, nz: side });
        // Back rest: painted front and shell, cut-out rounded shoulders; thin sides and top.
        _mm.copy(m).multiply(_t4.makeTranslation(cx, 0.72, -0.22)).multiply(_r4.makeRotationX(-0.12));
        b.setMatrix(_mm);
        b.rect(_o.set(-0.25, -0.24, 0.026), X, Y, 0.5, 0.48, chairBack(a, hex, v % 3), { flipU: hash2(i, Math.round(m.elements[12] * 3), 73) > 0.5 });
        b.rect(_o.set(0.25, -0.24, -0.026), NX, Y, 0.5, 0.48, shell);
        b.rect(_o.set(0.25, -0.24, 0.026), NZ, Y, 0.052, 0.42, side);
        b.rect(_o.set(-0.25, -0.24, -0.026), Z, Y, 0.052, 0.42, side);
        b.rect(_o.set(-0.22, 0.24, 0.026), X, NZ, 0.44, 0.052, side);
        b.setMatrix(null);
      }
      return false;
    }
    case 'gurney': {
      // (Tipped: the frame hangs under a rotated child group.)
      const r = info.tipped ? o.children[0] : o;
      const mr = new THREE.Matrix4().multiplyMatrices(tc.inv, r.matrixWorld);
      const hex = (info.sheet as number | undefined) ?? 0xc8d2cc;
      const body = !!info.body;
      const bloody = !!info.blood;
      // Sheet, lumps, blood slabs and the grey arm go; the frame, mattress and pillow stay.
      for (const c of [...r.children]) {
        const hx = ((c as THREE.Mesh).material as THREE.MeshLambertMaterial | undefined)?.color?.getHex();
        if (hx !== undefined && (hx === hex || hx === 0x8a9488 || BLOOD_HEX.has(hx))) r.remove(c);
      }
      const plain = sheetTile(a, hex, false);
      const soaked = bloody ? sheetTile(a, hex, true) : plain;
      b.setMatrix(mr);
      b.rect(_o.set(-0.3, 0.97, 0.92), X, NZ, 0.6, 1.6, soaked, { u0: Math.floor(hsh * 64) });
      if (!info.tipped) {
        const hem = hemTile(a, hex);
        b.rect(_o.set(0.302, 0.69, 0.92), NZ, Y, 1.6, 0.28, hem, { v0: 7 });
        b.rect(_o.set(-0.302, 0.69, -0.68), Z, Y, 1.6, 0.28, hem, { v0: 7, u0: 23 });
        b.rect(_o.set(-0.302, 0.69, 0.922), X, Y, 0.604, 0.28, hem, { v0: 7, u0: 41 });
      }
      b.setMatrix(null);
      if (body) {
        mound(b, mr, plain, 1.0, BODY_HEAD, (z) => z);
        mound(b, mr, soaked, 0.97, BODY_TORSO, (z) => z);
        if (!info.tipped) {
          _p.set(0.33, 0.55, 0.1).applyMatrix4(mr);
          pw.bills.add(_p.x, _p.y, _p.z, deadArmSprite(a), 14 / PW_TPM);
        }
      }
      return false;
    }
    case 'autopsy': {
      const sheetHex = 0xb8c4c0;
      if (info.body) {
        for (const c of [...o.children]) {
          const hx = ((c as THREE.Mesh).material as THREE.MeshLambertMaterial | undefined)?.color?.getHex();
          if (hx === sheetHex || hx === 0xd8d0c0 || hx === 0x7e0d0d) o.remove(c);
        }
      }
      lay(b, m, _o.set(-0.44, 0.8805, 1.0), X, NZ, 0.88, 2.0, autopsyTop(a));
      // The pedestal: brushed steel faces (seam, drain valve, rust ring, blood runs).
      lay(b, m, _o.set(-0.16, 0, 0.163), X, Y, 0.32, 0.8, z2PedestalFace(a, 0));
      lay(b, m, _o.set(0.16, 0, -0.163), NX, Y, 0.32, 0.8, z2PedestalFace(a, 1));
      lay(b, m, _o.set(0.163, 0, 0.16), NZ, Y, 0.32, 0.8, z2PedestalFace(a, 2));
      lay(b, m, _o.set(-0.163, 0, -0.16), Z, Y, 0.32, 0.8, z2PedestalFace(a, 1));
      if (info.body) {
        // Head at z −0.72, feet at 0.82 on the table (top 0.88, inside the rims).
        const zf = (z: number) => -0.72 + (z + 0.52) * (1.54 / 1.38);
        const sheet = sheetTile(a, sheetHex, false);
        mound(b, m, sheet, 0.9, BODY_HEAD, zf);
        mound(b, m, sheet, 0.89, BODY_TORSO, zf);
        b.setMatrix(m);
        b.rect(_o.set(0.04, 0.9, 1.0), X, Y, 0.19, 0.125, toeTag(a));
        if (info.open) {
          // The Y-cut on the chest: on the mound's flat top between its chest sections.
          const [s0, s1] = [BODY_TORSO[2], BODY_TORSO[3]];
          const y0 = 0.89 + s0[1] + 0.004;
          const y1 = 0.89 + s1[1] + 0.004;
          const w0 = s0[2] * 0.4;
          const w1 = s1[2] * 0.4;
          _q[0].set(-w1, y1, zf(s1[0]));
          _q[1].set(w1, y1, zf(s1[0]));
          _q[2].set(w0, y0, zf(s0[0]));
          _q[3].set(-w0, y0, zf(s0[0]));
          b.quad(_q[0], _q[1], _q[2], _q[3], openCavity(a), [0, 0, 16, 0, 16, 16, 0, 16]);
        }
        b.setMatrix(null);
      }
      return false;
    }
    case 'opTable': {
      const drape = 0x6a9a8a;
      // The sterile field taped round the table, instruments dropped by it.
      lay(b, m, _o.set(-1.5, 0.006, 2), X, NZ, 3, 4, z2SterileField(a));
      lay(b, m, _o.set(0.6, 0.008, 1.4), X, NZ, 0.75, 0.5, z2InstrumentsDecal(a));
      lay(b, m, _o.set(-1.2, 0.008, -0.6), X, NZ, 0.6, 0.6, drainDecal(a));
      for (const c of [...o.children]) {
        const hx = ((c as THREE.Mesh).material as THREE.MeshLambertMaterial | undefined)?.color?.getHex();
        if (hx !== undefined && BLOOD_HEX.has(hx)) o.remove(c);
      }
      b.setMatrix(m);
      b.rect(_o.set(-0.36, 0.931, 1.05), X, NZ, 0.72, 2.0, drapeTop(a, drape));
      const hem = hemTile(a, drape);
      b.rect(_o.set(0.362, 0.65, 1.05), NZ, Y, 2.0, 0.28, hem, { v0: 7 });
      b.rect(_o.set(-0.362, 0.65, -0.95), Z, Y, 2.0, 0.28, hem, { v0: 7, u0: 29 });
      b.setMatrix(null);
      return false;
    }
    case 'anesthesia':
      // Cabinet 0.7 × 1.2 × 0.6 from y 0.1, front at z 0.3 (its screen block above stays).
      lay(b, m, _o.set(-0.35, 0.1, 0.302), X, Y, 0.7, 1.2, anesthesiaFront(a));
      return false;
    case 'counter': {
      const w = info.w as number;
      // (Each counter starts the 4 m front at its own place: the stickers and dents never line up.)
      lay(b, m, _o.set(-w / 2, 0, 0.462), X, Y, w, 1.1, counterFront(a, 0x5c7a74), { u0: Math.floor(hsh * 128) });
      return false;
    }
    case 'corpse':
    case 'bodyBag': {
      _p.setFromMatrixPosition(m);
      const t = info.kind === 'corpse' ? corpseSprite(a, info.shirt as number, hsh > 0.5 ? 1 : 0) : bodyBagSprite(a);
      pw.bills.add(_p.x, _p.y, _p.z, t, t.h / PW_TPM, { flip: hsh > 0.5 });
      if (info.kind === 'corpse') {
        const pt = bloodPoolDecal(a, 2);
        const ptw = pt.w / pt.density;
        const pth = pt.h / pt.density;
        b.rect(_o.set(_p.x - ptw / 2, _p.y + 0.009 + (pw.nDecal++ % 3) * 0.001, _p.z + pth / 2), X, NZ, ptw, pth, pt);
      }
      return true;
    }
    default:
      return undefined;
  }
}

/** The generic materials (steel, enamel, linen, veneer, grates, hazard stripes, plain colours): the last rule asked. */
function pickProps(pw: Z2PixelWorld, q: PickQuery): Pick | null | undefined {
  const a = pw.atlas;
  const { hex, tex } = q;
  switch (q.preset) {
    case 'wallpaper|0.7|0.55':
      return neutral(z2CurtainTile(a, { hex: NEUTRAL_HEX }), hex);
    case 'metal|2|0.5':
      return neutral(z2SteelTile(a, { hex: NEUTRAL_HEX }), hex);
    case 'metal|1.5|0.32':
    case 'metal|1|0.3':
      return neutral(z2EnamelTile(a, { hex: NEUTRAL_HEX }), hex);
    case 'cloth|0.5|0.55':
      return neutral(z2LinenTile(a, { hex: NEUTRAL_HEX }), hex);
    case 'planks|1.2|0.35':
      return neutral(z2VeneerTile(a, { hex: NEUTRAL_HEX }), hex);
    case 'grate|1.5|0.9':
      return own(grateTile(a, { hex }));
    case 'hazard|1|0.7':
      return own(hazardTile(a, {}));
    case 'corrugated|1.2|0.5':
      return neutral(z2EnamelTile(a, { hex: NEUTRAL_HEX }), hex);
    case 'skin|0.7|0.65':
      return neutral(z2LinenTile(a, { hex: NEUTRAL_HEX }), hex);
    default:
      break;
  }
  if (tex === 'grain' || tex === undefined) {
    // Untextured colours: rubber, dark fixtures, blood slabs.
    if (BLOOD_HEX.has(hex)) return own(z2BloodTile(a, { hex }));
    return neutral(z2PlainTile(a, { hex: NEUTRAL_HEX }), hex);
  }
  if (tex === 'water') return own(z2PlainTile(a, { hex }));
  return neutral(z2PlainTile(a, { hex: NEUTRAL_HEX }), hex);
}

export function registerProps(reg: Z2Registry) {
  reg.tag(
    [
      'monitor', 'clock', 'whiteboard', 'elamp', 'fireExt', 'tv', 'xray', 'xrayFilm', 'vending',
      'wheelchair', 'iv', 'bin', 'crashCart', 'laundryCart', 'trolley', 'plant', 'bedside', 'filing', 'drum', 'cone', 'coneBase',
      'fireDoor', 'bed', 'shelf', 'chairs', 'gurney', 'autopsy', 'opTable', 'anesthesia', 'counter', 'corpse', 'bodyBag',
    ],
    handleProps,
  );
  // The breakable doors' leaves and the cylinders (painted when they spawn, after the build).
  reg.prebuild((pw, dyn) => {
    for (const c of dyn.doorColors) doorLeaf(pw.atlas, c);
    z2CylTile(pw.atlas, 'gas', 0xc22a1e);
    z2CylTile(pw.atlas, 'oxygen', 0x1f8a3c);
    z2EnamelTile(pw.atlas, { hex: NEUTRAL_HEX }).neutral = NEUTRAL_HEX;
  }, 0);
}

/** The generic materials answer last (after every zone's own surfaces). */
export function registerPropsLast(reg: Z2Registry) {
  reg.pick(pickProps);
}
