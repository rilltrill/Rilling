import * as THREE from 'three';
import { PwAtlas } from '../../pixelworld/atlas';
import { PwBatch } from '../../pixelworld/batch';
import { PwBackdrop } from '../../pixelworld/backdrop';
import { kitTileRule, retexture, type TileRule } from '../../pixelworld/retexture';
import { z3CityTile, z3HillsTile, z3RidgeTile, z3SkyTile } from '../../pixelworld/z3sky';
import { z3ScrubTile } from '../../pixelworld/z3road';
import { z3KeepOut, z3StrataTile } from '../../pixelworld/z3structures';
import { z3InkLevels } from '../../pixelworld/z3levels';
import { Z3Road } from './pwRoad';
import { Z3Roadside } from './pwRoadside';
import { Z3Vehicles } from './pwVehicles';
import { Z3Trucks } from './pwTrucks';
import { Z3Structures } from './pwStructures';
import { Z3Buildings } from './pwBuildings';
import { BAY_FRAMES, z3BayWater, z3BridgeHouse, z3ContainerTile, z3ExitSign, z3HullTile, z3SosPhone } from '../../pixelworld/z3bay';
import { z3FlareFire, z3FlarePool, z3FlareStick, z3FootingTile, z3SteelPoleTile, z3TunnelLamp } from '../../pixelworld/z3roadside';
import { tintFor } from '../../pixelworld/batch';
import { pwMaterial, pwTick, type PwMaterialOptions } from '../../pixelworld/material';
import { Z3FxAtlas } from '../../pixelworld/z3fx';
import type { PwCarRecord } from './props';
import type { Ctx } from './scenery';
import { partsOf } from './pwTrucks';
import { D } from './layout';
import { box, cylinder } from './pwShapes';
import { craggyLump, type RockTiles } from './pwRock';
import { hash2 } from '../../pixelworld/surfaces';
import { Kit } from '../../kit/ModelKit';
import { chainFenceTile } from '../../pixelworld/props';
import type { PwTile } from '../../pixelworld/atlas';

/**
 * HIGHWAY TO HELL in ART: PIXEL WORLD — every surface of the interstate
 * painted as hand-pixelled art (painters in `pixelworld/z3*.ts`):
 *  - the classic builders only RECORD what painting replaces (`userData.pw` =
 *    { k: kind, …what it shows }; the glyph boxes of block text `pwText`) —
 *    no rng draw moves, so CLASSIC / PIXEL CAST build byte-identically;
 *  - each 50 m chunk (and each landmark group) is converted BEFORE its bake:
 *    tagged things are re-emitted as painted geometry into the chunk's one
 *    PixelWorld mesh (it culls with the chunk) and their classic meshes go;
 *    whatever is left untagged is re-textured by the Kit-texture rule; glows
 *    stay classic and bake as before;
 *  - set pieces that move (the rammed car, the falling car, the tanker and
 *    its halves, the gate panels) get their own painted mesh in their own
 *    frame; destructibles keep their classic meshes as (hidden) hit boxes;
 *  - the sky is a painted panorama (dusk bands, the low sun, stratus, the
 *    burning city's smoke), with the hills and the city skyline as cut-out
 *    layers.
 * Gameplay never sees any of it: occluders, ground and the RNG are the stage's own.
 */

export const Z3_FOG = 0xa65a54;
/**
 * What the big rock (the ridge the tunnel bores through, the bay cliffs) fades to with distance
 * instead of the pink fog: a dusk mauve between the fog and the painted hills, so from the bridge
 * the ridge reads as a darker hill against the burning skyline, not a flat pink blob.
 */
export const Z3_HAZE = 0x6e3e4c;
/** What the far water fades to (the dusk sky's violet laid on the bay). */
export const Z3_WATER_HAZE = 0x6a4060;
/** What the far buildings fade to (a little darker and cooler than the rock's haze). */
export const Z3_BLD_HAZE = 0x5e3646;
/** Azimuth span (deg) of the ridge panel the bridge sees. */
const RIDGE_SPAN = 48;

const _inv = new THREE.Matrix4();

/** Is this mesh a classic glow (unlit: lamps, lit windows, fire) — kept classic unless a painter says otherwise? */
export function isGlow(m: THREE.Object3D): boolean {
  const mat = (m as THREE.Mesh).material as THREE.Material | undefined;
  return !!mat && (mat as THREE.MeshBasicMaterial).isMeshBasicMaterial === true;
}

/** Queue every untagged mesh under `o` for removal (`glows` too when set); tagged children are painted on their own. */
export function dropUntagged(o: THREE.Object3D, drop: THREE.Object3D[], glows = false) {
  const walk = (n: THREE.Object3D) => {
    for (const c of n.children) {
      if (c.userData.pw) continue;
      if ((c as THREE.Mesh).isMesh && (glows || !isGlow(c))) drop.push(c);
      walk(c);
    }
  };
  walk(o);
}

export class Z3PixelWorld {
  readonly atlas = new PwAtlas('z3');
  readonly skyAtlas = new PwAtlas('z3-sky', { levels: 1 });
  readonly rule: TileRule;
  readonly road: Z3Road;
  readonly side: Z3Roadside;
  readonly veh: Z3Vehicles;
  readonly trucks: Z3Trucks;
  readonly st: Z3Structures;
  readonly bld: Z3Buildings;
  backdrop: PwBackdrop | null = null;
  private ridgeLayer: THREE.Object3D | null = null;
  private ridgeMesh: THREE.Mesh | null = null;
  private farBatch: { batch: PwBatch; parent: THREE.Object3D } | null = null;
  private farMesh: THREE.Mesh | null = null;
  private bridgeView = false;
  private batches = new Map<THREE.Object3D, PwBatch>();
  /** Rock batches per group (hazed toward `Z3_HAZE`, not the fog colour). */
  private rockBatches = new Map<THREE.Object3D, PwBatch>();
  /** Building batches per group (hazed toward `Z3_BLD_HAZE`: the far warehouses keep their shapes). */
  private bldBatches = new Map<THREE.Object3D, PwBatch>();
  /** The group being converted (rock goes to its rock batch). */
  private cur: THREE.Object3D | null = null;
  /** Batches laid in a moving group's own frame (built in `finish`). */
  private parts: { batch: PwBatch; parent: THREE.Object3D }[] = [];

  /** Animated surfaces (the bay's water): one batch, one animated material. */
  private anim: PwBatch;
  private animMat: THREE.Material | null = null;
  private animParent: THREE.Object3D | null = null;
  /** Flame strips and smoke puffs (their own small atlas). */
  readonly fx = new Z3FxAtlas();
  private bay;
  private gateLink: PwTile;
  private strata: PwTile;
  private gatePlate: PwTile;
  private rockTiles: RockTiles;
  /** Scrub and dead trees for the rock's ledges (env.ts adds them to the stage's flora field). */
  readonly plants: { key: string; x: number; y: number; z: number; h: number }[] = [];

  constructor(readonly ctx: Ctx) {
    this.rule = kitTileRule(this.atlas);
    this.strata = z3StrataTile(this.atlas);
    this.rockTiles = { face: this.strata, top: z3ScrubTile(this.atlas, { hex: 0x56493a, grass: 0x7a6a40 }) };
    this.anim = new PwBatch(this.atlas);
    const a = this.atlas;
    this.bay = {
      water: z3BayWater(a),
      hull: z3HullTile(a),
      house: z3BridgeHouse(a),
      container: z3ContainerTile(a),
      exit: z3ExitSign(a),
      sos: z3SosPhone(a),
      footing: z3FootingTile(a),
      steel: z3SteelPoleTile(a),
      scrub: z3ScrubTile(a, { hex: 0x56493a, grass: 0x7a6a40 }),
      flare: z3FlareStick(a),
      flareFire: z3FlareFire(a),
      flarePool: z3FlarePool(a),
      tunLamp: z3TunnelLamp(a),
    };
    this.gateLink = chainFenceTile(this.atlas, { hex: 0x9a9ea4, rust: 0.4 });
    this.gatePlate = z3KeepOut(this.atlas);
    this.road = new Z3Road(this.atlas, ctx);
    this.side = new Z3Roadside(this.atlas);
    this.veh = new Z3Vehicles(this.atlas);
    this.trucks = new Z3Trucks(this.atlas);
    this.st = new Z3Structures(this.atlas);
    this.bld = new Z3Buildings(this.atlas);
  }

  /** The (world-frame) batch whose mesh joins `g` (a chunk, a landmark, the root). */
  batchFor(g: THREE.Object3D): PwBatch {
    let b = this.batches.get(g);
    if (!b) this.batches.set(g, (b = new PwBatch(this.atlas)));
    return b;
  }

  /** The rock batch of the group being converted. */
  private rock(): PwBatch {
    const g = this.cur!;
    let b = this.rockBatches.get(g);
    if (!b) this.rockBatches.set(g, (b = new PwBatch(this.atlas)));
    return b;
  }

  /** The far portal's batch (world frame, in the group being converted): the bridge view hides it. */
  private far(): PwBatch {
    if (!this.farBatch) this.farBatch = { batch: new PwBatch(this.atlas), parent: this.cur! };
    return this.farBatch.batch;
  }

  /** The building batch of the group being converted. */
  private bldg(): PwBatch {
    const g = this.cur!;
    let b = this.bldBatches.get(g);
    if (!b) this.bldBatches.set(g, (b = new PwBatch(this.atlas)));
    return b;
  }

  /** A batch laid in `parent`'s own frame (a moving set piece). */
  part(parent: THREE.Object3D): PwBatch {
    const b = new PwBatch(this.atlas);
    this.parts.push({ batch: b, parent });
    return b;
  }

  /**
   * Convert a chunk / landmark group before its bake: painted re-emission of
   * everything tagged, the Kit-texture rule for the rest. Classic meshes that
   * were painted over are removed (glows stay).
   */
  convert(g: THREE.Object3D) {
    g.updateMatrixWorld(true);
    const b = this.batchFor(g);
    this.cur = g;
    const drop: THREE.Object3D[] = [];
    const visit = (o: THREE.Object3D) => {
      const tag = o.userData.pw as { k: string } | undefined;
      if (tag && this.paint(b, o, tag, drop)) return;
      for (const c of o.children) visit(c);
    };
    for (const c of g.children) visit(c);
    for (const o of drop) o.parent?.remove(o);
    g.updateMatrixWorld(true);
    retexture(g, b, this.rule);
  }

  /** Paint one tagged object; true = it (and its subtree) is handled. */
  private paint(b: PwBatch, o: THREE.Object3D, tag: { k: string }, drop: THREE.Object3D[]): boolean {
    switch (tag.k) {
      case 'road': {
        const r = tag as unknown as { d0: number; d1: number };
        this.road.lay(b, r.d0, r.d1);
        drop.push(o);
        return true;
      }
      case 'paint':
        drop.push(o);
        return true;
      case 'spill': {
        // The oil slick's thin slabs → one painted fuel spill.
        o.updateMatrixWorld(true);
        const p = o.getWorldPosition(new THREE.Vector3());
        const f = new THREE.Vector3(0, 0, -1).applyQuaternion(o.getWorldQuaternion(new THREE.Quaternion()));
        this.road.decalAt(b, p, 7.5, 4.6, Math.atan2(-f.x, -f.z), this.road.t.spill, 0.02);
        dropUntagged(o, drop);
        return true;
      }
      case 'jersey':
        this.side.jersey(b, o, tag as unknown as { len: number; color: number });
        dropUntagged(o, drop);
        return true;
      case 'rail':
        this.side.rail(b, o as THREE.Mesh, (tag as unknown as { side: number }).side);
        drop.push(o);
        return true;
      case 'rpost':
        this.side.post(b, o as THREE.Mesh);
        drop.push(o);
        return true;
      case 'lpole':
        this.side.lightPole(b, o, tag as unknown as { two: boolean; lit: boolean });
        dropUntagged(o, drop, true);
        return true;
      case 'upole':
        this.side.utilityPole(b, o, tag as unknown as { lean: number });
        dropUntagged(o, drop);
        return true;
      case 'car': {
        const r = tag as unknown as PwCarRecord;
        this.veh.car(b, o, r, b);
        if (r.burnt) {
          const p = o.getWorldPosition(new THREE.Vector3());
          const q = o.getWorldQuaternion(new THREE.Quaternion());
          const f = new THREE.Vector3(0, 0, 1).applyQuaternion(q);
          if (p.y < 1) this.veh.decal(b, p, 3, 4, Math.atan2(-f.x, -f.z), this.road.t.scorch, p.y + 0.013);
        }
        drop.push(...Z3Vehicles.classicParts(o, r));
        return true;
      }
      case 'semi':
        this.trucks.semi(b, o, tag as unknown as { color: number; burnt: boolean });
        dropUntagged(o, drop);
        return true;
      case 'trailer':
        this.trucks.trailer(b, o, tag as unknown as { color: number; text: string });
        dropUntagged(o, drop);
        return true;
      case 'bus':
        this.trucks.bus(b, o, tag as unknown as { burnt: boolean });
        dropUntagged(o, drop);
        return true;
      case 'armyTruck':
        this.trucks.armyTruck(b, o);
        dropUntagged(o, drop);
        return true;
      case 'armyTank':
        this.trucks.armyTank(b, o);
        dropUntagged(o, drop);
        return true;
      case 'sign':
        this.st.sign(b, o, tag as unknown as { lines: string[]; w: number; h: number; color: number });
        dropUntagged(o, drop);
        return true;
      case 'gantry':
        drop.push(...this.st.gantry(b, o));
        return false;
      case 'overpass':
        drop.push(...this.st.overpass(b, o));
        return false;
      case 'soundwall':
        drop.push(...this.st.soundWall(b, o, (tag as unknown as { i: number }).i));
        return true;
      case 'tag':
        this.st.graffiti(b, o, tag as unknown as { text: string; color: number });
        dropUntagged(o, drop);
        return true;
      case 'tseg': {
        // The last metres of the bore go with the far portal (hidden from the bridge with the ridge).
        const far = (tag as unknown as { d: number }).d > D.TUNNEL_TO - 24;
        drop.push(...this.st.tunnelSeg(far ? this.far() : b, o, tag as unknown as { i: number }));
        return true;
      }
      case 'fan':
        this.st.fan(b, o as THREE.Mesh);
        drop.push(o);
        return true;
      case 'portal': {
        const dir = (tag as unknown as { dir: number }).dir;
        drop.push(...this.st.portal(dir < 0 ? this.far() : b, o, dir));
        return true;
      }
      case 'bseg':
        drop.push(...this.st.bridgeSeg(b, o));
        return true;
      case 'susp':
      case 'cable':
        // (The bridge's steel fades to the dusk mauve, not the pink fog: from the approach the far
        // towers and the cable's sweep hold as a darker silhouette.)
        this.st.cable(this.rock(), o as THREE.Mesh, tag.k === 'susp');
        drop.push(o);
        return true;
      case 'blamp':
        this.st.bridgeLamp(b, o);
        dropUntagged(o, drop, true);
        return true;
      case 'tower':
        drop.push(...this.st.tower(this.rock(), o));
        return true;
      case 'sandbags':
        this.st.sandbags(b, o, tag as unknown as { len: number; rows: number });
        dropUntagged(o, drop);
        return true;
      case 'flood':
        this.st.flood(b, o, tag as unknown as { h: number; w: number });
        dropUntagged(o, drop, true);
        return true;
      case 'house':
        this.bld.house(this.bldg(), o, tag as unknown as Parameters<Z3Buildings['house']>[2]);
        dropUntagged(o, drop, true);
        return true;
      case 'gas':
        drop.push(...this.bld.gas(this.bldg(), o));
        return true;
      case 'gasSign':
        this.bld.gasSign(b, o);
        dropUntagged(o, drop, true);
        return true;
      case 'warehouse':
        drop.push(...this.bld.warehouse(this.bldg(), o, tag as unknown as Parameters<Z3Buildings['warehouse']>[2]));
        return true;
      case 'motel':
        drop.push(...this.bld.motel(this.bldg(), o, tag as unknown as { wins: number[] }));
        return false;
      case 'motelSign':
        this.bld.motelSign(b, o);
        dropUntagged(o, drop, true);
        return true;
      case 'billboard':
        drop.push(...this.bld.billboard(b, o, tag as unknown as { art: string; lit: boolean }));
        return true;
      case 'block':
        this.bld.block(this.bldg(), o as THREE.Mesh, tag as unknown as Parameters<Z3Buildings['block']>[2]);
        drop.push(o);
        return true;
      case 'blockRoof':
        this.bld.blockRoof(this.bldg(), o as THREE.Mesh);
        drop.push(o);
        return true;
      case 'blockWin':
        drop.push(o);
        return true;
      case 'exit': {
        o.updateMatrixWorld(true);
        b.setMatrix(o.matrixWorld);
        b.rect(new THREE.Vector3(-0.06, -0.28, -0.62), new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 1, 0), 1.25, 0.56, this.bay.exit);
        b.setMatrix(null);
        dropUntagged(o, drop, true);
        return true;
      }
      case 'phone': {
        const d = ((o as THREE.Mesh).geometry as THREE.BoxGeometry).parameters;
        b.setMatrix(o.matrixWorld);
        box(b, 0, 0, 0, d.width, d.height, d.depth, { nx: this.bay.sos, px: this.bay.sos, pz: this.bay.sos, nz: this.bay.sos, py: this.bay.sos });
        b.setMatrix(null);
        drop.push(o);
        return true;
      }
      case 'shore':
        for (const p of partsOf(o, true)) {
          const hex = (p.mesh.material as THREE.MeshLambertMaterial).color.getHex();
          if (p.mesh.geometry.type === 'IcosahedronGeometry') {
            // Shore boulders: small stepped crags at the waterline.
            const e = p.rel.elements;
            const seed = Math.floor(hash2(Math.round(e[12] * 3), Math.round(e[14] * 3), 9) * 9973);
            craggyLump(this.rock(), p.rel, this.rockTiles, { ground: -26, seed, segs: 12, crown: 0.5 });
          } else (hex === 0x7a746c ? b : this.rock()).geometry(p.mesh.geometry, p.rel, hex === 0x7a746c ? this.bay.footing : this.strata, { world: true });
          drop.push(p.mesh);
        }
        return true;
      case 'ship':
        for (const p of partsOf(o, true)) {
          const m = p.mesh;
          const d = (m.geometry as THREE.BoxGeometry).parameters;
          const hex = (m.material as THREE.MeshLambertMaterial).color.getHex();
          b.setMatrix(p.rel);
          const t = d.depth > 60 ? this.bay.hull : d.height > 8 ? this.bay.house : this.bay.container;
          const o2 = t === this.bay.container ? { tintRGB: tintFor(t, hex) } : {};
          box(b, 0, 0, 0, d.width, d.height, d.depth, { px: t, nx: t, pz: t, nz: t, py: t }, {}, o2);
          drop.push(m);
        }
        b.setMatrix(null);
        return true;
      case 'checkpoint':
        for (const c of o.children) {
          const m = c as THREE.Mesh;
          if (!m.isMesh || c.userData.pw) continue;
          const d = (m.geometry as THREE.BoxGeometry).parameters;
          b.setMatrix(m.matrixWorld);
          box(b, 0, 0, 0, d.width, d.height, d.depth, { px: this.bay.steel, nx: this.bay.steel, pz: this.bay.steel, nz: this.bay.steel, py: this.bay.steel, ny: this.bay.steel });
          drop.push(m);
        }
        b.setMatrix(null);
        return false;
      case 'ridge': {
        // Stepped desert cliff in the lump's place (the classic lump only says where the rock goes).
        const e = o.matrixWorld.elements;
        const seed = Math.floor(hash2(Math.round(e[12]), Math.round(e[14]), 5) * 9973);
        const ledges = craggyLump(this.rock(), o.matrixWorld, this.rockTiles, { ground: 0, seed });
        this.plant(ledges, seed);
        drop.push(o);
        return true;
      }
      case 'flare': {
        // A painted flare (stick, burning end) and its stepped red pool on the road.
        const g = ((o as THREE.Mesh).geometry as THREE.CylinderGeometry).parameters;
        b.setMatrix(o.matrixWorld);
        cylinder(b, new THREE.Vector3(0, -g.height / 2, 0), new THREE.Vector3(0, g.height / 2, 0), 0.045, 0.045, 6, this.bay.flare, { capB: this.bay.flareFire });
        b.setMatrix(null);
        const p = o.getWorldPosition(new THREE.Vector3());
        b.rect(new THREE.Vector3(p.x - 0.75, 0.016, p.z + 0.75), new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, -1), 1.5, 1.5, this.bay.flarePool);
        drop.push(o);
        return true;
      }
      case 'tlight': {
        // The tunnel's lamp: a sodium tube behind its diffuser (still in the lights group: the
        // stall's flicker hides it with the group).
        const d = ((o as THREE.Mesh).geometry as THREE.BoxGeometry).parameters;
        b.setMatrix(o.matrixWorld);
        box(b, 0, 0, 0, d.width, d.height, d.depth, { ny: this.bay.tunLamp, px: this.bay.tunLamp, nx: this.bay.tunLamp });
        b.setMatrix(null);
        drop.push(o);
        return true;
      }
      case 'hazardBand':
      case 'gatePost':
        this.st.hazard(b, o as THREE.Mesh);
        drop.push(o);
        return true;
      default:
        return false;
    }
  }

  /** Scrub on the rock's lit ledges, now and then a dead tree (pixel billboards of the stage's flora). */
  private plant(ledges: { x: number; y: number; z: number; room: number }[], seed: number) {
    ledges.forEach((l, i) => {
      const r = hash2(seed, i, 61);
      if (r < 0.35) return;
      const tree = r > 0.86 && l.room > 2.2;
      this.plants.push({ key: tree ? 'deadTree' : r > 0.6 ? 'bushWide' : 'bush', x: l.x, y: l.y - 0.15, z: l.z, h: tree ? 3.6 + hash2(seed, i, 67) * 2 : 0.9 + hash2(seed, i, 71) * 0.7 });
    });
  }

  // ─── Moving set pieces (their own painted mesh in their own frame) ────────

  /** A set-piece car (the rammed one, the one that falls off the overpass, its burnt wreck): call before its bake. */
  dynCar(g: THREE.Group) {
    const r = g.userData.pw as PwCarRecord;
    g.updateMatrixWorld(true);
    _inv.copy(g.matrixWorld).invert();
    const b = this.part(g);
    // (Painted in the car's own frame: undo its placement.)
    const save = g.matrixWorld.clone();
    g.matrixWorld.identity();
    for (const c of g.children) c.updateMatrixWorld(true);
    this.veh.car(b, g, r, null);
    g.matrixWorld.copy(save);
    for (const m of Z3Vehicles.classicParts(g, r)) g.remove(m);
  }

  /**
   * The tanker's tank (a destructible: its classic meshes stay as hidden hit boxes). Call before its
   * bake; `hideClassic` after it.
   */
  dynTank(g: THREE.Group) {
    this.trucks.tank(this.part(g), g);
  }

  /** The tank's halves (shown after the blast): burnt shells. */
  dynHalf(g: THREE.Group) {
    const b = this.part(g);
    b.setMatrix(null);
    for (const p of partsOf(g)) {
      const d = (p.mesh.geometry as THREE.CylinderGeometry).parameters;
      b.setMatrix(p.rel);
      cylinder(b, new THREE.Vector3(0, -d.height / 2, 0), new THREE.Vector3(0, d.height / 2, 0), d.radiusBottom, d.radiusTop, Math.max(8, d.radialSegments), this.veh.burnt, { capB: this.veh.burnt });
      b.setMatrix(null);
      g.remove(p.mesh);
    }
  }

  /** A barricade gate panel: steel frame, chain-link (cut out), the warning plate. */
  dynGate(g: THREE.Group) {
    const b = this.part(g);
    const steel = this.trucks.t.steel;
    for (const p of partsOf(g)) {
      const d = (p.mesh.geometry as THREE.BoxGeometry).parameters;
      b.setMatrix(p.rel);
      if (d.depth < 0.035) {
        // The chain-link: one cut-out face each way (the classic grate was a translucent box).
        const t = this.gateLink;
        b.rect(new THREE.Vector3(-d.width / 2, -d.height / 2, 0.005), new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), d.width, d.height, t, { u0: 0, v0: 0 });
        b.rect(new THREE.Vector3(d.width / 2, -d.height / 2, -0.005), new THREE.Vector3(-1, 0, 0), new THREE.Vector3(0, 1, 0), d.width, d.height, t, { u0: 0, v0: 0 });
      } else if (Math.abs(d.width - 1.0) < 0.01) {
        box(b, 0, 0, 0, d.width, d.height, d.depth, { pz: this.gatePlate, nz: this.gatePlate, px: steel, nx: steel, py: steel });
      } else if (Math.abs(d.width - 0.7) < 0.01) {
        // (The plate's stripe is painted into the plate.)
      } else box(b, 0, 0, 0, d.width, d.height, d.depth, { px: steel, nx: steel, pz: steel, nz: steel, py: steel, ny: steel });
      b.setMatrix(null);
      g.remove(p.mesh);
    }
  }

  /** Hide a destructible's classic meshes (they stay its hit boxes): call after its bake. */
  hideClassic(g: THREE.Object3D) {
    g.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh || m.userData.pixelWorld) return;
      const hide = (mat: THREE.Material) => {
        const c = Kit.track(mat.clone());
        c.visible = false;
        return c;
      };
      m.material = Array.isArray(m.material) ? m.material.map(hide) : hide(m.material);
    });
  }

  /** Root-level bay pieces: the water (animated) and the far shore's ground. */
  bayRoot(root: THREE.Object3D) {
    const list: THREE.Mesh[] = [];
    for (const c of root.children) if (c.userData.pw && (c.userData.pw.k === 'water' || c.userData.pw.k === 'farShore')) list.push(c as THREE.Mesh);
    const b = this.batchFor(root);
    for (const m of list) {
      m.updateMatrixWorld(true);
      if (m.userData.pw.k === 'water') {
        const g = (m.geometry as THREE.PlaneGeometry).parameters;
        const p = m.position;
        this.anim.rect(new THREE.Vector3(p.x - g.width / 2, p.y, p.z + g.height / 2), new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, -1), g.width, g.height, this.bay.water, { u0: 0, v0: 0 });
        this.animParent = root;
      } else b.geometry(m.geometry, m.matrixWorld, this.bay.scrub, { world: true });
      root.remove(m);
    }
  }

  /** Per frame: the water's strip plays on. */
  tick(dt: number) {
    if (this.animMat) pwTick(this.animMat, dt);
  }

  /** The scrub either side of the road (classic ground meshes → one painted, world-projected surface). */
  ground(root: THREE.Object3D, meshes: THREE.Mesh[]) {
    const b = this.batchFor(root);
    const tile = z3ScrubTile(this.atlas, { hex: 0x56493a, grass: 0x7a6a40 });
    for (const m of meshes) {
      m.updateMatrixWorld(true);
      b.geometry(m.geometry, m.matrixWorld, tile, { world: true });
      m.parent?.remove(m);
    }
  }

  /** The painted panorama (replaces the dome, glow ring, sun, hills and box skyline). */
  buildBackdrop(sunAz: number, sunEl: number, cityAz: number, ridgeAz: number): THREE.Group {
    const s = this.skyAtlas;
    const sky = z3SkyTile(s, { fog: Z3_FOG, el0: -6, el1: 40, sunAz, sunEl, cityAz });
    const hills = z3HillsTile(s, { near: 0x3a2234, far: 0x52304a, fog: Z3_FOG, el0: -2, el1: 8, sunAz, cityAz });
    const span = 130;
    const city = z3CityTile(s, { body: 0x2a1a30, fog: Z3_FOG, span, el0: -2, el1: 22 });
    const ridge = z3RidgeTile(s, { rock: 0x744450, fog: Z3_FOG, span: RIDGE_SPAN, el0: -4, el1: 12 });
    this.backdrop = new PwBackdrop(s, { tile: sky, el0: -6, el1: 40, radius: 330 }, [
      { tile: hills, radius: 320, el0: -2, el1: 8 },
      { tile: city, radius: 310, el0: -2, el1: 22, span, yaw: cityAz },
      { tile: ridge, radius: 300, el0: -4, el1: 12, span: RIDGE_SPAN, yaw: ridgeAz },
    ]);
    const g = this.backdrop.build();
    this.ridgeLayer = g.children[3] ?? null;
    if (this.ridgeLayer) this.ridgeLayer.visible = false;
    return g;
  }

  /**
   * The far rock from the bridge: the 3D ridge (in the fog there, a mauve heap) gives way to the
   * painted ridge panel once the camera is out on the bridge looking back (call per frame).
   */
  view(onBridge: boolean) {
    if (this.bridgeView === onBridge) return;
    this.bridgeView = onBridge;
    if (this.ridgeMesh) this.ridgeMesh.visible = !onBridge;
    if (this.farMesh) this.farMesh.visible = !onBridge;
    if (this.ridgeLayer) this.ridgeLayer.visible = onBridge;
  }

  /** Paint the atlas and add every batch's mesh to its group. Register nothing after this. */
  finish() {
    this.atlas.build();
    const tiles = [...(this.atlas as unknown as { tiles: Map<string, { tile: PwTile }> }).tiles.values()].map((t) => t.tile);
    // Letters keep their bars down the levels; sign faces stay on level 0 a little longer.
    this.atlas.post((data) => z3InkLevels(data, tiles));
    const signs = new Set<number>();
    for (const t of tiles) if (Z3_SIGN_KEY.test(t.key)) signs.add(t.x * 65536 + t.y);
    const base = pwMaterial(this.atlas, { gain: 1 });
    const sign = pwMaterial(this.atlas, { gain: 1, bias: Z3_SIGN_BIAS, tag: 'sign' });
    for (const [g, b] of this.batches) {
      const m = b.build(base);
      if (m) {
        splitSigns(m, base, sign, signs);
        g.add(m);
      }
    }
    if (this.bldBatches.size) {
      const mat = hazeMaterial(this.atlas, 'z3bld', Z3_BLD_HAZE, 0.72);
      for (const [g, b] of this.bldBatches) {
        const m = b.build(mat);
        if (m) g.add(m);
      }
    }
    if (this.rockBatches.size) {
      const mat = hazeMaterial(this.atlas, 'z3rock', Z3_HAZE, 0.8);
      for (const [g, b] of this.rockBatches) {
        const m = b.build(mat);
        if (!m) continue;
        g.add(m);
        if (g.userData.pw?.k === 'ridgeGroup') this.ridgeMesh = m;
      }
    }
    if (this.farBatch) {
      const m = this.farBatch.batch.build(base);
      if (m) {
        splitSigns(m, base, sign, signs);
        this.farBatch.parent.add(m);
        this.farMesh = m;
      }
    }
    for (const { batch, parent } of this.parts) {
      const m = batch.build(base);
      if (m) {
        splitSigns(m, base, sign, signs);
        parent.add(m);
      }
    }
    if (this.animParent) {
      // The bay keeps its swell and the dusk glints out to the horizon (hazed, never flat fog).
      this.animMat = hazeMaterial(this.atlas, 'z3water', Z3_WATER_HAZE, 0.7, { anim: { frames: BAY_FRAMES, fps: 3 } });
      const m = this.anim.build(this.animMat);
      if (m) this.animParent.add(m);
    }
  }
}

/** Painted letters (highway signs, posters, graffiti, cast letters, plates): their own material. */
const Z3_SIGN_KEY = /^z3(sign|graffiti|cast|bb|flammable|keepout|stencil|unit)(\||$)/;
/**
 * Level bias of the letters. Their levels keep the glyphs (ink levels, glyphs on the level grid),
 * so the right level is the one sampled at under a texel a pixel: a coarser level a step sooner
 * (+0.75: 0.6–1.2 level texels a pixel) never drops a one-texel bar between two pixels.
 */
export const Z3_SIGN_BIAS = 0.25;

/**
 * One painted mesh, up to two draws: its triangles re-ordered into the rest (`base`) and the
 * signs (`sign`, by their tile's atlas rect), as geometry groups.
 */
function splitSigns(m: THREE.Mesh, base: THREE.Material, sign: THREE.Material, signs: Set<number>) {
  const g = m.geometry;
  const idx = g.index!;
  const rect = g.getAttribute('pwRect') as THREE.BufferAttribute;
  const n = idx.count / 3;
  const a: number[] = [];
  const s: number[] = [];
  for (let i = 0; i < n; i++) {
    const v = idx.getX(i * 3);
    const key = rect.getX(v) * 65536 + rect.getY(v);
    const out = signs.has(key) ? s : a;
    out.push(idx.getX(i * 3), idx.getX(i * 3 + 1), idx.getX(i * 3 + 2));
  }
  if (!s.length) return;
  const all = a.concat(s);
  g.setIndex(idx.array instanceof Uint32Array ? new THREE.Uint32BufferAttribute(all, 1) : new THREE.Uint16BufferAttribute(all, 1));
  g.clearGroups();
  if (a.length) g.addGroup(0, a.length, 0);
  g.addGroup(a.length, s.length, 1);
  m.material = [base, sign];
}

/**
 * The PixelWorld material fogged toward `haze` (aerial perspective: the far rock, the far buildings)
 * instead of the fog colour, never more than `cap` of the way: a warehouse 120 m off keeps its doors
 * and lettering as darker shapes, it does not dissolve into a flat salmon block.
 */
function hazeMaterial(atlas: PwAtlas, tag: string, haze: number, cap: number, o: PwMaterialOptions = {}): THREE.MeshLambertMaterial {
  const m = pwMaterial(atlas, { ...o, tag });
  if (m.userData.z3haze) return m;
  m.userData.z3haze = true;
  const base = m.onBeforeCompile;
  const col = { value: new THREE.Color(haze) };
  const capU = { value: cap };
  m.onBeforeCompile = (shader, r) => {
    base.call(m, shader, r);
    shader.uniforms.uZ3Haze = col;
    shader.uniforms.uZ3HazeCap = capU;
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nuniform vec3 uZ3Haze;\nuniform float uZ3HazeCap;').replace(
      '#include <fog_fragment>',
      `#ifdef USE_FOG
  #ifdef FOG_EXP2
    float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
  #else
    float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
  #endif
  gl_FragColor.rgb = mix( gl_FragColor.rgb, uZ3Haze, min( fogFactor, uZ3HazeCap ) );
#endif`,
    );
  };
  const key = m.customProgramCacheKey.bind(m);
  m.customProgramCacheKey = () => `${key()}|z3haze`;
  return m;
}
