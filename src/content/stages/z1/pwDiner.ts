import * as THREE from 'three';
import type { PwAtlas, PwTile } from '../../pixelworld/atlas';
import { PwBatch, type PwRectOpts } from '../../pixelworld/batch';
import { PW_TPM, PWF } from '../../pixelworld/canvas';
import { FONT_5x7, neonText, textWidth } from '../../pixelworld/font';
import { fontScaleFor } from '../../pixelworld/signs';
import { roofTile } from '../../pixelworld/surfaces';
import { z1DinerTiles, type Z1DinerTiles } from '../../pixelworld/z1diner';

/**
 * The chrome diner in ART: PIXEL WORLD: every part `buildDiner` tagged
 * (`userData.pwDiner`) is re-emitted with the diner modules (z1diner.ts) in its
 * own frame; the interior's glow surfaces become GLOW texels (the lit room
 * still shines into the wet street), with the menu board, clock, kitchen pass
 * and back bar laid over its back wall. The destructible panes and the
 * transparent glass stay classic (gameplay / glass), as do the pendant globes.
 */

const X = new THREE.Vector3(1, 0, 0);
const Y = new THREE.Vector3(0, 1, 0);
const Z = new THREE.Vector3(0, 0, 1);
const NX = new THREE.Vector3(-1, 0, 0);
const NZ = new THREE.Vector3(0, 0, -1);
const _o = new THREE.Vector3();

type Face = 'px' | 'nx' | 'py' | 'ny' | 'pz' | 'nz';

/** Emit faces of a box centred on the origin (current batch matrix). Wrap tiles at density; modules stretched. */
export function boxFaces(b: PwBatch, w: number, h: number, d: number, faces: Partial<Record<Face, PwTile | null>>, opts: Partial<Record<Face, PwRectOpts>> = {}) {
  const hx = w / 2;
  const hy = h / 2;
  const hz = d / 2;
  for (const f of Object.keys(faces) as Face[]) {
    const t = faces[f];
    if (!t) continue;
    const o = opts[f] ?? {};
    if (f === 'pz') b.rect(_o.set(-hx, -hy, hz), X, Y, w, h, t, o);
    else if (f === 'nz') b.rect(_o.set(hx, -hy, -hz), NX, Y, w, h, t, o);
    else if (f === 'px') b.rect(_o.set(hx, -hy, hz), NZ, Y, d, h, t, o);
    else if (f === 'nx') b.rect(_o.set(-hx, -hy, -hz), Z, Y, d, h, t, o);
    else if (f === 'py') b.rect(_o.set(-hx, hy, hz), X, NZ, w, d, t, o);
    else b.rect(_o.set(-hx, -hy, -hz), X, Z, w, d, t, o);
  }
}

/** A cylinder along its local Y: `side` wrapped round it (v rows `v0…v1`), `cap` mapped across the top disc. */
export function cylinder(b: PwBatch, r: number, h: number, seg: number, side: PwTile, cap: PwTile | null, v0 = 0, v1 = side.h, bothCaps = false) {
  const circ = 2 * Math.PI * r * PW_TPM;
  for (let i = 0; i < seg; i++) {
    const a0 = (i / seg) * Math.PI * 2;
    const a1 = ((i + 1) / seg) * Math.PI * 2;
    const p0 = new THREE.Vector3(Math.sin(a0) * r, -h / 2, Math.cos(a0) * r);
    const p1 = new THREE.Vector3(Math.sin(a1) * r, -h / 2, Math.cos(a1) * r);
    const p2 = new THREE.Vector3(Math.sin(a1) * r, h / 2, Math.cos(a1) * r);
    const p3 = new THREE.Vector3(Math.sin(a0) * r, h / 2, Math.cos(a0) * r);
    const u0 = (i / seg) * circ;
    const u1 = ((i + 1) / seg) * circ;
    b.quad(p0, p1, p2, p3, side, [u0, v0, u1, v0, u1, v1, u0, v1]);
    if (cap) {
      const W = cap.w;
      const uv = (a: number) => [(Math.sin(a) * 0.5 + 0.5) * W, (Math.cos(a) * 0.5 + 0.5) * W];
      const [ua, va] = uv(a0);
      const [ub, vb] = uv(a1);
      b.tri(new THREE.Vector3(0, h / 2, 0), p3.clone(), p2.clone(), cap, [W / 2, W / 2, ua, va, ub, vb]);
      if (bothCaps) b.tri(new THREE.Vector3(0, -h / 2, 0), p1.clone(), p0.clone(), cap, [W / 2, W / 2, ub, vb, ua, va]);
    }
  }
}

export class Z1Diner {
  readonly t: Z1DinerTiles;
  private roof: PwTile;
  constructor(atlas: PwAtlas) {
    this.t = z1DinerTiles(atlas);
    this.roof = roofTile(atlas, { hex: 0x2a2b31 });
  }

  /** Paint the diner under `root` (if any); returns the replaced classic meshes. */
  convert(b: PwBatch, root: THREE.Object3D): THREE.Object3D[] {
    let diner: THREE.Object3D | null = null;
    root.traverse((o) => {
      if (o.userData.pwDinerRoot) diner = o;
    });
    if (!diner) return [];
    const g = diner as THREE.Object3D;
    g.updateMatrixWorld(true);
    const t = this.t;
    const drop: THREE.Object3D[] = [];
    for (const c of g.children) {
      const part = c.userData.pwDiner as string | undefined;
      if (!part) continue;
      const m = c as THREE.Mesh;
      b.setMatrix(m.matrixWorld);
      if (part === 'stoolSeat' || part === 'stoolPole') {
        const p = (m.geometry as THREE.CylinderGeometry).parameters;
        if (part === 'stoolSeat') cylinder(b, p.radiusTop, p.height, 10, t.stoolSide, t.stoolTop, 12, 16);
        else cylinder(b, p.radiusTop, p.height, 6, t.chrome, null);
        drop.push(c);
        continue;
      }
      const p = (m.geometry as THREE.BoxGeometry).parameters;
      const all = (tile: PwTile): Partial<Record<Face, PwTile>> => ({ px: tile, nx: tile, py: tile, ny: tile, pz: tile, nz: tile });
      switch (part) {
        case 'shell':
          boxFaces(b, p.width, p.height, p.depth, all(t.panel));
          break;
        case 'roof':
          boxFaces(b, p.width, p.height, p.depth, { py: this.roof, pz: t.flute, px: t.panel, nx: t.panel, nz: t.panel, ny: t.panel });
          // Roof clutter breaking the box: two exhaust fans (crossed cut-outs) on the roof deck.
          for (const fx of [-5.5, 6.2]) {
            const fw = t.fan.w / PW_TPM;
            const fh = t.fan.h / PW_TPM;
            const y0 = p.height / 2;
            const z0 = -1.5;
            b.rect(_o.set(fx - fw / 2, y0, z0), X, Y, fw, fh, t.fan);
            b.rect(_o.set(fx + fw / 2, y0, z0 - 0.02), NX, Y, fw, fh, t.fan, { flipU: true });
            b.rect(_o.set(fx, y0, z0 + fw / 2), NZ, Y, fw, fh, t.fan);
          }
          break;
        case 'kick':
        case 'header':
        case 'mullion':
        case 'doorHead':
          boxFaces(b, p.width, p.height, p.depth, { pz: t.flute, px: t.flute, nx: t.flute, py: t.flute, ny: t.flute });
          break;
        case 'stripe':
          boxFaces(b, p.width, p.height, p.depth, { pz: t.stripe, px: t.stripe, nx: t.stripe, py: t.flute, ny: t.flute });
          break;
        case 'checker':
          boxFaces(b, p.width, p.height, p.depth, { pz: t.checker, px: t.checker, nx: t.checker, py: t.flute, ny: t.flute });
          break;
        case 'backWall':
          boxFaces(b, p.width, p.height, p.depth, { pz: t.wall });
          // The menu board, the clock and the kitchen pass on the back wall (over the back bar).
          b.rect(_o.set(-6.4, -p.height / 2 + 2.3, p.depth / 2 + 0.01), X, Y, t.menu.w / PW_TPM, t.menu.h / PW_TPM, t.menu);
          b.rect(_o.set(-1.4, -p.height / 2 + 2.95, p.depth / 2 + 0.01), X, Y, t.clock.w / PW_TPM, t.clock.h / PW_TPM, t.clock);
          b.rect(_o.set(4.6, -p.height / 2 + 2.15, p.depth / 2 + 0.01), X, Y, t.pass.w / PW_TPM, t.pass.h / PW_TPM, t.pass);
          break;
        case 'sideWall':
          boxFaces(b, p.width, p.height, p.depth, { px: t.wall, nx: t.wall });
          break;
        case 'ceiling':
          boxFaces(b, p.width, p.height, p.depth, { ny: t.ceiling });
          break;
        case 'floor':
          boxFaces(b, p.width, p.height, p.depth, { py: t.floor });
          break;
        case 'counter':
          boxFaces(b, p.width, p.height, p.depth, { pz: t.counter, px: t.chrome, nx: t.chrome, py: t.chrome });
          break;
        case 'counterTop':
          boxFaces(b, p.width, p.height, p.depth, all(t.chrome));
          break;
        case 'boothSeat':
        case 'boothBack':
          boxFaces(b, p.width, p.height, p.depth, { pz: t.vinyl, nz: t.vinyl, px: t.vinyl, nx: t.vinyl, py: t.vinyl });
          break;
        case 'table':
          boxFaces(b, p.width, p.height, p.depth, { py: t.table, pz: t.chrome, px: t.chrome, nx: t.chrome, ny: t.chrome });
          break;
        case 'backBar':
          boxFaces(b, p.width, p.height, p.depth, { pz: t.backbar, py: t.chrome, px: t.chrome, nx: t.chrome });
          break;
        case 'door':
          boxFaces(b, p.width, p.height, p.depth, { pz: t.door, px: t.chrome, nx: t.chrome });
          break;
        default:
          continue;
      }
      drop.push(c);
    }
    b.setMatrix(null);
    return drop;
  }

  /**
   * The buzzing 'r' of the neon "Diner" script: a tile with that letter's tubes
   * dark (its board behind), laid over the painted sign (same layout as
   * `neonSign`'s script) — the classic overlay is a dark block letter.
   * `sign` is the board group (`pwSign` "Diner"); returns the overlay's batch.
   */
  rOverlay(atlas: PwAtlas, sign: THREE.Object3D): PwBatch | null {
    const info = sign.userData.pwSign as { text: string; size: number; bw?: number; bh?: number };
    if (!info || info.text !== 'Diner') return null;
    // neonSign's layout for { font: 'script', cap: size × 0.9, minW / minH = the classic board }.
    const f = FONT_5x7;
    const scale = fontScaleFor('script', info.size * 0.9);
    const to = { scale, script: true, spacing: 1 };
    const pad = 4 + scale * 2;
    const tw = textWidth(info.text, f, to);
    const th = f.h * scale;
    const W = Math.ceil(Math.max(tw + pad * 2, Math.round((info.bw ?? 0) * PW_TPM)) / 2) * 2;
    const H = Math.ceil(Math.max(th + pad * 2, Math.round((info.bh ?? 0) * PW_TPM)) / 2) * 2;
    const x0 = Math.round((W - tw) / 2);
    const y0 = Math.round((H - th) / 2);
    const r0 = x0 + textWidth('Dine', f, { scale, spacing: 1 }) + scale;
    const r1 = Math.min(W - 6, x0 + tw + 2);
    const ow = Math.max(16, Math.ceil((r1 - r0) / 2) * 2);
    const oh = H - 12;
    const tile = atlas.tile(`z1diner|roff|${W}x${H}|${r0}`, ow, oh, (c, k) => {
      const board = k.ramp(0x1c1c22, { light: 0.5, sat: 0.8 });
      const dead = k.ramp(0x5a1a30, { light: 0.4 });
      c.rect(0, 0, ow, oh, board, 2);
      // The whole word in dead tube colour, shifted so only the 'r' falls inside this tile.
      neonText(c, info.text, x0 - r0, y0 - 6, f, dead, { ...to, core: 2, halo: 1 });
      for (let i = 0; i < c.flag.length; i++) c.flag[i] &= ~PWF.GLOW;
    });
    const b = new PwBatch(atlas);
    sign.updateMatrixWorld(true);
    b.setMatrix(sign.matrixWorld);
    b.rect(_o.set(-W / PW_TPM / 2 + r0 / PW_TPM, -H / PW_TPM / 2 + 6 / PW_TPM, 0.016), X, Y, ow / PW_TPM, oh / PW_TPM, tile);
    b.setMatrix(null);
    return b;
  }
}
