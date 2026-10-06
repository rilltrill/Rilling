import * as THREE from 'three';
import type { TexName } from '../../kit/Textures';
import { PwAtlas, type PwTile } from '../../pixelworld/atlas';
import { PwBatch, planarUv } from '../../pixelworld/batch';
import { NEUTRAL_BRICK, NEUTRAL_HEX } from '../../pixelworld/retexture';
import { asphaltTile, brickTile, corrugatedTile, curbTile, grateTile, hazardTile, roadPaintTile, sidewalkTile } from '../../pixelworld/surfaces';
import { chainFenceTile } from '../../pixelworld/props';
import {
  z2BlockTile, z2CeilingTile, z2ConcreteTile, z2CurtainTile, z2EnamelTile, z2FleshTile, z2FloorTileTile, z2GlazedTile, z2LinenTile, z2MarbleTile, z2PaintTile,
  z2PlainTile, z2RailTile, z2SheetVinylTile, z2SkirtingTile, z2SteelTile, z2StonePanelTile, z2TerrazzoTile, z2VeneerTile, z2VinylTile, z2WallpaperTile,
} from '../../pixelworld/z2surfaces';
import { B } from './layout';
import { PW_TPM } from '../../pixelworld/canvas';
import { pwMaterial } from '../../pixelworld/material';
import { hash2 } from '../../pixelworld/surfaces';
import { ventModule } from '../../pixelworld/interior';
import {
  bloodPoolDecal, bloodWipeDecal, bloodWordsDecal, ceilingHoleDecal, ceilingStainDecal, dragTrailTile, drainDecal, floorCrackDecal, floorStainDecal, handprintDecal,
  papersDecal, pictureGhostDecal, pillsDecal, puddleDecal, spatterDecal, wallCrackDecal, waterStainDecal,
} from '../../pixelworld/z2decals';
import {
  clockFace, emergencyLampFace, extinguisherMod, fixture, hospitalWindow, monitorFace, nightWindow, redCross, troffer, tvBroadcast, vendingFront,
  whiteboardFace, xrayFace, type FixtureKind, type HospWindowKind,
} from '../../pixelworld/z2modules';
import { Z2Billboards } from '../../pixelworld/z2billboard';
import { PwBackdrop } from '../../pixelworld/backdrop';
import { z2CityTile, z2StormSkyTile } from '../../pixelworld/z2sky';
import { binSprite, bodyBagSprite, coneSprite, corpseSprite, crashCartSprite, ivSprite, laundrySprite, potSprite, trolleySprite, wheelchairSprite } from '../../pixelworld/z2props';
import { z2ExitSign, z2LitSign, z2PlateSign, z2Poster, z2Stencil, type PosterKind } from '../../pixelworld/z2signs';

/**
 * ST. MERCY HOSPITAL in ART: PIXEL WORLD.
 *
 * Every zone is converted BEFORE z2's colour baker runs (`convertZone`), and
 * every `bakeInto` set piece (curtains, drawers, pendant lamps, the crashing
 * ambulance…) before its own bake (`convertInto`): what PixelWorld paints is
 * re-emitted into one PwBatch per zone / set piece (one draw call, culled with
 * its group) and removed; the baker only merges what stays classic (glows,
 * glass). Gameplay never sees it: occluders, ground, door slots, drawers,
 * vents and destructibles are the stage's own, built from the same RNG draws
 * in every ART style (the builders only RECORD what painting replaces).
 */

/** Painted re-texture rule result: a tile, and a vertex tint (sRGB hex) for NEUTRAL tiles. */
interface Pick {
  tile: PwTile;
  tint: number;
}

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
const _la = new THREE.Vector3();
const _lb = new THREE.Vector3();
const _lc = new THREE.Vector3();
const _n = new THREE.Vector3();
const _e1 = new THREE.Vector3();
const _e2 = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _col = new THREE.Color();
const _base = new THREE.Color();

/** Linear-ratio tint that turns a NEUTRAL tile (painted round `base`) into `hex`, as an sRGB hex for PwBatch. */
function tintHex(hex: number, base: number): number {
  _col.setHex(hex);
  _base.setHex(base);
  _col.setRGB(Math.min(1, _col.r / Math.max(1e-4, _base.r)), Math.min(1, _col.g / Math.max(1e-4, _base.g)), Math.min(1, _col.b / Math.max(1e-4, _base.b)));
  return _col.getHex();
}

interface Job {
  parent: THREE.Object3D;
  batch: PwBatch;
  bills: Z2Billboards;
}

/** A wall / floor / ceiling piece seen by the converter (world-axis box), for the decal scatter. */
interface Piece {
  box: THREE.Box3;
  kind: 'wallHi' | 'wallLo' | 'block' | 'floor' | 'ceil';
  hex: number;
}

const X = new THREE.Vector3(1, 0, 0);
const Y = new THREE.Vector3(0, 1, 0);
const Z = new THREE.Vector3(0, 0, 1);
const NX = new THREE.Vector3(-1, 0, 0);
const NZ = new THREE.Vector3(0, 0, -1);
const _o = new THREE.Vector3();
const _u = new THREE.Vector3();
const _v = new THREE.Vector3();
const _rel = new THREE.Matrix4();
const _inv = new THREE.Matrix4();
const _box = new THREE.Box3();
const _p = new THREE.Vector3();


/** ST. MERCY HOSPITAL's PIXEL WORLD converter (one per stage build). */
export class Z2PixelWorld {
  readonly atlas = new PwAtlas('z2');
  readonly skyAtlas = new PwAtlas('z2-sky', { levels: 1 });
  private jobs: Job[] = [];
  private cache = new Map<string, Pick | null>();
  /** Flicker diffusers / vent grates painted after the atlas is built. */
  private dynFlickers: { mesh: THREE.Mesh; warm: boolean }[] = [];
  private dynGrates: THREE.Mesh[] = [];
  /** Decal counter (staggers coplanar decal offsets). */
  private nDecal = 0;
  /** Billboards of the group being converted. */
  private bills = new Z2Billboards();

  // ─── Zones ────────────────────────────────────────────────────────────────

  /** Re-paint a zone's static scenery (call before `bake(g)`). */
  convertZone(g: THREE.Group) {
    const b = new PwBatch(this.atlas);
    this.bills = new Z2Billboards();
    this.jobs.push({ parent: g, batch: b, bills: this.bills });
    g.updateMatrixWorld(true);
    const floor = ZONE_FLOOR[g.name] ?? 0;
    const pieces: Piece[] = [];
    this.handleTagged(g, b);
    this.emitAll(g, b, floor, true, pieces);
    this.scatter(b, pieces, g.name);
  }

  /** `bakeInto` hook: re-paint a set piece's meshes into a batch in its parent's frame (call before its bake). */
  convertInto(g: THREE.Group, parent: THREE.Object3D) {
    const b = new PwBatch(this.atlas);
    this.bills = new Z2Billboards();
    this.jobs.push({ parent, batch: b, bills: this.bills });
    g.updateMatrixWorld(true);
    this.handleTagged(g, b);
    this.emitAll(g, b, 0, false, null);
  }

  /** Register the dynamic panels / grates (their painted look is set in `finish`). */
  registerDynamic(flickers: { mesh: THREE.Mesh }[], grates: THREE.Object3D[]) {
    // Registers the tiles now (before the atlas is built).
    troffer(this.atlas, 'on');
    troffer(this.atlas, 'warm');
    ventModule(this.atlas, { hex: 0x9aa09c });
    for (const f of flickers) this.dynFlickers.push({ mesh: f.mesh, warm: (f.mesh.material as THREE.MeshBasicMaterial).color?.getHex?.() === 0xfff1d0 });
    for (const g of grates) this.dynGrates.push(g as THREE.Mesh);
  }

  /** Paint the atlas and build every batch (each mesh joins the group it was made for). */
  finish(gain = 1, flickers?: { mesh: THREE.Mesh; on: THREE.Material; off: THREE.Material }[]) {
    this.atlas.build();
    for (const j of this.jobs) {
      const mesh = j.batch.build(undefined, { gain });
      if (mesh) j.parent.add(mesh);
      const bm = j.bills.build(this.atlas, gain);
      if (bm) j.parent.add(bm);
    }
    this.jobs.length = 0;
    // Flickering troffers: one painted quad geometry (mesh-local), lit / unlit by material.
    if (flickers?.length) {
      const on = pwMaterial(this.atlas, { gain });
      const off = pwMaterial(this.atlas, { gain, glow: 0.1, tag: 'off' });
      const geo = (t: PwTile) => {
        const b = new PwBatch(this.atlas);
        b.rect(_o.set(-0.345, -0.016, -0.625), X, Z, 22 / PW_TPM, 40 / PW_TPM, t);
        return b.build()!.geometry;
      };
      const gOn = geo(troffer(this.atlas, 'on'));
      const gWarm = geo(troffer(this.atlas, 'warm'));
      for (const f of flickers) {
        const warm = this.dynFlickers.find((d) => d.mesh === f.mesh)?.warm ?? false;
        const lit = f.mesh.material === f.on;
        f.mesh.geometry = warm ? gWarm : gOn;
        f.on = on;
        f.off = off;
        f.mesh.material = lit ? on : off;
        f.mesh.raycast = () => {};
      }
    }
    // Vent grates: a painted louvre quad seen from below and above (they tumble when they drop).
    if (this.dynGrates.length) {
      const b = new PwBatch(this.atlas);
      const t = ventModule(this.atlas, { hex: 0x9aa09c });
      b.rect(_o.set(-0.35, -0.016, -0.35), X, Z, 0.7, 0.7, t);
      b.rect(_o.set(-0.35, 0.016, 0.35), X, NZ, 0.7, 0.7, t);
      const geo = b.build()!.geometry;
      const mat = pwMaterial(this.atlas, { gain });
      for (const m of this.dynGrates) {
        m.geometry = geo;
        m.material = mat;
      }
    }
  }

  // ─── Sky ──────────────────────────────────────────────────────────────────

  backdrop: PwBackdrop | null = null;

  /** The painted storm night over the bay (sky band dissolving into `top`, the city beyond the fence). */
  buildBackdrop(fog: number, top: number): THREE.Group {
    const s = this.skyAtlas;
    const sky = z2StormSkyTile(s, { fog, top, glow: 0x8a4a22, el0: -3, el1: 27 });
    const city = z2CityTile(s, { hex: 0x161c26, fog, fire: 0xff7a2a, el0: -2, el1: 9 });
    this.backdrop = new PwBackdrop(s, null, [
      { tile: sky, radius: 330, el0: -3, el1: 27, repeat: 2, follow: 1 },
      { tile: city, radius: 290, el0: -2, el1: 9, repeat: 2, yaw: 40, follow: 0.97 },
    ]);
    this.backdrop.anchor.set(0, 0, 0);
    return this.backdrop.build();
  }

  /** Lightning lights the painted clouds (0 = none). Allocation-free. */
  lightning(k: number) {
    const g = this.backdrop?.group.children[0] as THREE.Mesh | undefined;
    const u = (g?.material as THREE.Material | undefined)?.userData.pw as { uPwGain: { value: number }; uPwGlow: { value: number } } | undefined;
    if (u) {
      u.uPwGain.value = 1 + k * 0.6;
      u.uPwGlow.value = 1 + k * 0.3;
    }
  }

  // ─── Tagged objects (signs, fixtures, blood, papers, windows…) ───────────

  private handleTagged(root: THREE.Object3D, b: PwBatch) {
    root.updateMatrixWorld(true);
    _inv.copy(root.matrixWorld).invert();
    const tagged: THREE.Object3D[] = [];
    root.traverse((o) => {
      if (o !== root && o.userData.pw) tagged.push(o);
    });
    const attached = (o: THREE.Object3D) => {
      let p: THREE.Object3D | null = o;
      while (p && p !== root) p = p.parent;
      return p === root;
    };
    for (const o of tagged) {
      if (!attached(o)) continue;
      _rel.multiplyMatrices(_inv, o.matrixWorld);
      const drop = this.handle(o, b, _rel.clone(), root);
      if (drop) o.parent?.remove(o);
    }
  }

  /** Lay a module rect in an object's frame. */
  private lay(b: PwBatch, m: THREE.Matrix4, o: THREE.Vector3, ux: THREE.Vector3, vy: THREE.Vector3, w: number, h: number, t: PwTile, opts: { tint?: number; flipU?: boolean } = {}) {
    b.setMatrix(m);
    b.rect(o, ux, vy, w, h, t, opts);
    b.setMatrix(null);
  }

  /** Paint what a tagged object stands for; returns true when the classic object goes. */
  private handle(o: THREE.Object3D, b: PwBatch, m: THREE.Matrix4, root: THREE.Object3D): boolean {
    const a = this.atlas;
    const info = o.userData.pw as Record<string, unknown> & { kind: string };
    const hsh = hash2(Math.round(m.elements[12] * 7), Math.round(m.elements[14] * 7), 5);
    switch (info.kind) {
      case 'lit': {
        const t = z2LitSign(a, info.text as string, info.color as number, {
          px: info.px as number,
          plate: info.plate as number | null,
          broken: info.broken as number[] | undefined,
          neon: (info.text as string).startsWith('EMERGENCY'),
        });
        this.lay(b, m, _o.set(-t.wM / 2, -t.hM / 2, info.plate === null ? 0.004 : 0.012), X, Y, t.wM, t.hM, t.tile);
        return true;
      }
      case 'plate': {
        const t = z2PlateSign(a, info.text as string, info.ink as number, info.plate as number, info.px as number);
        this.lay(b, m, _o.set(-t.wM / 2, -t.hM / 2, 0.006), X, Y, t.wM, t.hM, t.tile);
        return true;
      }
      case 'text': {
        const text = info.text as string;
        if (info.glow) {
          const t = z2LitSign(a, text, info.color as number, { px: info.px as number, plate: null });
          this.lay(b, m, _o.set(-t.wM / 2, -t.hM / 2, 0.004), X, Y, t.wM, t.hM, t.tile);
        } else {
          const t = z2Stencil(a, text, info.color as number, info.px as number, text === 'AMBULANCE' ? 0.45 : 0.25);
          this.lay(b, m, _o.set(-t.wM / 2, -t.hM / 2, 0.004), X, Y, t.wM, t.hM, t.tile);
        }
        return true;
      }
      case 'exit': {
        const t = z2ExitSign(a, info.label as string);
        this.lay(b, m, _o.set(-t.wM / 2, -t.hM / 2, 0.045), X, Y, t.wM, t.hM, t.tile);
        // The housing box stays (re-painted); its glow face goes.
        for (const c of [...o.children]) if (isGlow(c)) o.remove(c);
        return false;
      }
      case 'panel': {
        const t = troffer(a, info.on ? (info.warm ? 'warm' : 'on') : 'off');
        this.lay(b, m, _o.set(-0.345, -0.052, -0.625), X, Z, 22 / PW_TPM, 40 / PW_TPM, t);
        return true;
      }
      case 'flickerFrame':
        // The dynamic diffuser covers it (painted in `finish`).
        return true;
      case 'panelHole': {
        const t = ceilingHoleDecal(a, hsh > 0.5 ? 1 : 0);
        this.lay(b, m, _o.set(-0.35, -0.012, -0.65), X, Z, 0.7, 1.3, t);
        return true;
      }
      case 'ventHole': {
        this.lay(b, m, _o.set(-0.37, -0.012, -0.37), X, Z, 0.74, 0.74, ceilingHoleDecal(a, 1));
        return true;
      }
      case 'monitor': {
        const t = monitorFace(a, info.on as boolean, info.color as number);
        this.lay(b, m, _o.set(-0.22, 0.01, 0.062), X, Y, 14 / PW_TPM, 10 / PW_TPM, t);
        for (const c of [...o.children]) if (isGlow(c) || c.position.z > 0.05) o.remove(c);
        return false;
      }
      case 'clock':
        this.lay(b, m, _o.set(-13 / 64, -13 / 64, 0.058), X, Y, 13 / PW_TPM, 13 / PW_TPM, clockFace(a));
        return true;
      case 'whiteboard':
        this.lay(b, m, _o.set(-25 / PW_TPM, -16 / PW_TPM, 0.035), X, Y, 50 / PW_TPM, 32 / PW_TPM, whiteboardFace(a));
        return true;
      case 'elamp':
        this.lay(b, m, _o.set(-0.125, -0.2, 0.075), X, Y, 8 / PW_TPM, 8 / PW_TPM, emergencyLampFace(a));
        return true;
      case 'fireExt':
        this.lay(b, m, _o.set(-6 / PW_TPM, -0.07, 0.03), X, Y, 12 / PW_TPM, 36 / PW_TPM, extinguisherMod(a));
        return true;
      case 'tv':
        this.lay(b, m, _o.set(-0.75, -0.44, 0.06), X, Y, 1.5, 28 / PW_TPM, tvBroadcast(a));
        for (const c of [...o.children]) if (isGlow(c) || c.type === 'Group') o.remove(c);
        return false;
      case 'xray':
        this.lay(b, m, _o.set(-0.66, -0.44, 0.03), X, Y, 42 / PW_TPM, 28 / PW_TPM, xrayFace(a, info.v as number));
        return true;
      case 'xrayFilm':
      case 'blind':
      case 'sill':
      case 'crossBar':
      case 'skyline':
      case 'poolDrop':
        return true;
      case 'vending': {
        const t = vendingFront(a, info.color as number, info.lit as boolean, (info.color as number) === 0x2a4a9a ? 1 : 0);
        this.lay(b, m, _o.set(-0.5, 0, 0.428), X, Y, 1.0, 62 / PW_TPM, t);
        // Keep the cabinet (re-painted); the front's classic details go.
        for (const c of [...o.children]) if (c.position.z > 0.42 || isGlow(c)) o.remove(c);
        return false;
      }
      case 'win': {
        const on = info.on as boolean;
        const fl = info.fl as number;
        const kind: HospWindowKind = on ? (hsh > 0.66 ? 'blinds' : hsh > 0.33 ? 'curtain' : hsh > 0.18 ? 'figure' : 'lit') : hsh > 0.9 ? 'broken' : hsh > 0.82 && fl === 0 ? 'boarded' : hsh > 0.5 ? 'blinds' : 'dark';
        const lit = on ? [0x9fc8b0, 0xd8c890, 0x8ab0d8][Math.floor(hsh * 3)] : 0x1a2434;
        const t = hospitalWindow(a, kind, lit, Math.floor(hsh * 7) % 2);
        // Window box front is at +0.05; the module covers the opening, its reveal, head and sill.
        this.lay(b, m, _o.set(-28 / PW_TPM, -1.06, -0.02), X, Y, 56 / PW_TPM, 68 / PW_TPM, t);
        return true;
      }
      case 'wingWin': {
        const on = info.on as boolean;
        const kind: HospWindowKind = on ? 'lit' : hsh > 0.85 ? 'broken' : hsh > 0.5 ? 'blinds' : 'dark';
        const t = hospitalWindow(a, kind, on ? 0xd8c890 : 0x1a2434, 1);
        // Box faces +X (the wing's side): lay in the box frame on its +x face.
        this.lay(b, m, _o.set(0.055, -1.06, 28 / PW_TPM), NZ, Y, 56 / PW_TPM, 68 / PW_TPM, t);
        return true;
      }
      case 'cross':
        this.lay(b, m, _o.set(-1.3, -1.3, 0.105), X, Y, 2.6, 2.6, redCross(a));
        return true;
      case 'moonWin': {
        const inward = info.inward as number;
        // The glow box is set back from the room face; lay the night window facing the room.
        const t = nightWindow(a, hsh > 0.5 ? 1 : 0);
        if (inward > 0) this.lay(b, m, _o.set(-0.9, -0.6, 0.03), X, Y, 1.8, 1.2, t);
        else this.lay(b, m, _o.set(0.9, -0.6, -0.03), NX, Y, 1.8, 1.2, t);
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
        _o.set(0, 0.008 + (this.nDecal++ % 4) * 0.0015, 0).addScaledVector(_u, -w / 2).addScaledVector(_v, -h / 2);
        b.rect(_o, _u, _v, w, h, t);
        b.setMatrix(null);
        return true;
      }
      case 'wallSmear': {
        const big = info.big as boolean;
        const t = big ? (hsh > 0.5 ? bloodWipeDecal(a, 0) : handprintDecal(a, 0)) : hsh > 0.6 ? spatterDecal(a) : handprintDecal(a, 1);
        const w = t.w / PW_TPM;
        const h = t.h / PW_TPM;
        this.lay(b, m, _o.set(-w / 2, -h / 2 - (big ? 0.1 : 0), 0.008), X, Y, w, h, t);
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
            _o.set(px, y + (this.nDecal++ % 5) * 0.0012, pz).addScaledVector(_u, -w / 2).addScaledVector(_v, -h / 2);
            b.rect(_o, _u, _v, w, h, t);
          }
        }
        return true;
      }
      case 'wheelchair':
      case 'iv':
      case 'bin':
      case 'crashCart':
      case 'laundryCart':
      case 'trolley':
      case 'plant':
      case 'cone': {
        const t =
          info.kind === 'wheelchair' ? wheelchairSprite(a, info.tipped as boolean)
          : info.kind === 'iv' ? ivSprite(a, (info.liquid as number) === 0x9a1a1a || (info.liquid as number) === 0xa82020)
          : info.kind === 'bin' ? binSprite(a, info.tipped as boolean)
          : info.kind === 'crashCart' ? crashCartSprite(a)
          : info.kind === 'laundryCart' ? laundrySprite(a)
          : info.kind === 'trolley' ? trolleySprite(a)
          : info.kind === 'plant' ? potSprite(a)
          : coneSprite(a);
        _p.setFromMatrixPosition(m);
        _p.y -= (info.foot as number | undefined) ?? 0;
        this.bills.add(_p.x, _p.y, _p.z, t, t.h / PW_TPM, { flip: hsh > 0.5 });
        return true;
      }
      case 'coneBase':
        return true;
      case 'puddle': {
        _p.setFromMatrixPosition(m);
        const t = puddleDecal(a, hsh > 0.5 ? 1 : 0);
        b.rect(_o.set(_p.x - 1, _p.y + 0.004 + (this.nDecal++ % 3) * 0.001, _p.z + 0.625), X, NZ, 2, 1.25, t);
        return true;
      }
      case 'fence': {
        _p.setFromMatrixPosition(m);
        const t = chainFenceTile(a, { hex: 0x8a9498, rust: 0.5 });
        b.rect(_o.set(_p.x - 0.02, 1.0, -25), Z, Y, 50, 1.5, t, { u0: 0, v0: 16 });
        b.rect(_o.set(_p.x + 0.02, 1.0, 25), NZ, Y, 50, 1.5, t, { u0: 0, v0: 16 });
        return true;
      }
      case 'corpse':
      case 'bodyBag': {
        _p.setFromMatrixPosition(m);
        const t = info.kind === 'corpse' ? corpseSprite(a, info.shirt as number, hsh > 0.5 ? 1 : 0) : bodyBagSprite(a);
        this.bills.add(_p.x, _p.y, _p.z, t, t.h / PW_TPM, { flip: hsh > 0.5 });
        if (info.kind === 'corpse') {
          const pt = bloodPoolDecal(a, 2);
          b.rect(_o.set(_p.x - 0.8, _p.y + 0.009 + (this.nDecal++ % 3) * 0.001, _p.z + 0.7), X, NZ, 1.6, 1.4, pt);
        }
        return true;
      }
      default:
        return false;
    }
    void root;
  }

  // ─── Generic re-texture ───────────────────────────────────────────────────

  /** Move every repaintable static mesh under `root` into `b` (in root's frame) and remove it. */
  private emitAll(root: THREE.Object3D, b: PwBatch, floorY: number, world: boolean, pieces: Piece[] | null) {
    const list: THREE.Mesh[] = [];
    root.updateMatrixWorld(true);
    root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh || (m as THREE.InstancedMesh).isInstancedMesh || Array.isArray(m.material) || m.userData.noMerge || m.userData.pixelWorld) return;
      // Subtrees that opted out of baking stay as they are (animated parts).
      let p: THREE.Object3D | null = m.parent;
      while (p && p !== root) {
        if (p.userData.noMerge) return;
        p = p.parent;
      }
      if (!this.repaintable(m.material)) return;
      list.push(m);
    });
    _m.copy(root.matrixWorld).invert();
    const rel = new THREE.Matrix4();
    for (const m of list) {
      const mat = m.material as THREE.MeshLambertMaterial;
      rel.multiplyMatrices(_m, m.matrixWorld);
      const flip = mat.side === THREE.BackSide;
      const both = mat.side === THREE.DoubleSide;
      const pick = (nx: number, ny: number, nz: number) => this.rule(mat, nx, ny, nz);
      emitMesh(b, m.geometry, rel, pick, { world, flip, floorY });
      if (both) emitMesh(b, m.geometry, rel, pick, { world, flip: true, floorY });
      if (pieces && m.parent === root && m.geometry.type === 'BoxGeometry') {
        const kind = pieceKind(mat);
        if (kind) {
          if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
          pieces.push({ box: _box.copy(m.geometry.boundingBox!).applyMatrix4(rel).clone(), kind, hex: mat.color.getHex() });
        }
      }
      m.parent?.remove(m);
    }
  }

  // ─── Decal scatter (stains, ghosts, blood, notices, holes) ────────────────

  private scatter(b: PwBatch, pieces: Piece[], zone: string) {
    const a = this.atlas;
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
            _o.set(gx + 0.5, y + 0.004 + (this.nDecal++ % 4) * 0.001, gz + 0.5).addScaledVector(_u, -w / 2).addScaledVector(_v, -hh / 2);
            b.rect(_o, _u, _v, w, hh, t, { tint: decalTint(t, p.hex) });
          }
        }
        continue;
      }
      // Walls: the two broad faces of the piece.
      const alongX = sx >= sz;
      const len = alongX ? sx : sz;
      if (len < 1.0 || sy < 0.5) continue;
      for (const side of [1, -1]) {
        const fc = alongX ? (side > 0 ? bx.max.z : bx.min.z) : side > 0 ? bx.max.x : bx.min.x;
        // ux runs left → right seen from the face's side.
        const ux = alongX ? (side > 0 ? X : NX) : side > 0 ? NZ : Z;
        const start = alongX ? (side > 0 ? bx.min.x : bx.max.x) : side > 0 ? bx.max.z : bx.min.z;
        const slots = Math.floor(len / 2.2);
        for (let i = 0; i < slots; i++) {
          const along = 0.6 + (i + hash2(i, Math.round(fc * 5), 3) * 0.5) * (len - 1.2) / Math.max(1, slots);
          const h = hash2(Math.round(start * 3) + i * 7, Math.round(fc * 3) + side, 43);
          const t = this.wallDecal(p, h, ext);
          if (!t) continue;
          const w = t.w / PW_TPM;
          const hh = t.h / PW_TPM;
          if (w > len - 0.3 || hh > sy - 0.15) continue;
          const y0 = p.kind === 'wallLo' ? bx.min.y + Math.min(sy - hh - 0.05, 0.15 + hash2(i, 5, 7) * 0.5) : bx.min.y + Math.min(sy - hh - 0.1, 0.25 + hash2(i, 9, 7) * Math.max(0, Math.min(1.4, sy - hh - 0.4)));
          const off = 0.006 + (this.nDecal++ % 3) * 0.002;
          _o.set(0, y0, 0);
          if (alongX) _o.set(start + (side > 0 ? along - w / 2 : -(along - w / 2)), y0, fc + side * off);
          else _o.set(fc + side * off, y0, start + (side > 0 ? -(along - w / 2) : along - w / 2));
          b.rect(_o, ux, Y, w, hh, t, { tint: decalTint(t, p.hex) });
        }
      }
    }
  }

  /** The decal for a wall slot (null = leave the wall plain here). */
  private wallDecal(p: Piece, h: number, ext: boolean): PwTile | null {
    const a = this.atlas;
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
  private repaintable(m: THREE.Material): boolean {
    if (m.transparent || m.userData.pixelWorld) return false;
    const l = m as THREE.MeshLambertMaterial;
    if (!l.isMeshLambertMaterial) return false;
    if (l.vertexColors || l.map) return false;
    if (l.emissive && l.emissive.getHex() !== 0) return false;
    // Bullet occluders are invisible proxies (never repainted, never removed).
    if (l.color.getHex() === 0xff00ff) return false;
    return true;
  }

  /** The painted tile (and tint) for a Kit material on a face with world normal n. */
  private rule(mat: THREE.MeshLambertMaterial, _nx: number, ny: number, _nz: number): Pick | null {
    const tex = mat.userData.retroTex as TexName | undefined;
    const hex = mat.color.getHex();
    const face = ny > 0.7 ? 'up' : ny < -0.7 ? 'down' : 'side';
    const key = `${tex}|${mat.userData.retroScale ?? ''}|${mat.userData.retroStrength ?? ''}|${hex}|${face}`;
    let p = this.cache.get(key);
    if (p === undefined) {
      p = this.pickFor(tex, `${tex}|${mat.userData.retroScale}|${mat.userData.retroStrength}`, hex, face);
      this.cache.set(key, p);
    }
    return p;
  }

  private pickFor(tex: TexName | undefined, preset: string, hex: number, face: 'up' | 'down' | 'side'): Pick | null {
    const a = this.atlas;
    const own = (tile: PwTile): Pick => ({ tile, tint: 0xffffff });
    const neutral = (tile: PwTile, base = NEUTRAL_HEX): Pick => {
      tile.neutral = base;
      return { tile, tint: tintHex(hex, base) };
    };
    switch (preset) {
      // ── Walls ──
      case 'tiles|1.2|0.62': {
        const spec = GLAZED[hex];
        if (spec) return own(z2GlazedTile(a, { hex, ...spec }));
        return neutral(z2GlazedTile(a, { hex: NEUTRAL_HEX }));
      }
      case 'stucco|1|0.65':
        if (hex === 0x86968a || hex === 0x94a690) return own(z2PaintTile(a, { hex }));
        return neutral(z2PaintTile(a, { hex: NEUTRAL_HEX }));
      case 'wallpaper|1|0.4':
        if (hex === 0x8e8670) return own(z2WallpaperTile(a, { hex }));
        return neutral(z2WallpaperTile(a, { hex: NEUTRAL_HEX }));
      case 'wallpaper|0.7|0.55':
        return neutral(z2CurtainTile(a, { hex: NEUTRAL_HEX }));
      case 'brick|1.25|0.5':
        if (hex === 0x3f5a4e || hex === 0x6a6c66) return own(z2BlockTile(a, { hex }));
        return neutral(z2BlockTile(a, { hex: NEUTRAL_HEX }));
      case 'brick|0.8|0.85':
        return neutral(brickTile(a, { hex: NEUTRAL_BRICK, grime: 0.7 }), NEUTRAL_BRICK);
      case 'concrete|1|0.8':
        if (hex === 0x4e4a44 && face === 'side') return own(z2StonePanelTile(a, { hex }));
        if (hex === 0x66665e && face === 'up') return own(sidewalkTile(a, { hex }));
        if (hex === 0x8a8a80) return own(curbTile(a, { hex }));
        return neutral(z2ConcreteTile(a, { hex: NEUTRAL_HEX, joints: face !== 'side' }));
      // ── Floors / ceilings ──
      case 'checker|0.55|0.34':
        if (hex === 0x5d6a63) return own(z2VinylTile(a, { a: 0x5d6a63, b: 0x46524c }));
        return own(z2SheetVinylTile(a, { hex }));
      case 'checker|0.32|0.36':
        return own(z2MarbleTile(a, { a: 0x77736a, b: 0x4e4a44 }));
      case 'tiles|0.5|0.85':
        return own(z2FloorTileTile(a, { hex }));
      case 'tiles|0.5|0.8':
        return neutral(z2CeilingTile(a, { hex: NEUTRAL_HEX }));
      case 'asphalt|1|0.9':
        return own(asphaltTile(a, { hex: 0x3a3e46, wet: true, wear: 0.7 }));
      case 'asphalt|1.6|0.6':
        return own(z2TerrazzoTile(a, { hex, chips: [0x3a6a5a, 0xd8dcd0] }));
      // ── Props ──
      case 'metal|2|0.5':
        return neutral(z2SteelTile(a, { hex: NEUTRAL_HEX }));
      case 'metal|1.5|0.32':
      case 'metal|1|0.3':
        return neutral(z2EnamelTile(a, { hex: NEUTRAL_HEX }));
      case 'cloth|0.5|0.55':
        return neutral(z2LinenTile(a, { hex: NEUTRAL_HEX }));
      case 'planks|1.2|0.35':
        return neutral(z2VeneerTile(a, { hex: NEUTRAL_HEX }));
      case 'grate|1.5|0.9':
        return own(grateTile(a, { hex }));
      case 'hazard|1|0.7':
        return own(hazardTile(a, {}));
      case 'corrugated|1.2|0.5':
        return neutral(corrugatedTile(a, { hex: NEUTRAL_HEX, rust: 0.6 }));
      case 'hide|1.3|0.75':
      case 'hide|2.2|0.45':
        return own(z2FleshTile(a, { hex }));
      case 'skin|0.7|0.65':
        return neutral(z2LinenTile(a, { hex: NEUTRAL_HEX }));
      default:
        break;
    }
    if (tex === 'grain' || tex === undefined) {
      // Untextured colours: skirtings, rails, rubber, dark fixtures.
      if (SKIRTING.has(hex)) return own(z2SkirtingTile(a, { hex }));
      if (hex === 0xc9cdbf || hex === 0xb9a07a) return own(z2RailTile(a, { hex }));
      if (hex === 0xb8962a) return own(roadPaintTile(a, { hex, wear: 0.6 }));
      return neutral(z2PlainTile(a, { hex: NEUTRAL_HEX }));
    }
    if (tex === 'water') return own(z2PlainTile(a, { hex }));
    return neutral(z2PlainTile(a, { hex: NEUTRAL_HEX }));
  }
}

/** Which decal family a shell piece belongs to (by its material preset). */
function pieceKind(m: THREE.MeshLambertMaterial): Piece['kind'] | null {
  const k = `${m.userData.retroTex}|${m.userData.retroScale}|${m.userData.retroStrength}`;
  switch (k) {
    case 'stucco|1|0.65':
    case 'wallpaper|1|0.4':
      return m.side === THREE.BackSide ? null : 'wallHi';
    case 'tiles|1.2|0.62':
      return 'wallLo';
    case 'brick|1.25|0.5':
      return 'block';
    case 'checker|0.55|0.34':
    case 'checker|0.32|0.36':
    case 'tiles|0.5|0.85':
    case 'asphalt|1.6|0.6':
      return 'floor';
    case 'tiles|0.5|0.8':
      return 'ceil';
    default:
      return null;
  }
}

/** Vertex tint for a decal on a surface of colour `hex` (NEUTRAL decals take the surface's colour). */
function decalTint(t: PwTile, hex: number): number {
  return t.neutral === undefined ? 0xffffff : tintHex(hex, t.neutral);
}

function isGlow(o: THREE.Object3D): boolean {
  const m = (o as THREE.Mesh).material as THREE.Material | undefined;
  return !!m && !Array.isArray(m) && (m as THREE.MeshBasicMaterial).isMeshBasicMaterial === true;
}

const POSTERS: PosterKind[] = ['handwash', 'quarantine', 'nosmoking', 'evac', 'flu', 'visiting', 'cork', 'painting', 'chart', 'missing'];
const FIXTURES: FixtureKind[] = ['switch', 'alarm', 'sanitizer', 'phone', 'sharps', 'gloves', 'thermostat', 'hoseReel'];
const WORDS = ['HELP US', 'GOD IS DEAD', 'NO ROOM', 'IT HUNGERS', 'RUN', 'DONT LET IT OUT'];

/** Floor height per zone (wall tiles are laid with v from the floor). */
const ZONE_FLOOR: Record<string, number> = {
  bay: 0,
  bayField: 0,
  er: 0,
  corrA: 0,
  ward: 0,
  hub: 0,
  morgue: B,
  corrB: B,
  or: B,
  corrC: B,
  atrium: B,
};

/** Wainscot / wall tiles per material colour. */
const GLAZED: Record<number, { tw?: number; th?: number; bond?: boolean; grime?: number; grout?: number }> = {
  0x2a6258: { grime: 0.6 },
  0x2e6a5e: { grime: 0.5 },
  0x587478: { tw: 16, th: 12, grime: 0.8 },
  0x9fb2b4: { tw: 16, th: 12, grime: 0.4, grout: 0x7a8486 },
  0x2a6a56: { tw: 16, th: 16, grime: 0.5 },
  0x3a7462: { tw: 16, th: 16, grime: 0.3 },
};

/** Skirting colours (the shells' base boards). */
const SKIRTING = new Set([0x232826, 0x1e2220, 0x2a3436, 0x1e2a26, 0x1e1e1c]);

/**
 * Re-emit a geometry's triangles (placed by `m`, in the batch's frame) with a
 * tile per face from `pick` (sees the WORLD normal of the visible side):
 * planar texel UVs on each face's dominant axis — in world space (`world`:
 * courses run on across pieces; wall v measured from `floorY`) or in the
 * object's scaled frame. `flip` emits the back face (BackSide room shells).
 */
function emitMesh(b: PwBatch, geo: THREE.BufferGeometry, m: THREE.Matrix4, pick: (nx: number, ny: number, nz: number) => Pick | null, o: { world: boolean; flip: boolean; floorY: number }) {
  const p = geo.getAttribute('position');
  const index = geo.index;
  const triCount = index ? index.count : p.count;
  const e = m.elements;
  const sx = Math.hypot(e[0], e[1], e[2]);
  const sy = Math.hypot(e[4], e[5], e[6]);
  const sz = Math.hypot(e[8], e[9], e[10]);
  const prev = b.matrix.clone();
  b.setMatrix(null);
  for (let i = 0; i + 2 < triCount; i += 3) {
    const i0 = index ? index.getX(i) : i;
    let i1 = index ? index.getX(i + 1) : i + 1;
    let i2 = index ? index.getX(i + 2) : i + 2;
    if (o.flip) [i1, i2] = [i2, i1];
    _la.fromBufferAttribute(p, i0);
    _lb.fromBufferAttribute(p, i1);
    _lc.fromBufferAttribute(p, i2);
    _a.copy(_la).applyMatrix4(m);
    _b.copy(_lb).applyMatrix4(m);
    _c.copy(_lc).applyMatrix4(m);
    _e1.subVectors(_b, _a);
    _e2.subVectors(_c, _a);
    _n.crossVectors(_e1, _e2);
    if (_n.lengthSq() < 1e-12) continue;
    _n.normalize();
    const pk = pick(_n.x, _n.y, _n.z);
    if (!pk) continue;
    const t = pk.tile;
    let ua: number, va: number, ub: number, vb: number, uc: number, vc: number;
    if (o.world) {
      [ua, va] = planarUv(_a, _n, t.density);
      [ub, vb] = planarUv(_b, _n, t.density);
      [uc, vc] = planarUv(_c, _n, t.density);
      if (Math.abs(_n.y) <= 0.7) {
        const off = o.floorY * t.density;
        va -= off;
        vb -= off;
        vc -= off;
      }
    } else {
      _la.set(_la.x * sx, _la.y * sy, _la.z * sz);
      _lb.set(_lb.x * sx, _lb.y * sy, _lb.z * sz);
      _lc.set(_lc.x * sx, _lc.y * sy, _lc.z * sz);
      _e1.subVectors(_lb, _la);
      _e2.subVectors(_lc, _la);
      _e1.cross(_e2);
      if (_e1.lengthSq() < 1e-12) continue;
      _e1.normalize();
      [ua, va] = planarUv(_la, _e1, t.density);
      [ub, vb] = planarUv(_lb, _e1, t.density);
      [uc, vc] = planarUv(_lc, _e1, t.density);
    }
    // Keep texel coords small (precision): shift by whole tile periods.
    const su = Math.floor(Math.min(ua, ub, uc) / t.w) * t.w;
    const sv = Math.floor(Math.min(va, vb, vc) / t.h) * t.h;
    b.tri(_a, _b, _c, t, [ua - su, va - sv, ub - su, vb - sv, uc - su, vc - sv], pk.tint);
  }
  b.setMatrix(prev);
}
