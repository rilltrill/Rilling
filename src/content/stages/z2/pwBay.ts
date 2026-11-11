import * as THREE from 'three';
import type { PwTile } from '../../pixelworld/atlas';
import { PwBatch, planarUv } from '../../pixelworld/batch';
import { PW_TPM } from '../../pixelworld/canvas';
import { NEUTRAL_BRICK } from '../../pixelworld/retexture';
import { brickTile, curbTile, hash2, roadPaintTile } from '../../pixelworld/surfaces';
import { chainFenceTile } from '../../pixelworld/props';
import { drainpipeTile } from '../../pixelworld/facade';
import { Z2_PUDDLE_FRAMES, z2ManholeDecal, z2OilDecal, z2PatchDecal, z2PuddleTile, z2ReflectDecal, z2RoadStencil, z2SkidTile, z2WetAsphaltTile, type PuddleLight } from '../../pixelworld/z2bay';
import { drainDecal } from '../../pixelworld/z2decals';
import { copingTile, hospitalWindow, redCross, roofUnit, type HospWindowKind, type RoofKind } from '../../pixelworld/z2modules';
import { z2CylTile, z2VineModule, type CylKind } from '../../pixelworld/z2objects';
import { Z2Billboards } from '../../pixelworld/z2billboard';
import { ambulanceCabSide, ambulanceDoor, ambulanceFront, ambulanceSide, carCabin, carEnd, carSide } from '../../pixelworld/z2vehicles';
import type { Ambulance } from './props';
import type { Z2PixelWorld } from './pixel';
import { lay, neutral, neutral0, NX, NZ, own, tintHex, X, Y, Z, type Pick, type PickQuery, type TagCtx, type Z2Registry } from './pwCore';

/**
 * ST. MERCY HOSPITAL in PIXEL WORLD — the AMBULANCE BAY (beats 0–5): the wet
 * ground and its history, the facade's depth and roofline, the canopy's round
 * things, both ambulances, the parked cars and the fence.
 */

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
const _la = new THREE.Vector3();
const _lb = new THREE.Vector3();
const _lc = new THREE.Vector3();
const _n = new THREE.Vector3();
const _e1 = new THREE.Vector3();
const _e2 = new THREE.Vector3();
const _o = new THREE.Vector3();
const _u = new THREE.Vector3();
const _v = new THREE.Vector3();
const _p = new THREE.Vector3();

/** An animated puddle (frame 0's rect: the material steps through the strip) flat at (x, y, z). */
function puddle(pw: Z2PixelWorld, x: number, y: number, z: number, light: PuddleLight, v: number, w = 2, d = 1.25) {
  const t = z2PuddleTile(pw.atlas, light, v);
  pw.animOf().rect(_o.set(x - w / 2, y + 0.004 + (pw.nDecal++ % 3) * 0.001, z + d / 2), X, NZ, w, d, t, { sub: { x: 0, y: 0, w: t.w, h: t.h / Z2_PUDDLE_FRAMES } });
}

/** Which light a bay puddle mirrors (by where it lies: the canopy's red, the wing's cyan sign, windows, sky). */
function puddleLight(x: number, z: number, h: number): PuddleLight {
  if (Math.abs(x) < 11 && z < -6 && z > -26) return 'red';
  if (x < -9 && z < 2) return 'cyan';
  return h > 0.5 ? 'warm' : 'sky';
}

/**
 * The bay's wet ground by rule: puddles along the canopy's drip line and the
 * kerb, round the drains; the long broken reflections of the EMERGENCY and
 * OUTPATIENTS neon on the wet asphalt.
 */
function bayGround(pw: Z2PixelWorld, b: PwBatch) {
  const a = pw.atlas;
  // Drip line under the canopy's front edge, and the kerb's gutter.
  for (const [x, z, w, d] of [[-7.2, -9.4, 2.2, 1.1], [-1.5, -9.2, 1.6, 0.9], [4.4, -9.5, 2.4, 1.2], [8.9, -9.1, 1.4, 0.8], [-12.5, -21.3, 2.4, 1.0], [12.8, -21.2, 1.8, 0.8], [-6.6, -21.3, 1.4, 0.7]] as const) {
    puddle(pw, x, 0, z, puddleLight(x, z, 0), 0, w, d);
  }
  // Drains (grates in the gutter / the apron), each in its puddle.
  for (const [x, z] of [[-9.5, -21.5], [9.6, -21.5], [-2, 6]] as const) {
    const t = drainDecal(a);
    b.rect(_o.set(x - 0.3, 0.007, z + 0.3), X, NZ, 0.6, 0.6, t);
    puddle(pw, x + 0.2, 0, z + 0.2, puddleLight(x, z, 0.8), 0, 2.4, 1.4);
  }
  // Neon reflections on the wet ground: long narrow streaks from under the signs toward the eye.
  // (Half density: chunky shimmer dashes, a quarter of the texels.)
  b.rect(_o.set(-3.4, 0.009, -10.2 + 2.4), X, NZ, 6.8, 2.4, z2ReflectDecal(a, 0xff3a2a, 109, 38));
  b.rect(_o.set(-17.7 + 2.2, 0.009, -8 + 2.2), NZ, NX, 4.4, 2.2, z2ReflectDecal(a, 0x8ad8ff, 70, 35));
  // Asphalt with a history (placed, never in the repeat): cut patches, oil where vehicles stood,
  // manholes, a skid curving down the drive.
  const flat = (x: number, z: number, t: PwTile, ang = 0, y = 0.005) => {
    const w = t.w / PW_TPM;
    const h = t.h / PW_TPM;
    const c = Math.cos(ang);
    const sn = Math.sin(ang);
    _u.set(c, 0, sn);
    _v.set(sn, 0, -c);
    _o.set(x, y + (pw.nDecal++ % 4) * 0.0008, z).addScaledVector(_u, -w / 2).addScaledVector(_v, -h / 2);
    b.rect(_o, _u, _v, w, h, t);
  };
  for (const [x, z, v] of [[-9, 4, 0], [7, 14, 1], [-14, -12, 1], [13.5, -4, 0], [-2.5, 19, 1]] as const) flat(x, z, z2PatchDecal(a, 0x3a3e46, 0), v ? Math.PI / 2 : 0, 0.003);
  [[-5.5, -16.5], [6.2, -13.8], [-12, -2], [10, 9], [-8.5, 12], [4.5, -3.5]].forEach(([x, z], i) => flat(x, z, z2OilDecal(a, i % 3), i * 0.9));
  for (const [x, z] of [[8, -1], [-6, 9]]) flat(x, z, z2ManholeDecal(a));
  const skid: THREE.Vector3[] = [];
  for (let i = 0; i <= 12; i++) {
    const t = i / 12;
    skid.push(new THREE.Vector3(2.5 - t * 6 + Math.sin(t * 3.1) * 2.2, 0.006, 17 - t * 15));
  }
  b.ribbon(skid, 1.5, z2SkidTile(a, 0x3a3e46));
}

/**
 * The facade's depth: stone string courses at the floor lines, downpipes
 * between the bays, dead creeper climbing the corners.
 */
function facadeDetail(pw: Z2PixelWorld, b: PwBatch) {
  const a = pw.atlas;
  const course = copingTile(a);
  for (const y of [4.95, 8.0, 11.3]) b.rect(_o.set(-34, y, -25.79), X, Y, 68, 0.25, course, { u0: 0, v0: 8 });
  const pipe = drainpipeTile(a, { hex: 0x4a5054 });
  for (const x of [-17.6, 17.6, -33.3, 33.3]) b.rect(_o.set(x - 0.25, 0.1, -25.78), X, Y, 0.5, 15.8, pipe);
  b.rect(_o.set(-31.5, 0, -25.77), X, Y, 2, 4, z2VineModule(a, 0));
  b.rect(_o.set(26.5, 0, -25.77), X, Y, 2, 4, z2VineModule(a, 0), { flipU: true });
}

/** Red neon spilling on the ground: under the canopy's EMERGENCY and at the entrance (additive stepped pools). */
function bayLights(pw: Z2PixelWorld, _b: PwBatch) {
  pw.job!.pools.push([0xff2a1a, 0, 0.011, -11.6, 15, 7, 0.5], [0xff3020, 0, 0.152, -24.4, 7, 3, 0.4]);
}

/**
 * A roofline that breaks the box against the sky: a brick parapet over the
 * wall's top, a lit coping, and rooftop clutter (AC units, vent stacks, a
 * water tank, a mast with a beacon, a stair house, a dish) standing behind it.
 * `axis` z: a facade at z = `face` facing +z, from a0 to a1 along x; x: a side
 * face at x = `face` facing +x, from a0 to a1 along z.
 */
function roofline(pw: Z2PixelWorld, b: PwBatch, a0: number, a1: number, top: number, face: number, axis: 'x' | 'z') {
  const a = pw.atlas;
  const brick = neutral0(brickTile(a, { hex: NEUTRAL_BRICK, grime: 0.7 }), NEUTRAL_BRICK);
  const tint = tintHex(axis === 'z' ? 0x8a5442 : 0x7a5446, NEUTRAL_BRICK);
  const len = a1 - a0;
  const ux = axis === 'z' ? X : NZ;
  const at = (u: number, y: number, off: number) => (axis === 'z' ? _o.set(a0 + u, y, face + off) : _o.set(face + off, y, a1 - u));
  // (Bricks continue the wall's own world-mapped courses: u from the wall's planar mapping.)
  const u0 = axis === 'z' ? a0 * PW_TPM : -a1 * PW_TPM;
  b.rect(at(0, top - 0.02, 0.012), ux, Y, len, 0.47, brick, { tint, u0: ((u0 % brick.w) + brick.w) % brick.w, v0: Math.round((top - 0.02) * PW_TPM) % brick.h });
  b.rect(at(0, top + 0.45, 0.02), ux, Y, len, 0.25, copingTile(a));
  // Clutter behind the parapet, spaced by hand-written hashes.
  const kinds: RoofKind[] = ['ac', 'stack', 'ac', 'tank', 'stack', 'mast', 'stairhouse', 'dish', 'ac', 'stack'];
  let u = 1.5;
  let i = 0;
  while (u < len - 2) {
    const kind = kinds[(i * 7 + Math.floor(hash2(i, Math.round(face), 3) * 5)) % kinds.length];
    const t = roofUnit(a, kind);
    const w = t.w / PW_TPM;
    const h = t.h / PW_TPM;
    if (u + w > len - 1) break;
    b.rect(at(u, top + 0.2, -0.6 - hash2(i, 2, 9) * 1.5), ux, Y, w, h, t);
    u += w + 1.5 + hash2(i, 7, 5) * 5;
    i++;
  }
}

// ─── Vehicles ────────────────────────────────────────────────────────────────

/** The crashing ambulance (dynamic): body and doors painted into batches that ride with them. */
export function paintAmbulance(pw: Z2PixelWorld, amb: Ambulance) {
  const body = new PwBatch(pw.atlas);
  pw.bills = new Z2Billboards();
  pw.jobs.push({ parent: amb.body, batch: body, bills: pw.bills, anim: null, pools: [], zone: '' });
  amb.body.updateMatrixWorld(true);
  for (const c of [...amb.body.children]) if (c.userData.pw?.kind === 'ambGrille') amb.body.remove(c);
  layAmbulanceBody(pw, body, new THREE.Matrix4());
  pw.emitAll(amb.body, body, 0, false, null);
  for (const [door, side] of [[amb.doorL, 1], [amb.doorR, -1]] as [THREE.Group, number][]) {
    const b = new PwBatch(pw.atlas);
    pw.jobs.push({ parent: door, batch: b, bills: new Z2Billboards(), anim: null, pools: [], zone: '' });
    layAmbulanceDoor(pw, b, new THREE.Matrix4(), side);
    pw.emitAll(door, b, 0, false, null);
  }
}

function layAmbulanceBody(pw: Z2PixelWorld, b: PwBatch, m: THREE.Matrix4) {
  const a = pw.atlas;
  lay(b, m, _o.set(-1.165, 0.45, -2.95), Z, Y, 4.0, 2.3, ambulanceSide(a, true));
  lay(b, m, _o.set(1.165, 0.45, 1.05), NZ, Y, 4.0, 2.3, ambulanceSide(a, false));
  lay(b, m, _o.set(-1.1, 0.45, 2.956), X, Y, 2.2, 1.35, ambulanceFront(a));
  lay(b, m, _o.set(-1.115, 0.45, 1.05), Z, Y, 1.9, 1.35, ambulanceCabSide(a, false));
  lay(b, m, _o.set(1.115, 0.45, 2.95), NZ, Y, 1.9, 1.35, ambulanceCabSide(a, true));
}

/** A rear door's outer face (door frame: hinge at 0, panel toward −side·x, outer face −z). */
function layAmbulanceDoor(pw: Z2PixelWorld, b: PwBatch, m: THREE.Matrix4, side: number) {
  const x0 = side > 0 ? 0 : 1.1;
  lay(b, m, _o.set(x0, 0, -0.036), NX, Y, 1.1, 2.2, ambulanceDoor(pw.atlas), { flipU: side < 0 });
}

/** The bay's tagged objects. */
function handleBay(tc: TagCtx): boolean | undefined {
  const { pw, o, b, m, info, hsh } = tc;
  const a = pw.atlas;
  switch (info.kind) {
    case 'text': {
      if (info.glow || info.text !== 'AMBULANCE') return undefined;
      // Road lettering: worn white paint, drawn tall (it is read at a grazing angle).
      const t = z2RoadStencil(a, info.text as string, 0xd0d0c0, 3);
      const w = t.w / PW_TPM;
      const h = t.h / PW_TPM;
      lay(b, m, _o.set(-w / 2, -h / 2, 0.004), X, Y, w, h, t);
      return true;
    }
    case 'crossBar':
    case 'skyline':
      return true;
    case 'win': {
      const on = info.on as boolean;
      const fl = info.fl as number;
      const kind: HospWindowKind = on ? (hsh > 0.66 ? 'blinds' : hsh > 0.33 ? 'curtain' : hsh > 0.18 ? 'figure' : 'lit') : hsh > 0.9 ? 'broken' : hsh > 0.82 && fl === 0 ? 'boarded' : hsh > 0.5 ? 'blinds' : 'dark';
      // A few painted variants only (each is a 56 × 68 module): the room colour follows the kind.
      const lit = !on ? 0x1a2434 : kind === 'figure' ? 0x9fc8b0 : kind === 'blinds' ? 0x8ab0d8 : 0xd8c890;
      const t = hospitalWindow(a, kind, lit, kind === 'dark' || kind === 'blinds' ? Math.floor(hsh * 7) % 2 : 0);
      // Window box front is at +0.05; the module covers the opening, its reveal, head and sill.
      lay(b, m, _o.set(-28 / PW_TPM, -1.06, -0.02), X, Y, 56 / PW_TPM, 68 / PW_TPM, t);
      return true;
    }
    case 'wingWin': {
      const on = info.on as boolean;
      const kind: HospWindowKind = on ? 'lit' : hsh > 0.85 ? 'broken' : hsh > 0.5 ? 'blinds' : 'dark';
      const t = hospitalWindow(a, kind, on ? 0xd8c890 : 0x1a2434, kind === 'dark' || kind === 'blinds' ? 1 : 0);
      // Box faces +X (the wing's side): lay in the box frame on its +x face.
      lay(b, m, _o.set(0.055, -1.06, 28 / PW_TPM), NZ, Y, 56 / PW_TPM, 68 / PW_TPM, t);
      return true;
    }
    case 'cross':
      lay(b, m, _o.set(-1.3, -1.3, 0.105), X, Y, 2.6, 2.6, redCross(a));
      return true;
    case 'puddle': {
      if (info.indoor) return undefined;
      _p.setFromMatrixPosition(m);
      // Outdoors: an animated mirror of the nearest light (rain rings spreading).
      const r = (info.r as number | undefined) ?? 1;
      puddle(pw, _p.x, _p.y, _p.z, puddleLight(_p.x, _p.z, hsh), 0, Math.max(1.4, r * 2.2), Math.max(0.8, r * 1.3));
      return true;
    }
    case 'fence': {
      _p.setFromMatrixPosition(m);
      const t = chainFenceTile(a, { hex: 0x8a9498, rust: 0.5 });
      b.rect(_o.set(_p.x - 0.02, 1.0, -25), Z, Y, 50, 1.5, t, { u0: 0, v0: 16 });
      b.rect(_o.set(_p.x + 0.02, 1.0, 25), NZ, Y, 50, 1.5, t, { u0: 0, v0: 16 });
      return true;
    }
    case 'ambulance': {
      // The parked ambulance: modules on the body's faces and the doors (meshes re-painted generically).
      layAmbulanceBody(pw, b, m);
      o.updateMatrixWorld(true);
      const amb = o as THREE.Group;
      amb.traverse((c) => {
        if (c.userData.pw?.kind === 'ambGrille') c.userData.pwDrop = true;
      });
      for (const c of [...amb.children[0].children]) {
        if (c.userData.pwDrop) amb.children[0].remove(c);
        if (c.type === 'Group' && c.children.length === 3) {
          const side = c.position.x > 0 ? 1 : -1;
          const dm = new THREE.Matrix4().multiplyMatrices(m, c.matrix);
          // (The door's frame is relative to the body, which sits at the root's origin.)
          layAmbulanceDoor(pw, b, dm, side);
        }
      }
      return false;
    }
    case 'car': {
      const col = info.color as number;
      lay(b, m, _o.set(-0.905, 0.3, -2.15), Z, Y, 4.3, 0.7, carSide(a, col));
      lay(b, m, _o.set(0.905, 0.3, 2.15), NZ, Y, 4.3, 0.7, carSide(a, col));
      lay(b, m, _o.set(-0.805, 1.0, -1.4), Z, Y, 2.2, 0.6, carCabin(a, col));
      lay(b, m, _o.set(0.805, 1.0, 0.8), NZ, Y, 2.2, 0.6, carCabin(a, col));
      lay(b, m, _o.set(-0.9, 0.3, 2.155), X, Y, 1.8, 0.7, carEnd(a, col, true));
      lay(b, m, _o.set(0.9, 0.3, -2.155), NX, Y, 1.8, 0.7, carEnd(a, col, false));
      return false;
    }
    default:
      return undefined;
  }
}

/** The bay's own surfaces: facade brick, wet asphalt, the kerb, worn lane paint. */
function pickBay(pw: Z2PixelWorld, q: PickQuery): Pick | null | undefined {
  const a = pw.atlas;
  switch (q.preset) {
    case 'brick|0.8|0.85':
      return neutral(brickTile(a, { hex: NEUTRAL_BRICK, grime: 0.7 }), q.hex, NEUTRAL_BRICK);
    case 'asphalt|1|0.9':
      return own(z2WetAsphaltTile(a, 0x3a3e46));
    case 'concrete|1|0.8':
      return q.hex === 0x8a8a80 ? own(curbTile(a, { hex: q.hex })) : undefined;
    default:
      break;
  }
  if ((q.tex === 'grain' || q.tex === undefined) && q.hex === 0xb8962a) return own(roadPaintTile(a, { hex: q.hex, wear: 0.6 }));
  return undefined;
}

/** Which painted cylinder a classic cylinder is (by its material preset and colour), or null. */
function cylKind(m: THREE.MeshLambertMaterial): CylKind | null {
  const k = `${m.userData.retroTex}|${m.userData.retroScale}|${m.userData.retroStrength}`;
  const hex = m.color.getHex();
  if (k === 'concrete|1|0.8' && hex === 0x7a7870) return 'pillar';
  if (k === 'hazard|1|0.7' && hex === 0xd0a82a) return 'collar';
  if (k === 'metal|1.5|0.32' && hex === 0xc9a227) return 'bollard';
  if (k === 'metal|1.5|0.32' && hex === 0x3a3e40) return 'post';
  return null;
}

/**
 * A cylinder (placed by `m`) with `tile` wrapped round it: u once round the
 * turn (the seam fixed), v up from its foot at the tile's density; the caps
 * from `pick` by their world normal (planar).
 */
function emitCylinder(b: PwBatch, geo: THREE.CylinderGeometry, m: THREE.Matrix4, tile: PwTile, pick: (nx: number, ny: number, nz: number) => Pick | null) {
  const p = geo.getAttribute('position');
  const index = geo.index!;
  const h = geo.parameters.height;
  const sy = Math.hypot(m.elements[4], m.elements[5], m.elements[6]);
  const prev = b.matrix.clone();
  b.setMatrix(null);
  const us = [0, 0, 0];
  for (let i = 0; i + 2 < index.count; i += 3) {
    const v = [index.getX(i), index.getX(i + 1), index.getX(i + 2)];
    _la.fromBufferAttribute(p, v[0]);
    _lb.fromBufferAttribute(p, v[1]);
    _lc.fromBufferAttribute(p, v[2]);
    _e1.subVectors(_lb, _la);
    _e2.subVectors(_lc, _la);
    _n.crossVectors(_e1, _e2);
    if (_n.lengthSq() < 1e-12) continue;
    _n.normalize();
    _a.copy(_la).applyMatrix4(m);
    _b.copy(_lb).applyMatrix4(m);
    _c.copy(_lc).applyMatrix4(m);
    if (Math.abs(_n.y) > 0.7) {
      // Caps: the material's own painted tile, planar in world space.
      _e1.subVectors(_b, _a);
      _e2.subVectors(_c, _a);
      _n.crossVectors(_e1, _e2).normalize();
      const pk = pick(_n.x, _n.y, _n.z);
      if (!pk) continue;
      const [ua, va] = planarUv(_a, _n, PW_TPM);
      const [ub, vb] = planarUv(_b, _n, PW_TPM);
      const [uc, vc] = planarUv(_c, _n, PW_TPM);
      const su = Math.floor(Math.min(ua, ub, uc) / pk.tile.w) * pk.tile.w;
      const sv = Math.floor(Math.min(va, vb, vc) / pk.tile.h) * pk.tile.h;
      b.tri(_a, _b, _c, pk.tile, [ua - su, va - sv, ub - su, vb - sv, uc - su, vc - sv], pk.tint);
      continue;
    }
    const L = [_la, _lb, _lc];
    for (let k = 0; k < 3; k++) us[k] = ((Math.atan2(L[k].x, L[k].z) / (Math.PI * 2) + 1) % 1) * tile.w;
    if (Math.max(us[0], us[1], us[2]) - Math.min(us[0], us[1], us[2]) > tile.w / 2) for (let k = 0; k < 3; k++) if (us[k] < tile.w / 2) us[k] += tile.w;
    b.tri(_a, _b, _c, tile, [us[0], (_la.y + h / 2) * sy * tile.density, us[1], (_lb.y + h / 2) * sy * tile.density, us[2], (_lc.y + h / 2) * sy * tile.density]);
  }
  b.setMatrix(prev);
}

export function registerBay(reg: Z2Registry) {
  reg.tag(['text', 'crossBar', 'skyline', 'win', 'wingWin', 'cross', 'puddle', 'fence', 'ambulance', 'car'], handleBay);
  reg.pick(pickBay);
  // Round things painted round: pillars, collars, bollards, posts (u round the turn, v up).
  reg.mesh(({ pw, b, mesh, mat, rel, pick }) => {
    const ck = mesh.geometry.type === 'CylinderGeometry' ? cylKind(mat) : null;
    if (!ck) return false;
    emitCylinder(b, mesh.geometry as THREE.CylinderGeometry, rel, z2CylTile(pw.atlas, ck, mat.color.getHex()), pick);
    return true;
  });
  reg.dress(['bay'], (pw, b) => {
    roofline(pw, b, -34, 34, 16, -25.85, 'z');
    facadeDetail(pw, b);
    bayLights(pw, b);
  });
  reg.dress(['bayField'], (pw, b) => {
    roofline(pw, b, -26, 12, 12, -18, 'x');
    bayGround(pw, b);
  });
}
