import * as THREE from 'three';
import { PwAtlas } from '../../pixelworld/atlas';
import { PwBatch } from '../../pixelworld/batch';
import { PwBackdrop } from '../../pixelworld/backdrop';
import { kitTileRule, retexture, type TileRule } from '../../pixelworld/retexture';
import { z3CityTile, z3HillsTile, z3SkyTile } from '../../pixelworld/z3sky';
import { z3ScrubTile } from '../../pixelworld/z3road';
import { z3StrataTile } from '../../pixelworld/z3structures';
import { Z3Road } from './pwRoad';
import { Z3Roadside } from './pwRoadside';
import { Z3Vehicles } from './pwVehicles';
import { Z3Trucks } from './pwTrucks';
import { Z3Structures } from './pwStructures';
import { Z3Buildings } from './pwBuildings';
import { BAY_FRAMES, z3BayWater, z3BridgeHouse, z3ContainerTile, z3ExitSign, z3HullTile, z3SosPhone } from '../../pixelworld/z3bay';
import { z3FootingTile, z3SteelPoleTile } from '../../pixelworld/z3roadside';
import { tintFor } from '../../pixelworld/batch';
import { pwMaterial, pwTick } from '../../pixelworld/material';
import { Z3FxAtlas } from '../../pixelworld/z3fx';
import type { PwCarRecord } from './props';
import type { Ctx } from './scenery';
import { partsOf } from './pwTrucks';
import { box, cylinder } from './pwShapes';
import { Kit } from '../../kit/ModelKit';
import { chainFenceTile } from '../../pixelworld/props';
import { paintedSign } from '../../pixelworld/signs';
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
  private batches = new Map<THREE.Object3D, PwBatch>();
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

  constructor(readonly ctx: Ctx) {
    this.rule = kitTileRule(this.atlas);
    this.strata = z3StrataTile(this.atlas);
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
    };
    this.gateLink = chainFenceTile(this.atlas, { hex: 0x9a9ea4, rust: 0.4 });
    this.gatePlate = paintedSign(this.atlas, 'KEEP OUT', { ground: 0xe0b820, ink: 0x1a1a1a, font: 'bold', cap: 0.14 }).tile;
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
      case 'tseg':
        drop.push(...this.st.tunnelSeg(b, o, tag as unknown as { i: number }));
        return true;
      case 'fan':
        this.st.fan(b, o as THREE.Mesh);
        drop.push(o);
        return true;
      case 'portal':
        drop.push(...this.st.portal(b, o, (tag as unknown as { dir: number }).dir));
        return true;
      case 'bseg':
        drop.push(...this.st.bridgeSeg(b, o));
        return true;
      case 'susp':
      case 'cable':
        this.st.cable(b, o as THREE.Mesh, tag.k === 'susp');
        drop.push(o);
        return true;
      case 'blamp':
        this.st.bridgeLamp(b, o);
        dropUntagged(o, drop, true);
        return true;
      case 'tower':
        drop.push(...this.st.tower(b, o));
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
        this.bld.house(b, o, tag as unknown as Parameters<Z3Buildings['house']>[2]);
        dropUntagged(o, drop, true);
        return true;
      case 'gas':
        drop.push(...this.bld.gas(b, o));
        return true;
      case 'gasSign':
        this.bld.gasSign(b, o);
        dropUntagged(o, drop, true);
        return true;
      case 'warehouse':
        drop.push(...this.bld.warehouse(b, o, tag as unknown as Parameters<Z3Buildings['warehouse']>[2]));
        return true;
      case 'motel':
        drop.push(...this.bld.motel(b, o, tag as unknown as { wins: number[] }));
        return false;
      case 'motelSign':
        this.bld.motelSign(b, o);
        dropUntagged(o, drop, true);
        return true;
      case 'billboard':
        drop.push(...this.bld.billboard(b, o, tag as unknown as { art: string; lit: boolean }));
        return true;
      case 'block':
        this.bld.block(b, o as THREE.Mesh, tag as unknown as Parameters<Z3Buildings['block']>[2]);
        drop.push(o);
        return true;
      case 'blockRoof':
        this.bld.blockRoof(b, o as THREE.Mesh);
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
          b.geometry(p.mesh.geometry, p.rel, hex === 0x7a746c ? this.bay.footing : this.strata, { world: true });
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
      case 'ridge':
        b.geometry((o as THREE.Mesh).geometry, o.matrixWorld, this.strata, { world: true });
        drop.push(o);
        return true;
      case 'hazardBand':
      case 'gatePost':
        this.st.hazard(b, o as THREE.Mesh);
        drop.push(o);
        return true;
      default:
        return false;
    }
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
  buildBackdrop(sunAz: number, sunEl: number, cityAz: number): THREE.Group {
    const s = this.skyAtlas;
    const sky = z3SkyTile(s, { fog: Z3_FOG, el0: -6, el1: 40, sunAz, sunEl, cityAz });
    const hills = z3HillsTile(s, { near: 0x3a2234, far: 0x52304a, fog: Z3_FOG, el0: -2, el1: 8, sunAz, cityAz });
    const span = 130;
    const city = z3CityTile(s, { body: 0x2a1a30, fog: Z3_FOG, span, el0: -2, el1: 22 });
    this.backdrop = new PwBackdrop(s, { tile: sky, el0: -6, el1: 40, radius: 330 }, [
      { tile: hills, radius: 320, el0: -2, el1: 8 },
      { tile: city, radius: 310, el0: -2, el1: 22, span, yaw: cityAz },
    ]);
    return this.backdrop.build();
  }

  /** Paint the atlas and add every batch's mesh to its group. Register nothing after this. */
  finish() {
    this.atlas.build();
    for (const [g, b] of this.batches) {
      const m = b.build(undefined, { gain: 1 });
      if (m) g.add(m);
    }
    for (const { batch, parent } of this.parts) {
      const m = batch.build(undefined, { gain: 1 });
      if (m) parent.add(m);
    }
    if (this.animParent) {
      this.animMat = pwMaterial(this.atlas, { anim: { frames: BAY_FRAMES, fps: 3 } });
      const m = this.anim.build(this.animMat);
      if (m) this.animParent.add(m);
    }
  }
}
