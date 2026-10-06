import * as THREE from 'three';
import { Kit } from '../content/kit/ModelKit';
import { PwAtlas, type PwTile } from '../content/pixelworld/atlas';
import { PwBatch, tintFor } from '../content/pixelworld/batch';
import { pwBackdropMaterial, pwMaterial, pwTick } from '../content/pixelworld/material';
import { PwBackdrop } from '../content/pixelworld/backdrop';
import { PW_BACKDROP_TPD } from '../content/pixelworld/canvas';
import {
  asphaltTile, brickTile, curbTile, hazardTile, metalTile, plasterTile, roadPaintTile, rockTile, roofTile, sidewalkTile, grassTile, dirtRoadTile,
} from '../content/pixelworld/surfaces';
import { awningTile, corniceTile, shopfrontModule, SHOP_BAY_M, SHOPFRONT_H_M, WINDOW_M, windowModule, type WindowKind } from '../content/pixelworld/facade';
import { neonSign, paintedSign } from '../content/pixelworld/signs';
import { nightSkyTile, skylineTile, duskSkyTile, rangeTile, volcanoTile, volcanoSpan, rowsFor } from '../content/pixelworld/sky';
import { z1CarTiles, type Z1CarTiles } from '../content/pixelworld/z1cars';
import { z1TongueFlameTile, Z1_FLAME_FRAMES, Z1_FLAME_H, Z1_FLAME_LEVELS, Z1_FLAME_W, z1FlameLevels } from '../content/pixelworld/z1fire';
import { PUFF_CELLS, PUFF_COLS, pwSpriteMaterial, spriteGeometry, z3PuffTile } from '../content/pixelworld/z3fx';
import { d1BarkTile } from '../content/pixelworld/d1Tiles';
import { FloraField, floraAtlas } from '../content/pixel/floraField';
import { BUSH, BUSH_WIDE, FERN, FERN_WIDE, JUNGLE_TREE, PALM } from '../content/pixel/floraSpecies';
import { D1_BIOME } from '../content/pixel/floraBiomes';

/**
 * ART: PIXEL WORLD title backdrop: the two attract-mode vignettes (the rainy
 * night street, the sunset jungle road) built from the PixelWorld toolkit
 * instead of flat-shaded boxes — brick and plaster facades with painted
 * windows, shopfront bays and cornices, wet asphalt with worn lane paint,
 * slab sidewalks and curbs, the cars in the stage's painted car modules, a
 * painted night sky and city skyline; a painted dusk sky, jungle ranges and the
 * smoking volcano, a jungle floor, a dirt track and the plants as FLORA
 * billboards. Fire and smoke are the stages' painted flame strips and billows.
 *
 * Layout is the classic vignette's (MenuBackdrop builds both from the same
 * calls), so the logo / menu composition is unchanged. Atlases are named
 * `menu-…` (painted once a session, persisted by the atlas store) and the
 * resources are owned by the backdrop (`own`), not by the per-stage Kit set.
 */

const X = new THREE.Vector3(1, 0, 0);
const Y = new THREE.Vector3(0, 1, 0);
const Z = new THREE.Vector3(0, 0, 1);
const NX = new THREE.Vector3(-1, 0, 0);
const NZ = new THREE.Vector3(0, 0, -1);
const _o = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _c = new THREE.Color();

type Own = <T extends { dispose(): void }>(x: T) => T;

/** Take a PixelWorld resource out of the per-stage Kit set and give it to the backdrop. */
function keep<T extends { dispose(): void }>(own: Own, x: T): T {
  return own(Kit.untrack(x));
}

/** Atlas memory / paint stats of the title's atlases (bench / docs). */
export function menuAtlases(...a: PwAtlas[]): PwAtlas[] {
  return a;
}

/** Compose a TRS matrix (radians, metres). */
function trs(x: number, y: number, z: number, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1): THREE.Matrix4 {
  _e.set(rx, ry, rz);
  _q.setFromEuler(_e);
  return new THREE.Matrix4().compose(_p.set(x, y, z), _q, _s.set(sx, sy, sz));
}

// ─── a painted smoke column (shared by both vignettes) ──────────────────────

/** Smoke billows as painted cut-out sprites: one instanced draw; positions / sizes / tints set per frame. */
export class MenuPuffs {
  readonly mesh: THREE.InstancedMesh;
  constructor(atlas: PwAtlas, tile: PwTile, n: number, o: { gain?: number; fog?: boolean } = {}) {
    const mat = pwSpriteMaterial(atlas, tile, { cells: PUFF_CELLS, cols: PUFF_COLS, gain: o.gain ?? 1.4, fog: o.fog ?? true });
    this.mesh = new THREE.InstancedMesh(spriteGeometry(false), mat, n);
    this.mesh.frustumCulled = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.setColorAt(0, _c.set(0xffffff));
    this.mesh.instanceColor!.setUsage(THREE.DynamicDrawUsage);
    this.mesh.count = 0;
  }

  /** Puff `i` at `pos`, `size` metres, variant `cell`, tinted `col`. */
  set(i: number, pos: THREE.Vector3, size: number, cell: number, col: THREE.Color) {
    _s.set(Math.max(0.001, size), Math.max(0.001, size), 1 + cell);
    _m.compose(pos, _q.identity(), _s);
    this.mesh.setMatrixAt(i, _m);
    this.mesh.setColorAt(i, col);
  }

  commit(n: number) {
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  own(own: Own) {
    keep(own, this.mesh.geometry);
    keep(own, this.mesh.material as THREE.Material);
  }
}

// ─── CITY ───────────────────────────────────────────────────────────────────

/** Street facade materials by building (cycled): brick reds and browns, a painted brick, plaster. */
const CITY_WALLS: { kind: 'brick' | 'plaster'; hex: number; painted?: number; cornice: number }[] = [
  { kind: 'brick', hex: 0x6e3a2c, cornice: 0x8a8070 },
  { kind: 'brick', hex: 0x5a4436, cornice: 0x7a7468 },
  { kind: 'plaster', hex: 0x6a6052, cornice: 0x8a8274 },
  { kind: 'brick', hex: 0x4e4648, painted: 0x5a5e66, cornice: 0x6e6e72 },
  { kind: 'brick', hex: 0x7a4632, cornice: 0x948a76 },
];

const WIN_STYLE = { frame: 0x3a3430, stone: 0x8a8070 };

export class MenuPwCity {
  readonly atlas = new PwAtlas('menu-city');
  readonly skyAtlas = new PwAtlas('menu-city-sky', { levels: 1 });
  readonly fireAtlas = new PwAtlas('menu-city-fire', { levels: Z1_FLAME_LEVELS });
  /** Lit scenery (one draw). */
  readonly b = new PwBatch(this.atlas);
  /** Two-sided cut-outs: awnings, the barricade boards (one draw). */
  readonly cut = new PwBatch(this.atlas);
  private walls: { wall: PwTile; cornice: PwTile }[];
  private asphalt: PwTile;
  private sidewalk: PwTile;
  private curb: PwTile;
  private lane: PwTile;
  private metal: PwTile;
  private dark: PwTile;
  private roof: PwTile;
  private hazard: PwTile;
  private rubble: PwTile;
  private bin: PwTile[];
  private awnings: PwTile[];
  private shops: PwTile[];
  private windows: Record<WindowKind, PwTile[]>;
  private car: Z1CarTiles;
  private neon: { tile: PwTile; wM: number; hM: number };
  private flames: PwTile[];
  readonly puffTile: PwTile;
  private backdrop: PwBackdrop;
  private flameBatch = new PwBatch(this.fireAtlas);
  private flameMat: THREE.Material | null = null;
  puffs: MenuPuffs | null = null;

  constructor() {
    const a = this.atlas;
    this.walls = CITY_WALLS.map((w) => ({
      wall: w.kind === 'plaster' ? plasterTile(a, { hex: w.hex, under: 0x6e3a2c, grime: 0.7 }) : brickTile(a, { hex: w.hex, painted: w.painted, grime: 0.7 }),
      cornice: corniceTile(a, { hex: w.cornice }),
    }));
    this.asphalt = asphaltTile(a, { hex: 0x34353c, wet: true, wear: 0.7 });
    this.sidewalk = sidewalkTile(a, { hex: 0x56565c, wear: 0.7 });
    this.curb = curbTile(a, { hex: 0x6a6a70 });
    this.lane = roadPaintTile(a, { hex: 0xc8a840, wear: 0.55 });
    this.metal = metalTile(a, { hex: 0x3a3c42, rust: 0.5 });
    this.dark = metalTile(a, { hex: 0x24252a, rust: 0.3 });
    this.roof = roofTile(a, { hex: 0x3a3836 });
    this.hazard = hazardTile(a, {});
    this.rubble = rockTile(a, { hex: 0x4a4846, size: 64 });
    this.bin = [metalTile(a, { hex: 0x2e4a34, rust: 0.6 }), metalTile(a, { hex: 0x4a3626, rust: 0.7 })];
    this.awnings = [awningTile(a, { hex: 0x7a2a24, stripe: 0xc8bca8 }), awningTile(a, { hex: 0x2a4a3a, stripe: 0xb8b0a0 })];
    // Ground-floor shop bays: shuttered, boarded, dead dark, one still lit (the night street's few lights).
    this.shops = [
      shopfrontModule(a, { widthM: 8, goods: 'hardware', lit: 0, riser: 0x3a2a24, frame: 0x2a2a2e, shutter: true }),
      shopfrontModule(a, { widthM: 8, goods: 'laundry', lit: 0, riser: 0x2a2e34, frame: 0x3a342c, boarded: true }),
      shopfrontModule(a, { widthM: 8, goods: 'pawn', lit: 0xffc477, riser: 0x4a2a24, frame: 0x2a2420, variant: 1 }),
      shopfrontModule(a, { widthM: 8, goods: 'generic', lit: 0, riser: 0x2a2a30, frame: 0x24242a, shutter: true, variant: 2 }),
    ];
    const kinds: WindowKind[] = ['dark', 'warm', 'dim', 'tv', 'blinds', 'broken', 'boarded'];
    this.windows = {} as Record<WindowKind, PwTile[]>;
    for (const k of kinds) this.windows[k] = [0, 1].map((v) => windowModule(a, k, WIN_STYLE, v));
    this.car = z1CarTiles(a);
    this.neon = neonSign(a, 'BAR', 0xff2a4a, { font: 'bold', cap: 0.42 });
    // Fire: the stage's tongue flames (animated strips) and smoke billows.
    this.flames = [z1TongueFlameTile(this.fireAtlas, 0), z1TongueFlameTile(this.fireAtlas, 1)];
    this.puffTile = z3PuffTile(this.fireAtlas);
    // Sky: the stage's night sky with the moon where the classic moon sprite hung, the skyline down the street.
    const s = this.skyAtlas;
    const fog = 0x161c2b;
    const sky = nightSkyTile(s, { horizon: 0x222a40, top: 0x05070e, moonAz: 345, moonEl: 19, el0: -4, el1: 60, clouds: 0.55 });
    const far = skylineTile(s, { hex: 0x161a28, fog, el0: -4, el1: 20, lights: 0.35, tall: 0.85, moonAz: 345, seed: 3 });
    this.backdrop = new PwBackdrop(s, { tile: sky, el0: -4, el1: 60 }, [{ tile: far, radius: 300, el0: -4, el1: 20, yaw: 0, follow: 1 }]);
  }

  // ── pieces (called by buildCity with the classic layout) ──

  /** The street: wet asphalt between the curbs, slab sidewalks, curbs. */
  street() {
    const b = this.b;
    b.rect(_o.set(-5, 0, 14), X, NZ, 10, 170, this.asphalt);
    for (const side of [-1, 1]) {
      // Sidewalk slab (top + its face toward the road) and the curb stone along its edge.
      const road = side < 0 ? { px: this.curb } : { nx: this.curb };
      b.box(side * 6.5, 0.08, -71, 3, 0.16, 170, { py: this.sidewalk, ...road });
      b.box(side * 5.05, 0.1, -71, 0.22, 0.2, 170, { py: this.curb, ...road });
    }
  }

  /** One worn centre-line dash. */
  dash(z: number) {
    this.b.rect(_o.set(-0.08, 0.012, z + 1.2), X, NZ, 0.16, 2.4, this.lane);
  }

  /**
   * A building block: street face at |x| = 8 with a shopfront band, the classic window
   * grid (`windows`: y, z, kind index), a cornice, brick ends and a roof.
   */
  building(side: number, z: number, w: number, h: number, d: number, idx: number, windows: { y: number; z: number; r: number; warm: boolean }[]) {
    const b = this.b;
    const W = this.walls[idx % this.walls.length];
    const cx = side * (8 + d / 2);
    const cz = z - w / 2;
    // Ends and roof (the street face is laid in pieces below).
    b.box(cx, h / 2, cz, d, h, w, { pz: W.wall, nz: W.wall, py: this.roof });
    const faceX = side * 8;
    // Street face: u runs left → right as seen from the street.
    const ux = side < 0 ? NZ : Z;
    const z0 = side < 0 ? z : z - w;
    const shopH = SHOPFRONT_H_M;
    b.rect(_o.set(faceX, shopH + 0.16, z0), ux, Y, w, h - shopH - 0.16, W.wall, { v0: Math.round((shopH + 0.16) * 32) });
    // Shopfront bays (a whole number of 4 m bays across the width) on the ground floor.
    const bays = Math.max(1, Math.round(w / SHOP_BAY_M));
    const shop = this.shops[(idx * 7 + (side > 0 ? 1 : 0)) % this.shops.length];
    b.rect(_o.set(faceX, 0.16, z0), ux, Y, w, shopH, shop, { uScale: (bays * SHOP_BAY_M) / w });
    // Cornice band under the roofline.
    b.rect(_o.set(faceX + side * -0.03, h - 0.5, z0), ux, Y, w, 0.5, W.cornice);
    // Window modules (flush, +1.5 cm), their opening where the classic window plane was.
    for (const win of windows) {
      const kind = this.windowKind(win.r, win.warm);
      const tile = this.windows[kind][Math.floor(win.r * 997) % 2];
      const left = side < 0 ? win.z + WINDOW_M.w / 2 : win.z - WINDOW_M.w / 2;
      b.rect(_o.set(faceX - side * 0.015, win.y - WINDOW_M.openY, left), ux, Y, WINDOW_M.w, WINDOW_M.h, tile);
    }
  }

  /** The classic's window draw (r) as a painted window: lit rooms, dark panes, blinds, a broken or boarded one. */
  private windowKind(r: number, warm: boolean): WindowKind {
    if (r < 0.1) return warm ? (r < 0.04 ? 'dim' : 'warm') : 'tv';
    if (r < 0.32) return 'dark';
    if (r < 0.45) return 'blinds';
    if (r < 0.52) return 'broken';
    if (r < 0.58) return 'boarded';
    return 'dark';
  }

  /** A box on the roofline (broken parapet, a stair head) in the building's wall. */
  roofBox(idx: number, geo: THREE.BoxGeometry, m: THREE.Matrix4) {
    this.b.geometry(geo, m, this.walls[idx % this.walls.length].wall);
  }

  /** Water tank / antenna on a roof. */
  roofMetal(geo: THREE.BufferGeometry, m: THREE.Matrix4) {
    this.b.geometry(geo, m, this.dark);
  }

  /** A striped awning over a shop (two-sided cut-out). */
  awning(side: number, cz: number, len: number, tilt: number, v: number) {
    const ux = side < 0 ? NZ : Z;
    const z0 = side < 0 ? cz + len / 2 : cz - len / 2;
    const out = new THREE.Vector3(-side * Math.cos(tilt), -Math.sin(tilt), 0);
    this.cut.rect(_o.set(side * 7.97, 3.2, z0), ux, out, len, 1.4, this.awnings[v % 2]);
  }

  /** The broken neon sign (lit tubes on a board), facing the street from the right-hand wall. */
  neonSign(): THREE.Mesh {
    const nb = new PwBatch(this.atlas);
    const { wM, hM } = this.neon;
    nb.rect(_o.set(7.9, 4.7, -27 - wM / 2), Z, Y, wM, hM, this.neon.tile);
    return this.pending(nb, { gain: 1 });
  }

  /** A lamp post: pole, arm and head in painted steel (the bulb stays a glow). */
  lampPost(x: number, z: number) {
    const s = Math.sign(x);
    this.b.geometry(new THREE.CylinderGeometry(0.09, 0.13, 6.2, 6), trs(x, 3.1, z), this.metal);
    this.b.geometry(new THREE.BoxGeometry(2.4, 0.1, 0.12), trs(x - s * 1.1, 6.1, z), this.metal);
    this.b.geometry(new THREE.BoxGeometry(0.7, 0.18, 0.36), trs(x - s * 2.25, 6.0, z), this.metal);
  }

  /** A sedan in the stage's painted car modules (tinted per paint job); flipped / burnt as the classic. */
  sedan(x: number, z: number, ry: number, col: number, flipped: boolean, burnt: boolean) {
    const b = this.b;
    const t = this.car;
    const y0 = flipped ? 1.45 : 0;
    const rz = flipped ? Math.PI : 0;
    const tint = (tile: PwTile) => (tile.neutral !== undefined ? { tintRGB: tintFor(tile, col) } : {});
    const face = (m: THREE.Matrix4, sx: number, sy: number, sz: number, faces: Partial<Record<'px' | 'nx' | 'py' | 'pz' | 'nz', PwTile>>) => {
      b.setMatrix(m);
      for (const [f, tile] of Object.entries(faces) as [string, PwTile][]) {
        const o = tint(tile);
        if (f === 'py') b.rect(_o.set(-sx / 2, sy / 2, sz / 2), X, NZ, sx, sz, tile, o);
        else if (f === 'pz') b.rect(_o.set(-sx / 2, -sy / 2, sz / 2), X, Y, sx, sy, tile, o);
        else if (f === 'nz') b.rect(_o.set(sx / 2, -sy / 2, -sz / 2), NX, Y, sx, sy, tile, o);
        else if (f === 'px') b.rect(_o.set(sx / 2, -sy / 2, sz / 2), NZ, Y, sz, sy, tile, o);
        else b.rect(_o.set(-sx / 2, -sy / 2, -sz / 2), Z, Y, sz, sy, tile, { ...o, flipU: true });
      }
      b.setMatrix(null);
    };
    const bodyM = trs(x, y0 + (flipped ? -0.1 : 0.55), z, 0, ry, rz);
    const side = burnt ? t.burnt.side : t.side[0];
    face(bodyM, 1.85, 0.7, 4.3, { px: side, nx: side, pz: burnt ? t.burnt.metal : t.front, nz: burnt ? t.burnt.metal : t.back, py: burnt ? t.burnt.top : t.top });
    const dx = Math.sin(ry) * -0.3;
    const dz = Math.cos(ry) * -0.3;
    const cabM = trs(x + dx, flipped ? 0.35 : 1.15, z + dz, 0, ry, rz);
    const glass = burnt ? t.burnt.glass : t.glassSide;
    face(cabM, 1.6, 0.55, 2.1, { px: glass, nx: glass, pz: burnt ? t.burnt.glass : t.glassFront, nz: burnt ? t.burnt.glass : t.glassFront, py: burnt ? t.burnt.roof : t.roof });
    for (const [wx, wz] of [
      [0.85, 1.35],
      [-0.85, 1.35],
      [0.85, -1.35],
      [-0.85, -1.35],
    ]) {
      const cx = x + Math.cos(ry) * wx + Math.sin(ry) * wz;
      const cz = z - Math.sin(ry) * wx + Math.cos(ry) * wz;
      const wy = flipped ? 1.3 : 0.34;
      // Tread (the tyre tile round the rim) and the two hub faces (the wheel module), outward along the axle.
      const ax = Math.cos(ry);
      const az = -Math.sin(ry);
      b.geometry(new THREE.CylinderGeometry(0.34, 0.34, 0.22, 10, 1, true), trs(cx, wy, cz, 0, ry, Math.PI / 2), t.tire);
      for (const s of [-1, 1]) {
        const ux = new THREE.Vector3(-az * s, 0, ax * s);
        b.rect(new THREE.Vector3(cx + ax * 0.111 * s, wy - 0.34, cz + az * 0.111 * s).addScaledVector(ux, -0.34), ux, Y, 0.68, 0.68, burnt ? t.burnt.wheel : t.wheel);
      }
    }
    // Contact shadow (upright cars).
    if (!flipped) {
      b.setMatrix(trs(x, 0.022, z, 0, ry));
      b.rect(_o.set(-1.25, 0, 2.6), X, NZ, 2.5, 5.2, t.shadow);
      b.setMatrix(null);
    }
  }

  /** The police barricade boards (hazard stripes), its posts. */
  board(geo: THREE.BoxGeometry, m: THREE.Matrix4) {
    this.b.geometry(geo, m, this.hazard);
  }

  post(geo: THREE.BoxGeometry, m: THREE.Matrix4) {
    this.b.geometry(geo, m, this.metal);
  }

  /** A chunk of rubble. */
  rock(geo: THREE.BufferGeometry, m: THREE.Matrix4) {
    this.b.geometry(geo, m, this.rubble);
  }

  /** A dumpster (green / rust). */
  dumpster(geo: THREE.BoxGeometry, m: THREE.Matrix4, v: number) {
    this.b.geometry(geo, m, this.bin[v % 2]);
  }

  /** Burning-wreck flames: three crossed animated cards over the wreck. */
  fire(x: number, z: number) {
    const fb = this.flameBatch;
    const sub = { x: 0, y: 0, w: Z1_FLAME_W, h: Z1_FLAME_H };
    const defs = [
      [0, 0, 1.6],
      [-0.5, 0.6, 1.2],
      [0.45, -0.7, 1.3],
    ];
    defs.forEach(([dx, dz, h], i) => {
      const w = ((h * Z1_FLAME_W) / Z1_FLAME_H) * 0.85;
      for (let k = 0; k < 3; k++) {
        const a = i * 0.7 + (k * Math.PI) / 3;
        const ux = new THREE.Vector3(Math.cos(a), 0, -Math.sin(a));
        fb.rect(new THREE.Vector3(x + dx, 0.85, z + dz).addScaledVector(ux, -w / 2), ux, Y, w, h, this.flames[(i + k) % 2], { sub, flipU: (i + k) % 2 === 1 });
      }
    });
  }

  /** A deferred-paint-safe mesh: its atlas may still be painting (it renders once the backdrop says it's ready). */
  private pending(b: PwBatch, o: { gain?: number; side?: THREE.Side } = {}): THREE.Mesh {
    return b.build(undefined, { gain: o.gain ?? 1, side: o.side })!;
  }

  /** Build every mesh (the atlases are laid out here; painted now or behind the title's opening black). */
  finish(scene: THREE.Scene, own: Own): { backdrop: PwBackdrop; flameMat: THREE.Material; neon: THREE.Mesh } {
    const neon = this.neonSign();
    const lit = this.b.build(undefined, { gain: MENU_CITY_GAIN })!;
    const cut = this.cut.build(undefined, { gain: MENU_CITY_GAIN, side: THREE.DoubleSide });
    scene.add(lit, neon);
    if (cut) scene.add(cut);
    this.fireAtlas.post((d) => z1FlameLevels(d, this.flames));
    this.flameMat = pwMaterial(this.fireAtlas, { anim: { frames: Z1_FLAME_FRAMES, fps: 12 }, side: THREE.DoubleSide });
    const fire = this.flameBatch.build(this.flameMat)!;
    scene.add(fire);
    this.puffs = new MenuPuffs(this.fireAtlas, this.puffTile, 18, { gain: 1.6 });
    this.puffs.mesh.renderOrder = 1;
    scene.add(this.puffs.mesh);
    const g = this.backdrop.build();
    scene.add(g);
    // The title backdrop outlives stages: its resources are the backdrop's, not the stage's Kit set.
    for (const m of [lit, neon, fire, cut]) {
      if (!m) continue;
      keep(own, m.geometry);
      keep(own, m.material as THREE.Material);
    }
    g.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      keep(own, m.geometry);
      keep(own, m.material as THREE.Material);
    });
    this.puffs.own(own);
    for (const a of [this.atlas, this.skyAtlas, this.fireAtlas]) keep(own, a.texture());
    return { backdrop: this.backdrop, flameMat: this.flameMat, neon };
  }

  /** Are the title's atlases painted (no frame shows them before)? */
  get painted(): boolean {
    return [this.atlas, this.skyAtlas, this.fireAtlas].every((a) => a.build().painted);
  }

  tick(dt: number) {
    if (this.flameMat) pwTick(this.flameMat, dt);
  }
}

/** Scenery gain under the night street's lights (moonlit hemisphere, the lamp, the fire): a dim street the logo sits on. */
const MENU_CITY_GAIN = 0.85;

// ─── JUNGLE ─────────────────────────────────────────────────────────────────

export class MenuPwJungle {
  readonly atlas = new PwAtlas('menu-jungle');
  readonly skyAtlas = new PwAtlas('menu-jungle-sky', { levels: 1 });
  readonly fxAtlas = new PwAtlas('menu-jungle-fx', { levels: 3 });
  readonly b = new PwBatch(this.atlas);
  private ground: PwTile;
  private track: PwTile;
  private rock: PwTile;
  private rockDark: PwTile;
  private bark: PwTile;
  private metal: PwTile;
  private wire: PwTile;
  private sign: { tile: PwTile; wM: number; hM: number };
  readonly puffTile: PwTile;
  readonly flora: FloraField;
  private backdrop: PwBackdrop;
  puffs: MenuPuffs | null = null;

  constructor() {
    const a = this.atlas;
    this.ground = grassTile(a, { hex: 0x34421e, dirt: 0x3a2a1c, dry: 0.2 });
    this.track = dirtRoadTile(a, { hex: 0x6a5236, ruts: true, grass: 0x3a4a22, width: 144 });
    this.rock = rockTile(a, { hex: 0x4a423e, moss: 0x3a4a24, tilt: 0.2, band: 18 });
    this.rockDark = rockTile(a, { hex: 0x3a3432, tilt: -0.1, band: 26 });
    this.bark = d1BarkTile(a, { hex: 0x4a3626, moss: 0x3e5a24, checks: 6 });
    this.metal = metalTile(a, { hex: 0x4a4c50, rust: 0.6 });
    this.wire = metalTile(a, { hex: 0x6a6a70, rust: 0.2 });
    this.sign = paintedSign(a, 'DANGER', { ground: 0xd0a020, ink: 0x1a1a1a, font: 'bold', cap: 0.2, frame: 0x1a1a1a });
    this.puffTile = z3PuffTile(this.fxAtlas);
    this.flora = new FloraField(floraAtlas([PALM, JUNGLE_TREE, BUSH, BUSH_WIDE, FERN, FERN_WIDE], MENU_JUNGLE_BIOME, 'menu-jungle'), { far: 160, gain: 0.9, rim: 0xff8a4a, rimStrength: 0.35 });
    // Sky: a dusk band (sun low over the far right), jungle ranges in silhouette, the volcano panel
    // where the classic cone stood (left of centre) with its painted smoke column.
    const s = this.skyAtlas;
    const haze = 0x6a3b37;
    const sky = duskSkyTile(s, { horizon: 0xe8783a, mid: 0xa04a5a, top: 0x24163e, el0: -4, el1: 64, sunAz: 17, sunEl: 5 });
    const ranges = rangeTile(s, { hex: 0x2c2032, haze, el0: -3, el1: 9, height: 0.75, rough: 0.6, jungle: true, lightAz: 17, seed: 5 });
    const vo = { hex: 0x3a2630, haze, el0: -2, el1: 26, az: 341, halfWidth: 19, lightAz: 17 };
    const volcano = volcanoTile(s, vo);
    this.backdrop = new PwBackdrop(s, { tile: sky, el0: -4, el1: 64 }, [
      { tile: ranges, radius: 300, el0: -3, el1: 9, follow: 1 },
      { tile: volcano, radius: 290, el0: -2, el1: 26, yaw: 341, span: volcanoSpan(vo), follow: 1 },
    ]);
    void rowsFor;
    void PW_BACKDROP_TPD;
  }

  /** The wavy jungle floor (the classic's terrain plane) in a painted floor. */
  terrain(geo: THREE.BufferGeometry, m: THREE.Matrix4) {
    this.b.geometry(geo, m, this.ground, { world: true });
  }

  /** The dirt track (4.2 m) with its ruts. */
  trackStrip() {
    this.b.rect(_o.set(-2.25, 0.03, 20), X, NZ, 4.5, 140, this.track);
  }

  /** A palm / tree / bush / fern billboard at the classic plant's spot and size. */
  plant(key: 'palm' | 'jungleTree' | 'bush' | 'fern', x: number, z: number, h: number, w: number) {
    this.flora.fit(key, x, 0, z, w, h, { sway: key === 'palm' ? 0.18 : key === 'jungleTree' ? 0.08 : 0.05, aspectTol: key === 'jungleTree' || key === 'palm' ? 2.2 : undefined });
  }

  /** The raptor's crag and the rocks at its foot. */
  crag(geo: THREE.BufferGeometry, m: THREE.Matrix4, dark: boolean) {
    this.b.geometry(geo, m, dark ? this.rockDark : this.rock);
  }

  /** The fallen log by the track. */
  log(geo: THREE.BufferGeometry, m: THREE.Matrix4) {
    this.b.geometry(geo, m, this.bark);
  }

  /** The broken electric fence: posts and wires; the warning plate. */
  fence(geo: THREE.BufferGeometry, m: THREE.Matrix4, wire: boolean) {
    this.b.geometry(geo, m, wire ? this.wire : this.metal);
  }

  warning(x: number, y: number, z: number, rz: number) {
    const { wM, hM } = this.sign;
    this.b.setMatrix(trs(x, y, z, 0, 0, rz));
    this.b.rect(_o.set(-0.04, -hM / 2, wM / 2), NX, Y, wM, hM, this.sign.tile);
    this.b.rect(_o.set(0.04, -hM / 2, -wM / 2), X, Y, wM, hM, this.sign.tile);
    this.b.setMatrix(null);
  }

  finish(scene: THREE.Scene, own: Own): { backdrop: PwBackdrop } {
    const lit = this.b.build(undefined, { gain: MENU_JUNGLE_GAIN })!;
    scene.add(lit);
    const flora = this.flora.build();
    scene.add(flora);
    this.puffs = new MenuPuffs(this.fxAtlas, this.puffTile, 26, { gain: 1.1, fog: false });
    this.puffs.mesh.renderOrder = -1;
    scene.add(this.puffs.mesh);
    const g = this.backdrop.build();
    scene.add(g);
    for (const m of [lit, flora]) {
      keep(own, m.geometry);
      keep(own, m.material as THREE.Material);
    }
    const fu = (flora.material as THREE.Material).userData.flora as { uFAtlas: { value: THREE.Texture }; uFPal: { value: THREE.Texture } };
    keep(own, fu.uFAtlas.value);
    keep(own, fu.uFPal.value);
    g.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      keep(own, m.geometry);
      keep(own, m.material as THREE.Material);
    });
    this.puffs.own(own);
    for (const a of [this.atlas, this.skyAtlas, this.fxAtlas]) keep(own, a.texture());
    return { backdrop: this.backdrop };
  }

  get painted(): boolean {
    return [this.atlas, this.skyAtlas, this.fxAtlas].every((a) => a.build().painted);
  }

  tick(t: number) {
    this.flora.time.value = t;
  }
}

/** The jungle's plants at sunset: the d1 biome a shade darker and warmer (they stand against the sun). */
const MENU_JUNGLE_BIOME = { ...D1_BIOME, leaf: 0x2a5a24, leafLight: 0x3e7a2a, leafDark: 0x1e461a };

const MENU_JUNGLE_GAIN = 1.5;

/** Backdrop materials' gain (lightning flashes the painted sky). */
export function backdropGain(b: PwBackdrop, k: number) {
  b.group.traverse((o) => {
    const m = (o as THREE.Mesh).material as THREE.Material | undefined;
    const u = m?.userData.pw as { uPwGain?: { value: number }; uPwGlow?: { value: number } } | undefined;
    if (u?.uPwGain) u.uPwGain.value = 1 + k * 1.4;
    if (u?.uPwGlow) u.uPwGlow.value = 1 + k * 1.4;
  });
}

void pwBackdropMaterial;
