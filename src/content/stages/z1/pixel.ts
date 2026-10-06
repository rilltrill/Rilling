import * as THREE from 'three';
import { PwAtlas, type PwTile } from '../../pixelworld/atlas';
import { PwBatch, tintFor } from '../../pixelworld/batch';
import { PwBackdrop } from '../../pixelworld/backdrop';
import { PW_TPM } from '../../pixelworld/canvas';
import {
  acUnitModule, awningTile, corniceTile, doorModule, DOOR_M, drainpipeTile, posterDecal, SHOP_BAY_M, SHOPFRONT_H_M, shopfrontModule, shopLightClass, valanceTile,
  WINDOW_M, windowModule, type ShopGoods, type WindowKind,
} from '../../pixelworld/facade';
import { kitTileRule, neutral, NEUTRAL_BRICK, retexture, type TileRule } from '../../pixelworld/retexture';
import { bladeSign as pwBlade, moviePoster, neonEdge, neonSign } from '../../pixelworld/signs';
import { z1Marquee, z1MarqueeEnd } from '../../pixelworld/z1signs';
import { z1WallPiece } from '../../pixelworld/z1graffiti';
import { paintZ1Panel, paintZ1Plaster, z1BrickHoles, z1PanelTile, z1PlasterTile, z1Streaks, z1WallBands, Z1_WEAR } from '../../pixelworld/z1walls';
import type { PwPainter } from '../../pixelworld/atlas';
import { z1CorrugatedTile } from '../../pixelworld/z1alley';
import { skylineTile } from '../../pixelworld/sky';
import { z1NightSkyTile, z1TownlineTile } from '../../pixelworld/z1sky';
import {
  brickTile, curbTile, hash2, metalTile, paintBrick, roofTile, sidewalkTile, stoneTile,
} from '../../pixelworld/surfaces';
import { texStd } from './bake';
import { z1AsphaltTile, z1PavingTile } from '../../pixelworld/z1ground';
import { Z1Ground } from './pwGround';
import { Z1Cars } from './pwCars';
import { Z1FacadeExtras } from './pwFacade';
import { boxFaces, cylinder, Z1Diner } from './pwDiner';
import { Z1Bus } from './pwBus';
import { Z1Square } from './pwSquare';
import { Z1Street } from './pwStreet';
import { Z1Props } from './pwProps';
import { PW_PARTS, type PwPart } from './setpieces';
import { repaintable } from '../../pixelworld/retexture';
import type { Town } from './town';
import { Kit } from '../../kit/ModelKit';
import { M, type FacadeRecord } from './props';
import type { ZoneId } from './town';
import { pwMaterial, pwTick } from '../../pixelworld/material';
import { z1FlameLevels, z1TongueFlameTile, Z1_FLAME_FRAMES, Z1_FLAME_H, Z1_FLAME_LEVELS, Z1_FLAME_W } from '../../pixelworld/z1fire';
import { pwPuffTexture } from './vfx';
import { z1DarkBay, z1LaundryBay, z1LitBay, z1PoliceBay, type Z1DarkKind, type Z1LitKind } from '../../pixelworld/z1shops';
import { Destructible } from '../../../gameplay/Props';
import type { World } from '../../../gameplay/World';

/**
 * MAIN STREET in ART: PIXEL WORLD — the reference conversion for the stage
 * agents (see docs/ARCHITECTURE.md "PixelWorld").
 *
 *  1. `building()` / `boardSign()` / `bladeSign()` record what a facade shows
 *     (`userData.pwBuilding`, `pwSign`) and tag the meshes painting replaces
 *     (`userData.pwFacade`); no rng draws change, so ART 3D / PIXEL CAST build
 *     byte-identically.
 *  2. Here, per zone and BEFORE the zone bake: every building's facade is laid
 *     as painted pixel art — the wall with a weathered foot band and drip-stained
 *     head band, window / door / shopfront modules, a cornice, awning canvas and
 *     a scalloped valance, posters, graffiti, drainpipes, AC units — and every
 *     sign becomes pixel-font neon. Everything else static (sidewalks, curbs,
 *     roads, lane paint, trims, roofs, cars, street furniture) is re-painted
 *     through `retexture` with the Kit-texture → tile mapping. All of a zone's
 *     PixelWorld geometry is ONE mesh (one draw call) in the zone's group, so it
 *     culls with the zone. Glows, glass and the fire effects stay classic.
 *  3. The sky is a painted panorama (night sky, moon, clouds) with two skyline
 *     layers, replacing the gradient dome / sphere moon.
 * Gameplay never sees any of it: occluders, ROOF_PADS and the destructibles are
 * the stage's own, unchanged.
 */

/** Facade texture per building colour (as z1 props FACADE_TEX). */
const WALL_KIND: Record<number, 'brick' | 'panel' | 'plaster'> = {
  0x7a3a2c: 'brick',
  0x664632: 'brick',
  0x62656e: 'panel',
  0x8a7454: 'plaster',
  0x445670: 'brick',
  0x4e6650: 'plaster',
  0x8c8370: 'plaster',
};
/** Painted-brick buildings (the blue): brick under peeling paint. */
const PAINTED: Record<number, number> = { 0x445670: 0x445670 };

/**
 * Lit-texel gain of the painted scenery: the painted ramps sit their base colour on step 3 with
 * two darker steps under it, so at the classic gain the street read a good deal darker than PIXEL
 * CAST (the brick and plaster sank into the night on a phone); this lifts it back to match.
 */
export const Z1_GAIN = 1.3;

const STONE_LIGHT = 0x86827a;
const STONE_DARK = 0x4a4a52;

const GOODS: Record<string, ShopGoods> = {
  HARDWARE: 'hardware',
  PAWN: 'pawn',
  LOANS: 'pawn',
  LAUNDRY: 'laundry',
  LIQUOR: 'liquor',
  PHARMACY: 'pharmacy',
  BARBER: 'barber',
  CAFE: 'cafe',
  BAR: 'bar',
  GUNS: 'guns',
};

const _m = new THREE.Matrix4();
const _o = new THREE.Vector3();
const X = new THREE.Vector3(1, 0, 0);
const Y = new THREE.Vector3(0, 1, 0);
const Z = new THREE.Vector3(0, 0, 1);
const NZ = new THREE.Vector3(0, 0, -1);

export class Z1PixelWorld {
  readonly atlas = new PwAtlas('z1');
  readonly skyAtlas = new PwAtlas('z1-sky', { levels: 1 });
  private batches = new Map<ZoneId, PwBatch>();
  private rule: TileRule;
  /** Per-material tile rules (the Kit-texture mapping's exceptions). */
  private overrides!: Map<THREE.Material, TileRule>;
  private groundMats: Set<THREE.Material>;
  readonly ground: Z1Ground;
  readonly cars: Z1Cars;
  private extras: Z1FacadeExtras;
  private diner: Z1Diner;
  /** PixelWorld meshes for dynamic objects (built in `finish`): batch, parent, world → parent matrix. */
  private dynBatches: { b: PwBatch; parent: THREE.Object3D; local?: boolean; swap?: boolean; anim?: boolean }[] = [];
  /** The fires' flame strips (a small atlas of their own) and their animated material (ticked by `tick`). */
  readonly fireAtlas = new PwAtlas('z1-fire', { levels: Z1_FLAME_LEVELS });
  private fireMat: THREE.Material | null = null;
  private flames: PwTile[] = [];
  private bus: Z1Bus;
  private square: Z1Square;
  private street: Z1Street;
  private props: Z1Props;
  backdrop: PwBackdrop | null = null;
  /** Running count of the walls given a graffiti piece (no two neighbours share a word). */
  private grafN = 0;
  /** Running count of the shuttered / boarded bays (sprayed with one of four pieces each, neighbours differ). */
  private bayN = 0;

  constructor() {
    const a = this.atlas;
    const sidewalk = M.sidewalk;
    const curb = M.curb;
    const ov = new Map<THREE.Material, TileRule>([
      [sidewalk, (_m, _x, ny) => (ny > 0.7 ? sidewalkTile(a, { hex: 0x56575d }) : curbTile(a, { hex: 0x6e6f75 }))],
      [curb, () => curbTile(a, { hex: 0x7a7b80 })],
      [M.trimLight, () => stoneTile(a, { hex: STONE_LIGHT })],
      [M.trimDark, () => stoneTile(a, { hex: STONE_DARK })],
      [M.roof, (_m, _x, ny) => (ny > 0.7 ? roofTile(a, { hex: 0x2a2b31 }) : stoneTile(a, { hex: STONE_DARK }))],
      [M.metal, () => metalTile(a, { hex: 0x3a3c44, rust: 0.6 })],
      [M.metalLight, () => metalTile(a, { hex: 0x6a6e75 })],
    ]);
    // Road surfaces (texStd wet asphalt): the z1 wet night asphalt (designed features, no speckle).
    for (const m of roadMaterials()) ov.set(m, () => this.asphalt());
    // The alley's cold-storage warehouse: calm corrugated cladding (its identity is painted on by pwStreet).
    ov.set(Kit.tex('corrugated', 0x50535d, 1), () => z1CorrugatedTile(a, 0x50535d));
    // The town square's stone flags.
    ov.set(SQUARE_FLAGS(), () => z1PavingTile(a, { brick: 0x6e4636, granite: 0x6a6862 }));
    this.overrides = ov;
    const roadPaint = new Set<THREE.Material>([M.yellowPaint, M.whitePaint]);
    const kit = kitTileRule(a, { overrides: ov, paint: roadPaint });
    // Every other render / concrete wall in town takes the calm z1 walls the facades use (no generic
    // blotchy plaster / panel tiles of their own: fewer texels to paint, one wall language).
    this.rule = (mat, nx, ny, nz) => {
      if (!ov.has(mat) && !roadPaint.has(mat)) {
        const tex = mat.userData.retroTex as string | undefined;
        if (tex === 'stucco' || tex === 'wallpaper' || tex === 'marble') return z1PlasterTile(a);
        if (tex === 'concrete' && ny <= 0.7) return z1PanelTile(a);
      }
      return kit(mat, nx, ny, nz);
    };
    this.groundMats = new Set<THREE.Material>([sidewalk, curb, SQUARE_FLAGS(), ...roadMaterials()]);
    this.ground = new Z1Ground(a);
    this.cars = new Z1Cars(a);
    this.extras = new Z1FacadeExtras(a);
    this.diner = new Z1Diner(a);
    this.bus = new Z1Bus(a, this.cars.t);
    this.square = new Z1Square(a);
    this.street = new Z1Street(a, this.extras);
    this.props = new Z1Props(a);
    // The courthouse: rusticated ashlar (tower too), fluted columns.
    for (const mat of [Kit.tex('brick', 0x7a7468, 0.45), Kit.tex('brick', 0x6a645a, 0.45)]) this.overrides.set(mat, () => this.square.t.ashlar);
    this.overrides.set(Kit.tex('stucco', 0x8a847a, 1.5), () => this.square.t.column);
  }

  /** The street asphalt (roads and the base ground under the town). */
  asphalt(): PwTile {
    // (A shade lighter than the classic asphalt colour: the wet road has no gloss here to lift it.)
    return z1AsphaltTile(this.atlas, { hex: 0x363943, wear: 0.6 });
  }

  private batch(id: ZoneId): PwBatch {
    let b = this.batches.get(id);
    if (!b) this.batches.set(id, (b = new PwBatch(this.atlas)));
    return b;
  }

  /** Paint a zone's buildings and signs, and re-paint the rest of its static scenery (call before its bake). */
  convertZone(id: ZoneId, zone: THREE.Group) {
    const b = this.batch(id);
    zone.updateMatrixWorld(true);
    const buildings: THREE.Object3D[] = [];
    const signs: THREE.Object3D[] = [];
    zone.traverse((o) => {
      if (o.userData.pwBuilding) buildings.push(o);
      if (o.userData.pwSign) signs.push(o);
    });
    buildings.forEach((g, i) => this.facade(b, g, g.userData.pwBuilding as FacadeRecord, i));
    for (const s of signs) this.sign(b, s);
    // Ground: the tagged classic decals (puddles, manholes, blood, litter, skids) → painted ones, plus the street dressing.
    for (const m of this.ground.replaceTagged(b, zone)) m.parent?.remove(m);
    this.ground.dress(b, id);
    // Cars: painted body / glass / nose / tail / wheel modules.
    for (const m of this.cars.convert(b, zone)) m.parent?.remove(m);
    // The chrome diner and its lit interior.
    for (const m of this.diner.convert(b, zone)) m.parent?.remove(m);
    // The town square: PRIME MEATS, kiosks, courthouse, shop windows, the memorial.
    for (const m of this.square.convert(b, zone)) m.parent?.remove(m);
    // Street hardware and the alley walls: lamps, news boxes, dumpsters, bags, graffiti, fire escapes…
    for (const m of this.street.convert(b, zone)) m.parent?.remove(m);
    // Small furniture as painted silhouettes: benches, sawhorses, crates, the square's lamps, fountain, memorial, pediment.
    for (const m of this.props.convert(b, zone)) m.parent?.remove(m);
    zone.updateMatrixWorld(true);
    retexture(zone, b, this.rule, { world: (m) => this.groundMats.has(m.material as THREE.Material) });
  }

  /**
   * Dynamic objects (they move, flicker or swap): each gets its own small
   * PixelWorld mesh in place of its classic children, built in `finish`.
   * Call after every `convertZone`, before `finish`.
   */
  convertDyn(town: Town) {
    // The diner's buzzing 'r' (the classic overlay is a dark block letter).
    let sign: THREE.Object3D | null = null;
    town.zones.A.traverse((o) => {
      if ((o.userData.pwSign as { text?: string } | undefined)?.text === 'Diner') sign = o;
    });
    // The overturned bus (body and emergency door are separate animated groups).
    const busGroups: THREE.Object3D[] = [];
    town.bus.group.traverse((o) => {
      if (o.userData.pwBus) busGroups.push(o);
    });
    for (const g of busGroups) this.repaintGroup(g, (b, parts) => this.bus.emit(b, parts, this.generic));
    // PRIME MEATS' door panels (they burst open before the boss).
    for (const p of town.doors.panels) this.repaintGroup(p, (b, parts) => this.square.door(b, parts, p.userData.pwMeatDoor as number), false);
    // The gas station: canopy (its under-lights stay), price sign faces, pillars (their own meshes, re-skinned).
    town.gas.canopy.traverse((o) => {
      if (o.userData.pwCanopy) this.repaintGroup(o, (b, parts) => this.street.canopy(b, parts), false);
    });
    for (const d of Object.values(town.dynZones)) {
      for (const o of d.children) if (o.userData.pwPrice !== undefined) this.repaintGroup(o, (b) => this.street.price(b), false);
    }
    for (const p of town.gas.pillars) {
      const m = p.mesh as THREE.Mesh;
      const g = (m.geometry as THREE.BoxGeometry).parameters;
      const b = new PwBatch(this.atlas);
      this.street.pillar(b, g.width, g.height, g.depth);
      this.dynBatches.push({ b, parent: m, swap: true });
    }
    // The pumps and the propane cage (spawned at stage setup): painted over their hit boxes.
    const cageLid = metalTile(this.atlas, { hex: 0x44474e, rust: 0.3 });
    town.gas.pwSkin = (g, kind) => this.skinGasProp(g, kind, cageLid);
    // Fires: painted flames (crossed cut-out cards, an animated strip) where the glow cones were.
    // (Their own small atlas: the tall animated strips would leave a 448-texel shelf half empty in the world atlas.)
    const flames = (this.flames = [z1TongueFlameTile(this.fireAtlas, 0), z1TongueFlameTile(this.fireAtlas, 1)]);
    const sub = { x: 0, y: 0, w: Z1_FLAME_W, h: Z1_FLAME_H };
    const puff = pwPuffTexture();
    town.anim.fires.forEach((f, fi) => {
      const b = new PwBatch(this.fireAtlas);
      f.plume.flameDefs().forEach((d, i) => {
        // A card the flame's height (the cones flicker up to ~1.35 ×), a little narrower than the strip's own aspect.
        const h = d.h * 1.3;
        const w = ((h * Z1_FLAME_W) / Z1_FLAME_H) * 0.8;
        const yaw0 = hash2(fi, i, 31) * Math.PI;
        const tile = flames[(fi + i) % 2];
        for (let k = 0; k < 3; k++) {
          const a = yaw0 + (k * Math.PI) / 3;
          const ux = new THREE.Vector3(Math.cos(a), 0, -Math.sin(a));
          b.rect(new THREE.Vector3(d.x, -0.04, d.z).addScaledVector(ux, -w / 2), ux, Y, w, h, tile, { sub, flipU: (i + k) % 2 === 1 });
        }
      });
      f.plume.pixelArt(puff);
      this.dynBatches.push({ b, parent: f.plume.group, local: true, anim: true });
    });
    for (const d of Object.values(town.dynZones)) {
      for (const o of [...d.children]) {
        if (!o.userData.pwDinerR || !sign) continue;
        const b = this.diner.rOverlay(this.atlas, sign);
        if (!b) continue;
        o.clear();
        this.dynBatches.push({ b, parent: o });
      }
    }
  }

  /** Re-paint one recorded part with the stage's Kit-texture rule (neutral tiles tinted by its material). */
  private generic = (b: PwBatch, p: PwPart) => {
    const mat = p.mesh.material as THREE.MeshLambertMaterial;
    if (Array.isArray(mat) || !repaintable(mat)) return;
    if (!this.rule(mat, 0, 1, 0) && !this.rule(mat, 0, 0, 1)) return;
    const hex = mat.color.getHex();
    b.geometry(p.mesh.geometry, p.rel, (nx, ny, nz) => this.rule(mat, nx, ny, nz), { tintRGB: (t) => (t.neutral !== undefined ? tintFor(t, hex) : null) });
  };

  /** Replace a merged animated group's classic meshes (glows stay) by a PixelWorld mesh painted by `paint`. */
  private repaintGroup(g: THREE.Object3D, paint: (b: PwBatch, parts: PwPart[]) => void, keepGlow = true) {
    const parts = PW_PARTS.get(g);
    if (!parts) return;
    const b = new PwBatch(this.atlas);
    paint(b, parts);
    for (const c of [...g.children]) {
      const m = c as THREE.Mesh;
      if (m.isMesh && (!keepGlow || !(m.material as THREE.MeshBasicMaterial).isMeshBasicMaterial)) g.remove(m);
    }
    this.dynBatches.push({ b, parent: g, local: true });
  }

  /**
   * A gas station destructible in PIXEL WORLD: its painted mesh joins the model
   * (after the hit boxes were registered, so it never takes a hit; it never
   * raycasts either), and the classic meshes stop drawing but stay the hit boxes.
   */
  skinGasProp(g: THREE.Object3D, kind: 'pump' | 'cage' | 'drum', lid: PwTile = this.street.gas.drumLid) {
    const t = this.street.gas;
    const b = new PwBatch(this.atlas);
    if (kind === 'pump') {
      b.setMatrix(_m.makeTranslation(0, 0.875, 0));
      boxFaces(b, 0.85, 1.75, 0.55, { pz: t.pumpFront, nz: t.pumpFront, px: t.pumpHose, nx: t.pumpSide });
      b.setMatrix(_m.makeTranslation(0, 1.84, 0));
      const band = { sub: { x: 0, y: 0, w: t.pumpCap.w, h: 6 } };
      boxFaces(b, 0.9, 0.18, 0.6, { pz: t.pumpCap, nz: t.pumpCap, px: t.pumpCap, nx: t.pumpCap, py: t.pumpCap }, { pz: band, nz: band, px: band, nx: band, py: { sub: { x: 0, y: 6, w: t.pumpCap.w, h: t.pumpCap.h - 6 } } });
    } else if (kind === 'cage') {
      b.setMatrix(_m.makeTranslation(0, 0.85, 0));
      boxFaces(b, 1.6, 1.7, 0.9, { pz: t.cageFront, nz: t.cageFront, px: t.cageSide, nx: t.cageSide, py: lid });
    } else {
      // The drum (the classic barrel: r 0.32, 0.9 m, its rims 0.33): rows 3…31 of the wrap tile, the lid on top.
      b.setMatrix(_m.makeTranslation(0, 0.45, 0));
      cylinder(b, 0.33, 0.9, 10, t.drum, t.drumLid, 3, 32);
    }
    b.setMatrix(null);
    const mesh = b.build(undefined, { gain: Z1_GAIN });
    if (!mesh) return;
    g.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      const hide = (mat: THREE.Material) => {
        const c = Kit.track(mat.clone());
        c.visible = false;
        return c;
      };
      m.material = Array.isArray(m.material) ? m.material.map(hide) : hide(m.material);
    });
    g.add(mesh);
  }

  /** The explosive drums the stage spawns at setup (at `positions`): painted like the gas station's. */
  skinDrums(world: World, positions: readonly THREE.Vector3[]) {
    for (const e of world.entities) {
      if (!(e instanceof Destructible) || e.removed) continue;
      if (positions.some((p) => e.root.position.distanceToSquared(p) < 1e-4)) this.skinGasProp(e.root, 'drum');
    }
  }

  /** Per frame: the fires' flame strips play on. */
  tick(dt: number) {
    if (this.fireMat) pwTick(this.fireMat, dt);
  }

  /** Build the atlases and the zone meshes (adds each zone's PixelWorld mesh to its group). */
  finish(zones: Record<ZoneId, THREE.Group>) {
    this.atlas.build();
    for (const [id, b] of this.batches) {
      const mesh = b.build(undefined, { gain: Z1_GAIN });
      if (mesh) zones[id].add(mesh);
    }
    // Dynamic pieces: world-space geometry under a moving / toggled parent (undo the parent's transform).
    for (const { b, parent, local, swap, anim } of this.dynBatches) {
      if (anim && !this.fireMat) {
        // (Coverage levels: a distant fire keeps its tapered tongues instead of filling in.)
        z1FlameLevels(this.fireAtlas.build(), this.flames);
        this.fireMat = pwMaterial(this.fireAtlas, { anim: { frames: Z1_FLAME_FRAMES, fps: 12 }, side: THREE.DoubleSide });
      }
      const mesh = anim ? b.build(this.fireMat!) : b.build(undefined, { gain: Z1_GAIN });
      if (!mesh) continue;
      if (swap) {
        // Re-skin an animated mesh in place (same object, same transform): the painted geometry and material.
        const target = parent as THREE.Mesh;
        target.geometry = mesh.geometry;
        target.material = mesh.material;
        target.userData.pixelWorld = true;
        // (Still the classic object, same box: it keeps its own raycast footprint like PIXEL CAST's.)
        target.userData.pwSwap = true;
        continue;
      }
      parent.updateMatrixWorld(true);
      // World-space geometry: undo the parent's transform; group-local geometry rides with it as is.
      if (!local) mesh.matrix.copy(parent.matrixWorld).invert();
      mesh.matrixWorldNeedsUpdate = true;
      parent.add(mesh);
    }
  }

  // ─── Facades ──────────────────────────────────────────────────────────────

  /**
   * Facade wall tile: three NEUTRAL wall painters (brick, plaster, concrete panel)
   * tinted per building (vertex colour), plus the peeling painted brick — a
   * handful of tiles (× foot / head variants) for every building of the stage.
   */
  private wallTile(color: number, tex?: string): { base: PwTile; paint: PwPainter } {
    const a = this.atlas;
    const kind = tex === 'brick' ? 'brick' : WALL_KIND[color] ?? 'brick';
    // (Calm z1 render / panels: the wear is composed per building with decals — z1walls.ts.)
    if (kind === 'panel') return { base: z1PanelTile(a), paint: paintZ1Panel };
    if (kind === 'plaster') return { base: z1PlasterTile(a), paint: paintZ1Plaster };
    if (tex !== 'brick' && PAINTED[color] !== undefined) {
      const o = { hex: 0x6a3a2c, painted: PAINTED[color] };
      return { base: brickTile(a, o), paint: (c, k) => paintBrick(c, k, o) };
    }
    const o = { hex: NEUTRAL_BRICK };
    return { base: neutral(brickTile(a, o), NEUTRAL_BRICK), paint: (c, k) => paintBrick(c, k, o) };
  }

  private facade(b: PwBatch, g: THREE.Object3D, rec: FacadeRecord, index: number) {
    const a = this.atlas;
    const { w, h } = rec;
    const color = rec.spec.color;
    const { base, paint } = this.wallTile(color, rec.spec.tex);
    // (Short foot / head bands cut from the wall's own pattern: z1walls.ts.)
    const { foot, head, headV0 } = z1WallBands(a, base, paint);
    // Neutral walls take the building's colour per vertex.
    const tintRGB = base.neutral !== undefined ? tintFor(base, color) : undefined;
    const stone = rec.trimLight ? STONE_LIGHT : STONE_DARK;
    const frameCol = rec.trimLight ? 0xd8d4c8 : 0x3a3a42;
    g.updateMatrixWorld(true);
    b.setMatrix(g.matrixWorld);
    // Wall: foot band (damp, splash-back), body, head band (drips under the cornice).
    const footH = 1.25;
    const headH = 1.0;
    const bodyH = Math.max(0, h - footH - headH);
    b.rect(_o.set(-w / 2, 0, 0), X, Y, w, footH, foot, { u0: 0, v0: 0, tintRGB });
    b.rect(_o.set(-w / 2, footH, 0), X, Y, w, bodyH, base, { u0: 0, v0: footH * PW_TPM, tintRGB });
    // Head band: the base's top rows (the drip rows) — `headV0` lands them as a full-height head variant did.
    b.rect(_o.set(-w / 2, footH + bodyH, 0), X, Y, w, headH, head, { u0: 0, v0: headV0, tintRGB });
    const style = { wall: color, frame: frameCol, stone };
    const wallSet = { base, foot, head, headV0, tintRGB };
    const wallKind = WALL_KIND[color] === 'brick' || rec.spec.tex === 'brick' || PAINTED[color] !== undefined ? 'brick' : 'plaster';
    // Sides and back (seen down the cross streets): banded like the front, windows, ghost signs.
    this.extras.sides(b, rec, index, wallSet, style);
    // String courses between the upper floors, the parapet and its crown, roof clutter.
    this.extras.courses(b, rec, stone);
    this.extras.crown(b, rec, index, wallSet, stone, wallKind);
    if (rec.fireEscapeX !== null) this.extras.fireEscape(b, rec.spec.floors, rec.fireEscapeX);
    // Upper windows.
    rec.windows.forEach((wr, i) => {
      const v = Math.floor(hash2(index, i, 7) * 2);
      let kind: WindowKind = wr.kind;
      if (wr.boarded) kind = 'boarded';
      else if (wr.ghoul) kind = 'ghoul';
      else if (wr.blind) kind = 'blinds';
      else if (kind === 'dark' && hash2(index, i, 9) > 0.86) kind = 'broken';
      const t = windowModule(a, kind, style, v);
      b.rect(_o.set(wr.x - WINDOW_M.w / 2, wr.y - WINDOW_M.openY, 0.015), X, Y, WINDOW_M.w, WINDOW_M.h, t);
      // An AC unit hanging under a few lit windows.
      if (kind !== 'boarded' && hash2(index, i, 11) > 0.84) b.rect(_o.set(wr.x - 0.44 + 0.2, wr.y - WINDOW_M.openY - 0.6, 0.03), X, Y, 28 / PW_TPM, 22 / PW_TPM, acUnitModule(a));
      // Rain streaks running down from under about half the sills.
      else if (hash2(index, i, 13) > 0.5) this.streaks(b, wr.x, wr.y - WINDOW_M.openY, i, tintRGB);
    });
    // Where the render has come away: a patch or two of bare brick, toward the corners, clear of the openings.
    if (wallKind === 'plaster') this.holes(b, rec, index, w, h, 0);
    // Ground floor.
    const shop = rec.shop;
    if (shop && !shop.noWindow) {
      const sw = rec.shopW + 0.3;
      const bays = Math.max(1, Math.round(sw / SHOP_BAY_M));
      const name = shop.board?.text ?? shop.blade?.text ?? '';
      const goods = GOODS[name] ?? 'generic';
      const riser = goods === 'generic' || hash2(index, 1, 3) > 0.5 ? 0x5a2a2a : 0x2a3a4a;
      const frame = frameCol === 0xd8d4c8 ? 0x8a8c90 : 0x34343b;
      // Painted rooms for z1 (z1shops.ts): lit interiors in perspective, dark windows that hold the street.
      const signs: string[] = [];
      g.traverse((o) => {
        const ps = o.userData.pwSign as { text?: string; kind?: string } | undefined;
        if (ps?.text) signs.push(ps.kind === 'marquee' ? 'MARQUEE' : ps.text);
      });
      const lobby = /HOTEL|MOTEL/.test(name) || signs.some((t) => /HOTEL|MOTEL/.test(t));
      const litKind: Z1LitKind | null = !shop.interior ? null : signs.includes('MARQUEE') ? 'cinema' : lobby ? 'lobby' : goods === 'pharmacy' ? 'pharmacy' : goods === 'liquor' ? 'liquor' : goods === 'bar' ? 'bar' : goods === 'pawn' ? 'pawn' : null;
      const darkKind: Z1DarkKind | null = shop.interior ? null : shop.boarded ? 'boarded' : shop.shutter ? 'shutter' : name === 'BANK' ? 'bank' : goods === 'cafe' ? 'cafe' : goods === 'barber' ? 'barber' : hash2(index, 1, 5) > 0.5 ? 'lease' : 'closed';
      // (The GAS & GO store gets its own night-lit convenience store bay.)
      const t = shop.board?.text === 'GAS & GO' ? this.street.gas.store : goods === 'laundry' ? z1LaundryBay(a) : shop.board?.text === 'POLICE' ? z1PoliceBay(a) : litKind ? z1LitBay(a, litKind, frame, riser) : darkKind === 'shutter' || darkKind === 'boarded' ? z1DarkBay(a, darkKind, 0x34343b, 0x5a2a2a, this.bayN++ % 4) : darkKind ? z1DarkBay(a, darkKind, frame, riser) : shopfrontModule(a, {
        widthM: SHOP_BAY_M,
        goods,
        lit: shop.interior,
        riser,
        frame,
        shutter: shop.shutter,
        boarded: shop.boarded,
        // (The variant only changes shutters / boards: plain bays share one tile.)
        variant: shop.shutter || shop.boarded ? index % 2 : 0,
      });
      // The pharmacy's classic shelf silhouettes (flat dark slabs) would stand in front of the painted shelves.
      if (goods === 'pharmacy') {
        for (const ch of [...g.children]) {
          const m = ch as THREE.Mesh;
          const gp = (m.geometry as THREE.BoxGeometry | undefined)?.parameters;
          if (m.isMesh && gp && gp.width === 1.6 && gp.height === 1.4 && gp.depth === 0.05) g.remove(m);
        }
      }
      const x0 = rec.shopX - sw / 2;
      // Bays across the window (u spans whole bays: a mullion every 4 m), stone jambs at both ends.
      if ((darkKind === 'shutter' || darkKind === 'boarded') && bays > 1) {
        // Every bay of a shuttered / boarded front sprayed with its own piece.
        const bw = sw / bays;
        for (let i = 0; i < bays; i++) b.rect(_o.set(x0 + i * bw, 0, 0.02), X, Y, bw, SHOPFRONT_H_M, i === 0 ? t : z1DarkBay(a, darkKind, 0x34343b, 0x5a2a2a, (this.bayN + i) % 4), { u0: 0, v0: 0, uScale: t.w / (bw * PW_TPM) });
        this.bayN += bays;
      } else if (shop.board?.text === 'POLICE' && bays > 1) {
        // The lobby's WANTED board in one bay only (the others its plain variant).
        const bw = sw / bays;
        const plain = z1PoliceBay(a, false);
        for (let i = 0; i < bays; i++) b.rect(_o.set(x0 + i * bw, 0, 0.02), X, Y, bw, SHOPFRONT_H_M, i === 0 ? t : plain, { u0: 0, v0: 0, uScale: t.w / (bw * PW_TPM) });
      } else b.rect(_o.set(x0, 0, 0.02), X, Y, sw, SHOPFRONT_H_M, t, { u0: 0, v0: 0, uScale: (bays * t.w) / (sw * PW_TPM) });
      const jamb = stoneTile(a, { hex: stone });
      for (const jx of [x0 - 0.2, x0 + sw]) b.rect(_o.set(jx, 0, 0.03), X, Y, 0.2, SHOPFRONT_H_M, jamb);
    }
    if (shop) {
      // (Lit doors by the light's class: shops of one colour family share a painted door.)
      const t = doorModule(a, shop.interior ? 'shop' : shop.shutter ? 'metal' : 'wood', { hex: 0x45301f, stone, lit: shop.interior ? shopLightClass(shop.interior) : undefined });
      b.rect(_o.set(rec.doorX - DOOR_M.w / 2, 0, 0.02), X, Y, DOOR_M.w, DOOR_M.h, t);
    } else {
      const t = doorModule(a, 'wood', { hex: hash2(index, 2, 3) > 0.5 ? 0x45301f : 0x2a3a2a, stone, lit: rec.groundLit ? 0xd8914a : undefined });
      b.rect(_o.set(rec.doorX - DOOR_M.w / 2, 0, 0.02), X, Y, DOOR_M.w, DOOR_M.h, t);
      for (const sx of [-1, 1]) {
        const t2 = windowModule(a, rec.groundLit ? 'dim' : hash2(index, sx, 5) > 0.7 ? 'boarded' : 'dark', style, (index + sx + 2) % 2);
        b.rect(_o.set(sx * w * 0.28 - WINDOW_M.w / 2, 1.8 - WINDOW_M.openY, 0.015), X, Y, WINDOW_M.w, WINDOW_M.h, t2);
      }
    }
    // Wall decals: posters / bills at eye level, a tag on the foot, a drainpipe at one end.
    const freeX = (x: number) => (!shop || Math.abs(x - rec.shopX) > rec.shopW / 2 + 0.6) && Math.abs(x - rec.doorX) > 1.0;
    for (let p = 0; p < 3; p++) {
      const px = -w / 2 + 0.9 + hash2(index, p, 21) * (w - 1.8);
      if (!freeX(px) || hash2(index, p, 22) > 0.6) continue;
      b.rect(_o.set(px, 1.1 + hash2(index, p, 23) * 0.5, 0.03), X, Y, 24 / PW_TPM, 32 / PW_TPM, posterDecal(a, (index + p) % 4));
    }
    if (hash2(index, 3, 24) > 0.45) {
      // A piece of spray paint (each wall its own word, style and colours: z1graffiti.ts).
      const t = z1WallPiece(a, this.grafN);
      const gw = t.w / PW_TPM;
      const gh = t.h / PW_TPM;
      const gx = -w / 2 + 0.8 + hash2(index, 3, 25) * Math.max(0, w - 1.6 - gw);
      if (freeX(gx) && freeX(gx + gw)) {
        b.rect(_o.set(gx, 0.12 + hash2(index, 3, 26) * 0.5, 0.03), X, Y, gw, gh, t);
        this.grafN++;
      }
    }
    const pipeX = hash2(index, 4, 26) > 0.5 ? w / 2 - 0.75 : -w / 2 + 0.3;
    b.rect(_o.set(pipeX, 0, 0.04), X, Y, 0.5, h - 0.5, drainpipeTile(a, { hex: 0x4a4c52 }), { u0: 0, v0: 0 });
    // Replace the tagged meshes (cornice / awning / valance get painted faces; the rest go).
    const drop: THREE.Object3D[] = [];
    for (const c of g.children) {
      const tag = c.userData.pwFacade as string | undefined;
      if (c.userData.pwChimney) this.extras.chimneyPots(b, c as THREE.Mesh);
      // A rooftop billboard: paint the board, drop the paper blocks.
      const papers = c.children.filter((k) => k.userData.pwBillboard === 'paper');
      for (const k of c.children) if (k.userData.pwBillboard === 'board') this.extras.billboard(b, k as THREE.Mesh);
      for (const k of papers) c.remove(k);
      if (!tag || tag === 'keep') continue;
      if (tag === 'cornice') this.cornice(b, c as THREE.Mesh, stone);
      else if (tag === 'poster') {
        const p = c.position;
        const t = moviePoster(a, index + Math.round(p.x));
        b.rect(_o.set(p.x - t.wM / 2, p.y - t.hM / 2, p.z + 0.04), X, Y, t.wM, t.hM, t.tile);
      }
      else if (tag === 'awning') b.geometry((c as THREE.Mesh).geometry, _m.copy(c.matrix), awningTile(a, { hex: awningHex(c as THREE.Mesh) }));
      else if (tag === 'valance') {
        const m = c as THREE.Mesh;
        const p = m.position;
        const aw = (m.geometry as THREE.BoxGeometry).parameters.width;
        b.rect(_o.set(p.x - aw / 2, p.y - 0.32, p.z + 0.03), X, Y, aw, 0.5, valanceTile(a, { hex: awningHex(m) }), { u0: 0, v0: 0 });
      }
      drop.push(c);
    }
    for (const c of drop) g.remove(c);
    b.setMatrix(null);
  }

  /** Rain streaks (the wall's own colour, darker) under a sill at (x, y) in the current frame. */
  streaks(b: PwBatch, x: number, y: number, n: number, tintRGB: readonly number[] | undefined) {
    const t = z1Streaks(this.atlas);
    b.rect(_o.set(x - 0.5, y - 1.5 + 0.02, 0.012), X, Y, 1.0, 1.5, t, { sub: { x: (n % 2) * 32, y: 0, w: 32, h: 48 }, tintRGB: tintRGB ?? tintFor(t, 0xd8d8d8) });
  }

  /** One or two patches of bare brick on a rendered wall (width `w`, height `h`), clear of its openings. */
  holes(b: PwBatch, rec: FacadeRecord, index: number, w: number, h: number, salt: number) {
    const t = z1BrickHoles(this.atlas);
    const names = ['holeA', 'holeB', 'holeC'] as const;
    const n = hash2(index, 61 + salt, 3) > 0.55 ? 2 : 1;
    for (let i = 0; i < n; i++) {
      const r = Z1_WEAR[names[Math.floor(hash2(index, 62 + salt + i, 3) * 3)]];
      const pw = r.w / PW_TPM;
      const ph = r.h / PW_TPM;
      const side = (i + Math.floor(hash2(index, 63 + salt, 3) * 2)) % 2 ? 1 : -1;
      const x = side * (w / 2 - 0.4 - pw / 2 - hash2(index, 64 + salt + i, 3) * 0.8);
      const y = hash2(index, 65 + salt + i, 3) > 0.5 ? 1.35 + hash2(index, 66 + salt, 3) * 0.6 : h - 1.6 - ph;
      // Clear of windows / the shop / the door (front only: `rec` holds those).
      const hit = (cx: number, cy: number, hw: number, hh: number) => Math.abs(cx - x) < hw + pw / 2 && Math.abs(cy - (y + ph / 2)) < hh + ph / 2;
      if (salt === 0) {
        if (rec.windows.some((wr) => hit(wr.x, wr.y - WINDOW_M.openY + WINDOW_M.h / 2, WINDOW_M.w / 2, WINDOW_M.h / 2))) continue;
        if (rec.shop && hit(rec.shopX, SHOPFRONT_H_M / 2, rec.shopW / 2 + 0.4, SHOPFRONT_H_M / 2)) continue;
        if (hit(rec.doorX, DOOR_M.h / 2, DOOR_M.w / 2 + 0.3, DOOR_M.h / 2)) continue;
      }
      b.rect(_o.set(x - pw / 2, y, 0.013), X, Y, pw, ph, t, { sub: { x: r.x, y: t.h - r.y - r.h, w: r.w, h: r.h } });
    }
  }

  /** The cornice box: moulded front, stone top and returns. */
  private cornice(b: PwBatch, m: THREE.Mesh, stoneHex: number) {
    const a = this.atlas;
    const p = (m.geometry as THREE.BoxGeometry).parameters;
    const c = m.position;
    const front = corniceTile(a, { hex: stoneHex });
    const stone = stoneTile(a, { hex: stoneHex });
    const x0 = c.x - p.width / 2;
    const y0 = c.y - p.height / 2;
    const z1 = c.z + p.depth / 2;
    const z0 = c.z - p.depth / 2;
    // Front: the moulding stretched over the face height (16 rows ≈ 0.45 m).
    b.rect(_o.set(x0, y0, z1), X, Y, p.width, p.height, front, { u0: 0, v0: 0 });
    b.rect(_o.set(x0, y0 + p.height, z1), X, NZ, p.width, p.depth, stone);
    b.rect(_o.set(x0, y0, z0), X, Z, p.width, p.depth, stone);
    b.rect(_o.set(x0, y0, z0), Z, Y, p.depth, p.height, stone);
    b.rect(_o.set(x0 + p.width, y0, z1), NZ, Y, p.depth, p.height, stone);
  }

  // ─── Signs ────────────────────────────────────────────────────────────────

  private sign(b: PwBatch, s: THREE.Object3D) {
    const a = this.atlas;
    const info = s.userData.pwSign as {
      kind: 'board' | 'blade' | 'marquee';
      text: string;
      color: number;
      size: number;
      back?: number;
      script?: boolean;
      border?: number;
      frame?: boolean;
      w?: number;
      z?: number;
      /** The classic board's size (m): the painted board is at least that big. */
      bw?: number;
      bh?: number;
    };
    if (info.kind === 'marquee') {
      // The marquee's lit board (the metal box around it is re-painted with the rest).
      s.updateMatrixWorld(true);
      b.setMatrix(s.matrixWorld);
      const t = z1Marquee(a, info.text.split('/'), { widthM: info.w ?? 12, heightM: info.size });
      b.rect(_o.set(-t.wM / 2, -t.hM / 2, info.z ?? 0.01), X, Y, t.wM, t.hM, t.tile);
      // The lit end panels (blank glowing boards in the classic look) carry the cinema's name.
      const ends = s.children.filter((c) => isGlow((c as THREE.Mesh).material) && ((c as THREE.Mesh).geometry as THREE.BoxGeometry).parameters?.width < 0.1);
      for (const c of ends) {
        const m = c as THREE.Mesh;
        const p = (m.geometry as THREE.BoxGeometry).parameters;
        // (Painted at the panel's own width: the name is never squeezed.)
        const end = z1MarqueeEnd(a, 'RIALTO', { widthM: p.depth, heightM: info.size });
        const sx = Math.sign(m.position.x);
        const z0 = m.position.z - p.depth / 2;
        const z1 = m.position.z + p.depth / 2;
        if (sx > 0) b.rect(_o.set(m.position.x + 0.035, -end.hM / 2, z1), NZ, Y, p.depth, end.hM, end.tile);
        else b.rect(_o.set(m.position.x - 0.035, -end.hM / 2, z0), Z, Y, p.depth, end.hM, end.tile);
      }
      b.setMatrix(null);
      for (const c of s.children.filter((c) => c.userData.pwFacade === 'signBack' || c.type === 'Group' || ends.includes(c))) s.remove(c);
      return;
    }
    s.updateMatrixWorld(true);
    b.setMatrix(s.matrixWorld);
    const backTile = metalTile(a, { hex: info.back ?? 0x1c1c22, rust: 0.2 });
    if (info.kind === 'board') {
      // Classic letters are `size` tall caps; script lower case runs a little smaller.
      const t = neonSign(a, info.text, info.color, {
        font: info.script ? 'script' : 'bold',
        cap: info.size * (info.script ? 0.9 : 1),
        border: info.frame !== false,
        borderColor: info.border,
        back: info.back,
        minW: Math.round((info.bw ?? 0) * PW_TPM),
        minH: Math.round((info.bh ?? 0) * PW_TPM),
      });
      // Board face at the front of the classic board, a 12 cm deep metal box behind it.
      b.rect(_o.set(-t.wM / 2, -t.hM / 2, 0.01), X, Y, t.wM, t.hM, t.tile);
      b.box(0, 0, -0.06, t.wM, t.hM, 0.12, { px: backTile, nx: backTile, py: backTile, ny: backTile, nz: backTile });
    } else {
      const t = pwBlade(a, info.text, info.color, { cap: info.size, back: info.back });
      const z0 = 0.35;
      const z1 = z0 + t.wM;
      b.rect(_o.set(0.11, -t.hM / 2, z1), NZ, Y, t.wM, t.hM, t.tile);
      b.rect(_o.set(-0.11, -t.hM / 2, z0), Z, Y, t.wM, t.hM, t.tile);
      // The outer edge carries the neon outline (what reads when the blade is seen edge-on).
      b.box(0, 0, (z0 + z1) / 2, 0.22, t.hM, t.wM, { pz: neonEdge(a, info.color, info.back), py: backTile, ny: backTile });
    }
    b.setMatrix(null);
    // Drop the board, block letters, neon tubes; keep brackets / legs (re-painted with the rest).
    const drop = s.children.filter((c) => c.userData.pwFacade === 'signBack' || c.type === 'Group' || isGlow((c as THREE.Mesh).material));
    for (const c of drop) s.remove(c);
  }

  // ─── Sky ──────────────────────────────────────────────────────────────────

  /**
   * The painted night panorama: the z1 sky band (gibbous moon behind a cloud
   * wisp, layered cloud banks, the glow and smoke of fires on the horizon), the
   * far city skyline in the haze and the town's own roofline in front of it
   * (gables, a steeple, the water tower, a grain elevator, tree clumps, poles).
   */
  buildBackdrop(moonDir: THREE.Vector3, fog: number): THREE.Group {
    const s = this.skyAtlas;
    const moonAz = Math.round((Math.atan2(moonDir.x, -moonDir.z) * 180) / Math.PI);
    const moonEl = Math.round((Math.asin(moonDir.y / moonDir.length()) * 180) / Math.PI);
    const el1 = 36;
    const sky = z1NightSkyTile(s, { horizon: fog, top: 0x03050b, moonAz, moonEl, el0: -4, el1, fires: [-58, 38, 150] });
    const far = skylineTile(s, { hex: 0x222a3e, fog, el0: -2, el1: 13, lights: 0.45, tall: 0.85, moonAz, seed: 1 });
    const near = z1TownlineTile(s, { hex: 0x151a28, fog, el0: -2, el1: 9, moonAz, name: 'MILLBROOK' });
    this.backdrop = new PwBackdrop(s, { tile: sky, el0: -4, el1, radius: 330 }, [
      { tile: far, radius: 300, el0: -2, el1: 13, follow: 1 },
      { tile: near, radius: 260, el0: -2, el1: 9, follow: 0.97 },
    ]);
    this.backdrop.anchor.set(-30, 0, -150);
    return this.backdrop.build();
  }
}

function isGlow(m: THREE.Material | THREE.Material[] | undefined): boolean {
  return !!m && !Array.isArray(m) && (m as THREE.MeshBasicMaterial).isMeshBasicMaterial === true;
}

function awningHex(m: THREE.Mesh): number {
  return ((m.material as THREE.MeshLambertMaterial).color?.getHex?.() ?? 0x3a2a24) as number;
}

/** The town square's stone-flag material (Kit.tex is cached: the same instance town.ts uses). */
function SQUARE_FLAGS(): THREE.Material {
  return Kit.tex('tiles', 0x4c4943, 0.5, 0.9);
}

/** The wet asphalt materials town.ts uses (texStd is cached: the same instances). */
function roadMaterials(): THREE.Material[] {
  return [texStd(0x23262e, 0.42, 0.1, 'asphalt', 1, 0.85), texStd(0x272a31, 0.5, 0.05, 'asphalt', 1.3, 0.9)];
}

/**
 * Light pools in PIXEL WORLD: a pixel artist's light pool — five flat steps
 * falling off from a bright core to a faint skirt, the step edges hand-wobbly
 * (painted, not compass-drawn) with a narrow ordered-dither seam, never a dither
 * field. Hand-made mip levels keep distant pools from sparkling. Screened over
 * the surface by `LightPools.build(…, light)`.
 */
export function pwPoolTexture(): THREE.DataTexture {
  const n = 256;
  const data = new Uint8Array(n * n * 4);
  const bayer = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  const edges = [0.24, 0.42, 0.6, 0.8, 1.0];
  const level = [0.86, 0.62, 0.4, 0.22, 0.09, 0];
  const SEAM = 0.06;
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const dx = (x + 0.5) / n - 0.5;
      const dy = (y + 0.5) / n - 0.5;
      // Wobbly rings: the radius pushed in and out a little round the pool (low-frequency, per ring).
      const a = Math.atan2(dy, dx);
      const r0 = Math.sqrt(dx * dx + dy * dy) * 2;
      let k = 0;
      while (k < edges.length) {
        const wob = 1 + Math.sin(a * 3 + k * 1.7) * 0.035 + Math.sin(a * 5 + k * 2.9) * 0.025;
        if (r0 <= edges[k] * wob) break;
        k++;
      }
      if (k < edges.length) {
        const wob = 1 + Math.sin(a * 3 + k * 1.7) * 0.035 + Math.sin(a * 5 + k * 2.9) * 0.025;
        const d = edges[k] * wob - r0;
        if (d < SEAM && (d / SEAM) * 16 < bayer[(y & 3) * 4 + (x & 3)] + 0.5) k++;
      }
      const i = (y * n + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = 255;
      // Screened over the surface (see LightPools.build): ~2/3 strength at the core.
      data[i + 3] = Math.round(level[k] * 165);
    }
  }
  const t = new THREE.DataTexture(data, n, n, THREE.RGBAFormat);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestMipmapLinearFilter;
  t.generateMipmaps = true;
  t.needsUpdate = true;
  return Kit.track(t);
}
