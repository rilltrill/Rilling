import * as THREE from 'three';
import type { PwTile } from '../../pixelworld/atlas';
import type { PwBatch } from '../../pixelworld/batch';
import { PW_TPM } from '../../pixelworld/canvas';
import { NEUTRAL_HEX } from '../../pixelworld/retexture';
import { hash2 } from '../../pixelworld/surfaces';
import { z2CeilingTile, z2GlazedTile, z2PaintTile, z2RailTile, z2SheetVinylTile, z2SkirtingTile, z2VinylTile } from '../../pixelworld/z2surfaces';
import { z2DangleCard, z2VentModule } from '../../pixelworld/z2objects';
import {
  bloodPoolDecal, bloodWipeDecal, brokenTilesDecal, bloodWordsDecal, ceilingHoleDecal, ceilingStainDecal, dragTrailTile, drainDecal, floorCrackDecal, floorStainDecal, handprintDecal,
  papersDecal, pictureGhostDecal, pillsDecal, spatterDecal, trayDecal, wallCrackDecal, waterStainDecal, ceilingGrimeDecal, mopSplashDecal,
} from '../../pixelworld/z2decals';
import { fixture, nightWindow, troffer, type FixtureKind } from '../../pixelworld/z2modules';
import { z2BigSign, z2ExitSign, z2LitSign, z2PlateSign, z2Poster, z2Stencil, type PosterKind } from '../../pixelworld/z2signs';
import { pwPanelCuts, type PwPanelSpan } from '../../pixelworld/brush2i';
import { z2ClinicArchitrave, z2ClinicCeiling, z2ClinicFixture, z2ClinicPanel, z2ClinicTroffer, z2CorridorFloor, z2RoomFloor, Z2_PANEL_LEN, Z2_TROFFER_HALO, type ClinicFixture, type ClinicStyle } from '../../pixelworld/z2clinic';
import { PW_TPM_MID, PW_TPM_NEAR } from '../../pixelworld/canvas';
import { R } from './layout';
import type { Z2PixelWorld } from './pixel';
import { decalTint, emitMesh, GLAZED, isGlow, lay, neutral, NX, NZ, own, X, Y, Z, type MeshCtx, type Pick, type PickQuery, type Piece, type TagCtx, type Z2Registry } from './pwCore';

/**
 * ST. MERCY HOSPITAL in PIXEL WORLD — the CLINICAL SHELL of the ground floor
 * (ER, corridor A, ward 3, the nurse station; beats 5–16): walls, floors,
 * ceilings and what is painted on them — signs, troffers, holes, windows,
 * blood, papers — and the decal pass over every zone's shell pieces.
 */

const _o = new THREE.Vector3();
const _u = new THREE.Vector3();
const _v = new THREE.Vector3();
const _p = new THREE.Vector3();
const _mm = new THREE.Matrix4();
const _box = new THREE.Box3();
const _col = new THREE.Color();


const POSTERS: PosterKind[] = ['handwash', 'quarantine', 'nosmoking', 'evac', 'flu', 'visiting', 'cork', 'painting', 'chart', 'missing'];
const FIXTURES: FixtureKind[] = ['switch', 'alarm', 'sanitizer', 'phone', 'sharps', 'gloves', 'thermostat', 'hoseReel'];
const WORDS = ['HELP US', 'IT HUNGERS', 'RUN'];

/** Insulation and cables hanging out of a ceiling hole (two crossed cut-out cards, both faces), in frame `m`. */
function dangle(pw: Z2PixelWorld, b: PwBatch, m: THREE.Matrix4, v: number) {
  const t = z2DangleCard(pw.atlas, v);
  const w = 0.6;
  const h = 1.0;
  lay(b, m, _o.set(-w / 2, -h - 0.01, 0), X, Y, w, h, t);
  lay(b, m, _o.set(w / 2, -h - 0.01, 0.002), NX, Y, w, h, t);
  lay(b, m, _o.set(0, -h - 0.01, w / 2), NZ, Y, w, h, t, { flipU: true });
  lay(b, m, _o.set(0.002, -h - 0.01, -w / 2), Z, Y, w, h, t, { flipU: true });
}

/** Signs, the ceiling's fixtures, windows, blood and papers. */
function handleShell(tc: TagCtx): boolean | undefined {
  const { pw, o, b, m, info, hsh } = tc;
  const a = pw.atlas;
  switch (info.kind) {
    case 'lit': {
      if ((info.px as number) >= 0.08) {
        // Big signs on a 4-texel grid (whole letters at every level), at the classic letter size.
        const t = z2BigSign(a, info.text as string, info.color as number, { px: info.px as number, plate: info.plate as number | null, broken: info.broken as number[] | undefined, neon: (info.text as string).startsWith('EMERGENCY') });
        lay(b, m, _o.set(-t.wM / 2, -t.hM / 2, info.plate === null ? 0.004 : 0.012), X, Y, t.wM, t.hM, t.tile);
        return true;
      }
      const t = z2LitSign(a, info.text as string, info.color as number, {
        px: info.px as number,
        plate: info.plate as number | null,
        broken: info.broken as number[] | undefined,
        neon: (info.text as string).startsWith('EMERGENCY'),
      });
      lay(b, m, _o.set(-t.wM / 2, -t.hM / 2, info.plate === null ? 0.004 : 0.012), X, Y, t.wM, t.hM, t.tile);
      return true;
    }
    case 'plate': {
      const t = z2PlateSign(a, info.text as string, info.ink as number, info.plate as number, info.px as number);
      lay(b, m, _o.set(-t.wM / 2, -t.hM / 2, 0.006), X, Y, t.wM, t.hM, t.tile);
      return true;
    }
    case 'text': {
      const text = info.text as string;
      if (info.glow) {
        const t = z2LitSign(a, text, info.color as number, { px: info.px as number, plate: null });
        lay(b, m, _o.set(-t.wM / 2, -t.hM / 2, 0.004), X, Y, t.wM, t.hM, t.tile);
      } else {
        const t = z2Stencil(a, text, info.color as number, info.px as number, 0.25);
        lay(b, m, _o.set(-t.wM / 2, -t.hM / 2, 0.004), X, Y, t.wM, t.hM, t.tile);
      }
      return true;
    }
    case 'exit': {
      const t = z2ExitSign(a, info.label as string);
      lay(b, m, _o.set(-t.wM / 2, -t.hM / 2, 0.045), X, Y, t.wM, t.hM, t.tile);
      // The housing box stays (re-painted); its glow face goes.
      for (const c of [...o.children]) if (isGlow(c)) o.remove(c);
      return false;
    }
    case 'panel': {
      if (PANEL_ZONES.includes(pw.job?.zone ?? '')) {
        // The clinical floor's troffers: repainted at 64, with their halo on the ceiling grid round them.
        const t = z2ClinicTroffer(a, info.on ? (info.warm ? 'warm' : 'on') : 'off', 0x7a827c);
        const h = Z2_TROFFER_HALO / t.density;
        lay(b, m, _o.set(-0.345 - h, -0.052, -0.625 - h), X, Z, t.w / t.density, t.h / t.density, t);
      } else {
        const t = troffer(a, info.on ? (info.warm ? 'warm' : 'on') : 'off');
        lay(b, m, _o.set(-0.345, -0.052, -0.625), X, Z, 22 / PW_TPM, 40 / PW_TPM, t);
      }
      // A lit panel's stepped pool on the floor below (the polish catches it).
      const fl = pw.job?.floor;
      if (info.on && fl !== undefined) {
        _p.setFromMatrixPosition(m);
        pw.job!.pools.push([info.warm ? 0xffe8c0 : 0xd8f0e8, _p.x, fl + 0.012, _p.z, 2.8, 3.4, 0.11]);
      }
      return true;
    }
    case 'flickerFrame':
      // The dynamic diffuser covers it (painted in `finish`).
      return true;
    case 'panelHole': {
      const t = ceilingHoleDecal(a, hsh > 0.5 ? 1 : 0);
      lay(b, m, _o.set(-0.35, -0.012, -0.65), X, Z, 0.7, 1.3, t);
      dangle(pw, b, m, hsh > 0.5 ? 1 : 0);
      return true;
    }
    case 'ventHole': {
      lay(b, m, _o.set(-0.37, -0.012, -0.37), X, Z, 0.74, 0.74, ceilingHoleDecal(a, 1));
      return true;
    }
    case 'blind':
    case 'sill':
      return true;
    case 'moonWin': {
      const inward = info.inward as number;
      // The glow box is set back from the room face; lay the night window facing the room.
      const t = nightWindow(a, hsh > 0.5 ? 1 : 0);
      if (inward > 0) lay(b, m, _o.set(-0.9, -0.6, 0.03), X, Y, 1.8, 1.2, t);
      else lay(b, m, _o.set(0.9, -0.6, -0.03), NX, Y, 1.8, 1.2, t);
      return true;
    }
    case 'smear': {
      const len = info.len as number;
      const w = info.w as number;
      // A short smear: a piece of the drag trail ribbon.
      b.setMatrix(m);
      b.rect(_o.set(-Math.max(0.25, w) , 0.008, len / 2), X, NZ, Math.max(0.5, w * 2), len, dragTrailTile(a), { u0: 0, v0: Math.floor(hsh * 96) });
      b.setMatrix(null);
      return true;
    }
    case 'trail': {
      if (info.head) {
        const x0 = info.x0 as number;
        const z0 = info.z0 as number;
        const x1 = info.x1 as number;
        const z1 = info.z1 as number;
        const y = (info.y as number) + 0.007;
        const pts: THREE.Vector3[] = [];
        const n = Math.max(2, Math.ceil(Math.hypot(x1 - x0, z1 - z0) / 1.5));
        for (let i = 0; i <= n; i++) {
          const k = i / n;
          const wob = Math.sin(k * 9 + x0) * 0.12;
          pts.push(new THREE.Vector3(x0 + (x1 - x0) * k + wob * (z1 - z0 ? 1 : 0), y, z0 + (z1 - z0) * k + wob * (x1 - x0 ? 1 : 0)));
        }
        // Ribbon points are in the root frame (the trail was built in it).
        b.ribbon(pts, 0.8, dragTrailTile(a), { y: 0 });
      }
      return true;
    }
    case 'pool': {
      const r = info.r as number;
      const t = bloodPoolDecal(a, Math.floor(hsh * 3));
      const w = Math.max(1.3, r * 2.4);
      const h = (w * 56) / 64;
      const ang = hsh * 6.28;
      const c = Math.cos(ang);
      const s = Math.sin(ang);
      b.setMatrix(m);
      _u.set(c, 0, s);
      _v.set(s, 0, -c);
      _o.set(0, 0.008 + (pw.nDecal++ % 4) * 0.0015, 0).addScaledVector(_u, -w / 2).addScaledVector(_v, -h / 2);
      b.rect(_o, _u, _v, w, h, t);
      b.setMatrix(null);
      return true;
    }
    case 'wallSmear': {
      const big = info.big as boolean;
      const t = big ? (hsh > 0.5 ? bloodWipeDecal(a, 0) : handprintDecal(a, 0)) : hsh > 0.6 ? spatterDecal(a) : handprintDecal(a, 1);
      const w = t.w / PW_TPM;
      const h = t.h / PW_TPM;
      lay(b, m, _o.set(-w / 2, -h / 2 - (big ? 0.1 : 0), 0.008), X, Y, w, h, t);
      return true;
    }
    case 'paper': {
      if ((info.i as number) === 0) {
        const n = info.n as number;
        const cx = info.cx as number;
        const cz = info.cz as number;
        const rx = info.rx as number;
        const rz = info.rz as number;
        const y = (info.y as number) + 0.006;
        const count = Math.max(1, Math.round(n / 7));
        // (Papers are built in the zone's frame: lay them in it.)
        for (let i = 0; i < count; i++) {
          const px = cx + (hash2(i, Math.round(cx * 3), 11) * 2 - 1) * rx;
          const pz = cz + (hash2(i, Math.round(cz * 3), 12) * 2 - 1) * rz;
          const t = papersDecal(a, (i + Math.round(cx)) % 3);
          const ang = hash2(i, 3, Math.round(cx + cz)) * 6.28;
          const c = Math.cos(ang);
          const s = Math.sin(ang);
          _u.set(c, 0, s);
          _v.set(s, 0, -c);
          const w = 56 / PW_TPM;
          const h = 48 / PW_TPM;
          _o.set(px, y + (pw.nDecal++ % 5) * 0.0012, pz).addScaledVector(_u, -w / 2).addScaledVector(_v, -h / 2);
          b.rect(_o, _u, _v, w, h, t);
        }
      }
      return true;
    }
    case 'tray': {
      b.setMatrix(m);
      b.rect(_o.set(-0.25, 0.006, 0.19), X, NZ, 0.5, 0.375, trayDecal(a));
      b.setMatrix(null);
      return true;
    }
    default:
      return undefined;
  }
}

/** The clinic's wainscots (the morgue's and the theatre's tiles are pwBasement's). */
const CLINIC_GLAZED = new Set([0x2a6258, 0x2e6a5e]);

/** Skirting colours (the shells' base boards). */
const SKIRTING = new Set([0x232826, 0x1e2220, 0x2a3436, 0x1e2a26, 0x1e1e1c]);

/** Walls, floors and ceilings of the clinical floor, and the shells' skirtings and bumper rails. */
function pickShell(pw: Z2PixelWorld, q: PickQuery): Pick | null | undefined {
  const a = pw.atlas;
  const { hex, tex } = q;
  switch (q.preset) {
    // ── Walls ──
    case 'tiles|1.2|0.62':
      if (CLINIC_GLAZED.has(hex)) return own(z2GlazedTile(a, { hex, ...GLAZED[hex] }));
      return neutral(z2GlazedTile(a, { hex: NEUTRAL_HEX }), hex);
    case 'stucco|1|0.65':
      if (hex === 0x86968a || hex === 0x94a690) return own(z2PaintTile(a, { hex }));
      return neutral(z2PaintTile(a, { hex: NEUTRAL_HEX }), hex);
    case 'wallpaper|1|0.4':
      // (The dark side rooms behind doors: the painted plaster reads the same in there.)
      return neutral(z2PaintTile(a, { hex: NEUTRAL_HEX }), hex);
    // ── Floors / ceilings ──
    case 'checker|0.55|0.34':
      // The clinical floor, repainted: the corridor's lane at 96, the rooms' vinyl at 64 (the ward's is sheet).
      if (q.zone === 'corrA') return own(z2CorridorFloor(a));
      if (PANEL_ZONES.includes(q.zone)) return own(z2RoomFloor(a, hex, q.zone === 'ward'));
      if (hex === 0x5d6a63) return own(z2VinylTile(a, { a: 0x5d6a63, b: 0x46524c }));
      return own(z2SheetVinylTile(a, { hex }));
    case 'tiles|0.5|0.8':
      if (PANEL_ZONES.includes(q.zone)) return own(z2ClinicCeiling(a, hex));
      return neutral(z2CeilingTile(a, { hex: NEUTRAL_HEX }), hex);
    default:
      break;
  }
  if ((tex === 'grain' || tex === undefined)) {
    // Untextured colours: skirtings, rails.
    if (SKIRTING.has(hex)) return own(z2SkirtingTile(a, { hex }));
    if (hex === 0xc9cdbf || hex === 0xb9a07a) return own(z2RailTile(a, { hex }));
  }
  return undefined;
}

// ─── Panelled walls (PIXEL WORLD 2) ──────────────────────────────────────────

/** The zones whose walls are painted panels (brush2i.ts) instead of wrap tiles with decals. */
const PANEL_ZONES = ['er', 'corrA', 'ward', 'hub'];

/**
 * One face of a wall, as a run of panels. `axis`: the world axis the wall runs along; `face`:
 * the face's coordinate on the other axis; `inward`: which way the face looks along it (+1 / −1);
 * `a0`…`a1`: the wall's extent. Seen from the room the wall runs left → right, and the layout's
 * metres are counted that way from its left end.
 */
interface PanelWall {
  axis: 'x' | 'z';
  face: number;
  inward: 1 | -1;
  a0: number;
  a1: number;
  layout: PwPanelSpan[];
}

/** The panelled walls of each zone, per converter (the panels are tiles of its atlas). */
const WALLS = new WeakMap<Z2PixelWorld, Map<string, PanelWall[]>>();

/** Thickness of the shells' walls (shell.ts `t`): a room's faces stand half of it inside its rect. */
const HALF_T = 0.15;

/**
 * The layout tables. A wall is `seq` panels laid from its left end as the room sees it: a
 * variant (0 and 1 tell the wall's story, 2 is quiet: behind enemies, round doors), `f` =
 * mirrored. Neighbours never match; where a calm zone of a hold lies against a wall
 * (docs/pixelworld2/plan-z2.md §1) the panels there are the quiet ones.
 */
function buildWalls(pw: Z2PixelWorld, zone: string): PanelWall[] {
  const a = pw.atlas;
  const wall = (axis: 'x' | 'z', face: number, inward: 1 | -1, a0: number, a1: number, style: ClinicStyle, H: number, density: number, seq: string[]): PanelWall => {
    const layout: PwPanelSpan[] = seq.map((q, i) => {
      const panel = z2ClinicPanel(a, style, Number(q[0]), H, density);
      pw.calm.add(panel);
      return { at: i * Z2_PANEL_LEN, panel, flip: q.endsWith('f') };
    });
    return { axis, face, inward, a0, a1, layout };
  };
  switch (zone) {
    case 'corrA': {
      // The showpiece: both walls pass at 2.2 m (96 texels a metre).
      const r = R.corrA;
      return [
        wall('x', r.z0 + HALF_T, 1, r.x0, r.x1, 'clinic', r.h, PW_TPM_NEAR, ['1', '0', '2', '1f', '0f', '2f', '1']),
        wall('x', r.z1 - HALF_T, -1, r.x0, r.x1, 'clinic', r.h, PW_TPM_NEAR, ['0', '2f', '1', '0f', '2', '1f', '0']),
      ];
    }
    case 'er': {
      const r = R.er;
      return [
        // Back wall (walkers come from it), west wall (doors), east wall (the grabbed nurse stands against its middle).
        wall('x', r.z0 + HALF_T, 1, r.x0, r.x1, 'clinic', r.h, PW_TPM_MID, ['2', '1', '2f', '0']),
        wall('z', r.x0 + HALF_T, 1, r.z0, r.z1, 'clinic', r.h, PW_TPM_MID, ['0', '2', '1f', '2f']),
        wall('z', r.x1 - HALF_T, -1, r.z0, r.z1, 'clinic', r.h, PW_TPM_MID, ['1', '2', '2f', '0']),
      ];
    }
    case 'ward': {
      const r = R.ward;
      return [
        wall('z', r.x0 + HALF_T, 1, r.z0, r.z1, 'ward', r.h, PW_TPM_MID, ['2', '0', '2f']),
        wall('z', r.x1 - HALF_T, -1, r.z0, r.z1, 'ward', r.h, PW_TPM_MID, ['2f', '1', '2']),
        wall('x', r.z0 + HALF_T, 1, r.x0, r.x1, 'ward', r.h, PW_TPM_MID, ['0', '2', '1', '2f']),
        wall('x', r.z1 - HALF_T, -1, r.x0, r.x1, 'ward', r.h, PW_TPM_MID, ['1', '2', '0f', '2f']),
        // The other faces of its two shared walls: the corridor's end (clinic paint) and the hub's west side.
        wall('z', r.x0 - HALF_T, -1, r.z0, r.z1, 'clinic', R.hub.h, PW_TPM_MID, ['2', '0', '2f']),
        wall('z', r.x1 + HALF_T, 1, r.z0, r.z1, 'clinic', R.hub.h, PW_TPM_MID, ['1', '2', '0f']),
      ];
    }
    case 'hub': {
      const r = R.hub;
      return [
        // The back wall is the backdrop of the spitters' heads: quiet panels only.
        wall('z', r.x1 - HALF_T, -1, r.z0, r.z1, 'clinic', r.h, PW_TPM_MID, ['2', '2f', '2']),
        wall('x', r.z1 - HALF_T, -1, r.x0, r.x1, 'clinic', r.h, PW_TPM_MID, ['1', '2', '0f']),
        wall('x', r.z0 + HALF_T, 1, r.x0, r.x1, 'clinic', r.h, PW_TPM_MID, ['2', '0', '1f']),
      ];
    }
    default:
      return [];
  }
}

/** What a shell box is to a panelled wall: the wall itself, its bumper rail, its skirting, a door frame's trim. */
function shellRole(mat: THREE.MeshLambertMaterial): 'wall' | 'rail' | 'skirt' | 'trim' | null {
  if (mat.side !== THREE.FrontSide) return null;
  const k = `${mat.userData.retroTex}|${mat.userData.retroScale}|${mat.userData.retroStrength}`;
  const hex = mat.color.getHex();
  if (k === 'tiles|1.2|0.62' || k === 'stucco|1|0.65') return 'wall';
  if (k === 'metal|1.5|0.32' && hex === 0x9aa39c) return 'trim';
  if (k === 'planks|1.2|0.35' && (hex === 0xc9cdbf || hex === 0xb9a07a)) return 'rail';
  if (mat.userData.retroTex === 'grain' && hex === 0x232826) return 'skirt';
  return null;
}

/**
 * A shell box of a panelled wall: its room-side face shows the wall's panels (one module rect
 * per panel it crosses), a rail / skirting box the same rows a little proud of the wall, with
 * its lit edge on top; every other face is re-textured as before.
 */
function emitPanelled(mc: MeshCtx): boolean {
  const walls = WALLS.get(mc.pw)?.get(mc.zone);
  if (!walls || !mc.world || mc.mesh.geometry.type !== 'BoxGeometry') return false;
  const role = shellRole(mc.mat);
  if (!role) return false;
  const g = mc.mesh.geometry;
  if (!g.boundingBox) g.computeBoundingBox();
  const bx = _box.copy(g.boundingBox!).applyMatrix4(mc.rel);
  // (A wall shared by two rooms shows a run of panels on each of its faces.)
  const done: PanelWall[] = [];
  for (const w of walls) {
    const lo = w.axis === 'x' ? bx.min.z : bx.min.x;
    const hi = w.axis === 'x' ? bx.max.z : bx.max.x;
    // Thin across the wall, and standing in its plane: a wall box ends on the face, a rail / skirting straddles it.
    if (hi - lo > 0.4 || w.face < lo - 1e-3 || w.face > hi + 1e-3) continue;
    // (A wall box belongs to the face it ENDS on; the one on its other side is another wall's.)
    if (role === 'wall' && Math.abs((w.inward > 0 ? hi : lo) - w.face) > 1e-3) continue;
    const front = w.inward > 0 ? hi : lo;
    const s0 = w.axis === 'x' ? bx.min.x : bx.min.z;
    const s1 = w.axis === 'x' ? bx.max.x : bx.max.z;
    // Left → right as the room sees it: +x for a face looking +z, −x for −z; −z for +x, +z for −x.
    const fwd = w.axis === 'x' ? w.inward > 0 : w.inward < 0;
    const ux = w.axis === 'x' ? (fwd ? X : NX) : fwd ? Z : NZ;
    const piece = { a0: fwd ? s0 - w.a0 : w.a1 - s1, a1: fwd ? s1 - w.a0 : w.a1 - s0, y0: bx.min.y - mc.floorY, y1: bx.max.y - mc.floorY };
    const at = (along: number, y: number, off: number) => {
      const s = fwd ? w.a0 + along : w.a1 - along;
      return w.axis === 'x' ? _o.set(s, y, front + off) : _o.set(front + off, y, s);
    };
    const back = w.axis === 'x' ? (w.inward > 0 ? NZ : Z) : w.inward > 0 ? NX : X;
    if (role === 'trim') {
      // A door frame's trim (it stands proud on both sides of the wall: each face takes its own):
      // the architrave along a jamb, turned along a head or a sill.
      if (Math.abs(front - w.face) > 0.06) continue;
      const t = z2ClinicArchitrave(mc.pw.atlas);
      const len = piece.a1 - piece.a0;
      const h = piece.y1 - piece.y0;
      if (h >= len) mc.b.rect(at(piece.a0, bx.min.y, 0), ux, Y, len, h, t, { sub: { x: 0, y: Math.round(piece.y0 * t.density), w: t.w, h: Math.min(t.h, h * t.density) } });
      else mc.b.rect(at(piece.a1, bx.min.y, 0), Y, _u.copy(ux).negate(), h, len, t, { sub: { x: 0, y: 0, w: t.w, h: Math.min(t.h, len * t.density) }, flipU: true });
      done.push(w);
      continue;
    }
    for (const c of pwPanelCuts(w.layout, piece)) {
      mc.b.rect(at(c.a0, mc.floorY + c.y0, 0), ux, Y, c.a1 - c.a0, c.y1 - c.y0, c.tile, { sub: c.sub, flipU: c.flipU });
      if (role === 'wall') continue;
      // The top of a rail / skirting: its lit edge, drawn out over its depth.
      const d = c.tile.density;
      mc.b.rect(at(c.a0, bx.max.y, 0), ux, back, c.a1 - c.a0, hi - lo, c.tile, { sub: { x: c.sub.x, y: Math.round(piece.y1 * d) - 1, w: c.sub.w, h: 1 }, flipU: c.flipU });
    }
    done.push(w);
  }
  if (!done.length) return false;
  // The other faces (ends at openings, a far side no room looks at, the underside): the generic paint.
  const panelled = (x: number, z: number) => done.some((w) => (w.axis === 'x' ? z : x) * w.inward > 0.7);
  emitMesh(mc.b, g, mc.rel, (x, y, z) => (panelled(x, z) || (role !== 'wall' && y > 0.7) ? null : mc.pick(x, y, z)), { world: true, flip: false, floorY: mc.floorY });
  return true;
}

/**
 * What hangs on the panelled walls, each thing in a place of its own: [fixture, wall (index in
 * `buildWalls`), world coordinate along the wall, height of its foot]. Placed by hand between the
 * doors, the classic signs and clocks, and clear of the holds' calm zones (nothing by door 324,
 * nothing on the walls enemies and the civilian stand against).
 */
const WALL_FIXTURES: Record<string, [ClinicFixture, number, number, number][]> = {
  corrA: [
    // Left wall (0), from the ER end.
    ['board', 0, 18.3, 1.62],
    ['gel', 0, 21.9, 1.6],
    ['switch', 0, 25.4, 1.62],
    ['callpoint', 0, 27.6, 1.62],
    ['boardB', 0, 34.2, 1.66],
    ['phone', 0, 41.6, 1.02],
    ['gel', 0, 45.8, 1.6],
    ['board', 0, 49.4, 1.62],
    // Right wall (1).
    ['callpoint', 1, 13.6, 1.62],
    ['gel', 1, 21.3, 1.6],
    ['boardB', 1, 23.7, 1.66],
    ['clipboard', 1, 28.5, 1.52],
    ['switch', 1, 30.95, 1.62],
    ['board', 1, 39.6, 1.62],
    ['clipboard', 1, 43.5, 1.52],
    ['gel', 1, 47.6, 1.6],
  ],
  er: [
    ['board', 1, -38, 1.62],
    ['callpoint', 1, -28.2, 1.62],
    ['gel', 1, -41.6, 1.6],
    ['gel', 2, -31.6, 1.6],
    ['boardB', 0, 3.4, 1.66],
  ],
  hub: [
    ['board', 1, 79.2, 1.62],
    ['gel', 1, 86.4, 1.6],
    ['callpoint', 2, 83.2, 1.62],
    ['clipboard', 2, 75.9, 1.52],
  ],
};

/** Lay the zone's fixtures on its panelled walls (a hair proud of the paint, facing the room). */
function layFixtures(pw: Z2PixelWorld, b: PwBatch, zone: string) {
  const walls = WALLS.get(pw)?.get(zone);
  if (!walls) return;
  for (const [kind, wi, s, y] of WALL_FIXTURES[zone] ?? []) {
    const w = walls[wi];
    const d = w.layout[0].panel.density;
    const t = z2ClinicFixture(pw.atlas, kind, 'clinic', d);
    const tw = t.w / d;
    const off = w.inward * (0.011 + (pw.nDecal++ % 3) * 0.001);
    const fwd = w.axis === 'x' ? w.inward > 0 : w.inward < 0;
    const s0 = fwd ? s - tw / 2 : s + tw / 2;
    if (w.axis === 'x') _o.set(s0, y, w.face + off);
    else _o.set(w.face + off, y, s0);
    b.rect(_o, w.axis === 'x' ? (fwd ? X : NX) : fwd ? Z : NZ, Y, tw, t.h / d, t);
  }
}

export function registerShell(reg: Z2Registry) {
  reg.dress(PANEL_ZONES, (pw, b, g) => layFixtures(pw, b, g.name));
  reg.prep(PANEL_ZONES, (pw, _b, g) => {
    let m = WALLS.get(pw);
    if (!m) WALLS.set(pw, (m = new Map()));
    m.set(g.name, buildWalls(pw, g.name));
  });
  reg.mesh(emitPanelled);
  reg.tag(['lit', 'plate', 'text', 'exit', 'panel', 'flickerFrame', 'panelHole', 'ventHole', 'blind', 'sill', 'moonWin', 'smear', 'trail', 'pool', 'wallSmear', 'paper', 'tray'], handleShell);
  reg.pick(pickShell);
  // The flickering diffusers and the vent grates (painted after the build).
  reg.prebuild((pw) => {
    troffer(pw.atlas, 'on');
    troffer(pw.atlas, 'warm');
    z2VentModule(pw.atlas, 0x9aa09c);
  }, 2);
}


/**
 * A dark side room seen through a doorway (a BackSide box): a moonlit window
 * on each of its long inner walls, so the doorway shows a room, not a void.
 */
export function roomGlimpse(pw: Z2PixelWorld, b: PwBatch, m: THREE.Mesh, rel: THREE.Matrix4, mat: THREE.MeshLambertMaterial) {
  _col.setHex(mat.color.getHex());
  if (_col.r + _col.g + _col.b > 0.12 * 3) return;
  if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
  const bx = _box.copy(m.geometry.boundingBox!).applyMatrix4(rel);
  const sx = bx.max.x - bx.min.x;
  const sz = bx.max.z - bx.min.z;
  const sy = bx.max.y - bx.min.y;
  if (sy < 2 || Math.max(sx, sz) < 2.4) return;
  const t = nightWindow(pw.atlas, Math.round(bx.min.x + bx.min.z) & 1);
  const w = Math.min(1.8, Math.max(sx, sz) - 0.8);
  const h = w * (38 / 58);
  const y = bx.min.y + Math.min(1.2, sy - h - 0.3);
  if (sx >= sz) {
    const cx = (bx.min.x + bx.max.x) / 2;
    b.rect(_o.set(cx - w / 2, y, bx.min.z + 0.02), X, Y, w, h, t);
    b.rect(_o.set(cx + w / 2, y, bx.max.z - 0.02), NX, Y, w, h, t);
  } else {
    const cz = (bx.min.z + bx.max.z) / 2;
    b.rect(_o.set(bx.min.x + 0.02, y, cz + w / 2), NZ, Y, w, h, t);
    b.rect(_o.set(bx.max.x - 0.02, y, cz - w / 2), Z, Y, w, h, t);
  }
}

// ─── Decal scatter (stains, ghosts, blood, notices, holes) ────────────────

export function scatter(pw: Z2PixelWorld, b: PwBatch, pieces: Piece[], zone: string, floorY: number) {
  const a = pw.atlas;
  const ext = zone === 'bay' || zone === 'bayField';
  for (const p of pieces) {
    const bx = p.box;
    const sx = bx.max.x - bx.min.x;
    const sy = bx.max.y - bx.min.y;
    const sz = bx.max.z - bx.min.z;
    if (p.kind === 'floor' || p.kind === 'ceil') {
      if (ext) continue;
      const y = p.kind === 'floor' ? bx.max.y : bx.min.y;
      for (let gx = Math.ceil(bx.min.x); gx < bx.max.x - 1; gx++) {
        for (let gz = Math.ceil(bx.min.z); gz < bx.max.z - 1; gz++) {
          const h = hash2(gx, gz, p.kind === 'floor' ? 31 : 37);
          if (p.kind === 'ceil') {
            // Ceiling: a stained or missing tile in the 1 m grid now and then.
            if (h > 0.06) continue;
            const t = h < 0.018 ? ceilingHoleDecal(a, gx & 1) : ceilingStainDecal(a, (gx + gz) & 1);
            b.rect(_o.set(gx, y - 0.004, gz), X, Z, 1, 1, t, { tint: decalTint(t, p.hex) });
            if (h < 0.018) dangle(pw, b, _mm.makeTranslation(gx + 0.5, y, gz + 0.5), gx & 1);
            continue;
          }
          if (h > 0.05) continue;
          const r = hash2(gx, gz, 41);
          const t = r < 0.3 ? floorStainDecal(a, gx & 1) : r < 0.55 ? floorCrackDecal(a) : r < 0.7 ? pillsDecal(a) : r < 0.85 ? papersDecal(a, (gx + gz) % 3) : drainDecal(a);
          const w = t.w / PW_TPM;
          const hh = t.h / PW_TPM;
          const ang = Math.floor(r * 40) * 0.6;
          const c = Math.cos(ang);
          const s = Math.sin(ang);
          _u.set(c, 0, s);
          _v.set(s, 0, -c);
          _o.set(gx + 0.5, y + 0.004 + (pw.nDecal++ % 4) * 0.001, gz + 0.5).addScaledVector(_u, -w / 2).addScaledVector(_v, -hh / 2);
          b.rect(_o, _u, _v, w, hh, t, { tint: decalTint(t, p.hex) });
        }
      }
      continue;
    }
    // Walls: the two broad faces of the piece.
    const alongX = sx >= sz;
    const len = alongX ? sx : sz;
    if (len < 1.0 || sy < 0.5) continue;
    if (p.kind === 'wallLo' && !ext) brokenTiles(pw, b, p, alongX, len, floorY);
    if (!ext && (p.kind === 'wallHi' || p.kind === 'wallLo')) bandDecals(pw, b, p, alongX, len);
    for (const side of [1, -1]) {
      const fc = alongX ? (side > 0 ? bx.max.z : bx.min.z) : side > 0 ? bx.max.x : bx.min.x;
      // ux runs left → right seen from the face's side.
      const ux = alongX ? (side > 0 ? X : NX) : side > 0 ? NZ : Z;
      const start = alongX ? (side > 0 ? bx.min.x : bx.max.x) : side > 0 ? bx.max.z : bx.min.z;
      const slots = Math.floor(len / 2.2);
      for (let i = 0; i < slots; i++) {
        const along = 0.6 + (i + hash2(i, Math.round(fc * 5), 3) * 0.5) * (len - 1.2) / Math.max(1, slots);
        const h = hash2(Math.round(start * 3) + i * 7, Math.round(fc * 3) + side, 43);
        const t = wallDecal(pw, p, h, ext);
        if (!t) continue;
        const w = t.w / PW_TPM;
        const hh = t.h / PW_TPM;
        if (w > len - 0.3 || hh > sy - 0.15) continue;
        const y0 = p.kind === 'wallLo' ? bx.min.y + Math.min(sy - hh - 0.05, 0.15 + hash2(i, 5, 7) * 0.5) : bx.min.y + Math.min(sy - hh - 0.1, 0.25 + hash2(i, 9, 7) * Math.max(0, Math.min(1.4, sy - hh - 0.4)));
        const off = 0.006 + (pw.nDecal++ % 3) * 0.002;
        _o.set(0, y0, 0);
        if (alongX) _o.set(start + (side > 0 ? along - w / 2 : -(along - w / 2)), y0, fc + side * off);
        else _o.set(fc + side * off, y0, start + (side > 0 ? -(along - w / 2) : along - w / 2));
        b.rect(_o, ux, Y, w, hh, t, { tint: decalTint(t, p.hex) });
      }
    }
  }
}

/**
 * Grime by rule along a wall: under the ceiling line (upper walls) and mop
 * splash above the skirting (wainscots), in 3 m slots, each with its own hash
 * and flip — the dirt never repeats with the wall's tile.
 */
function bandDecals(pw: Z2PixelWorld, b: PwBatch, p: Piece, alongX: boolean, len: number) {
  const bx = p.box;
  const hi = p.kind === 'wallHi';
  const slots = Math.floor(len / 3);
  for (let i = 0; i < slots; i++) {
    for (const side of [1, -1]) {
      const h = hash2(Math.round((alongX ? bx.min.x : bx.min.z) * 3) + i * 11, side + Math.round((alongX ? bx.min.z : bx.min.x) * 3), hi ? 81 : 83);
      if (h > (hi ? 0.5 : 0.4)) continue;
      const t = hi ? ceilingGrimeDecal(pw.atlas, i & 1) : mopSplashDecal(pw.atlas, i & 1);
      const w = t.w / PW_TPM;
      const hh = t.h / PW_TPM;
      if (w > len - 0.2) continue;
      const along = 0.1 + hash2(i, side, 85) * (len - w - 0.2);
      const y0 = hi ? bx.max.y - hh - 0.01 : bx.min.y + 0.15;
      const fc = alongX ? (side > 0 ? bx.max.z : bx.min.z) : side > 0 ? bx.max.x : bx.min.x;
      const off = 0.007 + (pw.nDecal++ % 3) * 0.002;
      const ux = alongX ? (side > 0 ? X : NX) : side > 0 ? NZ : Z;
      const start = alongX ? (side > 0 ? bx.min.x : bx.max.x) : side > 0 ? bx.max.z : bx.min.z;
      if (alongX) _o.set(start + (side > 0 ? along : -along), y0, fc + side * off);
      else _o.set(fc + side * off, y0, start + (side > 0 ? -along : along));
      b.rect(_o, ux, Y, w, hh, t, { tint: decalTint(t, p.hex), flipU: h < 0.2 });
    }
  }
}

/** Knocked-off / cracked glazed tiles, snapped to the wall's tile grid (world-mapped from the floor). */
function brokenTiles(pw: Z2PixelWorld, b: PwBatch, p: Piece, alongX: boolean, len: number, floorY: number) {
  const spec = GLAZED[p.hex] ?? {};
  const tw = (spec.tw ?? 8) / PW_TPM;
  const th = (spec.th ?? 8) / PW_TPM;
  const bx = p.box;
  const n = Math.floor(len / 5);
  for (let i = 0; i < n; i++) {
    const h = hash2(Math.round(bx.min.x * 3) + i * 13, Math.round(bx.min.z * 3), 61);
    if (h > 0.35) continue;
    const t = brokenTilesDecal(pw.atlas, Math.round(tw * PW_TPM), Math.round(th * PW_TPM), i & 1);
    const w = t.w / PW_TPM;
    const hh = t.h / PW_TPM;
    // Rows from the floor, columns on the world grid.
    const row = 1 + Math.floor(hash2(i, 3, 63) * Math.max(1, Math.floor((bx.max.y - bx.min.y - hh) / th) - 1));
    const y0 = floorY + row * th;
    if (y0 + hh > bx.max.y - 0.05 || y0 < bx.min.y) continue;
    const a0 = (alongX ? bx.min.x : bx.min.z) + 0.4 + h * (len - w - 0.8);
    for (const side of [1, -1]) {
      const tint = decalTint(t, p.hex);
      if (alongX) {
        const fc = side > 0 ? bx.max.z + 0.005 : bx.min.z - 0.005;
        // u = ±x·32: snap the rect's start corner (left as seen) to whole tiles.
        if (side > 0) b.rect(_o.set(Math.round(a0 / tw) * tw, y0, fc), X, Y, w, hh, t, { tint });
        else b.rect(_o.set(Math.round((a0 + w) / tw) * tw, y0, fc), NX, Y, w, hh, t, { tint });
      } else {
        const fc = side > 0 ? bx.max.x + 0.005 : bx.min.x - 0.005;
        if (side > 0) b.rect(_o.set(fc, y0, Math.round((a0 + w) / tw) * tw), NZ, Y, w, hh, t, { tint });
        else b.rect(_o.set(fc, y0, Math.round(a0 / tw) * tw), Z, Y, w, hh, t, { tint });
      }
    }
  }
}

/** The decal for a wall slot (null = leave the wall plain here). */
function wallDecal(pw: Z2PixelWorld, p: Piece, h: number, ext: boolean): PwTile | null {
  const a = pw.atlas;
  if (ext) return null;
  if (p.kind === 'wallHi') {
    if (h < 0.1) return waterStainDecal(a, Math.floor(h * 30) % 2);
    if (h < 0.17) return pictureGhostDecal(a, Math.floor(h * 100) % 2);
    if (h < 0.22) return wallCrackDecal(a, Math.floor(h * 100) % 2);
    if (h < 0.3) return z2Poster(a, POSTERS[Math.floor(h * 997) % POSTERS.length]).tile;
    if (h < 0.34) return handprintDecal(a, Math.floor(h * 100) % 2);
    if (h < 0.37) return bloodWordsDecal(a, WORDS[Math.floor(h * 991) % WORDS.length]);
    if (h < 0.45) return fixture(a, FIXTURES[Math.floor(h * 983) % FIXTURES.length]);
    return null;
  }
  if (p.kind === 'wallLo') {
    if (h < 0.08) return spatterDecal(a);
    if (h < 0.14) return fixture(a, 'outlet');
    return null;
  }
  // Basement block: stains, rust, blood, the odd notice.
  if (h < 0.12) return waterStainDecal(a, Math.floor(h * 30) % 2);
  if (h < 0.18) return wallCrackDecal(a, 1);
  if (h < 0.24) return z2Poster(a, h < 0.21 ? 'biohazard' : 'quarantine').tile;
  if (h < 0.29) return bloodWipeDecal(a, 1);
  if (h < 0.32) return bloodWordsDecal(a, WORDS[Math.floor(h * 991) % WORDS.length]);
  return null;
}
