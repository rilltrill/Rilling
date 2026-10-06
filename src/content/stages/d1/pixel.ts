import * as THREE from 'three';
import { EnvKit } from '../../kit/EnvKit';
import type { TexName } from '../../kit/Textures';
import { PwAtlas, type PwTile } from '../../pixelworld/atlas';
import { PwBatch } from '../../pixelworld/batch';
import { PwBackdrop } from '../../pixelworld/backdrop';
import { pwMaterial, pwTick } from '../../pixelworld/material';
import { kitTile, neutral, NEUTRAL_HEX, retexture, type TileRule } from '../../pixelworld/retexture';
import { volcanoSpan, volcanoTile } from '../../pixelworld/sky';
import { d1RangeTile, d1SkyTile } from '../../pixelworld/d1Sky';
import { fabricTile, flatTile, grassTile, grateTile, hazardTile, planksTile, rockTile } from '../../pixelworld/surfaces';
import { d1BarkTile, d1FlagModule, d1GateDoorModule, d1GateSignModule, d1HewnTile, d1IronTile, d1LogEndModule, d1PalisadeTile, d1PatchDecal, d1PuddleDecal } from '../../pixelworld/d1Tiles';
import {
  d1ArrowSignModule, d1BarricadeModule, d1CarBackModule, d1CarCabinModule, d1CarFrontModule, d1CarPaintTile, d1CarSideModule, d1CarUnderModule, d1CrateModule,
  d1DangerSignModule, d1GalvTile, d1TinTile, d1KioskWindowModule, d1MapBoardModule, d1MossTile, d1RoadTile, d1ThatchTile, d1TreadTile, d1WheelModule, d1WireSpanModule, type CarPaint,
} from '../../pixelworld/d1Props';
import { D1_WATER_FRAMES, d1BankTile, d1FallTile, d1FoamEdgeTile, d1SplashModule, d1WaterTile } from '../../pixelworld/d1Water';
import { D1_STONE_BIOME, D1_STONES } from '../../pixelworld/d1Species';
import { FloraField, floraAtlas, floraReach } from '../../pixel/floraField';
import { pwCylinder, pwDecal, pwPanel } from './pwShapes';
import { COL } from './flora';
import { RIVER_WIDTH } from './layout';
import type { FallenTree, GateParts } from './props';

/**
 * JUNGLE RUN in ART: PIXEL WORLD — every surface of the park painted as pixel
 * art (d1 painters in `pixelworld/d1*.ts`), the classic geometry kept only
 * where gameplay needs it (hidden, for the occluder raycasts):
 *  - the jungle road (ruts, tread prints, pebbles, a raptor track, ragged
 *    verges), the meadow, ragged moss / litter / earth patch decals, rain
 *    puddles mirroring the sky;
 *  - the park gate: log pillars with iron bands, sharpened-log palisade, braced
 *    plank doors with strap hinges, the carved PRIMAL ISLAND sign; the ticket
 *    kiosk, flagpoles and torn park flags;
 *  - the electric fence: galvanised posts with hazard collars and insulators,
 *    sagging wire spans (vines, a cut wire at the old breach), DANGER plates;
 *  - the fallen tree: bark wrapped round the trunk, moss bands, a splintered
 *    break, branch stubs; ranger supplies; the tour car (painted body, cabin,
 *    windows, wheels, underside) following its flip; the ROAD CLOSED barricade;
 *  - the river: banks with roots and pebbles, animated water with ripples
 *    riding the current, white water along the banks, the waterfall sheet and
 *    its churning splash;
 *  - rocks, boulders and the cliff pillars as hand-pixelled billboards
 *    (`d1Species.ts`), signposts as painted arrow boards;
 *  - the painted panorama (day sky, jungle ranges, smoking volcano).
 * CLASSIC / PIXEL CAST build byte-identically: the stage only branches on
 * `pixelWorld(world)`, never draws from an RNG differently.
 */

const FOG = 0xb3cfc2;
const FOG_FAR = 140;

const CAR: CarPaint = { white: 0xe8e2d4, red: 0xd0321c, glass: 0x3e5a70, tyre: 0x2a2b2c, steel: 0xa4a4a0, mud: 0x8a6e48 };

const _v = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _box = new THREE.Box3();
const X = new THREE.Vector3(1, 0, 0);
const Y = new THREE.Vector3(0, 1, 0);
const Z = new THREE.Vector3(0, 0, 1);
const NX = new THREE.Vector3(-1, 0, 0);
const NZ = new THREE.Vector3(0, 0, -1);
const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/** Arrow-board destinations (picked per signpost). */
const ARROWS = ['VISITORS', 'RIVER', 'LOOKOUT', 'MEADOW', 'TOURS', 'NO ENTRY', 'RANGERS', 'FALLS'];

/** Hide the classic meshes painting replaces (kept for raycasts / bounds: occluders stay identical). */
function hideMeshes(o: THREE.Object3D, keep?: (m: THREE.Mesh) => boolean) {
  o.traverse((c) => {
    const m = c as THREE.Mesh;
    if (m.isMesh && !m.userData.pixelWorld && !(keep && keep(m))) m.visible = false;
  });
}

/** Signpost boards recorded by `signpost()` (props.ts). */
export interface SignpostBoard {
  dir: number;
  y: number;
  green: boolean;
}

export class D1PixelWorld {
  readonly atlas = new PwAtlas('d1');
  readonly skyAtlas = new PwAtlas('d1-sky', { levels: 1 });
  /** Road, meadow, decals, the gate and every static painted structure (always shown in a PIXEL WORLD stage). */
  readonly world: PwBatch;
  /** Rocks / patches / signposts re-painted out of the ART: SPRITES scenery chunks (toggled with them). */
  readonly veg: PwBatch;
  /** The river, the waterfall and the splash (animated strip tiles). */
  readonly anim: PwBatch;
  /** Boulders and cliff pillars as hand-pixelled billboards (in the SPRITES scenery). */
  readonly stones: FloraField;
  readonly rule: TileRule;
  backdrop: PwBackdrop | null = null;
  /** Batches laid in a moving group's own frame (doors, the breakable fence, the tree halves). */
  private parts: { batch: PwBatch; parent: THREE.Object3D }[] = [];
  private car: { batch: PwBatch; body: THREE.Object3D; mesh: THREE.Mesh | null } | null = null;
  private animMat: THREE.Material | null = null;

  constructor() {
    this.world = new PwBatch(this.atlas);
    this.veg = new PwBatch(this.atlas);
    this.anim = new PwBatch(this.atlas);
    this.stones = new FloraField(floraAtlas(D1_STONES, D1_STONE_BIOME, 'd1-stones'), { far: FOG_FAR + 10 });
    const a = this.atlas;
    // Tiles are registered only when a surface needs them (every registered tile is painted at load):
    // rocks the billboards don't take → one painted rock face tinted per material; earth / grass → one patch tile.
    this.rule = (mat, _nx, ny) => {
      const tex = mat.userData.retroTex as TexName | undefined;
      const hex = (mat as THREE.MeshLambertMaterial).color.getHex();
      if (tex === 'rock') return neutral(rockTile(a, { hex: 0x9a9282, moss: COL.moss, band: 22 }), 0x9a9282);
      if (tex === 'grass' && hex === 0x8a6a34) return d1ThatchTile(a, { hex: 0x8a6a34 });
      if (tex === 'grass' || tex === 'dirt') return d1MossTile(a, { hex: 0x5b7a30, light: 0x8aaa3c });
      if (tex === 'planks') return neutral(planksTile(a, { hex: NEUTRAL_HEX }));
      return kitTile(a, tex, hex, ny);
    };
  }

  private part(parent: THREE.Object3D): PwBatch {
    const b = new PwBatch(this.atlas);
    this.parts.push({ batch: b, parent });
    return b;
  }

  // ─── Ground ────────────────────────────────────────────────────────────────

  /** The meadow under everything (a painted grass field, world-projected). */
  ground(y: number) {
    const t = grassTile(this.atlas, { hex: COL.ground, flowers: [COL.flowerY, COL.flowerP], dirt: COL.litter });
    this.world.rect(new THREE.Vector3(-800, y, 460), new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, -1), 1600, 1600, t, { u0: 0, v0: 0 });
  }

  /** The road along the rail: one painted ribbon (ruts, tread prints, verges) 8 m across. */
  road(curve: THREE.Curve<THREE.Vector3>, to: number) {
    const t: PwTile = d1RoadTile(this.atlas, { hex: COL.road, rut: 0x94744c, grass: COL.verge, stone: 0x8a8478, leaf: 0x7a6a2a });
    const pts: THREE.Vector3[] = [];
    for (let d = 0; d <= to + 0.001; d += 2) pts.push(EnvKit.frameAt(curve, Math.min(d, to)).pos.clone());
    this.world.ribbon(pts, 8, t, { y: 0.02 });
  }

  /** A rain puddle on the road (the classic one's disc: radii `rx`, `rz`, turned by `yaw`). */
  puddle(p: THREE.Vector3, yaw: number, rx: number, rz: number, variant: number) {
    const t = d1PuddleDecal(this.atlas, { mud: 0x5a4632, sky: 0xa8c8d8, tree: 0x4a6a4a }, variant % 2);
    pwDecal(this.world, p.x, 0.056, p.z, rx * 2.2, rz * 2.2, yaw, t);
  }

  /** An embedded stone on the road (a tiny slab billboard). */
  roadStone(p: THREE.Vector3, size: number) {
    this.stones.add('boulderWide', p.x, 0.02, p.z, size);
  }

  // ─── River ─────────────────────────────────────────────────────────────────

  /** Banks, the animated river, white water at both edges. */
  river(rc: THREE.Curve<THREE.Vector3>) {
    const a = this.atlas;
    const len = rc.getLength();
    const pts: THREE.Vector3[] = [];
    for (let s = 0; s <= len + 0.001; s += 2) pts.push(rc.getPointAt(Math.min(1, s / len)));
    const bank = { earth: 0x6a5434, sand: 0x9a8a6a, mud: 0x4a3a28, grass: COL.verge, stone: 0x8a8478 };
    const W = RIVER_WIDTH;
    this.world.ribbon(pts, 2.6, d1BankTile(a, bank), { offset: -(W / 2 + 1.0), y: 0.045 });
    this.world.ribbon(pts, 2.6, d1BankTile(a, { ...bank, mirror: true }), { offset: W / 2 + 1.0, y: 0.045 });
    this.anim.ribbon(pts, W + 0.4, d1WaterTile(a, { hex: 0x2a8098, deep: 0x1c5e74 }), { y: 0.075 });
    this.anim.ribbon(pts, 0.5, d1FoamEdgeTile(a, { hex: 0xe8f4f4 }), { offset: -(W / 2 - 0.05), y: 0.085 });
    this.anim.ribbon(pts, 0.5, d1FoamEdgeTile(a, { hex: 0xe8f4f4, mirror: true }), { offset: W / 2 - 0.05, y: 0.085 });
  }

  /** The waterfall sheet (8 × 22 m, facing `normal`) off the cliff at `top`, and the churning splash at its foot. */
  waterfall(top: THREE.Vector3, normal: THREE.Vector3, pool: THREE.Vector3) {
    const a = this.atlas;
    const right = new THREE.Vector3(normal.z, 0, -normal.x);
    const c = new THREE.Vector3(top.x, 10.6, top.z).addScaledVector(normal, 0.6);
    pwPanel(this.anim, c, right, Y, 8, 22, d1FallTile(a, { hex: 0xb8e0ec }));
    const sp = d1SplashModule(a, { hex: 0xe8f4f4 });
    const base = new THREE.Vector3(top.x, 1.4, top.z).addScaledVector(normal, 1.4);
    pwPanel(this.anim, base, right, Y, 9, 3.6, sp);
    const p2 = pool.clone().setY(1.0).addScaledVector(normal, -0.5);
    pwPanel(this.anim, p2, right, Y, 6, 2.4, sp, { flipU: true });
  }

  // ─── Rocks, patches, signposts (the SPRITES scenery chunks) ────────────────

  /**
   * Re-paint a group's leftovers before it is baked: rocks and cliff stones
   * become stone billboards, ground patches ragged decals, signposts arrow
   * boards; everything else is retextured. Returns the meshes moved.
   */
  rocks(g: THREE.Object3D): number {
    g.updateMatrixWorld(true);
    let n = 0;
    for (const ch of [...g.children]) {
      const kind = classify(ch);
      if (!kind) continue;
      if (kind === 'rock') this.stone(ch);
      else if (kind === 'patch') this.patch(ch);
      else this.signpost(ch);
      g.remove(ch);
      n++;
    }
    return n + retexture(g, this.veg, this.rule, { world: () => false });
  }

  /** A rock / cliff stone as a stone billboard of its size (rotation-independent reach). */
  private stone(o: THREE.Object3D) {
    _box.setFromObject(o);
    const cx = (_box.min.x + _box.max.x) / 2;
    const cz = (_box.min.z + _box.max.z) / 2;
    const h = _box.max.y - Math.max(0, _box.min.y);
    if (h <= 0.05) return;
    _v.set(cx, 0, cz);
    const reach = floraReach(o, _v);
    this.stones.fit(h > 5 ? 'cliffSpire' : 'boulder', cx, 0, cz, reach, h, { aspectTol: 1.6 });
  }

  /** A ground patch (moss / leaf litter disc) as a ragged decal of the same footprint. */
  private patch(o: THREE.Object3D) {
    let mesh: THREE.Mesh | null = null;
    o.traverse((c) => {
      if ((c as THREE.Mesh).isMesh) mesh = c as THREE.Mesh;
    });
    if (!mesh) return;
    const m = mesh as THREE.Mesh;
    const e = m.matrixWorld.elements;
    const sx = Math.hypot(e[0], e[1], e[2]);
    const sz = Math.hypot(e[8], e[9], e[10]);
    const yaw = Math.atan2(-e[2], e[0]);
    m.getWorldPosition(_v);
    const hex = (m.material as THREE.MeshLambertMaterial).color.getHex();
    const h = Math.floor(Math.abs(_v.x * 7.3 + _v.z * 3.1)) % 4;
    const a = this.atlas;
    let t: PwTile;
    let tint = 0xffffff;
    if (hex === COL.litter) t = h === 0 ? d1PatchDecal(a, 'earth', { hex: 0x6a5a3a, dark: 0x8a8478, accent: COL.verge }, 2) : d1PatchDecal(a, 'litter', { hex: 0x5a4a2c, dark: 0x2a2018, accent: 0x8a6a34 }, 1);
    else {
      t = d1PatchDecal(a, 'moss', { hex: 0x5b7a30, dark: 0x3a5622, accent: 0x8aaa3c }, 0);
      if (hex === COL.groundDark) tint = 0xb8c8b0;
    }
    pwDecal(this.veg, _v.x, -0.03, _v.z, sx * 2.1, sz * 2.1, yaw, t, tint);
  }

  /** A park signpost: a weathered post and its arrow boards as painted modules (readable from both sides). */
  private signpost(o: THREE.Object3D) {
    const boards = (o.userData.pwSignpost as SignpostBoard[] | undefined) ?? [];
    const a = this.atlas;
    const b = this.veg;
    o.updateMatrixWorld(true);
    const post = neutral(planksTile(a, { hex: NEUTRAL_HEX }));
    b.withMatrix(o.matrixWorld, () => {
      b.box(0, 1.3, 0, 0.16, 2.6, 0.16, post, { tint: 0x8a6a48 });
      boards.forEach((bd, i) => {
        const text = ARROWS[(Math.abs(Math.round(o.matrixWorld.elements[12] * 3 + o.matrixWorld.elements[14])) + i * 3) % ARROWS.length];
        const col = bd.green ? { board: 0x2f5a2a, ink: 0xe8d8a0 } : { board: 0x6a4a2a, ink: 0xe8d8a0 };
        // Seen from the front the arrow points `dir`; from behind, the other way.
        pwPanel(b, V(bd.dir * 0.72, bd.y, 0.115), X, Y, 1.5, 0.375, d1ArrowSignModule(a, text, col, bd.dir));
        pwPanel(b, V(bd.dir * 0.72, bd.y, 0.045), NX, Y, 1.5, 0.375, d1ArrowSignModule(a, text, col, -bd.dir));
      });
    });
  }

  // ─── The park gate ─────────────────────────────────────────────────────────

  /** Paint the gate (pillars, beams, sign, doors, palisade) and the kiosk / flags group `kiosk` (both placed). */
  gate(parts: GateParts, kiosk: THREE.Object3D) {
    const a = this.atlas;
    const root = parts.root;
    root.updateMatrixWorld(true);
    // Classic meshes: hidden (the pillars stay the bullet occluder, unchanged); the torch flames stay.
    hideMeshes(parts.pillars);
    hideMeshes(parts.doorL);
    hideMeshes(parts.doorR);
    for (const c of root.children) if (c !== parts.pillars && c !== parts.doorL && c !== parts.doorR && !(c as THREE.Mesh).isMesh) hideMeshes(c);
    const log = d1BarkTile(a, { hex: 0x7a5434, lichen: 0x9aa088 });
    const hewn = d1HewnTile(a, { hex: 0xc8a06a });
    const iron = d1IronTile(a, { hex: 0x3a3633 });
    const boards = planksTile(a, { hex: 0x5a3c22, horizontal: true });
    const b = this.world;
    const W = 4.4;
    b.withMatrix(root.matrixWorld, () => {
      for (const side of [-1, 1]) {
        const x = side * (W + 0.75);
        for (let i = 0; i < 3; i++) {
          const ang = (i / 3) * Math.PI * 2;
          const h = 10 + i * 0.4;
          const lx = x + Math.cos(ang) * 0.42;
          const lz = Math.sin(ang) * 0.42;
          pwCylinder(b, V(lx, 0, lz), V(lx, h, lz), 0.48, 0.42, 8, log, { tint: i === 1 ? 0xb89880 : 0xffffff, u0: i * 21, v0: i * 17 });
          pwCylinder(b, V(lx, h, lz), V(lx, h + 0.9, lz), 0.44, 0, 8, hewn);
        }
        for (const y of [1.2, 4.5, 8.4]) pwCylinder(b, V(x, y - 0.14, 0), V(x, y + 0.14, 0), 1.0, 1.0, 12, iron, { capB: iron });
        b.box(x - side * 0.2, 5.6, 1.0, 0.12, 0.12, 0.9, iron);
        pwCylinder(b, V(x - side * 0.2, 5.62, 1.45), V(x - side * 0.2, 6.07, 1.45), 0.18, 0.32, 8, iron);
      }
      // Cross beams (logs along x), the roof board, the sign and its trims / hangers.
      pwCylinder(b, V(-(W + 2), 8.9, 0.1), V(W + 2, 8.9, 0.1), 0.42, 0.42, 8, log, { phase: 0.3 });
      pwCylinder(b, V(-(W + 1.5), 9.7, -0.1), V(W + 1.5, 9.7, -0.1), 0.36, 0.36, 8, log, { tint: 0xb89880, phase: 0.6 });
      b.box(0, 10.35, 0, 2 * W + 4.5, 0.25, 2.4, boards, { tint: 0x9a8a7a });
      b.box(0, 7.4, 0.55, 6.2, 1.9, 0.25, { px: boards, nx: boards, py: boards, ny: boards, nz: boards, pz: null }, { tint: 0x8a7a6a });
      pwPanel(b, V(0, 7.4, 0.681), X, Y, 6.2, 1.9, d1GateSignModule(a, { board: 0x46301c, frame: 0x765032, gold: 0xe8b83a, iron: 0x3a3633 }));
      for (const y of [8.4, 6.42]) b.box(0, y, 0.55, 6.5, 0.18, 0.3, boards);
      for (const sx of [-2.7, 2.7]) b.box(sx, 8.6, 0.55, 0.12, 0.6, 0.12, iron);
      // Palisade: a painted wall of sharpened logs both sides (front and back faces).
      const pal = d1PalisadeTile(a, { log: 0x7a5434, logDark: 0x54361f, hewn: 0xc8a06a, rail: 0x4e331e, rope: 0x9a8058, moss: COL.moss, grass: COL.verge });
      for (const side of [-1, 1]) {
        const x0 = side < 0 ? -34.3 : W + 1.5;
        const x1 = side < 0 ? -(W + 1.5) : 34.3;
        b.rect(V(x0, 0, 0.33), X, Y, x1 - x0, 7, pal, { u0: side < 0 ? 17 : 0 });
        b.rect(V(x1, 0, -0.33), NX, Y, x1 - x0, 7, pal, { u0: side < 0 ? 5 : 29 });
      }
    });
    // Doors: one painted leaf module each (front and back), in the hinge's own frame (they swing open).
    const door = d1GateDoorModule(a, { wood: 0x765032, woodDark: 0x4e331e, iron: 0x3a3633 });
    for (const [hinge, side] of [[parts.doorL, -1], [parts.doorR, 1]] as [THREE.Group, number][]) {
      const db = this.part(hinge);
      // The leaf runs from the hinge (x = 0) toward the gate's centre: the module's hinge straps (its left) at x = 0.
      const w = 4.25;
      const cx = -side * (w / 2);
      pwPanel(db, V(cx, 4, 0.2), X, Y, w, 8, door, { flipU: side > 0 });
      pwPanel(db, V(cx, 4, -0.12), NX, Y, w, 8, door, { flipU: side < 0 });
    }
    this.kiosk(kiosk);
  }

  /** Ticket kiosk, flagpoles and flags (the classic group, placed in the gate's frame). */
  private kiosk(g: THREE.Object3D) {
    const a = this.atlas;
    g.updateMatrixWorld(true);
    hideMeshes(g);
    const b = this.world;
    const wall = planksTile(a, { hex: 0x8a6a44, horizontal: true });
    const roof = d1TinTile(a, { hex: 0x3e5a2c });
    const galv = d1GalvTile(a, { hex: 0x9a9a92 });
    const gm = g.matrixWorld.clone();
    b.withMatrix(gm, () => {
      // Booth: plank walls; the ticket window on the gate side (−z), the park map on the road side (+x).
      b.box(-9, 1.3, 14, 3.2, 2.6, 2.6, { px: wall, nx: wall, pz: wall, nz: null, py: null, ny: null });
      pwPanel(b, V(-9, 1.3, 12.7), NX, Y, 3.2, 2.6, wall);
      pwPanel(b, V(-9, 1.45, 12.69), NX, Y, 2.0, 1.5, d1KioskWindowModule(a, { wood: 0x8a6a44, shutter: 0x6a7a6a }));
      pwPanel(b, V(-7.39, 1.45, 14), NZ, Y, 1.5, 1.0, d1MapBoardModule(a));
      pwPanel(b, V(-9, 1.5, 15.31), X, Y, 1.0, 0.75, d1CrateModule(a, { wood: 0xc8b890, stencil: 'TOURS' }));
      // Flagpoles and flags (cloth modules on both faces, the hoist at the pole).
      for (const side of [-1, 1]) {
        for (const z of [4, 9]) {
          pwCylinder(b, V(side * 6.5, 0, z), V(side * 6.5, 7, z), 0.1, 0.08, 6, galv);
          const flag = d1FlagModule(a, side < 0 ? { hex: 0xe0401a, emblem: z === 4 } : { hex: 0xf4c43a, emblem: z === 9 });
          const hoist = V(side * 6.5, 5.85, z);
          const dir = side < 0 ? NX : X;
          b.rect(hoist.clone(), dir, Y, 1.5, 1.0, flag);
          b.rect(hoist.clone().addScaledVector(dir, 1.5), dir.clone().negate(), Y, 1.5, 1.0, flag, { flipU: true });
        }
      }
    });
    // Tin roof, tilted.
    _m.makeRotationZ(0.08).setPosition(-9, 2.75, 14);
    b.withMatrix(gm.clone().multiply(_m), () => b.box(0, 0, 0, 3.8, 0.3, 3.2, roof));
  }

  // ─── Electric fence ────────────────────────────────────────────────────────

  /**
   * Painters for the fence pieces: the static run (world) or the breakable
   * section ('brk': laid in `brk`'s own frame — it falls over).
   */
  fence(brk: THREE.Object3D): D1FenceArt {
    const a = this.atlas;
    brk.updateMatrixWorld(true);
    const inv = brk.matrixWorld.clone().invert();
    const bb = this.part(brk);
    const pick = (part: 's' | 'brk') => (part === 'brk' ? bb : this.world);
    const frameOf = (part: 's' | 'brk', m: THREE.Matrix4) => (part === 'brk' ? inv.clone().multiply(m) : m);
    const galv = d1GalvTile(a, { hex: 0x9a9a92 });
    const cap = d1GalvTile(a, { hex: 0x6e6c66 });
    const haz = hazardTile(a, {});
    const ins = flatTile(a, { hex: 0x3a2a22, wear: 0.3 });
    const amber = flatTile(a, { hex: 0xe8a81c, wear: 0.2 });
    const danger = d1DangerSignModule(a);
    const back = d1GalvTile(a, { hex: 0x8a8a84 });
    const WIRE_Y = [0.9, 1.7, 2.5, 3.3, 4.1];
    return {
      post: (part, p, yaw, tilt) => {
        const b = pick(part);
        const m = new THREE.Matrix4().makeRotationY(yaw).setPosition(p).multiply(new THREE.Matrix4().makeRotationZ(tilt));
        b.withMatrix(frameOf(part, m), () => {
          b.box(0, 2.4, 0, 0.38, 4.8, 0.38, galv);
          b.box(0, 4.85, 0, 0.5, 0.25, 0.5, cap);
          b.box(0, 0.31, 0, 0.42, 0.62, 0.42, haz);
          for (const y of WIRE_Y) b.box(0, y, 0, 0.5, 0.1, 0.14, ins);
          b.box(0, 5.05, 0, 0.2, 0.16, 0.2, amber);
        });
      },
      span: (part, pa, pb, variant) => {
        const b = pick(part);
        const dx = pb.x - pa.x;
        const dz = pb.z - pa.z;
        const len = Math.hypot(dx, dz);
        const ux = new THREE.Vector3(dx / len, 0, dz / len);
        const t = d1WireSpanModule(a, { wire: 0xa8aeb2, vine: COL.vine }, variant);
        b.withMatrix(frameOf(part, new THREE.Matrix4()), () => {
          const c = pa.clone().lerp(pb, 0.5).setY(0.6 + 2.25);
          pwPanel(b, c, ux, Y, len, 4.5, t, { back: true });
        });
      },
      sign: (part, x, y, z, yaw, tilt) => {
        const b = pick(part);
        const m = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(0, yaw, tilt)).setPosition(x, y, z);
        b.withMatrix(frameOf(part, m), () => {
          pwPanel(b, V(0, 0, 0.035), X, Y, 1.1, 0.9, danger);
          pwPanel(b, V(0, 0, -0.035), NX, Y, 1.1, 0.9, back);
        });
      },
    };
  }

  // ─── Fallen tree, supplies ─────────────────────────────────────────────────

  /** Paint the fallen tree's two halves (in their own frames: they fly apart) and the ranger supplies group `supplies` (placed). */
  tree(t: FallenTree, supplies: THREE.Object3D) {
    const a = this.atlas;
    // The trunk meshes (merged into each half) are hidden; crown / root billboards are FLORA's.
    for (const half of [t.left, t.right]) for (const c of half.children) if ((c as THREE.Mesh).isMesh) c.visible = false;
    const bark = d1BarkTile(a, { hex: COL.trunk, lichen: 0x8a9a6a });
    const barkDark = d1BarkTile(a, { hex: 0x4a382a });
    const moss = d1MossTile(a, { hex: 0x5a8a2c, light: 0x8aaa3c });
    const end = d1LogEndModule(a, { wood: 0xc0965e, bark: 0x4a382a, broken: true });
    const L = this.part(t.left);
    // Left half (local to `left`): trunk from the break (x = 0, r 1.15) to the root end (x = −10, r 0.95), a moss band.
    pwCylinder(L, V(0.05, 1, 0), V(-10, 1, 0), 1.15, 0.95, 10, bark, { capA: end, phase: 0.2 });
    pwCylinder(L, V(-2.4, 1.08, 0), V(-4.6, 1.08, 0), 1.0, 1.0, 10, moss, { phase: 0.2 });
    const R = this.part(t.right);
    pwCylinder(R, V(-0.05, 0.95, 0), V(9, 0.95, 0), 0.8, 0.95, 10, bark, { capA: end, phase: 0.5 });
    pwCylinder(R, V(2.4, 1.0, 0), V(4.0, 1.0, 0), 0.86, 0.86, 10, moss, { phase: 0.5 });
    // Branch stubs (each recorded transform: a tapering limb 3.2 m up its own +y).
    for (const bm of t.branches) R.withMatrix(bm, () => pwCylinder(R, V(0, 0, 0), V(0, 3.2, 0), 0.25, 0.14, 6, barkDark));
    // Ranger supplies: a canvas kit bag, a crate, a toppled signal pole.
    supplies.updateMatrixWorld(true);
    hideMeshes(supplies);
    const b = this.world;
    const sm = supplies.matrixWorld.clone();
    _m.makeRotationY(0.3).setPosition(-3.2, 0.3, 1.6);
    b.withMatrix(sm.clone().multiply(_m), () => b.box(0, 0, 0, 0.9, 0.6, 0.6, fabricTile(a, { hex: 0x5a6a3a })));
    _m.makeRotationY(-0.2).setPosition(-2.6, 0.25, 2.4);
    b.withMatrix(sm.clone().multiply(_m), () => b.box(0, 0, 0, 0.7, 0.5, 0.5, d1CrateModule(a, { wood: 0x6a5a3a })));
    _m.makeRotationFromEuler(new THREE.Euler(0, 0.6, Math.PI / 2 - 0.05)).setPosition(4.5, 0.2, 2.4);
    b.withMatrix(sm.clone().multiply(_m), () => pwCylinder(b, V(0, -3, 0), V(0, 3, 0), 0.08, 0.08, 6, d1GalvTile(a, { hex: 0x7a7a76 })));
  }

  // ─── Tour car ──────────────────────────────────────────────────────────────

  /** Paint the toppled tour car (`body`: the classic body, hidden but kept as the occluder; the painted one follows it). */
  tourCar(body: THREE.Object3D) {
    const a = this.atlas;
    hideMeshes(body, (m) => (m.material as THREE.Material).type === 'MeshBasicMaterial');
    const b = new PwBatch(this.atlas);
    this.car = { batch: b, body, mesh: null };
    const side = d1CarSideModule(a, CAR, true);
    const sideClean = d1CarSideModule(a, CAR, false);
    const cabin = d1CarCabinModule(a, CAR, true);
    const cabin2 = d1CarCabinModule(a, CAR, false);
    const paint = d1CarPaintTile(a, CAR);
    const tread = d1TreadTile(a, { hex: CAR.tyre, mud: CAR.mud });
    const wheel = d1WheelModule(a, { tyre: CAR.tyre, rim: CAR.steel, mud: CAR.mud });
    const grate = grateTile(a, { hex: 0x34383c });
    const haz = hazardTile(a, {});
    // Body (2 × 1 × 4.6, y 0.55…1.55; front = +z).
    pwPanel(b, V(1.0, 1.05, 0), NZ, Y, 4.6, 1.0, side);
    pwPanel(b, V(-1.0, 1.05, 0), Z, Y, 4.6, 1.0, sideClean, { flipU: true });
    pwPanel(b, V(0, 1.05, 2.3), X, Y, 2.0, 1.0, d1CarFrontModule(a, CAR));
    pwPanel(b, V(0, 1.05, -2.3), NX, Y, 2.0, 1.0, d1CarBackModule(a, CAR));
    b.rect(V(-1, 1.55, 2.3), X, NZ, 2, 4.6, paint);
    b.rect(V(-1, 0.55, -2.3), X, Z, 2, 4.6, d1CarUnderModule(a, CAR));
    // Cabin (1.9 × 0.85 × 2.9 at z −0.4, y 1.525…2.375).
    pwPanel(b, V(0.95, 1.95, -0.4), NZ, Y, 2.9, 0.85, cabin);
    pwPanel(b, V(-0.95, 1.95, -0.4), Z, Y, 2.9, 0.85, cabin2, { flipU: true });
    pwPanel(b, V(0, 1.95, 1.05), X, Y, 1.9, 0.85, cabin2);
    pwPanel(b, V(0, 1.95, -1.85), NX, Y, 1.9, 0.85, cabin);
    b.rect(V(-0.95, 2.375, 1.05), X, NZ, 1.9, 2.9, paint);
    // Roof rack, push bars, wheels, spare.
    b.box(0, 2.45, -0.4, 1.6, 0.12, 2.2, grate);
    b.box(0, 0.7, 2.35, 2.1, 0.3, 0.25, haz);
    b.box(0, 0.66, -2.32, 2.1, 0.26, 0.2, haz);
    for (const sx of [-1, 1]) for (const sz of [-1.45, 1.45]) pwCylinder(b, V(sx * 0.84, 0.44, sz), V(sx * 1.16, 0.44, sz), 0.44, 0.44, 10, tread, { capB: wheel });
    pwCylinder(b, V(0, 1.2, -2.28), V(0, 1.2, -2.56), 0.42, 0.42, 10, tread, { capB: wheel });
  }

  // ─── The barricade (end of the road) ──────────────────────────────────────

  /** Paint the ROAD CLOSED barricade group `g` (placed): boards → one painted module, rocks → stone billboards. */
  barricade(g: THREE.Object3D) {
    const a = this.atlas;
    g.updateMatrixWorld(true);
    for (const ch of [...g.children]) {
      const m = ch as THREE.Mesh;
      if (!m.isMesh) continue;
      const mat = m.material as THREE.MeshLambertMaterial;
      const tex = mat.userData.retroTex as TexName | undefined;
      if (tex === 'rock') {
        this.stone(m);
        g.remove(m);
      } else if (tex === 'planks' && mat.color.getHex() !== 0x5a4a3a) g.remove(m);
    }
    const t = d1BarricadeModule(a);
    this.world.withMatrix(g.matrixWorld, () => {
      pwPanel(this.world, V(0, 0.975, 0.051), X, Y, 5.5, 1.0, t);
      pwPanel(this.world, V(0, 0.975, -0.051), NX, Y, 5.5, 1.0, t);
    });
    retexture(g, this.world, this.rule, { world: () => false });
  }

  // ─── Backdrop ──────────────────────────────────────────────────────────────

  /** The painted panorama: day sky, two jungle ranges whose feet melt into the fog, the smoking volcano. */
  buildBackdrop(anchor: THREE.Vector3): THREE.Group {
    const s = this.skyAtlas;
    const sky = d1SkyTile(s, { horizon: FOG, top: 0x3a86cc, el0: -4, el1: 42, sunAz: 124, clouds: 0.55, haze: 15 });
    const far = d1RangeTile(s, { hex: 0x7c9a92, haze: FOG, el0: -2, el1: 20, height: 0.85, rough: 0.5, lightAz: 124, seed: 4, fogFoot: 0.22 });
    const near = d1RangeTile(s, { hex: 0x4f7258, haze: FOG, el0: -3, el1: 11, height: 0.7, rough: 0.8, lightAz: 124, seed: 7, fogFoot: 0.3 });
    const vo = { hex: 0x707a76, haze: FOG, el0: -3, el1: 24, az: 340, halfWidth: 24, lightAz: 124 };
    const volcano = volcanoTile(s, vo);
    this.backdrop = new PwBackdrop(s, { tile: sky, el0: -4, el1: 42, radius: 330 }, [
      { tile: far, radius: 310, el0: -2, el1: 20, follow: 1 },
      { tile: volcano, radius: 280, el0: -3, el1: 24, yaw: vo.az, span: volcanoSpan(vo), follow: 0.85 },
      { tile: near, radius: 250, el0: -3, el1: 11, yaw: 77, follow: 0.92 },
    ]);
    this.backdrop.anchor.copy(anchor);
    return this.backdrop.build();
  }

  // ─── Build + per frame ─────────────────────────────────────────────────────

  /** Paint the atlas and build the meshes: world / water → `root`, scenery leftovers + stones → `vegPx`, parts → their groups. */
  finish(root: THREE.Object3D, vegPx: THREE.Object3D) {
    this.atlas.build();
    const w = this.world.build();
    if (w) root.add(w);
    const v = this.veg.build();
    if (v) vegPx.add(v);
    this.animMat = pwMaterial(this.atlas, { anim: { frames: D1_WATER_FRAMES, fps: 8 } });
    const an = this.anim.build(this.animMat);
    if (an) root.add(an);
    for (const p of this.parts) {
      const m = p.batch.build();
      if (m) p.parent.add(m);
    }
    if (this.car) {
      const m = this.car.batch.build();
      if (m) {
        root.add(m);
        this.car.mesh = m;
        this.followCar();
      }
    }
    const st = this.stones.build();
    st.name = 'd1-stones';
    vegPx.add(st);
  }

  /** Keep the painted car on the (moving) classic body. Allocation-free. */
  followCar() {
    const c = this.car;
    if (!c?.mesh) return;
    c.body.updateWorldMatrix(true, false);
    c.mesh.matrix.copy(c.body.matrixWorld);
    c.mesh.matrixWorldNeedsUpdate = true;
  }

  /** Per frame: the water clock. */
  update(dt: number) {
    if (this.animMat) pwTick(this.animMat, dt);
  }
}

/** The fence painters handed to the fence builder (see `D1PixelWorld.fence`). */
export interface D1FenceArt {
  post: (part: 's' | 'brk', p: THREE.Vector3, yaw: number, tilt: number) => void;
  span: (part: 's' | 'brk', a: THREE.Vector3, b: THREE.Vector3, variant: number) => void;
  sign: (part: 's' | 'brk', x: number, y: number, z: number, yaw: number, tilt: number) => void;
}

/** What painting does with a leftover of the SPRITES scenery: a rock, a ground patch, a signpost (or nothing: retexture it). */
function classify(o: THREE.Object3D): 'rock' | 'patch' | 'signpost' | null {
  if (o.userData.pwSignpost) return 'signpost';
  let rock = false;
  let other = false;
  let patch = false;
  o.traverse((c) => {
    const m = c as THREE.Mesh;
    if (!m.isMesh) return;
    if (m.geometry.type === 'CircleGeometry') patch = true;
    const tex = (m.material as THREE.Material).userData.retroTex as TexName | undefined;
    if (tex === 'rock') rock = true;
    else if (!(tex === 'grass' && (m.material as THREE.MeshLambertMaterial).color.getHex() === COL.moss)) other = true;
  });
  if (patch) return 'patch';
  if (rock && !other) return 'rock';
  return null;
}
