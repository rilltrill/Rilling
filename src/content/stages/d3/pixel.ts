import * as THREE from 'three';
import { PwAtlas, type PwTile } from '../../pixelworld/atlas';
import { PwBatch } from '../../pixelworld/batch';
import { d2CalmLevels } from '../../pixelworld/d2levels';
import { PwBackdrop } from '../../pixelworld/backdrop';
import { pwBackdropMaterial, pwMaterial, pwTick } from '../../pixelworld/material';
import { hash2 } from '../../pixelworld/surfaces';
import {
  D3_ANIM_FRAMES, D3_ROAD_W, d3FloorTile, d3RockTile, d3FootprintDecal, d3GravelTile, d3MudRoadTile, d3MudTile, d3PuddleDecal, d3RoadTile, d3SkidDecal, d3VergeTile, d3WaterTile,
} from '../../pixelworld/d3Ground';
import { d3BoltModule, d3RangeTile, d3SkyTile } from '../../pixelworld/d3Sky';
import {
  d3BarrierBoardModule, d3CableTile, d3ConcreteTile, d3DangerBoardModule, d3DrumLidModule, d3DrumTile, d3FlareDecal, d3FrondModule, d3InsulatorModule, d3LampHeadModule, d3PalmBarkTile,
  d3PoleTile, d3PylonFaceModule, d3TornFenceModule, d3StumpFaceModule, d3RubbleTopModule, d3ScorchDecal, d3SignBoardModule, d3UtilityPoleTile, d3WireSpanModule, d3FireModule, d3WindsockModule, d3VineModule, d3FlarePoolDecal, d3FlarePlumeModule,
} from '../../pixelworld/d3Park';
import {
  d1CarBackModule, d1CarCabinModule, d1CarFrontModule, d1CarPaintTile, d1CarSideModule, d1CarUnderModule, d1TreadTile, d1WheelModule, type CarPaint,
} from '../../pixelworld/d1Props';
import { planksTile, stoneTile } from '../../pixelworld/surfaces';
import {
  d3AtriumModule, d3BannerModule, d3BrickTile, d3ColumnTile, d3FasciaTile, d3FloodheadModule, d3FringeTile, d3KioskWindowModule, d3LobbyModule, d3LodgeDoorModule, d3MarqueeModule,
  d3MosaicModule, d3PaverTile, d3StuccoTile, d3ThatchTile, d3WingWindowModule, type WingWindow, d3DripBandTile, d3DampFootTile, d3ParkMapModule, d3NoticeModule, d3GougeModule,
} from '../../pixelworld/d3Visitor';
import type { VisitorParts, HelipadParts, HeliParts } from './props';
import { FloraField, floraAtlas, floraReach } from '../../pixel/floraField';
import type { FloraBiome } from '../../pixel/floraSpecies';
import { D3_BIOME } from '../../pixel/floraBiomes';
import { D1_STONES } from '../../pixelworld/d1Species';

/** d3's biome plus wet night stone (the classic rock colours: dark basalt, lichen). */
const D3_STONE_BIOME: FloraBiome = {
  ...D3_BIOME,
  extra: {
    rock: { hex: 0x5a5850, sat: 0.85, dark: 0.34, light: 0.36 },
    rockDark: { hex: 0x4c4a44, sat: 0.85, dark: 0.34, light: 0.38 },
    rockLight: { hex: 0x666258, sat: 0.8, dark: 0.36, light: 0.34 },
    lichen: { hex: 0x6a7a5a, sat: 0.7, dark: 0.4, light: 0.4 },
  },
};
import { kitTile, repaintable, retexture, type TileRule } from '../../pixelworld/retexture';
import { corrugatedTile, hazardTile } from '../../pixelworld/surfaces';
import {
  d3CapModule, d3CraneTile, d3EnamelTile, d3HeliSideModule, d3HeliNoseModule, d3LiveryTile, d3SootModule, d3RotorDiscModule, d3BumperModule, d3HutWindowModule, d3PadLettersModule, d3PadTile, d3PaintStripeTile, d3TankPlateModule, d3TruckDoorModule, d3TruckFrontModule,
} from '../../pixelworld/d3Vehicles';
import { d3DeckTile, d3FoamModule, d3TimberTile } from '../../pixelworld/d3Bridge';
import { pwCylinder, pwDecal, pwPanel } from '../d1/pwShapes';
import { STORM } from './weather';

/**
 * TYRANT CHASE in ART: PIXEL WORLD — the park at night in the storm, every
 * surface painted as pixel art (painters in `pixelworld/d3*.ts`); the classic
 * geometry stays only where gameplay needs it (hidden occluders, the
 * destructibles' hit meshes), never drawing from the world RNG:
 *  - the ground: the terrain (jungle floor, mud, gorge rock and gravel; one
 *    planar mesh, tinted per vertex), the wet road as painted ribbons (tar
 *    snakes, worn dashes, broken edge lines, crumbling shoulders), muddy
 *    verges, the mud stretch, rain puddles with animated ripples, the
 *    Tyrant's prints;
 *  - the panorama: storm clouds with moonlit rims, rain curtains, the island's
 *    ridges with palm silhouettes and the glowing volcano; painted lightning
 *    forks for the strikes, the whole panorama flashing with them.
 * CLASSIC / PIXEL CAST build byte-identically: the stage only branches on
 * `pixelWorld(world)`.
 */

/** Painted colours (from the classic materials). */
export const D3C = {
  asphalt: 0x3a3d44,
  line: 0x9a8a40,
  edge: 0x96968e,
  gravel: 0x7a766a,
  verge: 0x4a3d2e,
  grass: 0x34492d,
  loam: 0x2e2a20,
  leaf: 0x6a5a2c,
  water: 0x2a3850,
  sky: 0x5a6a90,
  mud: 0x433426,
  mudDeep: 0x33281c,
  rock: 0x54524a,
  bed: 0x2c3632,
  stone: 0x6a665c,
} as const;

const CHUNK = 60;
/** The park's tour cars (white, red livery: the d1 painters, d3's night-storm grime). */
const CAR: CarPaint = { white: 0xb4ae9c, red: 0xb8302a, glass: 0x2a3a52, tyre: 0x1c1c1e, steel: 0x8a8a86, mud: 0x5a4630 };
const Z = new THREE.Vector3(0, 0, 1);
const NZ = new THREE.Vector3(0, 0, -1);
const X = new THREE.Vector3(1, 0, 0);
const Y = new THREE.Vector3(0, 1, 0);
const NX = new THREE.Vector3(-1, 0, 0);
const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const _m = new THREE.Matrix4();
const _p = new THREE.Vector3();
const _q = new THREE.Vector3();

/**
 * A ribbon like `PwBatch.ribbon` whose u runs right-to-left (the tile mirrored across the path):
 * one painted verge serves both sides of the road.
 */
function ribbonMirror(b: PwBatch, pts: THREE.Vector3[], width: number, tile: PwTile, offset: number, y: number, v0: number) {
  const dens = tile.density;
  const dir = new THREE.Vector3();
  const right = new THREE.Vector3();
  let along = v0;
  let pL: THREE.Vector3 | null = null;
  let pR: THREE.Vector3 | null = null;
  const u1 = width * dens;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)];
    const c2 = pts[Math.min(pts.length - 1, i + 1)];
    dir.subVectors(c2, a).setY(0).normalize();
    right.set(-dir.z, 0, dir.x);
    const L = pts[i].clone().addScaledVector(right, offset - width / 2);
    const R = pts[i].clone().addScaledVector(right, offset + width / 2);
    L.y += y;
    R.y += y;
    if (pL && pR) {
      const step = pts[i].distanceTo(pts[i - 1]) * dens;
      b.quad(pL, pR, R, L, tile, [u1, along, 0, along, 0, along + step, u1, along + step]);
      along += step;
    }
    pL = L;
    pR = R;
  }
}

/** Remove a classic group's meshes that painting replaces (glows stay: light sources keep shining). */
export function stripMeshes(o: THREE.Object3D, keep: (m: THREE.Mesh) => boolean = (m) => (m.material as THREE.Material).type === 'MeshBasicMaterial') {
  const out: THREE.Mesh[] = [];
  o.traverse((c) => {
    const m = c as THREE.Mesh;
    if (m.isMesh && !m.userData.pixelWorld && !keep(m)) out.push(m);
  });
  for (const m of out) m.parent?.remove(m);
}

/** Hide (keep for raycasts) the classic meshes of an occluder that painting replaces. */
export function hideMeshes(o: THREE.Object3D, keep?: (m: THREE.Mesh) => boolean) {
  o.traverse((c) => {
    const m = c as THREE.Mesh;
    if (m.isMesh && !m.userData.pixelWorld && !(keep && keep(m))) m.visible = false;
  });
}

/**
 * The sky band's material: the backdrop material whose colour is scaled by elevation — the live
 * fog ratio `uLo` up to v0 (the fog-coloured horizon), blending to the flash gain `uHi` by v1
 * (the storm heaps light up with the lightning; the horizon only as much as the fog does).
 */
function d3SkyMaterial(atlas: PwAtlas, v0: number, v1: number): THREE.MeshBasicMaterial {
  const m = pwBackdropMaterial(atlas);
  const u = { uLo: { value: new THREE.Color(1, 1, 1) }, uHi: { value: 1 }, uV: { value: new THREE.Vector2(v0, v1) } };
  m.userData.d3 = u;
  const base = m.onBeforeCompile;
  m.onBeforeCompile = (shader, r) => {
    base.call(m, shader, r);
    shader.uniforms.uD3Lo = u.uLo;
    shader.uniforms.uD3Hi = u.uHi;
    shader.uniforms.uD3V = u.uV;
    shader.fragmentShader = shader.fragmentShader
      .replace('uniform float uPwGain;', 'uniform float uPwGain;\n  uniform vec3 uD3Lo;\n  uniform float uD3Hi;\n  uniform vec2 uD3V;')
      .replace('diffuseColor.rgb = (diffuseColor.rgb + pwEmit);', 'diffuseColor.rgb = (diffuseColor.rgb + pwEmit) * mix(uD3Lo, vec3(uD3Hi), smoothstep(uD3V.x, uD3V.y, vPwUv.y));');
  };
  m.customProgramCacheKey = () => 'd3SkyBackdrop1';
  m.name = 'pwBackdrop:d3-sky';
  return m;
}

export type TerrainKind = 'floor' | 'mud' | 'rock' | 'bed';

export class D3PixelWorld {
  readonly atlas = new PwAtlas('d3');
  readonly skyAtlas = new PwAtlas('d3-sky', { levels: 1 });
  /** The terrain: one planar mesh (world-projected wrap tiles, per-vertex tint). */
  readonly terrain: PwBatch;
  /** Animated strips (water, foam, flames). */
  readonly anim: PwBatch;
  /** Rain puddles: animated, on their own material (levels a step early: calm dark pools at a distance). */
  readonly puddles: PwBatch;
  /** Static painted scenery per 60 m chunk (fog-culled with the classic chunks). */
  private chunks = new Map<number, PwBatch>();
  /** Signs per chunk (their own material: level bias −0.25, the letters stay whole further away). */
  private signs = new Map<number, PwBatch>();
  /** Wrap tiles whose far levels are re-made calm (`d2CalmLevels`): the deck, the plaza pavers. */
  private calmTiles = new Set<PwTile>();
  /** Batches laid in a moving group's own frame (`mat`: the sign or the calm-level material). */
  private parts: { batch: PwBatch; parent: THREE.Object3D; cull: boolean; mat?: 'sign' | 'calm' }[] = [];
  /** Painted meshes that copy a classic object's world matrix every frame (the flying roadblock car). */
  private followers: { batch: PwBatch; target: THREE.Object3D; mesh: THREE.Mesh | null }[] = [];
  /** Windsocks swinging with the wind. */
  private socks: THREE.Object3D[] = [];
  /** Pivots attached at `finish` (a bake drops empty groups). */
  private late: [THREE.Object3D, THREE.Object3D][] = [];
  /** Swinging banners: pivots rocked by the wind each frame. */
  private banners: { pivot: THREE.Object3D; phase: number }[] = [];
  private time = 0;
  /** The helicopter's main rotor and its blur disc (shown above a spin rate). */
  private rotor: { rotor: THREE.Object3D; disc: THREE.Object3D; last: number } | null = null;
  /** Invisible material for the classic hit meshes of painted destructibles (still raycast, never drawn). */
  private hidden: THREE.MeshBasicMaterial | null = null;
  backdrop: PwBackdrop | null = null;
  /** Boulders as hand-pixelled billboards (the SPRITES scenery: they toggle with the plants). */
  readonly stones: FloraField;
  private skyMat: THREE.MeshBasicMaterial | null = null;
  private rangeMat: THREE.MeshBasicMaterial | null = null;
  private fog: THREE.Fog | null = null;
  private fogBase = new THREE.Color(STORM.fog);
  private animMat: THREE.Material | null = null;
  private puddleMat: THREE.Material | null = null;
  /** The forks' material (made at `finish`: the world atlas must be painted first). */
  boltMat!: THREE.MeshBasicMaterial;
  private floorT: PwTile;
  private fireT: PwTile[];
  private flameN = 0;
  private flameGeos = new Map<string, THREE.BufferGeometry>();
  private mudT: PwTile;
  private rockT: PwTile;
  private bedT: PwTile;

  constructor() {
    const a = this.atlas;
    this.terrain = new PwBatch(a, { planar: true });
    this.stones = new FloraField(floraAtlas(D1_STONES, D3_STONE_BIOME, 'd3-stones'), { far: 88, rim: 0x8aa4d8, rimStrength: 0.22, gain: 0.74, localCap: 0.3 });
    this.anim = new PwBatch(a);
    this.puddles = new PwBatch(a);
    this.floorT = d3FloorTile(a, { hex: D3C.grass, dark: D3C.loam, leaf: D3C.leaf, water: D3C.sky, stone: D3C.stone });
    this.mudT = d3MudTile(a, { hex: D3C.mud, water: D3C.water });
    this.rockT = d3RockTile(a, { hex: 0x5c5a52, moss: 0x34492d });
    this.bedT = d3GravelTile(a, { hex: 0x5a5e58, silt: D3C.bed });
    // Bolts: painted forks (cut-out, glowing), in the world atlas (its levels keep the glow far away).
    for (let i = 0; i < 2; i++) d3BoltModule(a, i);
    // Fires (spawned during play): the animated flame, registered up front.
    this.fireT = [d3FireModule(a, D3_ANIM_FRAMES, 0), d3FireModule(a, D3_ANIM_FRAMES, 1)];
  }

  /** The static batch of the chunk at rail distance d. */
  chunk(d: number): PwBatch {
    const k = Math.floor(d / CHUNK);
    let b = this.chunks.get(k);
    if (!b) this.chunks.set(k, (b = new PwBatch(this.atlas)));
    return b;
  }

  /** The sign batch of the chunk at rail distance d. */
  signChunk(d: number): PwBatch {
    const k = Math.floor(d / CHUNK);
    let b = this.signs.get(k);
    if (!b) this.signs.set(k, (b = new PwBatch(this.atlas)));
    return b;
  }

  /** A batch laid in `parent`'s own frame (it moves with it); `mat` picks the sign / calm material. */
  part(parent: THREE.Object3D, cull = false, mat?: 'sign' | 'calm'): PwBatch {
    const b = new PwBatch(this.atlas);
    this.parts.push({ batch: b, parent, cull, mat });
    return b;
  }

  // ─── Ground ────────────────────────────────────────────────────────────────

  /** One terrain cell (corners counter-clockwise from above: a, b, c, d) with corner tints. */
  terrainCell(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3, kind: TerrainKind, tints: [number, number, number, number]) {
    const t = kind === 'mud' ? this.mudT : kind === 'rock' ? this.rockT : kind === 'bed' ? this.bedT : this.floorT;
    this.terrain.quad(a, b, c, d, t, [0, 0, 0, 0, 0, 0, 0, 0], tints);
  }

  /**
   * The road from d0 to d1 (painted ribbons: the carriageway, or the mud stretch, and a muddy verge
   * each side), its pattern continuous along the rail; split per chunk (culled with it).
   */
  road(d0: number, d1: number, at: (d: number) => THREE.Vector3, mud: boolean) {
    const a = this.atlas;
    const t = mud
      ? d3MudRoadTile(a, { hex: D3C.mud, water: 0x3a3428, plank: 0x6e5a3e })
      : d3RoadTile(a, { hex: D3C.asphalt, line: D3C.line, edge: D3C.edge, gravel: D3C.gravel, grass: 0x3f6d3a, leaf: D3C.leaf });
    // One verge tile (outer edge at u = W): the left verge is the same tile mirrored across the road.
    const verge = d3VergeTile(a, { mud: D3C.verge, grass: D3C.grass, gravel: D3C.gravel, leaf: D3C.leaf, water: D3C.sky });
    for (let s0 = d0; s0 < d1 - 0.001; ) {
      const s1 = Math.min(d1, (Math.floor(s0 / CHUNK) + 1) * CHUNK);
      const pts: THREE.Vector3[] = [];
      for (let d = s0; d < s1 + 1.999; d += 2) pts.push(at(Math.min(d, s1)).setY(0));
      if (pts.length > 1) {
        const b = this.chunk(s0);
        const v0 = (s0 + 60) * 32;
        b.ribbon(pts, D3_ROAD_W / 32, t, { y: mud ? 0.025 : 0.02, v0 });
        ribbonMirror(b, pts, 5, verge, -5.9, 0.012, v0);
        b.ribbon(pts, 5, verge, { offset: 5.9, y: 0.012, v0 });
      }
      s0 = s1;
    }
  }

  /** A rain puddle (the classic disc: radius r, stretched `sz` along its local z, turned `yaw`). */
  puddle(p: THREE.Vector3, yaw: number, rx: number, rz: number, variant: number, muddy = false) {
    // (One painted puddle per kind; `variant` mirrors it so neighbours differ.)
    const t = d3PuddleDecal(this.atlas, muddy ? { rim: 0x2a2018, water: 0x1e2430, sky: 0x52627e } : { rim: 0x24221e, water: 0x1a2232, sky: D3C.sky }, 0);
    const sub = { x: 0, y: 0, w: t.w, h: t.h / D3_ANIM_FRAMES };
    const ax = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
    const az = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
    const sx = rx * 2.3;
    const sz = rz * 2.3;
    const o = new THREE.Vector3(p.x, p.y, p.z).addScaledVector(ax, -sx / 2).addScaledVector(az, sz / 2);
    this.puddles.rect(o, ax, az.negate(), sx, sz, t, { sub, flipU: (variant & 1) === 1 });
  }

  /** A Tyrant footprint at (x, y, z), toes along `yaw` (+z of that frame), `s` × the 2 × 2.5 m print. */
  footprint(x: number, y: number, z: number, yaw: number, s: number, onAsphalt: boolean, d: number) {
    const t = d3FootprintDecal(this.atlas, { mud: onAsphalt ? 0x24262c : 0x3a2c1e, water: D3C.water }, onAsphalt);
    // (x, z) is the heel: the module's centre lies 0.56 m (× s / 1.2) toward the toes (+z of `yaw`).
    const k = s * 0.84;
    const off = 0.56 * k;
    // The module's toes point up (−v): turn it so they lead along +z of `yaw`.
    pwDecal(this.chunk(d), x + Math.sin(yaw) * off, y, z + Math.cos(yaw) * off, 2 * k, 2.5 * k, yaw + Math.PI, t);
  }

  /** A boulder billboard of the rock it replaces (`w` wide, `h` tall, foot at (x, y, z)). */
  stone(x: number, y: number, z: number, w: number, h: number) {
    if (h <= 0.05) return;
    this.stones.fit(h > 5 ? 'cliffSpire' : 'boulder', x, y, z, w, h, { aspectTol: 1.6 });
  }

  /** A classic rock mesh / group (placed) as a boulder billboard of its size. */
  stoneOf(o: THREE.Object3D) {
    o.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(o);
    const cx = (box.min.x + box.max.x) / 2;
    const cz = (box.min.z + box.max.z) / 2;
    const foot = new THREE.Vector3(cx, box.min.y, cz);
    this.stone(cx, box.min.y + (box.max.y - box.min.y) * 0.15, cz, floraReach(o, foot), (box.max.y - box.min.y) * 0.85);
  }

  /** Tyre skid marks (two streaks 6 m long) at (x, z) along `yaw`. */
  skid(x: number, y: number, z: number, yaw: number, d: number) {
    pwDecal(this.chunk(d), x, y, z, 1.0, 6, yaw, d3SkidDecal(this.atlas, { hex: 0x101114 }));
  }

  // ─── Paddock fence ─────────────────────────────────────────────────────────

  /** Paint a placed pylon group (`h` tall; a snapped stump when not `intact`) into the chunk batch; its red lamp stays. */
  pylon(g: THREE.Object3D, h: number, intact: boolean, variant: number, d: number) {
    const a = this.atlas;
    g.updateMatrixWorld(true);
    stripMeshes(g);
    const face = d3PylonFaceModule(a, { hex: 0x8c8a82, rust: 0x7a3a1c, moss: 0x3f5a2e }, variant % 2);
    const conc = d3ConcreteTile(a, { hex: 0x5e5c56 });
    const ins = d3InsulatorModule(a);
    const steel = d3PoleTile(a, { hex: 0x34363c });
    const b = this.chunk(d);
    if (!intact) {
      // A snapped stump: its own darker face module (jagged cut-out break, rebar ends, cracks, the
      // hazard band square on the foot), the broken top set below the break's notches.
      const sf = d3StumpFaceModule(a, { hex: 0x56544e, moss: 0x3f5a2e }, variant % 2);
      b.withMatrix(g.matrixWorld, () => {
        for (const [n, r] of [[Z, X], [X, NZ], [NZ, NX], [NX, Z]] as [THREE.Vector3, THREE.Vector3][]) pwPanel(b, n.clone().multiplyScalar(0.45).setY(h / 2), r, Y, 0.9, h, sf);
        b.rect(V(-0.45, h - 0.5, 0.45), X, NZ, 0.9, 0.9, d3RubbleTopModule(a, { hex: 0x56544e }));
        b.box(0, 0.25, 0, 1.2, 0.5, 1.2, { px: conc, nx: conc, pz: conc, nz: conc, py: conc, ny: null });
      });
      // Soot on the ground round its foot, chunks of the snapped column lying about.
      _p.setFromMatrixPosition(g.matrixWorld);
      pwDecal(b, _p.x, _p.y + 0.03, _p.z, 3, 3, variant, d3ScorchDecal(a));
      for (let i = 0; i < 3; i++) {
        const ang = variant * 1.7 + i * 2.1;
        const r = 1.1 + (i % 2) * 0.6;
        this.stones.fit('boulder', _p.x + Math.cos(ang) * r, _p.y, _p.z + Math.sin(ang) * r, 0.5 + (i % 2) * 0.25, 0.35 + (i === 0 ? 0.2 : 0), { aspectTol: 1.6 });
      }
      return;
    }
    b.withMatrix(g.matrixWorld, () => {
      b.box(0, h / 2, 0, 0.9, h, 0.9, { px: face, nx: face, pz: face, nz: face, py: conc, ny: null });
      b.box(0, 0.25, 0, 1.2, 0.5, 1.2, { px: conc, nx: conc, pz: conc, nz: conc, py: conc, ny: null });
      if (intact) {
        b.box(0, h + 0.15, 0, 1.1, 0.3, 1.1, conc);
        for (let i = 0; i < 6; i++) b.box(0, 1.3 + i * ((h - 2) / 5), 0, 0.25, 0.12, 1.3, { px: ins, nx: ins, pz: steel, nz: steel, py: steel, ny: steel });
        // Vines hanging from the cap over the road-facing face (some pylons), breaking the column's edge.
        if (variant % 3 === 1) pwPanel(b, V(0.12, h - 1.5, 0.47), X, Y, 1.0, 3.0, d3VineModule(a, { hex: 0x3f6d3a }, variant % 2));
        if (variant % 4 === 2) pwPanel(b, V(-0.47, h - 2.2, 0.1), Z, Y, 1.0, 3.0, d3VineModule(a, { hex: 0x355f36 }, 1));
      }
    });
  }

  /** Bent rebar sticking out of a snapped pylon (a thin rusty rod from a to b, world space). */
  rebar(a: THREE.Vector3, b: THREE.Vector3, d: number) {
    pwCylinder(this.chunk(d), a, b, 0.03, 0.03, 4, d3PoleTile(this.atlas, { hex: 0x5a3a24 }));
  }

  /** A wire span between two pylon feet (world, y = 0), painted both sides. */
  wireSpan(a: THREE.Vector3, b: THREE.Vector3, variant: number, d: number) {
    const t = d3WireSpanModule(this.atlas, { wire: 0x6a6e72, vine: 0x3f6a2e, tape: 0xe0b020 }, variant % 3);
    _p.subVectors(b, a).setY(0);
    const len = _p.length();
    _p.normalize();
    const c = a.clone().lerp(b, 0.5).setY(4.5);
    pwPanel(this.chunk(d), c, _p.clone(), Y, len, 9, t, { back: true });
  }

  /** A dangling live cable from `a` down to `b` (world) sagging `sag` m: a flat ribbon facing the road (`toRoad`). */
  cable(a: THREE.Vector3, b: THREE.Vector3, sag: number, toRoad: THREE.Vector3, d: number) {
    const t = d3CableTile(this.atlas);
    const bt = this.chunk(d);
    const n = 8;
    const w = 0.12;
    let prev = a.clone();
    let v = 0;
    for (let i = 1; i <= n; i++) {
      const k = i / n;
      const p = new THREE.Vector3().lerpVectors(a, b, k);
      p.y -= Math.sin(Math.PI * k) * sag;
      _q.subVectors(p, prev);
      const len = _q.length();
      const side = new THREE.Vector3().crossVectors(_q, toRoad).normalize().multiplyScalar(w / 2);
      const v1 = v + len * 32;
      bt.quad(prev.clone().sub(side), prev.clone().add(side), p.clone().add(side), p.clone().sub(side), t, [0, v, 4, v, 4, v1, 0, v1]);
      bt.quad(prev.clone().add(side), prev.clone().sub(side), p.clone().sub(side), p.clone().add(side), t, [0, v, 4, v, 4, v1, 0, v1]);
      v = v1;
      prev = p;
    }
  }

  /** A DANGER board (the classic `dangerSign` group, placed): the painted plate front, steel back, posts. */
  dangerBoard(g: THREE.Object3D, variant: number, d: number) {
    g.updateMatrixWorld(true);
    stripMeshes(g);
    const a = this.atlas;
    const b = this.chunk(d);
    const back = d3PoleTile(a, { hex: 0x5a5c5e });
    const sb = this.signChunk(d);
    sb.withMatrix(g.matrixWorld, () => pwPanel(sb, V(0, 0, 0.05), X, Y, 3.75, 1.82, d3DangerBoardModule(a, 0), { backTile: back }));
    b.withMatrix(g.matrixWorld, () => {
      for (const sx of [-1.4, 1.4]) b.box(sx, -0.6, -0.08, 0.1, 3, 0.1, back);
    });
  }

  // ─── Vehicles, roadblock ───────────────────────────────────────────────────

  /**
   * The tour car (`P.tourCar`) painted into `b` in the car group's own frame (body 2 × 1 × 4.6 at
   * y 0.45–1.45, front +z; cabin 1.86 × roofH × 2.7 at z −0.35): the park livery sides, cabin
   * windows, front / back, roof, the underside (mud, rust, axles), knobbly wheels.
   */
  paintTourCar(b: PwBatch, crushed: boolean) {
    const a = this.atlas;
    const side = d1CarSideModule(a, CAR, true);
    const side2 = d1CarSideModule(a, CAR, crushed);
    const cabin = d1CarCabinModule(a, CAR, true);
    const paint = d1CarPaintTile(a, CAR);
    const tread = d1TreadTile(a, { hex: CAR.tyre, mud: CAR.mud });
    const wheel = d1WheelModule(a, { tyre: CAR.tyre, rim: CAR.steel, mud: CAR.mud });
    const steel = d3PoleTile(a, { hex: 0x2a2c30 });
    const roofH = crushed ? 0.45 : 0.95;
    pwPanel(b, V(1.0, 0.95, 0), NZ, Y, 4.6, 1.0, side);
    pwPanel(b, V(-1.0, 0.95, 0), Z, Y, 4.6, 1.0, side2, { flipU: true });
    pwPanel(b, V(0, 0.95, 2.3), X, Y, 2.0, 1.0, d1CarFrontModule(a, CAR));
    pwPanel(b, V(0, 0.95, -2.3), NX, Y, 2.0, 1.0, d1CarBackModule(a, CAR));
    b.rect(V(-1, 1.45, 2.3), X, NZ, 2, 4.6, paint);
    b.rect(V(-1, 0.45, -2.3), X, Z, 2, 4.6, d1CarUnderModule(a, CAR));
    // Cabin (crushed: tilted, squashed).
    const cm = new THREE.Matrix4().makeTranslation(0, 1.45 + roofH / 2, -0.35);
    if (crushed) cm.multiply(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(0.08, 0, 0.12)));
    b.withMatrix(b.matrix.clone().multiply(cm), () => {
      pwPanel(b, V(0.93, 0, 0), NZ, Y, 2.7, roofH, cabin);
      pwPanel(b, V(-0.93, 0, 0), Z, Y, 2.7, roofH, cabin, { flipU: true });
      pwPanel(b, V(0, 0, 1.35), X, Y, 1.86, roofH, cabin, { flipU: true });
      pwPanel(b, V(0, 0, -1.35), NX, Y, 1.86, roofH, cabin);
      b.rect(V(-0.93, roofH / 2, 1.35), X, NZ, 1.86, 2.7, paint);
    });
    // Bumpers, chassis, wheels.
    b.box(0, 0.55, 2.38, 2.1, 0.28, 0.25, steel);
    b.box(0, 0.55, -2.38, 2.1, 0.28, 0.25, steel);
    for (const sx of [-1, 1]) for (const sz of [-1.45, 1.45]) pwCylinder(b, V(sx * 0.74, 0.45, sz), V(sx * 1.1, 0.45, sz), 0.45, 0.45, 10, tread, { capB: wheel });
  }

  /** A static tour car (the crushed one by the paddock gap): classic meshes removed, painted in the chunk. */
  staticCar(g: THREE.Object3D, crushed: boolean, d: number) {
    g.updateMatrixWorld(true);
    stripMeshes(g);
    const b = this.chunk(d);
    b.withMatrix(g.matrixWorld, () => this.paintTourCar(b, crushed));
  }

  /** The roadblock car: the classic body (`inner`, the occluder) hidden; a painted copy follows it every frame. */
  followCar(inner: THREE.Object3D, crushed: boolean) {
    hideMeshes(inner);
    const b = new PwBatch(this.atlas);
    this.paintTourCar(b, crushed);
    this.followers.push({ batch: b, target: inner, mesh: null });
  }

  /**
   * The fallen palm (`flora.brokenPalm` group `log`, its trunk along local z, the crown at +len/2):
   * ringed bark, torn fronds as crossed cut-out cards; painted in its own frame (it rolls away).
   */
  palmLog(log: THREE.Object3D, len: number) {
    stripMeshes(log);
    const a = this.atlas;
    const b = this.part(log);
    const bark = d3PalmBarkTile(a, { hex: 0x6e5d4a, ring: 0x4c3f32 });
    pwCylinder(b, V(0, 0, -len / 2), V(0, 0, len / 2), 0.24, 0.2, 8, bark);
    const fr = [d3FrondModule(a, { hex: 0x3f6d3a, rib: 0x8a7a4a }, 0), d3FrondModule(a, { hex: 0x4a7b42, rib: 0x8a7a4a }, 1)];
    const e = new THREE.Euler();
    const dir = new THREE.Vector3();
    const up = new THREE.Vector3();
    for (let i = 0; i < 6; i++) {
      e.set(-0.5 + (i % 3) * 0.45, (i / 6) * Math.PI * 2, 0, 'YXZ');
      dir.set(0, 0, 1).applyEuler(e);
      up.set(0, 1, 0).applyEuler(e);
      const c = V(0, 0, len / 2).addScaledVector(dir, 1.25);
      pwPanel(b, c, dir.clone(), up.clone(), 2.5, 0.85, fr[i % 2], { back: true });
    }
  }

  /** A sawhorse barrier (`P.sawhorse`, its lamp kept): the striped boards front and back, A-frame legs; in its own frame. */
  sawhorse(root: THREE.Object3D, lamp: THREE.Mesh) {
    stripMeshes(root, (m) => m === lamp);
    const a = this.atlas;
    const b = this.part(root);
    const wood = planksTile(a, { hex: 0xb8b0a0 });
    pwPanel(b, V(0, 0.95, 0.045), X, Y, 2.6, 0.32, d3BarrierBoardModule(a, true), { backTile: d3BarrierBoardModule(a, false) });
    pwPanel(b, V(0, 0.45, 0.045), X, Y, 2.6, 0.22, d3BarrierBoardModule(a, false), { back: true });
    for (const sx of [-1.1, 1.1]) {
      for (const [z, rx] of [[0.25, -0.35], [-0.25, 0.35]] as [number, number][]) {
        _m.makeTranslation(sx, 0.6, z).multiply(new THREE.Matrix4().makeRotationX(rx));
        b.withMatrix(_m, () => b.box(0, 0, 0, 0.08, 1.2, 0.08, wood));
      }
    }
  }

  /**
   * A painted fuel drum on a destructible (after it was added to the world: never a hit box): its
   * classic meshes keep being hit but are no longer drawn; the painted drum rides on its root.
   */
  drum(root: THREE.Object3D, red: boolean) {
    this.hidden ??= new THREE.MeshBasicMaterial({ visible: false });
    root.traverse((c) => {
      const m = c as THREE.Mesh;
      if (m.isMesh && !m.userData.pixelWorld) m.material = this.hidden!;
    });
    const a = this.atlas;
    const b = new PwBatch(a);
    const hex = red ? 0xb3261e : 0xc8a028;
    pwCylinder(b, V(0, 0, 0), V(0, 0.96, 0), 0.345, 0.345, 12, d3DrumTile(a, { hex, label: red ? 0xe8e0c8 : 0xe0401a }), { capB: d3DrumLidModule(a, { hex }) });
    const m = b.build();
    if (m) root.add(m);
  }

  /** Register the drum tiles before the atlas is painted (drums are spawned later). */
  drumTiles() {
    for (const red of [false, true]) {
      const hex = red ? 0xb3261e : 0xc8a028;
      d3DrumTile(this.atlas, { hex, label: red ? 0xe8e0c8 : 0xe0401a });
      d3DrumLidModule(this.atlas, { hex });
    }
  }

  // ─── Visitor centre ────────────────────────────────────────────────────────

  /**
   * The visitor centre, painted in its own frame (v.root, placed; +z toward the road, the front
   * wall at z = −1) BEFORE the classic shell is baked (the roofs' geometry is read from it); the
   * shell then stays as the hidden occluder (`hideShell`). `plaza` = the env-built plaza group
   * (paving, planters, mast, kiosk) holding `v.plaza` (the fountain). Returns a group standing
   * for the flickering window (toggle its visibility).
   */
  visitorCentre(v: VisitorParts, plaza: THREE.Group): THREE.Object3D {
    const a = this.atlas;
    v.root.updateMatrixWorld(true);
    const inv = v.root.matrixWorld.clone().invert();
    const b = this.part(v.root, true);
    const st = d3StuccoTile(a, { hex: 0x9c917c });
    const stD = d3StuccoTile(a, { hex: 0x7a705e });
    const conc = d3ConcreteTile(a, { hex: 0x6e685c });
    const stone = stoneTile(a, { hex: 0xb0a68e });
    const steel = d3PoleTile(a, { hex: 0x2e2a24 });
    const thatch = d3ThatchTile(a, { hex: 0x6a5232 });
    const fringe = d3FringeTile(a, { hex: 0x6a5232 });
    const win = (k: WingWindow) => d3WingWindowModule(a, k, { wall: 0x9c917c, stone: 0xb0a68e, frame: 0x2e2a24 });
    // Wings: stucco fronts (a hand-painted window per opening: dark / lit / one smashed / the flickering one).
    for (const sd of [-1, 1]) {
      const x0 = sd < 0 ? -20 : 7.5;
      b.rect(V(x0, 0, -0.99), X, Y, 12.5, 8, st, { u0: sd < 0 ? 0 : 17 });
      for (let i = 0; i < 4; i++) {
        for (let row = 0; row < 2; row++) {
          const x = sd * (9.5 + i * 2.9);
          const y = 2.4 + row * 3.2;
          const lit = (i + row * 3 + (sd > 0 ? 1 : 0)) % 5 === 0;
          const flick = sd > 0 && i === 2 && row === 0;
          if (flick) continue;
          const kind: WingWindow = lit ? 'lit' : sd < 0 && i === 1 && row === 0 ? 'broken' : 'dark';
          pwPanel(b, V(x, y - 0.03, -0.98), X, Y, 2.5, 2.625, win(kind));
        }
      }
      // Ends of the wings (x = ±20) with three windows each.
      const ex = sd * 20.01;
      b.rect(V(ex, 0, sd > 0 ? -1 : -17), sd > 0 ? NZ : Z, Y, 16, 8, st, { u0: 9 });
      for (const z of [-4.5, -9, -13.5]) for (const y of [2.4, 5.6]) pwPanel(b, V(sd * 20.02, y - 0.03, z), sd > 0 ? NZ : Z, Y, 2.5, 2.625, win(z === -9 && y > 3 ? 'lit' : 'dark'));
      // Plinth band, cornice.
      b.rect(V(x0 - (sd < 0 ? 0.08 : 0), 0, -0.91), X, Y, 12.58, 1.1, conc);
      b.box(sd * 13.9, 8.1, -9, 12.8, 0.6, 16.6, { pz: d3FasciaTile(a, { hex: 0x7a705e }), px: d3FasciaTile(a, { hex: 0x7a705e }), nx: d3FasciaTile(a, { hex: 0x7a705e }), ny: stD });
    }
    // The flickering window: its own little batch under a group the flicker toggles.
    const flick = new THREE.Group();
    flick.name = 'd3-flicker-window';
    v.root.add(flick);
    pwPanel(this.part(flick), V(9.5 + 2 * 2.9, 2.37, -0.97), X, Y, 2.5, 2.625, win('flicker'));
    // A dark window behind it (shown when the strip light is off).
    pwPanel(b, V(9.5 + 2 * 2.9, 2.37, -0.98), X, Y, 2.5, 2.625, win('dark'));
    // Vines hanging from the cornice down the wings and the atrium's corners.
    const vine = d3VineModule(a, { hex: 0x3f6d3a }, 0);
    const vine2 = d3VineModule(a, { hex: 0x355f36 }, 1);
    for (const [x, y, z, w, hh, t] of [[-19.4, 6.4, -0.95, 1.2, 3.4, vine], [-8.2, 6.6, -0.95, 1.0, 3, vine2], [19.2, 6.3, -0.95, 1.2, 3.4, vine2], [-7, 10.6, -0.94, 1.0, 3, vine], [7.0, 10.8, -0.94, 1.0, 2.8, vine2]] as [number, number, number, number, number, PwTile][]) {
      pwPanel(b, V(x, y, z), X, Y, w, hh, t);
    }
    // Atrium: stucco round the big glass, its sides.
    b.rect(V(-7.5, 0, -0.99), X, Y, 1.5, 12.5, st, { u0: 3 });
    b.rect(V(6, 0, -0.99), X, Y, 1.5, 12.5, st, { u0: 11 });
    b.rect(V(-6, 11.8, -0.99), X, Y, 12, 0.7, st);
    b.rect(V(-6, 0, -0.99), X, Y, 12, 2.8, st);
    pwPanel(b, V(0, 7.3, -0.885), X, Y, 12, 9, d3AtriumModule(a));
    for (const sd of [-1, 1]) b.rect(V(sd * 7.5, 0, sd > 0 ? -1 : -15), sd > 0 ? NZ : Z, Y, 14, 12.5, st, { u0: 21 });
    // Roofs: the classic cones (square pyramids) re-emitted as thatch, a ragged straw fringe on every eave.
    v.shell.updateMatrixWorld(true);
    for (const c of v.shell.children) {
      const m = c as THREE.Mesh;
      if (!m.isMesh || m.geometry.type !== 'ConeGeometry') continue;
      _m.multiplyMatrices(inv, m.matrixWorld);
      const dark = (m.material as THREE.MeshLambertMaterial).color.getHex() === 0x3a2c1e;
      b.geometry(m.geometry, _m, thatch, { tint: dark ? 0xb0a090 : 0xffffff });
    }
    const eave = (cx: number, cz: number, half: number, y: number) => {
      const corners = [V(cx - half, y, cz + half), V(cx + half, y, cz + half), V(cx + half, y, cz - half), V(cx - half, y, cz - half)];
      for (let i = 0; i < 4; i++) {
        const p0 = corners[i];
        const p1 = corners[(i + 1) % 4];
        _p.subVectors(p1, p0).normalize();
        const out = new THREE.Vector3(_p.z, 0, -_p.x).multiplyScalar(0.06);
        const len = p0.distanceTo(p1);
        b.rect(p0.clone().add(out).setY(y - 1), _p.clone(), Y, len, 1, fringe, { v0: 0 });
        b.rect(p1.clone().add(out).setY(y - 1), _p.clone().negate(), Y, len, 1, fringe, { v0: 0 });
      }
    };
    eave(-12.5, -9, 11.4 / Math.SQRT2, 8.42);
    eave(12.5, -9, 11.4 / Math.SQRT2, 8.42);
    eave(0, -8, 11.2 / Math.SQRT2, 12.42);
    // Colonnade.
    const col = d3ColumnTile(a, { hex: 0xb0a68e });
    for (const x of [-12, -7.5, -3.2, 3.2, 7.5, 12]) {
      pwCylinder(b, V(x, 0.4, 2.6), V(x, 7.12, 2.6), 0.58, 0.5, 10, col);
      b.box(x, 0.2, 2.6, 1.4, 0.4, 1.4, stone);
      b.box(x, 7.3, 2.6, 1.3, 0.35, 1.3, stone);
    }
    // Portico: moulded fascia front and sides, a dark soffit, its roof.
    const fascia = d3FasciaTile(a, { hex: 0x7a705e });
    b.box(0, 7.8, 1.6, 28, 0.8, 5, { pz: fascia, px: fascia, nx: fascia, ny: stD, py: conc });
    // VISITOR CENTER: the marquee on its board.
    b.box(0, 7.95, 4.08, 13, 1.4, 0.15, { px: steel, nx: steel, py: steel, ny: steel, nz: null, pz: null });
    // (The bulb letters stay on the default level bias: their 3 × 3 bulbs on a 4-texel pitch merge into whole strokes at level 1.)
    pwPanel(b, V(0, 7.95, 4.157), X, Y, 13, 1.4, d3MarqueeModule(a, 'VISITOR CENTER'));
    // Floor of the portico and the step.
    const pav = d3PaverTile(a, { hex: 0x7c7a72 });
    this.calmTiles.add(pav);
    b.box(0, 0.15, 1.5, 42, 0.3, 7, { py: pav, pz: conc, px: conc, nx: conc });
    b.box(0, 0.075, 5.4, 18, 0.15, 1.2, { py: conc, pz: conc, px: conc, nx: conc });
    // The doorway: the dark lobby, its steel frame.
    pwPanel(b, V(0, 2.9, -0.585), X, Y, 4.8, 5.2, d3LobbyModule(a));
    b.box(0, 5.6, -0.7, 5.6, 0.4, 0.6, steel);
    for (const sx of [-2.6, 2.6]) b.box(sx, 2.9, -0.7, 0.4, 5.4, 0.6, steel);
    // Torn banners, rocking in the wind (pivots at their tops).
    for (const [x, len] of [[-5.3, 6.2], [5.3, 3.4]] as [number, number][]) {
      const pivot = new THREE.Group();
      pivot.position.set(x, 7.4, 4.25);
      v.root.add(pivot);
      pwPanel(this.part(pivot), V(0, -len / 2, 0), X, Y, 2.0, len, d3BannerModule(a, len), { back: true });
      this.banners.push({ pivot, phase: x });
    }
    // Wall dressing: rain stains hanging under the cornices, a damp splashed foot over the plinth,
    // the park map and an EVACUATION notice on the atrium's flanks, claw gouges beside the doors.
    const drip = d3DripBandTile(a, { hex: 0x7a705e });
    const foot = d3DampFootTile(a, { hex: 0x6a604e });
    for (const sd of [-1, 1]) {
      const x0 = sd < 0 ? -20 : 7.5;
      b.rect(V(x0, 6.8, -0.986), X, Y, 12.5, 1, drip, { u0: sd < 0 ? 0 : 23 });
      b.rect(V(x0, 1.1, -0.986), X, Y, 12.5, 0.5, foot, { u0: sd < 0 ? 0 : 31 });
    }
    b.rect(V(-6, 10.8, -0.986), X, Y, 12, 1, drip, { u0: 11 });
    pwPanel(b, V(-6.75, 2.2, -0.982), X, Y, 1.25, 0.875, d3ParkMapModule(a));
    pwPanel(b, V(6.6, 2.0, -0.982), X, Y, 0.75, 1.0, d3NoticeModule(a));
    const gouge = d3GougeModule(a, { hex: 0x9c917c });
    pwPanel(b, V(-3.4, 1.7, -0.982), X, Y, 1.0, 1.5, gouge);
    pwPanel(b, V(3.5, 1.4, -0.982), X, Y, 1.0, 1.5, gouge, { flipU: true });
    // The lit ground-floor window's light on the portico floor (a dim warm pool).
    pwDecal(b, -9.5, 0.304, 0.4, 3, 2.2, 0, d3FlarePoolDecal(a, { hex: 0xb07a4a }));
    // Palm fronds hanging over the eaves from the trees behind (breaking the roofline).
    const fr = [d3FrondModule(a, { hex: 0x355f36, rib: 0x6a5a3a }, 0), d3FrondModule(a, { hex: 0x2f5530, rib: 0x6a5a3a }, 1)];
    for (const [x, y, z, ry, droop, i] of [[-19.4, 8.7, -0.6, Math.PI, 0.55, 0], [-15.5, 8.9, -0.5, Math.PI - 0.4, 0.45, 1], [19.4, 8.6, -0.6, 0, 0.55, 1], [15, 9.0, -0.5, 0.4, 0.4, 0], [-4.8, 12.8, 0.1, Math.PI - 0.3, 0.6, 1], [5.2, 12.7, 0.1, 0.3, 0.5, 0]] as [number, number, number, number, number, number][]) {
      const dir = V(Math.cos(ry), -droop, 0.35).normalize();
      const up = new THREE.Vector3().crossVectors(dir, X).normalize();
      if (up.y < 0) up.negate();
      pwPanel(b, V(x, y, z).addScaledVector(dir, 1.2), dir, up, 2.6, 0.9, fr[i], { back: true });
    }
    this.plaza(plaza, inv);
    return flick;
  }

  /** The plaza (paving with the inlaid emblem, planters, the tilted floodlight mast, the ticket kiosk, the fountain). */
  private plaza(plaza: THREE.Group, inv: THREE.Matrix4) {
    const a = this.atlas;
    plaza.updateMatrixWorld(true);
    const root = plaza.parent!;
    const b = this.part(root, true);
    const pav = d3PaverTile(a, { hex: 0x626058 });
    this.calmTiles.add(pav);
    const stone = stoneTile(a, { hex: 0x8a867c });
    const brick = d3BrickTile(a, { hex: 0x7a5a48 });
    const soil = d3MudTile(a, { hex: D3C.mud, water: D3C.water });
    b.rect(V(-23, 0.081, 25.9), X, NZ, 46, 21, pav);
    pwDecal(b, 0, 0.083, 20.4, 6, 6, 0, d3MosaicModule(a));
    for (const sx of [-21, 21]) b.box(sx, 0.4, 20, 2.2, 0.8, 2.2, { px: brick, nx: brick, pz: brick, nz: brick, py: soil, ny: null });
    // Collect the classic pieces' frames, then strip them (the fountain's lamp stays).
    let mast: THREE.Object3D | null = null;
    let kiosk: THREE.Object3D | null = null;
    const ring: THREE.Matrix4[] = [];
    let water: THREE.Mesh | null = null;
    for (const c of plaza.children) {
      if (!(c as THREE.Mesh).isMesh && c !== plaza.children[plaza.children.length - 1]) {
        if (c.position.x > 0) mast = c;
        else kiosk = c;
      }
    }
    const fountain = plaza.children.find((c) => c.children.length > 4) ?? null;
    if (fountain) {
      for (const c of fountain.children) {
        const m = c as THREE.Mesh;
        if (!m.isMesh) continue;
        if (m.geometry.type === 'BoxGeometry') ring.push(new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld));
        else if (m.geometry.type === 'CylinderGeometry' && (m.geometry as THREE.CylinderGeometry).parameters.radiusTop > 2) water = m;
      }
    }
    if (mast) {
      _m.multiplyMatrices(inv, mast.matrixWorld);
      b.withMatrix(_m, () => {
        pwCylinder(b, V(0, 0, 0), V(0, 10, 0), 0.2, 0.14, 6, d3PoleTile(a, { hex: 0x44484c }));
        b.box(0, 10, 0, 2, 0.8, 0.5, { px: d3PoleTile(a, { hex: 0x2a2c30 }), nx: d3PoleTile(a, { hex: 0x2a2c30 }), py: d3PoleTile(a, { hex: 0x2a2c30 }), ny: d3PoleTile(a, { hex: 0x2a2c30 }), pz: d3FloodheadModule(a, false), nz: d3FloodheadModule(a, false) });
      });
    }
    if (kiosk) {
      _m.multiplyMatrices(inv, kiosk.matrixWorld);
      const planks = planksTile(a, { hex: 0x6e543a, horizontal: true });
      b.withMatrix(_m, () => {
        b.box(0, 1.3, 0, 3, 2.6, 2.4, { px: planks, nx: planks, pz: planks, nz: planks, py: null, ny: null });
        pwPanel(b, V(0, 1.55, 1.215), X, Y, 2.0, 1.25, d3KioskWindowModule(a));
      });
      for (const c of kiosk.children) {
        const m = c as THREE.Mesh;
        if (m.isMesh && m.geometry.type === 'ConeGeometry') b.geometry(m.geometry, new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld), d3ThatchTile(a, { hex: 0x6a5232 }));
      }
    }
    for (const r of ring) b.withMatrix(r, () => b.box(0, 0, 0, 1.9, 0.6, 0.4, stone));
    if (water) {
      water.updateMatrixWorld(true);
      this.anim.geometry(water.geometry, water.matrixWorld, d3WaterTile(a, { hex: 0x264868, deep: 0x16304a, flow: 2 }), { world: true });
    }
    // The fountain's pedestal.
    if (fountain) b.withMatrix(new THREE.Matrix4().multiplyMatrices(inv, fountain.matrixWorld), () => pwCylinder(b, V(0, 0, 12), V(0, 2.2, 12), 0.6, 0.4, 8, stone));
    // Everything classic goes but the fountain's lamp (the kiosk's lit hatch is painted).
    stripMeshes(plaza, (m) => m.geometry.type === 'SphereGeometry' && (m.material as THREE.Material).type === 'MeshBasicMaterial');
  }

  /** Paint a visitor-centre door leaf (`leaf`: the group inside the door's pivot) in its own frame. */
  door(leaf: THREE.Object3D, side: number) {
    stripMeshes(leaf);
    const a = this.atlas;
    const b = this.part(leaf);
    const t = d3LodgeDoorModule(a);
    const wood = planksTile(a, { hex: 0x5e3e26 });
    pwPanel(b, V(0, 2.45, 0.111), X, Y, 2.25, 4.9, t, { flipU: side > 0 });
    pwPanel(b, V(0, 2.45, -0.111), NX, Y, 2.25, 4.9, t, { flipU: side < 0 });
    b.box(0, 2.45, 0, 2.25, 4.9, 0.22, { px: wood, nx: wood, py: wood, ny: wood, pz: null, nz: null });
  }

  // ─── Re-texturing in a group's frame ───────────────────────────────────────

  /** Re-emit `g`'s repaintable meshes (removed from it) into `b` laid in `frame`'s own frame, tiles by `rule`. */
  private paintIn(g: THREE.Object3D, frame: THREE.Object3D, b: PwBatch, rule: TileRule, skip?: (m: THREE.Mesh) => boolean) {
    frame.updateMatrixWorld(true);
    g.updateMatrixWorld(true);
    const prev = b.matrix.clone();
    b.setMatrix(frame.matrixWorld.clone().invert());
    retexture(g, b, rule, { world: () => false, skip });
    b.setMatrix(prev);
  }

  /** A rule by material colour (falls back to the Kit mapping). */
  private ruleBy(map: [number, PwTile][]): TileRule {
    const m = new Map(map);
    const a = this.atlas;
    return (mat, _nx, ny) => {
      const hex = (mat as THREE.MeshLambertMaterial).color.getHex();
      const t = m.get(hex);
      if (t) return t;
      const tex = mat.userData.retroTex as string | undefined;
      if (tex === 'hazard') return hazardTile(a, {});
      return kitTile(a, tex as never, hex, ny);
    };
  }

  // ─── Mud truck ─────────────────────────────────────────────────────────────

  /** The stuck maintenance truck (`P.maintenanceTruck`, placed): painted cab, corrugated bed, crane, wheels; its hazard lamps stay. */
  truck(root: THREE.Object3D, d: number) {
    root.updateMatrixWorld(true);
    stripMeshes(root);
    const a = this.atlas;
    const b = this.chunk(d);
    const yel = d3EnamelTile(a, { hex: 0xb08a28, rivets: true });
    const door = d3TruckDoorModule(a, { hex: 0xb08a28 });
    const corr = corrugatedTile(a, { hex: 0x6a6a62, rust: 0.8, vertical: false });
    const tread = d1TreadTile(a, { hex: CAR.tyre, mud: 0x4a3624 });
    const wheel = d1WheelModule(a, { tyre: CAR.tyre, rim: 0x8a7a40, mud: 0x4a3624 });
    const crane = d3CraneTile(a);
    b.withMatrix(root.matrixWorld, () => {
      // Cab (2.2 × 1.6 × 2.0 at y 1.5, z 1.8): doors on the sides, the front, an enamelled back and roof.
      pwPanel(b, V(1.101, 1.5, 1.8), NZ, Y, 2.0, 1.6, door, { flipU: true });
      pwPanel(b, V(-1.101, 1.5, 1.8), Z, Y, 2.0, 1.6, door);
      pwPanel(b, V(0, 1.5, 2.801), X, Y, 2.2, 1.6, d3TruckFrontModule(a, { hex: 0xb08a28 }));
      b.box(0, 1.5, 1.8, 2.2, 1.6, 2.0, { nz: yel, py: yel, ny: null, px: null, nx: null, pz: null });
      // Bed: corrugated sides, the hazard rim, a plank deck.
      b.box(0, 1.15, -1.3, 2.3, 0.9, 4.0, { px: corr, nx: corr, nz: corr, pz: corr, py: null, ny: null });
      b.box(0, 1.67, -1.3, 2.3, 0.15, 4.0, { px: crane, nx: crane, nz: crane, pz: crane, py: planksTile(a, { hex: 0x5a4a38 }), ny: null });
      for (const sx of [-1, 1]) for (const sz of [-2.4, -0.6, 1.9]) pwCylinder(b, V(sx * 0.82, 0.4, sz), V(sx * 1.22, 0.4, sz), 0.5, 0.5, 10, tread, { capB: wheel });
      // The front bumper, bent: a cut-out card buckled down at one end.
      _m.makeTranslation(0, 0.62, 2.88).multiply(new THREE.Matrix4().makeRotationZ(-0.04));
      b.withMatrix(b.matrix.clone().multiply(_m), () => pwPanel(b, V(0, 0, 0), X, Y, 2.25, 0.3, d3BumperModule(a), { back: true }));
      _m.makeTranslation(0.5, 2.6, -1.2).multiply(new THREE.Matrix4().makeRotationX(-0.35));
      b.withMatrix(b.matrix.clone().multiply(_m), () => b.box(0, 0, 0, 0.3, 0.3, 4.2, crane));
      // Profiled like z3's vehicles (round 5): the cab's box broken by a sun visor over the
      // windscreen, an amber beacon, mirrors out on arms, rubber fender arches over every
      // wheel and mud flaps behind them.
      const black = d3EnamelTile(a, { hex: 0x1c1c1e });
      const amber = d3EnamelTile(a, { hex: 0xe0a020 });
      const steel = d3EnamelTile(a, { hex: 0x8a8a86 });
      const M = b.matrix.clone();
      const at = (m: THREE.Matrix4, fn: () => void) => b.withMatrix(M.clone().multiply(m), fn);
      at(new THREE.Matrix4().makeTranslation(0, 2.33, 2.86).multiply(new THREE.Matrix4().makeRotationX(0.3)), () => b.box(0, 0, 0, 2.24, 0.05, 0.3, black));
      b.box(0.72, 2.4, 2.35, 0.26, 0.2, 0.26, { px: amber, nx: amber, pz: amber, nz: amber, py: amber, ny: null });
      b.box(0.72, 2.29, 2.35, 0.34, 0.04, 0.34, black);
      for (const sx of [-1, 1]) {
        b.box(sx * 1.24, 2.05, 2.62, 0.3, 0.04, 0.04, steel);
        b.box(sx * 1.4, 1.95, 2.62, 0.06, 0.42, 0.24, { pz: black, nz: steel, px: black, nx: black, py: black, ny: black });
        // Fender arches: six rubber segments round each wheel, standing 0.12 m proud of the body.
        for (const wz of [-2.4, -0.6, 1.9]) {
          const side = wz > 1 ? 1.1 : 1.15;
          for (let k = 0; k < 6; k++) {
            const a0 = (k / 6) * Math.PI;
            const a1 = ((k + 1) / 6) * Math.PI;
            const am = (a0 + a1) / 2;
            const r = 0.62;
            const len = 2 * r * Math.sin((a1 - a0) / 2) + 0.02;
            _m.makeTranslation(sx * (side + 0.04), 0.4 + Math.sin(am) * r, wz + Math.cos(am) * r).multiply(new THREE.Matrix4().makeRotationX(-(am - Math.PI / 2)));
            at(_m, () => b.box(0, 0, 0, 0.14, 0.07, len, black));
          }
          // Mud flap behind the wheel (rubber, caked).
          b.box(sx * 1.02, 0.42, wz - 0.66, 0.36, 0.56, 0.03, { pz: black, nz: black, px: black, nx: black, py: null, ny: null });
        }
      }
    });
  }

  // ─── Bridge ────────────────────────────────────────────────────────────────

  private bridgeRule(): TileRule {
    const a = this.atlas;
    const deck = d3DeckTile(a, { hex: 0x74583a });
    const light = d3TimberTile(a, { hex: 0x74583a });
    const dark = d3TimberTile(a, { hex: 0x4e3a26 });
    const mid = d3TimberTile(a, { hex: 0x5a442e });
    return (mat, _nx, ny) => {
      const hex = (mat as THREE.MeshLambertMaterial).color.getHex();
      if (hex === 0x74583a) return ny > 0.7 ? deck : light;
      if (hex === 0x4e3a26) return dark;
      return mid;
    };
  }

  /**
   * Re-emit `g`'s repaintable meshes (removed) in `frame`'s own frame: the deck's planks into `calm`
   * (the calm-level material: no crawl under the moving camera), everything else into `main`.
   */
  private paintBridge(g: THREE.Object3D, frame: THREE.Object3D, main: PwBatch, calm: PwBatch) {
    frame.updateMatrixWorld(true);
    g.updateMatrixWorld(true);
    const rule = this.bridgeRule();
    const deck = d3DeckTile(this.atlas, { hex: 0x74583a });
    this.calmTiles.add(deck);
    const inv = frame.matrixWorld.clone().invert();
    main.setMatrix(inv);
    calm.setMatrix(inv);
    const list: THREE.Mesh[] = [];
    g.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh && !(m as THREE.InstancedMesh).isInstancedMesh && !m.userData.pixelWorld && !m.userData.noMerge && !Array.isArray(m.material) && repaintable(m.material)) list.push(m);
    });
    for (const m of list) {
      const mat = m.material as THREE.Material;
      main.geometry(m.geometry, m.matrixWorld, (nx, ny, nz) => {
        const t = rule(mat, nx, ny, nz);
        return t === deck ? null : t;
      });
      calm.geometry(m.geometry, m.matrixWorld, (nx, ny, nz) => (rule(mat, nx, ny, nz) === deck ? deck : null));
      m.parent?.remove(m);
    }
    main.setMatrix(null);
    calm.setMatrix(null);
  }

  /** A bridge piece (deck segment / trestle tower) painted in its own frame (a loose piece: it falls on the collapse). */
  bridgePiece(g: THREE.Object3D) {
    this.paintBridge(g, g, this.part(g), this.part(g, false, 'calm'));
  }

  /** The intact bridge: every piece copy of `whole` painted into one batch (hidden with it at the collapse). */
  bridgeWhole(whole: THREE.Object3D) {
    const b = this.part(whole, true);
    const calm = this.part(whole, true, 'calm');
    for (const c of [...whole.children]) this.paintBridge(c, whole, b, calm);
  }

  /** Abutments and posts (concrete), the river (animated, flowing along it), foam round the rocks: the classic group `g` (world frame). */
  gorge(g: THREE.Object3D, river: THREE.Object3D, foams: THREE.Object3D[], d: number) {
    const a = this.atlas;
    g.updateMatrixWorld(true);
    const water = d3WaterTile(a, { hex: 0x264868, deep: 0x16304a, flow: 2 });
    this.anim.withMatrix(river.matrixWorld, () => this.anim.rect(V(-120, 0.052, -7), Z, X, 14, 240, water));
    const foam = d3FoamModule(a, { hex: 0x8a9aa8 });
    for (const f of foams) {
      const w = ((f as THREE.Mesh).geometry as THREE.BoxGeometry).parameters?.width ?? 2;
      this.anim.withMatrix(f.matrixWorld, () => this.anim.rect(V(-w * 0.6, 0.03, 0.4), X, NZ, w * 1.2, 0.8, foam, { sub: { x: 0, y: 0, w: foam.w, h: foam.h / D3_ANIM_FRAMES } }));
      f.parent?.remove(f);
    }
    river.parent?.remove(river);
    // The river rocks: boulder billboards standing in the water.
    for (const c of [...g.children]) {
      const m = c as THREE.Mesh;
      if (m.isMesh && (m.material as THREE.Material).userData.retroTex === 'rock') {
        this.stoneOf(m);
        g.remove(m);
      }
    }
    const conc = d3ConcreteTile(a, { hex: 0x6c6a64 });
    this.paintIn(g, g.parent ?? g, this.chunk(d), this.ruleBy([[0x6c6a64, conc]]), (m) => (m.material as THREE.Material).userData.retroTex === 'rock');
  }

  // ─── Helipad, helicopter, fuel tank ────────────────────────────────────────

  /** The helipad (`P.helipad`, placed; before its bake): painted slab and markings, the hut, the floodlight mast. Edge lights / windsock stay. */
  helipad(pad: HelipadParts, half: number) {
    const a = this.atlas;
    const root = pad.root;
    root.updateMatrixWorld(true);
    const b = this.part(root, true);
    const padT = d3PadTile(a, { hex: 0x6e6e6a });
    const conc = d3ConcreteTile(a, { hex: 0x5e5c56 });
    const yellow = d3PaintStripeTile(a, { hex: 0xd8b028 });
    const white = d3PaintStripeTile(a, { hex: 0xe8e8e0 });
    const haz = hazardTile(a, {});
    const top = 0.281;
    b.box(0, 0.13, 0, half * 2, 0.3, half * 2, { py: padT, px: conc, nx: conc, pz: conc, nz: conc, ny: null });
    // The ring (a painted ribbon round the circle), the H, the hazard border, lettering.
    const ring: THREE.Vector3[] = [];
    const R = half * 0.62;
    for (let i = 0; i <= 64; i++) ring.push(V(Math.cos((i / 64) * Math.PI * 2) * R, 0, Math.sin((i / 64) * Math.PI * 2) * R));
    b.ribbon(ring, 0.5, yellow, { y: top + 0.004 });
    for (const sx of [-2.4, 2.4]) b.rect(V(sx - 0.55, top + 0.006, 3.5), X, NZ, 1.1, 7, white);
    b.rect(V(-1.9, top + 0.007, 0.5), Z, X, 1.0, 3.8, white);
    for (const s of [-1, 1]) {
      b.rect(V(-half, top + 0.005, s * (half - 0.25) + 0.25), X, NZ, half * 2, 0.5, haz);
      b.rect(V(s * (half - 0.25) - 0.25, top + 0.005, half), X, NZ, 0.5, half * 2, haz);
    }
    const letters = d3PadLettersModule(a, 'PARK RESCUE', 3);
    pwDecal(b, 0, top + 0.006, half * 0.81, letters.w / 32, letters.h / 32, 0, letters);
    // Hut: corrugated walls, the lit radio-room window, a steel door, a dark roof.
    const hut = root.children.find((c) => !(c as THREE.Mesh).isMesh && c.position.x < -half);
    const mast = root.children.find((c) => !(c as THREE.Mesh).isMesh && c.position.x > half && c.position.z > 0);
    const corr = corrugatedTile(a, { hex: 0x6a6a62, rust: 0.8, vertical: false });
    const dark = d3EnamelTile(a, { hex: 0x3a3c3e });
    if (hut) {
      _m.compose(hut.position, hut.quaternion, hut.scale);
      b.withMatrix(_m, () => {
        b.box(0, 1.5, 0, 4, 3, 3.2, { px: corr, nx: corr, pz: corr, nz: corr, py: null, ny: null });
        b.box(0, 3.05, 0, 4.4, 0.2, 3.6, dark);
        pwPanel(b, V(0.6, 1.8, 1.611), X, Y, 2.0, 1.5, d3HutWindowModule(a));
        b.box(-1.1, 1.0, 1.62, 0.9, 2, 0.08, dark);
      });
      stripMeshes(hut, () => false);
    }
    if (mast) {
      _m.compose(mast.position, mast.quaternion, mast.scale);
      b.withMatrix(_m, () => {
        pwCylinder(b, V(0, 0, 0), V(0, 9, 0), 0.2, 0.14, 6, d3PoleTile(a, { hex: 0x4a4e52 }));
        b.box(0, 9.1, 0, 1.8, 0.7, 0.4, { nz: d3FloodheadModule(a, true), pz: d3FloodheadModule(a, false), px: dark, nx: dark, py: dark, ny: dark });
      });
      stripMeshes(mast, () => false);
    }
    // The windsock: a painted pole, the sock a striped card swinging with the wind.
    const ws = root.children.find((c) => !(c as THREE.Mesh).isMesh && c.position.x > half && c.position.z < 0);
    if (ws) {
      _m.compose(ws.position, ws.quaternion, ws.scale);
      b.withMatrix(_m, () => pwCylinder(b, V(0, 0, 0), V(0, 6, 0), 0.1, 0.08, 6, d3PoleTile(a, { hex: 0x9a9a96 })));
      stripMeshes(ws, () => false);
      const pivot = new THREE.Group();
      pivot.position.set(ws.position.x, 5.8, ws.position.z);
      this.late.push([root, pivot]);
      pwPanel(this.part(pivot), V(1.3, -0.15, 0), X, Y, 2.6, 0.8, d3WindsockModule(a), { back: true });
      this.socks.push(pivot);
    }
    // The pad's own classic slab / paint go; edge lights (separate groups) stay.
    for (const c of [...root.children]) if ((c as THREE.Mesh).isMesh) root.remove(c);
  }

  /** The rescue helicopter (`P.helicopter`, placed; before its bake): livery, nose, boom, fins, skids; rotors in their own frames. */
  helicopter(h: HeliParts) {
    const a = this.atlas;
    const white = d3LiveryTile(a, { hex: 0xccd0d4 });
    const navy = d3LiveryTile(a, { hex: 0x22304e });
    const orange = d3LiveryTile(a, { hex: 0xe06a1a });
    const steel = d3PoleTile(a, { hex: 0x24262a });
    const rule = this.ruleBy([[0xccd0d4, white], [0x22304e, navy], [0xe06a1a, orange], [0x24262a, steel]]);
    // The open door's dark box and its little light: the side module paints them.
    for (const c of [...h.body.children]) {
      const m = c as THREE.Mesh;
      if (!m.isMesh) continue;
      const hex = (m.material as THREE.MeshLambertMaterial).color?.getHex?.();
      const isDoor = m.geometry.type === 'BoxGeometry' && Math.abs(m.position.x - 1.16) < 0.02;
      const isLight = Math.abs(m.position.x - 1.1) < 0.02 && (m.material as THREE.Material).type === 'MeshBasicMaterial';
      if (isDoor || isLight || hex === 0x14161c) h.body.remove(m);
    }
    const b = this.part(h.body, true);
    this.paintIn(h.body, h.body, b, rule);
    pwPanel(b, V(1.172, 1.8, 0), NZ, Y, 3.6, 2.0, d3HeliSideModule(a, true), { flipU: true });
    pwPanel(b, V(-1.172, 1.8, 0), Z, Y, 3.6, 2.0, d3HeliSideModule(a, false));
    // The nose in profile on both flanks (over the classic ellipsoid: the bubble canopy's curve).
    const nose = d3HeliNoseModule(a);
    pwPanel(b, V(1.185, 1.85, 1.75), NZ, Y, 3.1, 2.1, nose, { flipU: true });
    pwPanel(b, V(-1.185, 1.85, 1.75), Z, Y, 3.1, 2.1, nose);
    // Exhaust soot down both flanks of the engine housing (1.5 × 0.7 × 2.6 at y 3.1, z −0.6), from its stacks aft.
    const soot = d3SootModule(a);
    pwPanel(b, V(0.752, 3.12, -1.3), NZ, Y, 1.5, 0.75, soot, { flipU: true });
    pwPanel(b, V(-0.752, 3.12, -1.3), Z, Y, 1.5, 0.75, soot);
    this.paintIn(h.rotor, h.rotor, this.part(h.rotor), rule);
    this.paintIn(h.tailRotor, h.tailRotor, this.part(h.tailRotor), rule);
    // The main rotor's blur disc (shown while it spins fast: `update`).
    const disc = new THREE.Group();
    disc.name = 'd3-rotor-disc';
    disc.position.copy(h.rotor.position);
    disc.visible = false;
    // (Attached at `finish`: a bake drops empty groups.)
    if (h.rotor.parent) this.late.push([h.rotor.parent, disc]);
    pwPanel(this.part(disc), V(0, 0.14, 0), X, NZ, 11.4, 11.4, d3RotorDiscModule(a), { back: true });
    this.rotor = { rotor: h.rotor, disc, last: h.rotor.rotation.y };
  }

  /** The finale fuel tank (`tank.root`, after it was added to the world): classic meshes kept as hit boxes but not drawn; painted tank + trailer on top. */
  fuelTank(root: THREE.Object3D, warn: THREE.Object3D) {
    this.hidden ??= new THREE.MeshBasicMaterial({ visible: false });
    root.traverse((c) => {
      const m = c as THREE.Mesh;
      if (m.isMesh && m !== warn && !m.userData.pixelWorld) m.material = this.hidden!;
    });
    const a = this.atlas;
    const b = this.part(root);
    const red = d3EnamelTile(a, { hex: 0x9e2a1e, rivets: true });
    const white = d3EnamelTile(a, { hex: 0xd8d4c8 });
    const dark = d3PoleTile(a, { hex: 0x2e3032 });
    const tread = d1TreadTile(a, { hex: CAR.tyre, mud: 0x4a3624 });
    const wheel = d1WheelModule(a, { tyre: CAR.tyre, rim: 0x6a6e72, mud: 0x4a3624 });
    pwCylinder(b, V(0, 2.05, -2.42), V(0, 2.05, 2.42), 1.16, 1.16, 16, red, { capA: d3CapModule(a, { hex: 0x9e2a1e }), capB: d3CapModule(a, { hex: 0x9e2a1e }) });
    for (const [z0, z1] of [[0.35, 0.85], [-1.6, -1.4]]) pwCylinder(b, V(0, 2.05, z0), V(0, 2.05, z1), 1.18, 1.18, 16, white);
    for (const sx of [-1, 1]) pwPanel(b, V(sx * 1.19, 2.05, -0.5), sx > 0 ? NZ : Z, Y, 1.5, 1.1, d3TankPlateModule(a));
    b.box(0, 0.75, 0, 1.8, 0.25, 5.2, dark);
    b.box(0, 0.6, 3.1, 0.2, 0.2, 1.6, dark);
    b.box(0, 3.2, -0.4, 1.2, 0.2, 0.7, dark);
    for (const sx of [-1, 1]) for (const sz of [-1.6, -0.6]) pwCylinder(b, V(sx * 0.77, 0.42, sz), V(sx * 1.07, 0.42, sz), 0.42, 0.42, 10, tread, { capB: wheel });
  }

  // ─── The boss stretch ──────────────────────────────────────────────────────

  /**
   * Set dressing along the Tyrant chase (the road from the bridge to the helipad, on screen for the
   * whole fight, mostly looking back down the road): the Tyrant's prints cracked into the asphalt and
   * pressed into the verges where it crossed, tyre skids, red road flares burning on the shoulders,
   * torn fronds and branches blown onto the road, a tour car on its side in the left treeline, a lamp
   * post knocked flat, a leaning utility pole trailing its wires, EVACUATE boards. Purely painted:
   * nothing here is an occluder, a collider or a target. `at(d, lat)` = the ground beside the rail,
   * `yaw(d)` = the rail heading.
   */
  bossDressing(at: (d: number, lat: number) => THREE.Vector3, yaw: (d: number) => number) {
    const a = this.atlas;
    // A crossing trail of prints at 3 places (from one treeline to the other, over the road).
    for (const [d0, dir] of [[418, 1], [452, -1], [497, 1]] as [number, number][]) {
      for (let i = 0; i < 7; i++) {
        const t = i / 6;
        const lat = dir * (-11 + t * 22);
        const d = d0 + t * 9 + (i % 2 ? 0.8 : -0.8);
        const p = at(d, lat);
        const h = yaw(d) - dir * (Math.PI / 2 - 0.4);
        this.footprint(p.x, p.y + 0.05, p.z, h, 1.45, Math.abs(lat) < 3.8, d);
      }
    }
    // Skids: a tour car that braked hard, swerving.
    for (const [d, lat, dy] of [[431, -1.2, 0.12], [431, 0.6, 0.1], [476, 1.4, -0.2], [476, -0.4, -0.18]] as [number, number, number][]) {
      const p = at(d, lat);
      this.skid(p.x, 0.036, p.z, yaw(d) + Math.PI + dy, d);
    }
    // Flares burning in the verges (off the lanes the Tyrant and the raptors run): a stick on the
    // ground, its small upright plume (crossed cards), a tight dim pool of light; one dying orange.
    for (const [d, lat, hex] of [[405, 5.3, 0xff4a30], [438, -5.6, 0xff4a30], [471, 6.1, 0xff8a2a], [503, -5.2, 0xff4a30]] as [number, number, number][]) {
      const p = at(d, lat);
      const b = this.chunk(d);
      pwDecal(b, p.x, p.y + 0.03, p.z, 2, 2, yaw(d), d3FlarePoolDecal(a, { hex: hex === 0xff4a30 ? 0xc06a5a : 0xb07a4a }));
      pwDecal(b, p.x, p.y + 0.04, p.z, 0.5, 0.5, yaw(d) + d, d3FlareDecal(a, { hex }));
      const plume = d3FlarePlumeModule(a, { hex });
      const hx = p.x + Math.cos(yaw(d) + d) * 0.16;
      const hz = p.z - Math.sin(yaw(d) + d) * 0.16;
      for (const r of [0, Math.PI / 2]) pwPanel(b, V(hx, p.y + 0.27, hz), V(Math.cos(r), 0, Math.sin(r)), Y, 0.25, 0.5, plume, { back: true });
    }
    // Fronds and branches blown onto the road.
    const fr = d3FrondModule(a, { hex: 0x355f36, rib: 0x6a5a3a }, 1);
    for (const [d, lat, r] of [[407, -2, 0.6], [423, 1.6, 2.2], [441, -0.6, 1.1], [462, 2.4, 2.8], [484, -2.2, 0.3], [506, 0.8, 1.9]] as [number, number, number][]) {
      const p = at(d, lat);
      pwDecal(this.chunk(d), p.x, 0.045, p.z, 2.6, 0.9, yaw(d) + r, fr);
    }
    // A tour car on its side in the left treeline (glass gone).
    {
      const d = 466;
      const p = at(d, -8.6);
      const m = new THREE.Matrix4().makeRotationY(yaw(d) + 0.7).setPosition(p.x, p.y - 0.15, p.z).multiply(new THREE.Matrix4().makeRotationZ(-Math.PI / 2).setPosition(1.0, 0, 0));
      const b = this.chunk(d);
      b.withMatrix(m, () => this.paintTourCar(b, true));
    }
    // A lamp post knocked flat across the right verge, its head in the grass.
    {
      const d = 448;
      const p = at(d, 5.4);
      const pole = d3PoleTile(a, { hex: 0x34403a });
      const b = this.chunk(d);
      const m = new THREE.Matrix4().makeRotationY(yaw(d) - 1.2).setPosition(p.x, p.y + 0.12, p.z).multiply(new THREE.Matrix4().makeRotationZ(-Math.PI / 2 + 0.06));
      b.withMatrix(m, () => {
        pwCylinder(b, V(0, 0, 0), V(0, 5.6, 0), 0.1, 0.07, 6, pole);
        pwCylinder(b, V(0, 5.5, 0.4), V(0, 5.8, 0.4), 0.32, 0.2, 8, pole);
        pwPanel(b, V(0, 5.6, 0.4), X, Y, 0.75, 0.375, d3LampHeadModule(a, false), { back: true });
      });
      pwCylinder(b, at(d, 6.3).setY(p.y), at(d, 6.3).setY(p.y + 0.55), 0.24, 0.2, 8, pole);
    }
    // A utility pole leaning over the left verge, its wires sagging to the ground.
    {
      const d = 492;
      const base = at(d, -6.5);
      const timber = d3UtilityPoleTile(a);
      const b = this.chunk(d);
      const top = base.clone().add(new THREE.Vector3(Math.cos(yaw(d)) * 3.2, 7.4, -Math.sin(yaw(d)) * 3.2));
      pwCylinder(b, base, top, 0.16, 0.13, 8, timber);
      const arm = new THREE.Vector3(-Math.sin(yaw(d)), 0, -Math.cos(yaw(d))).multiplyScalar(0.9);
      pwCylinder(b, top.clone().sub(arm).setY(top.y - 0.3), top.clone().add(arm).setY(top.y - 0.3), 0.06, 0.06, 4, timber);
      const toRoad = new THREE.Vector3(Math.cos(yaw(d)), 0, -Math.sin(yaw(d)));
      for (const k of [-1, 0, 1]) {
        const s0 = top.clone().addScaledVector(arm, k).setY(top.y - 0.35);
        this.cable(s0, at(d + 14 + k * 3, -9 - k).setY(0.1), 1.2 + k * 0.3, toRoad, d);
        this.cable(s0, at(d - 16 + k * 2, -8.5 + k).setY(0.1), 1.0, toRoad, d);
      }
    }
    // The old paddock fence along both treelines, broken in places (cut-out 6 m spans).
    for (const lat of [-9.6, 9.8]) {
      for (let d = 402, i = 0; d < 516; d += 6, i++) {
        const h = hash2(i, lat > 0 ? 1 : 2, 91);
        if (h < 0.18) continue;
        const v = h > 0.78 ? 1 : h > 0.62 ? 2 : 0;
        const p0 = at(d, lat);
        const p1 = at(d + 6, lat);
        const dir = p1.clone().sub(p0).setY(0).normalize();
        pwPanel(this.chunk(d), p0.clone().lerp(p1, 0.5).setY((p0.y + p1.y) / 2 + 1.5), dir, Y, 6, 3, d3TornFenceModule(a, v), { back: true });
      }
    }
    // EVACUATE boards on posts (the escape route to the helipad).
    for (const [d, lat, text, ry] of [[413, -5.9, 'EVACUATE', Math.PI + 0.45], [487, 6.0, 'EVACUATE', Math.PI - 0.45]] as [number, number, string, number][]) {
      const p = at(d, lat);
      const w = text.length * 6 * 0.07 + 0.5;
      const h = 0.07 * 7 + 0.4;
      const m = new THREE.Matrix4().makeRotationY(yaw(d) + ry).setPosition(p.x, p.y, p.z);
      const b = this.chunk(d);
      const wood = d3PoleTile(a, { hex: 0x5e442c });
      const sb = this.signChunk(d);
      sb.withMatrix(m, () => pwPanel(sb, V(0, 1.9, 0.051), X, Y, w, h, d3SignBoardModule(a, text, w, h, 0.07), { backTile: wood }));
      b.withMatrix(m, () => {
        for (const sx of [-w / 2 + 0.2, w / 2 - 0.2]) b.box(sx, 1.05, -0.06, 0.12, 2.1, 0.12, wood);
      });
    }
  }

  // ─── Lamps, signs ──────────────────────────────────────────────────────────

  /** Paint a placed lamp post (`P.lampPost`); the bulb (glow / flickering) stays classic unless the lamp is off. */
  lampPost(root: THREE.Object3D, bulb: THREE.Mesh, kind: 'on' | 'off' | 'flicker', d: number) {
    root.updateMatrixWorld(true);
    stripMeshes(root, (m) => kind !== 'off' && m === bulb);
    const a = this.atlas;
    const pole = d3PoleTile(a, { hex: 0x34403a });
    const b = this.chunk(d);
    b.withMatrix(root.matrixWorld, () => {
      pwCylinder(b, V(0, 0, 0), V(0, 0.6, 0), 0.22, 0.18, 8, pole);
      pwCylinder(b, V(0, 0.6, 0), V(0, 5.8, 0), 0.1, 0.07, 6, pole);
      b.box(0, 5.7, 0.7, 0.1, 0.1, 1.5, pole);
      pwCylinder(b, V(0, 5.47, 1.4), V(0, 5.77, 1.4), 0.32, 0.2, 8, pole);
      const head = d3LampHeadModule(a, kind !== 'off');
      // The hood seen from the road both ways (a card across the arm).
      pwPanel(b, V(0, 5.5, 1.4), X, Y, 0.75, 0.375, head, { back: true });
    });
  }

  /** A wooden direction board (`P.roadSign(text, px)`, placed): the painted board, plank back, posts. */
  roadSign(g: THREE.Object3D, text: string, px: number, d: number) {
    g.updateMatrixWorld(true);
    stripMeshes(g);
    const a = this.atlas;
    const w = text.length * 6 * px + 0.5;
    const h = px * 7 + 0.4;
    const wood = d3PoleTile(a, { hex: 0x5e442c });
    const b = this.chunk(d);
    const sb = this.signChunk(d);
    sb.withMatrix(g.matrixWorld, () => pwPanel(sb, V(0, 2.2, 0.051), X, Y, w, h, d3SignBoardModule(a, text, w, h, px), { backTile: wood }));
    b.withMatrix(g.matrixWorld, () => {
      for (const sx of [-w / 2 + 0.25, w / 2 - 0.25]) b.box(sx, 1.2, -0.08, 0.14, 2.4, 0.14, wood);
    });
  }

  // ─── Backdrop ──────────────────────────────────────────────────────────────

  /**
   * The painted storm panorama (follows the camera itself). Its horizon matches the fog, flash or
   * not: the ranges' colour follows the live fog colour (`fog`: the Storm lerps it toward its flash
   * colour), and the sky band blends from that (below ~7°) to the clouds' flash gain (above ~15°).
   */
  buildBackdrop(anchor: THREE.Vector3, fog: THREE.Fog): THREE.Group {
    const s = this.skyAtlas;
    const moonAz = 300;
    const sky = d3SkyTile(s, { fog: STORM.fog, top: 0x0b0f18, cloud: 0x2c354c, rim: 0x6a78a0, el0: -4, el1: 33, moonAz, moonEl: 26 });
    const far = d3RangeTile(s, { hex: 0x080c12, fog: STORM.fog, haze: 0.62, el0: -2, el1: 9.5, seed: 3, moonAz, yaw: 0, hill: [0.24, 0.52], palm: [12, 22], palms: 0.35, crown: 5, fogRows: 12 });
    const near = d3RangeTile(s, { hex: 0x080c12, fog: STORM.fog, haze: 0.36, el0: -2, el1: 13, seed: 8, moonAz, yaw: 140, hill: [0.14, 0.3], palm: [26, 50], palms: 0.62, crown: 9, fogRows: 16 });
    this.backdrop = new PwBackdrop(s, { tile: sky, el0: -4, el1: 33, radius: 330 }, [
      { tile: far, radius: 300, el0: -2, el1: 9.5, follow: 1 },
      { tile: near, radius: 240, el0: -2, el1: 13, yaw: 140, follow: 0.94 },
    ]);
    this.backdrop.anchor.copy(anchor);
    const g = this.backdrop.build();
    this.fog = fog;
    // Two materials: the sky band (fog-matched low, flashing high) and the ranges (fog-matched).
    const rpd = sky.h / 37;
    const skyMat = d3SkyMaterial(s, (7 + 4) * rpd, (15 + 4) * rpd);
    const rangeMat = pwBackdropMaterial(s);
    rangeMat.name = 'pwBackdrop:d3-ranges';
    g.children.forEach((c, i) => c.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) m.material = i === 0 ? skyMat : rangeMat;
    }));
    this.skyMat = skyMat;
    this.rangeMat = rangeMat;
    return g;
  }

  /** The lightning forks as camera-facing cards in the classic bolts' frame (local XY, ~120 m tall). */
  boltGeometry(i: number): THREE.BufferGeometry {
    const t = this.atlas.get(`d3bolt|${i % 2}`)!;
    const b = new PwBatch(this.atlas);
    b.rect(new THREE.Vector3(-21, -6, 0), new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), 42, 126, t);
    return b.build(this.boltMat)!.geometry;
  }

  /** A painted flame card `w` × `h` m centred on its origin (two-sided, animated, unlit) — `Fire` uses them for its tongues. */
  flameCard(w: number, h: number): THREE.Mesh {
    // Alternate the two painted fires (neighbouring tongues never flicker in step).
    const v = this.flameN++ & 1;
    const key = `${w.toFixed(3)}|${h.toFixed(3)}|${v}`;
    let geo = this.flameGeos.get(key);
    if (!geo) {
      const b = new PwBatch(this.atlas);
      const t = this.fireT[v];
      pwPanel(b, V(0, 0, 0), X, Y, w, h, t, { back: true });
      const m = b.build(this.animMat!)!;
      // (pwPanel maps the whole strip: the material plays one frame of it; rescale v to a frame.)
      geo = m.geometry;
      const uv = geo.getAttribute('pwUv') as THREE.BufferAttribute;
      for (let i = 0; i < uv.count; i++) uv.setY(i, uv.getY(i) / D3_ANIM_FRAMES);
      this.flameGeos.set(key, geo);
    }
    const mesh = new THREE.Mesh(geo, this.animMat!);
    mesh.raycast = () => {};
    mesh.userData.pixelWorld = true;
    mesh.userData.noMerge = true;
    mesh.name = 'pw:d3-flame';
    return mesh;
  }

  // ─── Build + per frame ─────────────────────────────────────────────────────

  /** Paint the atlases and build every mesh: terrain / chunks / water → `root` (chunks fog-culled via `culled`). */
  finish(root: THREE.Object3D, culled: THREE.Mesh[], vegPx: THREE.Object3D) {
    this.atlas.post((data) => d2CalmLevels(data, this.calmTiles));
    this.boltMat = pwBackdropMaterial(this.atlas, { gain: 2.2 });
    this.boltMat.transparent = true;
    this.boltMat.depthWrite = false;
    this.boltMat.toneMapped = false;
    const st = this.stones.build();
    st.name = 'd3-stones';
    vegPx.add(st);
    const ter = this.terrain.build(undefined, { planar: true });
    if (ter) {
      ter.name = 'pw:d3-terrain';
      root.add(ter);
    }
    const signMat = pwMaterial(this.atlas, { bias: -0.25, tag: 'sign' });
    const calmMat = pwMaterial(this.atlas, { bias: 1.5, tag: 'calm' });
    for (const b of this.chunks.values()) {
      const m = b.build();
      if (!m) continue;
      root.add(m);
      culled.push(m);
    }
    for (const b of this.signs.values()) {
      const m = b.build(signMat);
      if (!m) continue;
      m.name = 'pw:d3-signs';
      root.add(m);
      culled.push(m);
    }
    this.animMat = pwMaterial(this.atlas, { anim: { frames: D3_ANIM_FRAMES, fps: 8 } });
    const an = this.anim.build(this.animMat);
    if (an) root.add(an);
    this.puddleMat = pwMaterial(this.atlas, { anim: { frames: D3_ANIM_FRAMES, fps: 8 }, bias: 1, tag: 'puddle' });
    const pu = this.puddles.build(this.puddleMat);
    if (pu) {
      pu.name = 'pw:d3-puddles';
      root.add(pu);
    }
    for (const [p, c] of this.late) p.add(c);
    for (const p of this.parts) {
      const m = p.batch.build(p.mat === 'sign' ? signMat : p.mat === 'calm' ? calmMat : undefined);
      if (!m) continue;
      p.parent.add(m);
      if (p.cull) culled.push(m);
    }
    for (const f of this.followers) {
      f.mesh = f.batch.build();
      if (f.mesh) root.add(f.mesh);
    }
    this.follow();
  }

  /** Painted meshes onto their (moving) classic objects. Allocation-free. */
  follow() {
    for (const f of this.followers) {
      if (!f.mesh) continue;
      f.target.updateWorldMatrix(true, false);
      f.mesh.matrix.copy(f.target.matrixWorld);
      f.mesh.matrixWorldNeedsUpdate = true;
    }
  }

  /** Per frame: the water clock, the panorama following the camera and flashing with the lightning. Allocation-free. */
  update(dt: number, cam: THREE.Vector3, flash: number, gust = 0) {
    this.time += dt;
    if (this.animMat) pwTick(this.animMat, dt);
    if (this.puddleMat) pwTick(this.puddleMat, dt);
    for (const sk of this.socks) {
      const t = this.time;
      sk.rotation.y = -0.45 + Math.sin(t * 0.7) * 0.22 - gust * 0.2;
      sk.rotation.z = -0.35 + Math.max(0, gust) * 0.3 + Math.sin(t * 5.3) * 0.04;
    }
    for (const bn of this.banners) {
      const t = this.time * 1.7 + bn.phase;
      bn.pivot.rotation.x = -0.1 - Math.max(0, gust) * 0.18 + Math.sin(t) * 0.07 + Math.sin(t * 2.3) * 0.03;
      bn.pivot.rotation.z = Math.sin(t * 0.8) * 0.04;
    }
    if (this.rotor && dt > 0) {
      const r = this.rotor;
      const spin = Math.abs(r.rotor.rotation.y - r.last) / dt;
      r.last = r.rotor.rotation.y;
      r.disc.visible = spin > 9;
    }
    this.backdrop?.update(cam);
    if (this.skyMat && this.rangeMat && this.fog) {
      // The live fog colour over the stage's base fog, per channel (linear): the fog-coloured
      // horizon and the ranges brighten exactly as the fogged scenery does in a flash.
      const f = this.fog.color;
      const b = this.fogBase;
      this.rangeMat.color.setRGB(f.r / b.r, f.g / b.g, f.b / b.b);
      const u = this.skyMat.userData.d3 as { uLo: { value: THREE.Color }; uHi: { value: number } };
      u.uLo.value.copy(this.rangeMat.color);
      u.uHi.value = 1 + flash * 1.3;
    }
  }
}
