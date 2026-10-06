import * as THREE from 'three';
import type { TexName } from '../../kit/Textures';
import { PwAtlas, type PwTile } from '../../pixelworld/atlas';
import { PwBatch, planarUv } from '../../pixelworld/batch';
import { NEUTRAL_BRICK, NEUTRAL_HEX } from '../../pixelworld/retexture';
import { brickTile, curbTile, grateTile, hazardTile, roadPaintTile } from '../../pixelworld/surfaces';
import { chainFenceTile } from '../../pixelworld/props';
import {
  z2BlockTile, z2BloodTile, z2CeilingTile, z2ConcreteTile, z2CurtainTile, z2EnamelTile, z2FleshTile, z2FloorTileTile, z2GlazedTile, z2LinenTile, z2MarbleTile, z2PaintTile,
  z2PlainTile, z2RailTile, z2SheetVinylTile, z2SkirtingTile, z2SteelTile, z2StonePanelTile, z2TerrazzoTile, z2TreadTile, z2VeneerTile, z2VinylTile, z2WallpaperTile,
} from '../../pixelworld/z2surfaces';
import { B } from './layout';
import { PW_TPM } from '../../pixelworld/canvas';
import { pwMaterial, pwTick } from '../../pixelworld/material';
import { d2CalmLevels } from '../../pixelworld/d2levels';
import { CYL_SIZE, z2CopingTile, z2CylTile, z2FireDoorLeaf, z2FleshDrape, z2PedestalFace, z2PlankModule, z2RubbleTile, z2VineModule, z2DangleCard, z2VentModule, type CylKind } from '../../pixelworld/z2objects';
import { drainpipeTile } from '../../pixelworld/facade';
import { Z2_PUDDLE_FRAMES, z2InstrumentsDecal, z2LightPool, z2PoolMesh, z2SterileField, z2ManholeDecal, z2OilDecal, z2PatchDecal, z2PoolTexture, z2PuddleTile, z2ReflectDecal, z2RoadStencil, z2SkidTile, z2WetAsphaltTile, type PuddleLight } from '../../pixelworld/z2bay';
import { hash2 } from '../../pixelworld/surfaces';
import {
  bloodPoolDecal, bloodWipeDecal, brokenTilesDecal, bloodWordsDecal, ceilingHoleDecal, ceilingStainDecal, dragTrailTile, drainDecal, floorCrackDecal, floorStainDecal, handprintDecal,
  papersDecal, pictureGhostDecal, pillsDecal, puddleDecal, spatterDecal, trayDecal, wallCrackDecal, waterStainDecal, ceilingGrimeDecal, mopSplashDecal,
} from '../../pixelworld/z2decals';
import {
  bedBoard, bedHeadUnit, clockFace, drawerFace, shelfFront, emergencyLampFace, extinguisherMod, fixture, hospitalWindow, monitorFace, nightWindow, redCross, troffer, tvBroadcast, vendingFront,
  whiteboardFace, xrayFace, copingTile, doorLeaf, roofUnit, type FixtureKind, type HospWindowKind, type RoofKind,
} from '../../pixelworld/z2modules';
import { Z2Billboards } from '../../pixelworld/z2billboard';
import { bannerModule, bigClock, cafeFront, sconceModule, columnTile, directoryBoard, doorwayModule, elevatorBank, fasciaTile, dripTile, glassRailTile, membraneTile, officeWindow, pustuleDecal, skylightTile, veinTile } from '../../pixelworld/z2atrium';
import { d1ShaftMaterial } from '../../pixelworld/d1Shafts';
import { ambulanceCabSide, ambulanceDoor, ambulanceFront, ambulanceSide, carCabin, carEnd, carSide } from '../../pixelworld/z2vehicles';
import type { Ambulance } from './props';
import { PwBackdrop } from '../../pixelworld/backdrop';
import { z2CityTile, z2RoofsTile, z2SkyDome, z2StormSkyTile } from '../../pixelworld/z2sky';
import { bedsideSprite, binSprite, bodyBagSprite, coneSprite, drumSprite, filingSprite, corpseSprite, crashCartSprite, ivSprite, laundrySprite, potSprite, trolleySprite, wheelchairSprite } from '../../pixelworld/z2props';
import { anesthesiaFront, autopsyTop, chairBack, chairEdge, chairSeat, chairShell, counterFront, deadArmSprite, drapeTop, hemTile, openCavity, sheetTile, toeTag } from '../../pixelworld/z2furniture';
import { z2BigSign, z2ExitSign, z2LitSign, z2PlateSign, z2Poster, z2Stencil, type PosterKind } from '../../pixelworld/z2signs';

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
  /** Animated strips (puddles), one material plays them. */
  anim: PwBatch | null;
  /** Additive light pools laid on the ground: [colour, x, y, z, w, d, strength]. */
  pools: number[][];
  /** Brightness of its painted surfaces (× the stage gain). */
  gain?: number;
  /** Floor height of a zone (troffer light pools land on it); undefined for set pieces. */
  floor?: number;
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
const _mm = new THREE.Matrix4();
const _t4 = new THREE.Matrix4();
const _r4 = new THREE.Matrix4();
const _q = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];

/**
 * A body under a sheet, head to foot (gurney frame: head at z −0.52, feet at
 * z 0.86, the sheet at y 0.97): sections [z, height above the sheet, half
 * width] for the draped mounds (head, then shoulders → chest → hips → knees →
 * toes pushing the sheet up → the end).
 */
const BODY_HEAD = [[-0.66, 0.07, 0.06], [-0.62, 0.15, 0.12], [-0.5, 0.18, 0.14], [-0.4, 0.13, 0.1], [-0.36, 0.06, 0.06]];
const BODY_TORSO = [[-0.38, 0.02, 0.12], [-0.3, 0.15, 0.24], [-0.05, 0.18, 0.24], [0.25, 0.14, 0.22], [0.5, 0.09, 0.18], [0.7, 0.07, 0.15], [0.8, 0.14, 0.15], [0.88, 0.11, 0.12], [0.92, 0.01, 0.1]];


/** ST. MERCY HOSPITAL's PIXEL WORLD converter (one per stage build). */
export class Z2PixelWorld {
  readonly atlas = new PwAtlas('z2');
  readonly skyAtlas = new PwAtlas('z2-sky', { levels: 1 });
  private jobs: Job[] = [];
  private cache = new Map<string, Pick | null>();
  /** Flicker diffusers / vent grates painted after the atlas is built. */
  private dynFlickers: { mesh: THREE.Mesh; warm: boolean }[] = [];
  private dynGrates: THREE.Mesh[] = [];
  /** The animated puddles' material (its clock advances in `tick`). */
  private animMat: THREE.Material | null = null;
  /** Decal counter (staggers coplanar decal offsets). */
  private nDecal = 0;
  /** Billboards of the group being converted. */
  private bills = new Z2Billboards();

  // ─── Zones ────────────────────────────────────────────────────────────────

  /** Re-paint a zone's static scenery (call before `bake(g)`). */
  convertZone(g: THREE.Group) {
    const b = new PwBatch(this.atlas);
    this.bills = new Z2Billboards();
    // (The boss arena is on screen longest and its lights are low: its paint a step brighter.)
    const floor = ZONE_FLOOR[g.name] ?? 0;
    this.job = { parent: g, batch: b, bills: this.bills, anim: null, pools: [], gain: g.name === 'atrium' ? 1.3 : 1, floor: g.name.startsWith('bay') ? undefined : floor };
    this.jobs.push(this.job);
    g.updateMatrixWorld(true);
    const pieces: Piece[] = [];
    this.handleTagged(g, b);
    this.emitAll(g, b, floor, true, pieces);
    this.scatter(b, pieces, g.name, floor);
    if (g.name === 'bay') {
      this.roofline(b, -34, 34, 16, -25.85, 'z');
      this.facadeDetail(b);
      this.bayLights(b);
    }
    if (g.name === 'atrium') this.atriumDressing(b);
    if (g.name === 'bayField') {
      this.roofline(b, -26, 12, 12, -18, 'x');
      this.bayGround(b);
    }
  }

  /** The job being converted (its animated batch on demand). */
  private job: Job | null = null;
  private animOf(): PwBatch {
    const j = this.job!;
    if (!j.anim) j.anim = new PwBatch(this.atlas);
    return j.anim;
  }

  /** An animated puddle (frame 0's rect: the material steps through the strip) flat at (x, y, z). */
  private puddle(x: number, y: number, z: number, light: PuddleLight, v: number, w = 2, d = 1.25) {
    const t = z2PuddleTile(this.atlas, light, v);
    this.animOf().rect(_o.set(x - w / 2, y + 0.004 + (this.nDecal++ % 3) * 0.001, z + d / 2), X, NZ, w, d, t, { sub: { x: 0, y: 0, w: t.w, h: t.h / Z2_PUDDLE_FRAMES } });
  }

  /** Which light a bay puddle mirrors (by where it lies: the canopy's red, the wing's cyan sign, windows, sky). */
  private puddleLight(x: number, z: number, h: number): PuddleLight {
    if (Math.abs(x) < 11 && z < -6 && z > -26) return 'red';
    if (x < -9 && z < 2) return 'cyan';
    return h > 0.5 ? 'warm' : 'sky';
  }

  /**
   * The bay's wet ground by rule: puddles along the canopy's drip line and the
   * kerb, round the drains; the long broken reflections of the EMERGENCY and
   * OUTPATIENTS neon on the wet asphalt.
   */
  private bayGround(b: PwBatch) {
    const a = this.atlas;
    // Drip line under the canopy's front edge, and the kerb's gutter.
    for (const [x, z, w, d] of [[-7.2, -9.4, 2.2, 1.1], [-1.5, -9.2, 1.6, 0.9], [4.4, -9.5, 2.4, 1.2], [8.9, -9.1, 1.4, 0.8], [-12.5, -21.3, 2.4, 1.0], [12.8, -21.2, 1.8, 0.8], [-6.6, -21.3, 1.4, 0.7]] as const) {
      this.puddle(x, 0, z, this.puddleLight(x, z, 0), 0, w, d);
    }
    // Drains (grates in the gutter / the apron), each in its puddle.
    for (const [x, z] of [[-9.5, -21.5], [9.6, -21.5], [-2, 6]] as const) {
      const t = drainDecal(a);
      b.rect(_o.set(x - 0.3, 0.007, z + 0.3), X, NZ, 0.6, 0.6, t);
      this.puddle(x + 0.2, 0, z + 0.2, this.puddleLight(x, z, 0.8), 0, 2.4, 1.4);
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
      _o.set(x, y + (this.nDecal++ % 4) * 0.0008, z).addScaledVector(_u, -w / 2).addScaledVector(_v, -h / 2);
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
   * The Patient Zero atrium, composed and lit: the elevator bank and the
   * directory on the back wall, a café on the right, a stopped clock and lit
   * office windows above, anniversary banners hanging from the top balconies,
   * the pool's red glow on the marble.
   */
  private atriumDressing(b: PwBatch) {
    const a = this.atlas;
    const Bf = B;
    // Back wall (x = 22, facing +x): elevators, the directory, a stopped clock, office windows.
    this.lay(b, _mm.identity(), _o.set(22.17, Bf, -128 + 1.875), NZ, Y, 3.75, 3.25, elevatorBank(a));
    this.lay(b, _mm, _o.set(22.17, Bf + 1.0, -116.5 + 0.625), NZ, Y, 1.25, 1.6, directoryBoard(a));
    this.lay(b, _mm, _o.set(22.16, 4.5 + 1.35, -127 + 0.75), NZ, Y, 1.5, 1.5, bigClock(a));
    for (const [y, z, k] of [[4.5, -115, 0], [4.5, -132, 1], [9, -113.5, 2], [9, -129, 3]] as const) {
      const lit = hash2(k, 5, 23) > 0.35;
      this.lay(b, _mm, _o.set(22.165, y + 1.4, z + 0.7), NZ, Y, 1.4, 0.8, officeWindow(a, lit ? 0xd8c890 : 0x2a3434, k & 1));
    }
    // Sconces along the balcony walls (a rhythm of warm lights on every level; a few dead).
    for (const ly of [0, 4.5, 9]) {
      for (let x = 26; x < 49; x += 6.5) {
        for (const [z, f, dx] of [[-106 - 0.17, -1, 1.3], [-136 + 0.17, 1, 3.3]] as const) {
          const lit = hash2(Math.round(x * 2), Math.round(ly * 2) + f, 29) > 0.3;
          const sx = x + dx;
          if (f < 0) this.lay(b, _mm, _o.set(sx + 0.15, ly + 2.0, z - 0.01), NX, Y, 0.3, 0.44, sconceModule(a, lit));
          else this.lay(b, _mm, _o.set(sx - 0.15, ly + 2.0, z + 0.01), X, Y, 0.3, 0.44, sconceModule(a, lit));
        }
      }
    }
    // Right wall (z = -136, facing +z): the café, its shutter half down.
    this.lay(b, _mm, _o.set(45, Bf, -135.82), X, Y, 5, 3, cafeFront(a));
    // Banners from the top balconies' fascias (both faces).
    let k = 0;
    for (const x of [29.5, 43]) {
      for (const [z, f] of [[-109.62, -1], [-132.38, 1]] as const) {
        const t = bannerModule(a, k++ & 1);
        if (f < 0) {
          this.lay(b, _mm, _o.set(x + 0.5, 5.0, z), NX, Y, 1, 3.5, t);
          this.lay(b, _mm, _o.set(x - 0.5, 5.0, z + 0.02), X, Y, 1, 3.5, t);
        } else {
          this.lay(b, _mm, _o.set(x - 0.5, 5.0, z), X, Y, 1, 3.5, t);
          this.lay(b, _mm, _o.set(x + 0.5, 5.0, z - 0.02), NX, Y, 1, 3.5, t);
        }
      }
    }
    // The pool's red glow on the marble round the fountain.
    this.job!.pools.push([0xff3a1a, 35, Bf + 0.013, -121, 20, 20, 0.42]);
  }

  /**
   * The moonlight shafts under the skylight (additive cylinders): hard-edged
   * rays in stepped strengths instead of pale slabs, and a cold stepped pool
   * where each meets the floor.
   */
  paintShafts(g: THREE.Object3D) {
    const mat = d1ShaftMaterial(0x7a98d8, 0.16);
    const tex = z2PoolTexture();
    const pools: THREE.Mesh[] = [];
    g.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      m.material = mat;
      const h = (m.geometry as THREE.CylinderGeometry).parameters?.height ?? 18;
      const x = m.position.x + Math.sin(m.rotation.z) * (h / 2);
      pools.push(z2LightPool(tex, 0x6a88c8, x, B + 0.014, m.position.z, 6.5, 6.5, 0.32));
    });
    for (const p of pools) g.add(p);
  }

  /**
   * The facade's depth: stone string courses at the floor lines, downpipes
   * between the bays, dead creeper climbing the corners.
   */
  private facadeDetail(b: PwBatch) {
    const a = this.atlas;
    const course = copingTile(a);
    for (const y of [4.95, 8.0, 11.3]) b.rect(_o.set(-34, y, -25.79), X, Y, 68, 0.25, course, { u0: 0, v0: 8 });
    const pipe = drainpipeTile(a, { hex: 0x4a5054 });
    for (const x of [-17.6, 17.6, -33.3, 33.3]) b.rect(_o.set(x - 0.25, 0.1, -25.78), X, Y, 0.5, 15.8, pipe);
    b.rect(_o.set(-31.5, 0, -25.77), X, Y, 2, 4, z2VineModule(a, 0));
    b.rect(_o.set(26.5, 0, -25.77), X, Y, 2, 4, z2VineModule(a, 0), { flipU: true });
  }

  /** Red neon spilling on the ground: under the canopy's EMERGENCY and at the entrance (additive stepped pools). */
  private bayLights(_b: PwBatch) {
    this.job!.pools.push([0xff2a1a, 0, 0.011, -11.6, 15, 7, 0.5], [0xff3020, 0, 0.152, -24.4, 7, 3, 0.4]);
  }

  /** `bakeInto` hook: re-paint a set piece's meshes into a batch in its parent's frame (call before its bake). */
  convertInto(g: THREE.Group, parent: THREE.Object3D) {
    const b = new PwBatch(this.atlas);
    this.bills = new Z2Billboards();
    this.job = { parent, batch: b, bills: this.bills, anim: null, pools: [] };
    this.jobs.push(this.job);
    g.updateMatrixWorld(true);
    this.boards(g, b);
    this.handleTagged(g, b);
    this.emitAll(g, b, 0, false, null);
  }

  /**
   * The boiler wall's KEEP OUT: its classic crack strokes become boards nailed
   * across the blocks (grain, nail heads, a cast shadow), at their angles.
   */
  private boards(g: THREE.Group, b: PwBatch) {
    let keep = false;
    g.traverse((o) => {
      if (o.userData.pw?.kind === 'text' && o.userData.pw.text === 'KEEP OUT') keep = true;
    });
    if (!keep) return;
    _inv.copy(g.matrixWorld).invert();
    let k = 0;
    for (const c of [...g.children]) {
      const m = c as THREE.Mesh;
      if (!m.isMesh || (m.material as THREE.MeshLambertMaterial).color?.getHex() !== 0x1a1a18) continue;
      const len = (m.geometry as THREE.BoxGeometry).parameters.width;
      _rel.multiplyMatrices(_inv, m.matrixWorld);
      const L = Math.min(1.6, Math.max(1.1, len * 1.4));
      const t = z2PlankModule(this.atlas, k++ % 2);
      this.lay(b, _rel, _o.set(-L / 2, -0.17, 0.014 + k * 0.002), X, Y, L, 10 / PW_TPM, t, { sub: { x: 0, y: 0, w: Math.round(L * PW_TPM), h: 10 } });
      g.remove(m);
    }
  }

  /** Register the dynamic panels / grates (their painted look is set in `finish`) and the breakable doors' leaves. */
  registerDynamic(flickers: { mesh: THREE.Mesh }[], grates: THREE.Object3D[], doorColors: number[] = []) {
    for (const c of doorColors) doorLeaf(this.atlas, c);
    // The cylinders (painted when they spawn) and the boiler wall's broken cores.
    z2CylTile(this.atlas, 'gas', 0xc22a1e);
    z2CylTile(this.atlas, 'oxygen', 0x1f8a3c);
    z2RubbleTile(this.atlas);
    z2EnamelTile(this.atlas, { hex: NEUTRAL_HEX }).neutral = NEUTRAL_HEX;
    // Registers the tiles now (before the atlas is built).
    troffer(this.atlas, 'on');
    troffer(this.atlas, 'warm');
    z2VentModule(this.atlas, 0x9aa09c);
    for (const f of flickers) this.dynFlickers.push({ mesh: f.mesh, warm: (f.mesh.material as THREE.MeshBasicMaterial).color?.getHex?.() === 0xfff1d0 });
    for (const g of grates) this.dynGrates.push(g as THREE.Mesh);
  }

  /** Paint the atlas and build every batch (each mesh joins the group it was made for). */
  finish(gain = 1, flickers?: { mesh: THREE.Mesh; on: THREE.Material; off: THREE.Material }[]) {
    const data = this.atlas.build();
    const tiles = this.atlasTiles();
    // Calm far levels on the tileable surfaces (grout, chequer, bricks collapse into their mid-tone
    // instead of crawling into dashes), and signs kept at level 0 a step longer (letters stay whole).
    d2CalmLevels(data, tiles);
    const signs = new Set<number>();
    for (const t of tiles) if (/^z2(lit|plate|exit|stencil|road)\|/.test(t.key)) signs.add(t.x * 65536 + t.y);
    let anim: THREE.Material | null = null;
    let poolTex: THREE.Texture | null = null;
    for (const j of this.jobs) {
      const jg = gain * (j.gain ?? 1);
      const mods = pwMaterial(this.atlas, { gain: jg });
      const surf = pwMaterial(this.atlas, { gain: jg, bias: Z2_SURF_BIAS, tag: 'surf' });
      const sign = pwMaterial(this.atlas, { gain: jg, bias: Z2_SIGN_BIAS, tag: 'sign' });
      const mesh = j.batch.build(mods);
      if (mesh) {
        splitMaterials(mesh, mods, surf, sign, signs);
        j.parent.add(mesh);
      }
      const bm = j.bills.build(this.atlas, jg);
      if (bm) j.parent.add(bm);
      if (j.anim) {
        anim ??= pwMaterial(this.atlas, { gain, anim: { frames: Z2_PUDDLE_FRAMES, fps: 7 }, tag: 'puddle' });
        const am = j.anim.build(anim);
        if (am) j.parent.add(am);
      }
      if (j.pools.length) {
        poolTex ??= z2PoolTexture();
        j.parent.add(z2PoolMesh(poolTex, j.pools));
      }
    }
    this.animMat = anim;
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
      const t = z2VentModule(this.atlas, 0x9aa09c);
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

  /** Every tile registered in the stage atlas. */
  private atlasTiles(): PwTile[] {
    const m = (this.atlas as unknown as { tiles: Map<string, { tile: PwTile }> }).tiles;
    return [...m.values()].map((t) => t.tile);
  }

  /** Advance the animated puddles (every frame; allocation-free). */
  tick(dt: number) {
    if (this.animMat) pwTick(this.animMat, dt);
  }

  // ─── Breakable doors (Destructibles: re-painted in place, hit boxes untouched) ──

  /**
   * Re-paint a baked door model in place: every Lambert mesh keeps its
   * triangles (the Destructible's hit boxes stay exactly the classic ones) and
   * gets PixelWorld attributes — the faces looking along ±z show the painted
   * leaf projected through them (slab, kick plate, window and handle all line
   * up with it), the edges a tinted enamel. (`ox`, `oy`: the leaf's origin in
   * the model's frame — 0, 0 for the classic hinge frame.)
   */
  paintDoor(root: THREE.Object3D, w: number, h: number, color: number, ox = 0, oy = 0) {
    if (!this.atlas.built) return;
    const leaf = doorLeaf(this.atlas, color);
    const edge = z2EnamelTile(this.atlas, { hex: NEUTRAL_HEX });
    const edgeTint = new THREE.Color(tintHex(color, NEUTRAL_HEX));
    const mat = pwMaterial(this.atlas);
    root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh || (m.material as THREE.Material).userData.pixelWorld || !(m.material as THREE.MeshLambertMaterial).isMeshLambertMaterial) return;
      const g = m.geometry;
      if (g.index) return;
      const pos = g.getAttribute('position');
      const n = pos.count;
      const uv = new Float32Array(n * 2);
      const rect = new Int16Array(n * 4);
      const col = new Uint8Array(n * 3);
      for (let i = 0; i + 2 < n; i += 3) {
        _a.fromBufferAttribute(pos, i);
        _b.fromBufferAttribute(pos, i + 1);
        _c.fromBufferAttribute(pos, i + 2);
        _e1.subVectors(_b, _a);
        _e2.subVectors(_c, _a);
        _n.crossVectors(_e1, _e2).normalize();
        const front = Math.abs(_n.z) > 0.7;
        for (let k = 0; k < 3; k++) {
          const v = i + k;
          const p = k === 0 ? _a : k === 1 ? _b : _c;
          if (front) {
            // Leaf texels across the face (the back face mirrored so the hinge side matches).
            const u = ((p.x - ox) / w) * leaf.w;
            uv[v * 2] = _n.z > 0 ? u : leaf.w - u;
            uv[v * 2 + 1] = ((p.y - oy) / h) * leaf.h;
            rect.set([leaf.x, leaf.y, -leaf.w, leaf.h], v * 4);
            col.set([255, 255, 255], v * 3);
          } else {
            const [pu, pv] = planarUv(p, _n, PW_TPM);
            uv[v * 2] = pu;
            uv[v * 2 + 1] = pv;
            rect.set([edge.x, edge.y, edge.w, edge.h], v * 4);
            col.set([Math.round(edgeTint.r * 255), Math.round(edgeTint.g * 255), Math.round(edgeTint.b * 255)], v * 3);
          }
        }
      }
      g.setAttribute('pwUv', new THREE.BufferAttribute(uv, 2));
      g.setAttribute('pwRect', new THREE.BufferAttribute(rect, 4));
      g.setAttribute('color', new THREE.BufferAttribute(col, 3, true));
      m.material = mat;
    });
  }

  // ─── Vehicles ─────────────────────────────────────────────────────────────

  /** The crashing ambulance (dynamic): body and doors painted into batches that ride with them. */
  paintAmbulance(amb: Ambulance) {
    const body = new PwBatch(this.atlas);
    this.bills = new Z2Billboards();
    this.jobs.push({ parent: amb.body, batch: body, bills: this.bills, anim: null, pools: [] });
    amb.body.updateMatrixWorld(true);
    for (const c of [...amb.body.children]) if (c.userData.pw?.kind === 'ambGrille') amb.body.remove(c);
    this.layAmbulanceBody(body, new THREE.Matrix4());
    this.emitAll(amb.body, body, 0, false, null);
    for (const [door, side] of [[amb.doorL, 1], [amb.doorR, -1]] as [THREE.Group, number][]) {
      const b = new PwBatch(this.atlas);
      this.jobs.push({ parent: door, batch: b, bills: new Z2Billboards(), anim: null, pools: [] });
      this.layAmbulanceDoor(b, new THREE.Matrix4(), side);
      this.emitAll(door, b, 0, false, null);
    }
  }

  private layAmbulanceBody(b: PwBatch, m: THREE.Matrix4) {
    const a = this.atlas;
    this.lay(b, m, _o.set(-1.165, 0.45, -2.95), Z, Y, 4.0, 2.3, ambulanceSide(a, true));
    this.lay(b, m, _o.set(1.165, 0.45, 1.05), NZ, Y, 4.0, 2.3, ambulanceSide(a, false));
    this.lay(b, m, _o.set(-1.1, 0.45, 2.956), X, Y, 2.2, 1.35, ambulanceFront(a));
    this.lay(b, m, _o.set(-1.115, 0.45, 1.05), Z, Y, 1.9, 1.35, ambulanceCabSide(a, false));
    this.lay(b, m, _o.set(1.115, 0.45, 2.95), NZ, Y, 1.9, 1.35, ambulanceCabSide(a, true));
  }

  /** A rear door's outer face (door frame: hinge at 0, panel toward −side·x, outer face −z). */
  private layAmbulanceDoor(b: PwBatch, m: THREE.Matrix4, side: number) {
    const x0 = side > 0 ? 0 : 1.1;
    this.lay(b, m, _o.set(x0, 0, -0.036), NX, Y, 1.1, 2.2, ambulanceDoor(this.atlas), { flipU: side < 0 });
  }

  // ─── Sky ──────────────────────────────────────────────────────────────────

  backdrop: PwBackdrop | null = null;
  private dome: THREE.Group | null = null;

  /**
   * The painted storm night over the bay: a sphere band of storm clouds up to
   * 50° (capped by the overcast deck's top row: the camera looks up at the
   * hospital), the far city (fires, smoke into the cloud base) and a nearer
   * roof layer drifting against it.
   */
  buildBackdrop(fog: number): THREE.Group {
    const s = this.skyAtlas;
    const sky = z2StormSkyTile(s, { fog, el0: -3, el1: 50 });
    const city = z2CityTile(s, { hex: 0x141a24, fog, el0: -2, el1: 9 });
    const roofs = z2RoofsTile(s, { hex: 0x0c1016, fog, el0: -2, el1: 6 });
    this.backdrop = new PwBackdrop(s, null, [
      { tile: city, radius: 300, el0: -2, el1: 9, repeat: 2, follow: 1 },
      { tile: roofs, radius: 240, el0: -2, el1: 6, repeat: 2, yaw: 33, follow: 0.9 },
    ]);
    this.backdrop.anchor.set(0, 0, -10);
    const g = this.backdrop.build();
    // The dome shares the layers' (unlit) material: the lightning gain lights all of it.
    const mat = (g.children[0] as THREE.Mesh).material as THREE.Material;
    this.dome = z2SkyDome(sky, mat, { radius: 330, el0: -3, el1: 50, repeat: 2 });
    g.add(this.dome);
    return g;
  }

  /** Follow the camera (every frame; allocation-free). */
  updateSky(cam: THREE.Vector3) {
    this.backdrop?.update(cam);
    this.dome?.position.set(cam.x, 0, cam.z);
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

  /**
   * A draped mound (a body under a sheet) in frame `m`: hexagonal sections
   * [z, height above `base`, half width] joined by quads, the ends capped;
   * the sheet tile mapped at world scale across and along it. `zf` maps the
   * section z (gurney frame) into the object's frame.
   */
  private mound(b: PwBatch, m: THREE.Matrix4, tile: PwTile, base: number, secs: number[][], zf: (z: number) => number) {
    const XS = [-1, -0.75, -0.4, 0.4, 0.75, 1];
    const YS = [0, 0.7, 1, 1, 0.7, 0];
    const pt = (s: number[], i: number, out: THREE.Vector3) => out.set(XS[i] * s[2], base + YS[i] * s[1], zf(s[0]));
    b.setMatrix(m);
    for (let k = 0; k + 1 < secs.length; k++) {
      const s0 = secs[k];
      const s1 = secs[k + 1];
      const v0 = zf(s0[0]) * PW_TPM;
      const v1 = zf(s1[0]) * PW_TPM;
      let ua = 0;
      let ub = 0;
      for (let i = 0; i + 1 < XS.length; i++) {
        pt(s0, i, _q[0]);
        pt(s1, i, _q[1]);
        pt(s1, i + 1, _q[2]);
        pt(s0, i + 1, _q[3]);
        const la = _q[0].distanceTo(_q[3]) * PW_TPM;
        const lb = _q[1].distanceTo(_q[2]) * PW_TPM;
        b.quad(_q[0], _q[1], _q[2], _q[3], tile, [ua, v0, ub, v1, ub + lb, v1, ua + la, v0]);
        ua += la;
        ub += lb;
      }
    }
    // End caps (fans): the first faces −z, the last +z.
    for (const [s, rev] of [[secs[0], false], [secs[secs.length - 1], true]] as const) {
      for (let i = 1; i + 1 < XS.length; i++) {
        pt(s, 0, _q[0]);
        pt(s, rev ? i + 1 : i, _q[1]);
        pt(s, rev ? i : i + 1, _q[2]);
        b.tri(_q[0], _q[1], _q[2], tile, [_q[0].x * PW_TPM, _q[0].y * PW_TPM, _q[1].x * PW_TPM, _q[1].y * PW_TPM, _q[2].x * PW_TPM, _q[2].y * PW_TPM]);
      }
    }
    b.setMatrix(null);
  }

  /** Insulation and cables hanging out of a ceiling hole (two crossed cut-out cards, both faces), in frame `m`. */
  private dangle(b: PwBatch, m: THREE.Matrix4, v: number) {
    const t = z2DangleCard(this.atlas, v);
    const w = 0.6;
    const h = 1.0;
    this.lay(b, m, _o.set(-w / 2, -h - 0.01, 0), X, Y, w, h, t);
    this.lay(b, m, _o.set(w / 2, -h - 0.01, 0.002), NX, Y, w, h, t);
    this.lay(b, m, _o.set(0, -h - 0.01, w / 2), NZ, Y, w, h, t, { flipU: true });
    this.lay(b, m, _o.set(0.002, -h - 0.01, -w / 2), Z, Y, w, h, t, { flipU: true });
  }

  /** Lay a module rect in an object's frame. */
  private lay(b: PwBatch, m: THREE.Matrix4, o: THREE.Vector3, ux: THREE.Vector3, vy: THREE.Vector3, w: number, h: number, t: PwTile, opts: { tint?: number; flipU?: boolean; u0?: number; sub?: { x: number; y: number; w: number; h: number } } = {}) {
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
        if ((info.px as number) >= 0.08) {
          // Big signs on a 4-texel grid (whole letters at every level), at the classic letter size.
          const t = z2BigSign(a, info.text as string, info.color as number, { px: info.px as number, plate: info.plate as number | null, broken: info.broken as number[] | undefined, neon: (info.text as string).startsWith('EMERGENCY') });
          this.lay(b, m, _o.set(-t.wM / 2, -t.hM / 2, info.plate === null ? 0.004 : 0.012), X, Y, t.wM, t.hM, t.tile);
          return true;
        }
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
        } else if (text === 'AMBULANCE') {
          // Road lettering: worn white paint, drawn tall (it is read at a grazing angle).
          const t = z2RoadStencil(a, text, 0xd0d0c0, 3);
          const w = t.w / PW_TPM;
          const h = t.h / PW_TPM;
          this.lay(b, m, _o.set(-w / 2, -h / 2, 0.004), X, Y, w, h, t);
        } else {
          const t = z2Stencil(a, text, info.color as number, info.px as number, 0.25);
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
        // A lit panel's stepped pool on the floor below (the polish catches it).
        const fl = this.job?.floor;
        if (info.on && fl !== undefined) {
          _p.setFromMatrixPosition(m);
          this.job!.pools.push([info.warm ? 0xffe8c0 : 0xd8f0e8, _p.x, fl + 0.012, _p.z, 2.8, 3.4, 0.11]);
        }
        return true;
      }
      case 'flickerFrame':
        // The dynamic diffuser covers it (painted in `finish`).
        return true;
      case 'panelHole': {
        const t = ceilingHoleDecal(a, hsh > 0.5 ? 1 : 0);
        this.lay(b, m, _o.set(-0.35, -0.012, -0.65), X, Z, 0.7, 1.3, t);
        this.dangle(b, m, hsh > 0.5 ? 1 : 0);
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
        // A few painted variants only (each is a 56 × 68 module): the room colour follows the kind.
        const lit = !on ? 0x1a2434 : kind === 'figure' ? 0x9fc8b0 : kind === 'blinds' ? 0x8ab0d8 : 0xd8c890;
        const t = hospitalWindow(a, kind, lit, kind === 'dark' || kind === 'blinds' ? Math.floor(hsh * 7) % 2 : 0);
        // Window box front is at +0.05; the module covers the opening, its reveal, head and sill.
        this.lay(b, m, _o.set(-28 / PW_TPM, -1.06, -0.02), X, Y, 56 / PW_TPM, 68 / PW_TPM, t);
        return true;
      }
      case 'wingWin': {
        const on = info.on as boolean;
        const kind: HospWindowKind = on ? 'lit' : hsh > 0.85 ? 'broken' : hsh > 0.5 ? 'blinds' : 'dark';
        const t = hospitalWindow(a, kind, on ? 0xd8c890 : 0x1a2434, kind === 'dark' || kind === 'blinds' ? 1 : 0);
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
      case 'bedside':
      case 'filing':
      case 'drum':
      case 'cone': {
        const t =
          info.kind === 'wheelchair' ? wheelchairSprite(a, info.tipped as boolean)
          : info.kind === 'iv' ? ivSprite(a, (info.liquid as number) === 0x9a1a1a || (info.liquid as number) === 0xa82020)
          : info.kind === 'bin' ? binSprite(a, info.tipped as boolean)
          : info.kind === 'crashCart' ? crashCartSprite(a)
          : info.kind === 'laundryCart' ? laundrySprite(a)
          : info.kind === 'trolley' ? trolleySprite(a)
          : info.kind === 'plant' ? potSprite(a)
          : info.kind === 'bedside' ? bedsideSprite(a)
          : info.kind === 'filing' ? filingSprite(a)
          : info.kind === 'drum' ? drumSprite(a)
          : coneSprite(a);
        _p.setFromMatrixPosition(m);
        _p.y -= (info.foot as number | undefined) ?? 0;
        this.bills.add(_p.x, _p.y, _p.z, t, t.h / PW_TPM, { flip: hsh > 0.5 });
        return true;
      }
      case 'coneBase':
        return true;
      case 'fireDoor': {
        // Leaf 0.06 × 2.75 × 1.7 from z 0.03 (hinge at z 0): painted on both faces (hinges on the hinge
        // side); the classic vision panel box goes (the wired glass is in the leaf).
        for (const c of [...o.children]) if (((c as THREE.Mesh).material as THREE.MeshLambertMaterial | undefined)?.color?.getHex() === 0x101414) o.remove(c);
        const t = z2FireDoorLeaf(a, 0x9a2a22);
        this.lay(b, m, _o.set(0.032, 0, 1.73), NZ, Y, 1.7, 2.75, t);
        this.lay(b, m, _o.set(-0.032, 0, 0.03), Z, Y, 1.7, 2.75, t, { flipU: true });
        return false;
      }
      case 'tray': {
        b.setMatrix(m);
        b.rect(_o.set(-0.25, 0.006, 0.19), X, NZ, 0.5, 0.375, trayDecal(a));
        b.setMatrix(null);
        return true;
      }
      case 'puddle': {
        _p.setFromMatrixPosition(m);
        if (info.indoor) {
          b.rect(_o.set(_p.x - 1, _p.y + 0.004 + (this.nDecal++ % 3) * 0.001, _p.z + 0.625), X, NZ, 2, 1.25, puddleDecal(a, 2));
          return true;
        }
        // Outdoors: an animated mirror of the nearest light (rain rings spreading).
        const r = (info.r as number | undefined) ?? 1;
        this.puddle(_p.x, _p.y, _p.z, this.puddleLight(_p.x, _p.z, hsh), 0, Math.max(1.4, r * 2.2), Math.max(0.8, r * 1.3));
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
        this.layAmbulanceBody(b, m);
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
            this.layAmbulanceDoor(b, dm, side);
          }
        }
        return false;
      }
      case 'car': {
        const col = info.color as number;
        this.lay(b, m, _o.set(-0.905, 0.3, -2.15), Z, Y, 4.3, 0.7, carSide(a, col));
        this.lay(b, m, _o.set(0.905, 0.3, 2.15), NZ, Y, 4.3, 0.7, carSide(a, col));
        this.lay(b, m, _o.set(-0.805, 1.0, -1.4), Z, Y, 2.2, 0.6, carCabin(a, col));
        this.lay(b, m, _o.set(0.805, 1.0, 0.8), NZ, Y, 2.2, 0.6, carCabin(a, col));
        this.lay(b, m, _o.set(-0.9, 0.3, 2.155), X, Y, 1.8, 0.7, carEnd(a, col, true));
        this.lay(b, m, _o.set(0.9, 0.3, -2.155), NX, Y, 1.8, 0.7, carEnd(a, col, false));
        return false;
      }
      case 'bed': {
        this.lay(b, m, _o.set(-0.5, 0.42, 1.047), X, Y, 1.0, 0.45, bedBoard(a, true));
        this.lay(b, m, _o.set(-0.5, 0.4, -0.988), X, Y, 1.0, 0.78, bedBoard(a, false));
        // Against the wall (yaw 0 / π): the bed-head gas and power unit on the wall behind it.
        const yaw = Math.atan2(m.elements[8], m.elements[10]);
        if (Math.abs(Math.sin(yaw)) < 0.05) this.lay(b, m, _o.set(-0.81, 1.2, -1.064), X, Y, 52 / PW_TPM, 0.5, bedHeadUnit(a));
        return false;
      }
      case 'shelf': {
        // (The tagged mesh's origin is the box centre: 1.1 × 2.0 × 0.45, front at local +z.)
        this.lay(b, m, _o.set(-0.55, -1.0, 0.228), X, Y, 1.1, 2.0, shelfFront(a, info.v as number));
        return false;
      }
      case 'morgueWall': {
        const cols = info.cols as number;
        const rows = info.rows as number;
        const skip = new Set(info.skip as string[]);
        const w = cols * 0.78;
        // Drop the classic door boxes, handles and cards (the big cabinet box and the open slots stay).
        for (const c of [...o.children]) {
          const mt = (c as THREE.Mesh).material as THREE.MeshLambertMaterial | undefined;
          if (c === o.children[0]) continue;
          if (mt?.color?.getHex() === 0x0b0f10) continue;
          o.remove(c);
        }
        for (let cc = 0; cc < cols; cc++) {
          for (let r = 0; r < rows; r++) {
            if (skip.has(`${cc},${r}`)) continue;
            const cx = -w / 2 + 0.39 + cc * 0.78;
            const cy = 0.61 + r * 0.72;
            this.lay(b, m, _o.set(cx - 0.34, cy - 0.31, 0.012), X, Y, 0.68, 0.62, drawerFace(a, Math.floor(hash2(cc, r, 7) * 3)));
          }
        }
        return false;
      }
      case 'glassRail': {
        // Bay by bay (posts every 2.5 m): most panes clean, the odd crack, smear or empty frame.
        const len = info.len as number;
        const n = Math.max(1, Math.round(len / 2.5));
        const bw = len / n;
        for (let i = 0; i < n; i++) {
          const h = hash2(i, Math.round(m.elements[12] * 3 + m.elements[13] * 5), Math.round(m.elements[14] * 3));
          const t = glassRailTile(a, h < 0.32 ? 0 : h < 0.62 ? 1 : h < 0.76 ? 2 : h < 0.9 ? 3 : 4);
          const s0 = -len / 2 + i * bw;
          if (info.along) {
            this.lay(b, m, _o.set(s0, -0.5, 0.017), X, Y, bw, 1.0, t);
            this.lay(b, m, _o.set(-s0, -0.5, -0.017), NX, Y, bw, 1.0, t);
          } else {
            this.lay(b, m, _o.set(0.017, -0.5, -s0), NZ, Y, bw, 1.0, t);
            this.lay(b, m, _o.set(-0.017, -0.5, s0), Z, Y, bw, 1.0, t);
          }
        }
        return true;
      }
      case 'doorway': {
        const t = doorwayModule(a, hsh > 0.82 ? 1 : hsh > 0.55 ? 2 : 0);
        if ((info.face as number) < 0) this.lay(b, m, _o.set(0.8, -1.2, -0.026), NX, Y, 1.6, 2.4, t);
        else this.lay(b, m, _o.set(-0.8, -1.2, 0.026), X, Y, 1.6, 2.4, t);
        return true;
      }
      case 'officeWin': {
        const col = ((o as THREE.Mesh).material as THREE.MeshBasicMaterial).color.getHex();
        this.lay(b, m, _o.set(0.7, -0.4, -0.021), NX, Y, 1.4, 0.8, officeWindow(a, col, hsh > 0.6 ? 1 : 0));
        return true;
      }
      case 'skylight': {
        const p = ((o as THREE.Mesh).geometry as THREE.BoxGeometry).parameters;
        this.lay(b, m, _o.set(-p.width / 2, -0.026, -p.depth / 2), X, Z, p.width, p.depth, skylightTile(a));
        return true;
      }
      case 'vein': {
        // Bold ribbons radiating from the pool (0.6–1 m wide: the arena's framing lines), u stretched once across.
        const len = info.len as number;
        const w = Math.max(0.6, (info.w as number) * 3.2);
        const hexV = ((o as THREE.Mesh).material as THREE.MeshLambertMaterial).color.getHex();
        b.setMatrix(m);
        b.rect(_o.set(-w / 2, 0.041 + (this.nDecal++ % 3) * 0.002, len / 2 + 0.15), X, NZ, w, len + 0.3, veinTile(a, hexV === 0x4a1212 ? 0x6a1a1a : 0x8a2a26), { u0: 0, v0: Math.floor(hsh * 64), uScale: 1 / w });
        b.setMatrix(null);
        return true;
      }
      case 'veinNode': {
        _p.setFromMatrixPosition(m);
        const r = Math.max(0.35, (info.r as number) * 1.9);
        b.rect(_o.set(_p.x - r, _p.y + 0.05, _p.z + r), X, NZ, r * 2, r * 2, pustuleDecal(a));
        return true;
      }
      case 'drip': {
        const len = info.len as number;
        const hexV = ((o as THREE.Mesh).material as THREE.MeshLambertMaterial).color.getHex();
        const t = dripTile(a, hexV);
        this.lay(b, m, _o.set(-0.18, -len / 2, 0.062), X, Y, 0.36, len, t);
        this.lay(b, m, _o.set(0.18, -len / 2, -0.062), NX, Y, 0.36, len, t);
        return true;
      }
      case 'membrane': {
        const p = ((o as THREE.Mesh).geometry as THREE.BoxGeometry).parameters;
        const t = membraneTile(a, 0x4a1212);
        this.lay(b, m, _o.set(-p.width / 2, -0.85, 0.102), X, Y, p.width, 1.1, t);
        this.lay(b, m, _o.set(p.width / 2, -0.85, -0.102), NX, Y, p.width, 1.1, t);
        return false;
      }
      case 'step': {
        const w = info.w as number;
        const h = info.h as number;
        this.lay(b, m, _o.set(-w / 2, h / 2 + 0.003, 0.15), X, NZ, w, 0.3, z2TreadTile(a, { hex: 0x6a6c66 }));
        return false;
      }
      case 'nosing':
        return true;
      case 'chairs': {
        const hex = info.color as number;
        const n = info.n as number;
        const missing = info.missing as number[];
        // The classic cushions go (boxes in the chairs' cloth); the steel beam and legs stay.
        for (const c of [...o.children]) if (((c as THREE.Mesh).material as THREE.MeshLambertMaterial | undefined)?.color?.getHex() === hex) o.remove(c);
        const w = 0.56;
        const x0 = (-(n - 1) * w) / 2;
        const edge = chairEdge(a, hex);
        const side = z2LinenTile(a, { hex });
        const shell = chairShell(a);
        for (let i = 0; i < n; i++) {
          if (missing.includes(i)) continue;
          const cx = x0 + i * w;
          const v = Math.floor(hash2(Math.round(m.elements[12] * 5) + i * 7, Math.round(m.elements[14] * 5), 71) * 5);
          b.setMatrix(m);
          b.box(cx, 0.45, 0.02, 0.5, 0.06, 0.46, { py: chairSeat(a, hex, v === 3 ? 1 : v === 4 ? 2 : 0), pz: edge, px: side, nx: side, nz: side });
          // Back rest: painted front and shell, cut-out rounded shoulders; thin sides and top.
          _mm.copy(m).multiply(_t4.makeTranslation(cx, 0.72, -0.22)).multiply(_r4.makeRotationX(-0.12));
          b.setMatrix(_mm);
          b.rect(_o.set(-0.25, -0.24, 0.026), X, Y, 0.5, 0.48, chairBack(a, hex, v % 3), { flipU: hash2(i, Math.round(m.elements[12] * 3), 73) > 0.5 });
          b.rect(_o.set(0.25, -0.24, -0.026), NX, Y, 0.5, 0.48, shell);
          b.rect(_o.set(0.25, -0.24, 0.026), NZ, Y, 0.052, 0.42, side);
          b.rect(_o.set(-0.25, -0.24, -0.026), Z, Y, 0.052, 0.42, side);
          b.rect(_o.set(-0.22, 0.24, 0.026), X, NZ, 0.44, 0.052, side);
          b.setMatrix(null);
        }
        return false;
      }
      case 'gurney': {
        // (Tipped: the frame hangs under a rotated child group.)
        const r = info.tipped ? o.children[0] : o;
        const mr = new THREE.Matrix4().multiplyMatrices(_inv, r.matrixWorld);
        const hex = (info.sheet as number | undefined) ?? 0xc8d2cc;
        const body = !!info.body;
        const bloody = !!info.blood;
        // Sheet, lumps, blood slabs and the grey arm go; the frame, mattress and pillow stay.
        for (const c of [...r.children]) {
          const hx = ((c as THREE.Mesh).material as THREE.MeshLambertMaterial | undefined)?.color?.getHex();
          if (hx !== undefined && (hx === hex || hx === 0x8a9488 || BLOOD_HEX.has(hx))) r.remove(c);
        }
        const plain = sheetTile(a, hex, false);
        const soaked = bloody ? sheetTile(a, hex, true) : plain;
        b.setMatrix(mr);
        b.rect(_o.set(-0.3, 0.97, 0.92), X, NZ, 0.6, 1.6, soaked, { u0: Math.floor(hsh * 64) });
        if (!info.tipped) {
          const hem = hemTile(a, hex);
          b.rect(_o.set(0.302, 0.69, 0.92), NZ, Y, 1.6, 0.28, hem, { v0: 7 });
          b.rect(_o.set(-0.302, 0.69, -0.68), Z, Y, 1.6, 0.28, hem, { v0: 7, u0: 23 });
          b.rect(_o.set(-0.302, 0.69, 0.922), X, Y, 0.604, 0.28, hem, { v0: 7, u0: 41 });
        }
        b.setMatrix(null);
        if (body) {
          this.mound(b, mr, plain, 1.0, BODY_HEAD, (z) => z);
          this.mound(b, mr, soaked, 0.97, BODY_TORSO, (z) => z);
          if (!info.tipped) {
            _p.set(0.33, 0.55, 0.1).applyMatrix4(mr);
            this.bills.add(_p.x, _p.y, _p.z, deadArmSprite(a), 14 / PW_TPM);
          }
        }
        return false;
      }
      case 'autopsy': {
        const sheetHex = 0xb8c4c0;
        if (info.body) {
          for (const c of [...o.children]) {
            const hx = ((c as THREE.Mesh).material as THREE.MeshLambertMaterial | undefined)?.color?.getHex();
            if (hx === sheetHex || hx === 0xd8d0c0 || hx === 0x7e0d0d) o.remove(c);
          }
        }
        this.lay(b, m, _o.set(-0.44, 0.8805, 1.0), X, NZ, 0.88, 2.0, autopsyTop(a));
        // The pedestal: brushed steel faces (seam, drain valve, rust ring, blood runs).
        this.lay(b, m, _o.set(-0.16, 0, 0.163), X, Y, 0.32, 0.8, z2PedestalFace(a, 0));
        this.lay(b, m, _o.set(0.16, 0, -0.163), NX, Y, 0.32, 0.8, z2PedestalFace(a, 1));
        this.lay(b, m, _o.set(0.163, 0, 0.16), NZ, Y, 0.32, 0.8, z2PedestalFace(a, 2));
        this.lay(b, m, _o.set(-0.163, 0, -0.16), Z, Y, 0.32, 0.8, z2PedestalFace(a, 1));
        if (info.body) {
          // Head at z −0.72, feet at 0.82 on the table (top 0.88, inside the rims).
          const zf = (z: number) => -0.72 + (z + 0.52) * (1.54 / 1.38);
          const sheet = sheetTile(a, sheetHex, false);
          this.mound(b, m, sheet, 0.9, BODY_HEAD, zf);
          this.mound(b, m, sheet, 0.89, BODY_TORSO, zf);
          b.setMatrix(m);
          b.rect(_o.set(0.04, 0.9, 1.0), X, Y, 0.19, 0.125, toeTag(a));
          if (info.open) {
            // The Y-cut on the chest: on the mound's flat top between its chest sections.
            const [s0, s1] = [BODY_TORSO[2], BODY_TORSO[3]];
            const y0 = 0.89 + s0[1] + 0.004;
            const y1 = 0.89 + s1[1] + 0.004;
            const w0 = s0[2] * 0.4;
            const w1 = s1[2] * 0.4;
            _q[0].set(-w1, y1, zf(s1[0]));
            _q[1].set(w1, y1, zf(s1[0]));
            _q[2].set(w0, y0, zf(s0[0]));
            _q[3].set(-w0, y0, zf(s0[0]));
            b.quad(_q[0], _q[1], _q[2], _q[3], openCavity(a), [0, 0, 16, 0, 16, 16, 0, 16]);
          }
          b.setMatrix(null);
        }
        return false;
      }
      case 'opTable': {
        const drape = 0x6a9a8a;
        // The sterile field taped round the table, instruments dropped by it.
        this.lay(b, m, _o.set(-1.5, 0.006, 2), X, NZ, 3, 4, z2SterileField(a));
        this.lay(b, m, _o.set(0.6, 0.008, 1.4), X, NZ, 0.75, 0.5, z2InstrumentsDecal(a));
        this.lay(b, m, _o.set(-1.2, 0.008, -0.6), X, NZ, 0.6, 0.6, drainDecal(a));
        for (const c of [...o.children]) {
          const hx = ((c as THREE.Mesh).material as THREE.MeshLambertMaterial | undefined)?.color?.getHex();
          if (hx !== undefined && BLOOD_HEX.has(hx)) o.remove(c);
        }
        b.setMatrix(m);
        b.rect(_o.set(-0.36, 0.931, 1.05), X, NZ, 0.72, 2.0, drapeTop(a, drape));
        const hem = hemTile(a, drape);
        b.rect(_o.set(0.362, 0.65, 1.05), NZ, Y, 2.0, 0.28, hem, { v0: 7 });
        b.rect(_o.set(-0.362, 0.65, -0.95), Z, Y, 2.0, 0.28, hem, { v0: 7, u0: 29 });
        b.setMatrix(null);
        return false;
      }
      case 'anesthesia':
        // Cabinet 0.7 × 1.2 × 0.6 from y 0.1, front at z 0.3 (its screen block above stays).
        this.lay(b, m, _o.set(-0.35, 0.1, 0.302), X, Y, 0.7, 1.2, anesthesiaFront(a));
        return false;
      case 'counter': {
        const w = info.w as number;
        // (Each counter starts the 4 m front at its own place: the stickers and dents never line up.)
        this.lay(b, m, _o.set(-w / 2, 0, 0.462), X, Y, w, 1.1, counterFront(a, 0x5c7a74), { u0: Math.floor(hsh * 128) });
        return false;
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
      // Round things painted round: pillars, collars, bollards, posts (u round the turn, v up).
      const ck = m.geometry.type === 'CylinderGeometry' ? cylKind(mat) : null;
      if (ck) {
        emitCylinder(b, m.geometry as THREE.CylinderGeometry, rel, z2CylTile(this.atlas, ck, mat.color.getHex()), pick);
        m.parent?.remove(m);
        continue;
      }
      if (m.geometry.type === 'TorusGeometry' && mat.color.getHex() === 0x8a867a) {
        this.coping(b, m, rel);
        m.parent?.remove(m);
        continue;
      }
      emitMesh(b, m.geometry, rel, pick, { world, flip, floorY });
      if (both) emitMesh(b, m.geometry, rel, pick, { world, flip: true, floorY });
      if (flip && m.geometry.type === 'BoxGeometry' && pieces) this.roomGlimpse(b, m, rel, mat);
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

  /**
   * The fountain's coping (a torus): the stone tile laid round the ring with
   * the geometry's own (u round the ring, v round the tube) coordinates, and
   * flesh spilling over the rim in a few places.
   */
  private coping(b: PwBatch, m: THREE.Mesh, rel: THREE.Matrix4) {
    const geo = m.geometry as THREE.TorusGeometry;
    const { radius: R, tube: r } = geo.parameters;
    const t = z2CopingTile(this.atlas, 0x8a867a);
    const reps = Math.max(1, Math.round((2 * Math.PI * R * PW_TPM) / t.w));
    const pos = geo.getAttribute('position');
    const uv = geo.getAttribute('uv');
    const idx = geo.index!;
    b.setMatrix(null);
    for (let i = 0; i + 2 < idx.count; i += 3) {
      const ia = idx.getX(i);
      const ib = idx.getX(i + 1);
      const ic = idx.getX(i + 2);
      _a.fromBufferAttribute(pos, ia).applyMatrix4(rel);
      _b.fromBufferAttribute(pos, ib).applyMatrix4(rel);
      _c.fromBufferAttribute(pos, ic).applyMatrix4(rel);
      b.tri(_a, _b, _c, t, [uv.getX(ia) * reps * t.w, uv.getY(ia) * t.h, uv.getX(ib) * reps * t.w, uv.getY(ib) * t.h, uv.getX(ic) * reps * t.w, uv.getY(ic) * t.h]);
    }
    // Flesh spilling over the rim: slanted flaps from the top of the coping down its outer side.
    _p.setFromMatrixPosition(rel);
    const top = _p.y + r;
    for (let k = 0; k < 7; k++) {
      const ang = 0.4 + k * 0.93 + hash2(k, 3, 17) * 0.4;
      const c = Math.cos(ang);
      const sn = Math.sin(ang);
      const tx = -sn;
      const tz = c;
      const w = 0.7 + hash2(k, 4, 17) * 0.5;
      const ri = R - 0.05;
      const ro = R + r + 0.06;
      _q[0].set(_p.x + c * ro + tx * (w / 2), _p.y - 0.24, _p.z + sn * ro + tz * (w / 2));
      _q[1].set(_p.x + c * ro - tx * (w / 2), _p.y - 0.24, _p.z + sn * ro - tz * (w / 2));
      _q[2].set(_p.x + c * ri - tx * (w / 2), top + 0.02, _p.z + sn * ri - tz * (w / 2));
      _q[3].set(_p.x + c * ri + tx * (w / 2), top + 0.02, _p.z + sn * ri + tz * (w / 2));
      const d = z2FleshDrape(this.atlas, k % 3);
      b.quad(_q[0], _q[1], _q[2], _q[3], d, [0, 0, d.w, 0, d.w, d.h, 0, d.h]);
    }
  }

  /**
   * The gas / oxygen cylinders (Destructibles: every mesh is a hit box) painted
   * on their own triangles: the body wrapped in its cylinder tile (u round the
   * turn, v up), the shoulder / valve / base an enamel in their baked colour.
   */
  paintTank(root: THREE.Object3D, kind: 'gas' | 'oxygen') {
    if (!this.atlas.built) return;
    const body = z2CylTile(this.atlas, kind, kind === 'gas' ? 0xc22a1e : 0x1f8a3c);
    const enamel = z2EnamelTile(this.atlas, { hex: NEUTRAL_HEX });
    const y0 = kind === 'gas' ? 0.02 : 0.025;
    const y1 = kind === 'gas' ? 1.22 : 1.175;
    const mat = pwMaterial(this.atlas);
    _base.setHex(NEUTRAL_HEX);
    root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh || !(m.material as THREE.MeshLambertMaterial).isMeshLambertMaterial || (m.material as THREE.Material).userData.pixelWorld) return;
      const g = m.geometry;
      const pos = g.getAttribute('position');
      const col0 = g.getAttribute('color');
      const n = pos.count;
      const uv = new Float32Array(n * 2);
      const rect = new Int16Array(n * 4);
      const col = new Uint8Array(n * 3);
      const index = g.index;
      const tris = index ? index.count : n;
      for (let i = 0; i + 2 < tris; i += 3) {
        const v = [index ? index.getX(i) : i, index ? index.getX(i + 1) : i + 1, index ? index.getX(i + 2) : i + 2];
        _a.fromBufferAttribute(pos, v[0]);
        _b.fromBufferAttribute(pos, v[1]);
        _c.fromBufferAttribute(pos, v[2]);
        _e1.subVectors(_b, _a);
        _e2.subVectors(_c, _a);
        _n.crossVectors(_e1, _e2).normalize();
        const cy = (_a.y + _b.y + _c.y) / 3;
        const side = Math.abs(_n.y) < 0.5 && cy > y0 && cy < y1;
        const us = [0, 0, 0];
        for (let kk = 0; kk < 3; kk++) {
          const p = kk === 0 ? _a : kk === 1 ? _b : _c;
          us[kk] = ((Math.atan2(p.x, p.z) / (Math.PI * 2)) + 1) % 1 * body.w;
        }
        if (Math.max(...us) - Math.min(...us) > body.w / 2) for (let kk = 0; kk < 3; kk++) if (us[kk] < body.w / 2) us[kk] += body.w;
        for (let kk = 0; kk < 3; kk++) {
          const vi = v[kk];
          const p = kk === 0 ? _a : kk === 1 ? _b : _c;
          if (side) {
            uv[vi * 2] = us[kk];
            uv[vi * 2 + 1] = (p.y - y0) * PW_TPM;
            rect.set([body.x, body.y, body.w, body.h], vi * 4);
            col.set([255, 255, 255], vi * 3);
          } else {
            const [pu, pv] = planarUv(p, _n, PW_TPM);
            uv[vi * 2] = pu;
            uv[vi * 2 + 1] = pv;
            rect.set([enamel.x, enamel.y, enamel.w, enamel.h], vi * 4);
            if (col0) _col.setRGB(col0.getX(vi), col0.getY(vi), col0.getZ(vi));
            else _col.copy((m.material as THREE.MeshLambertMaterial).color);
            col.set([Math.round(Math.min(1, _col.r / _base.r) * 255), Math.round(Math.min(1, _col.g / _base.g) * 255), Math.round(Math.min(1, _col.b / _base.b) * 255)], vi * 3);
          }
        }
      }
      g.setAttribute('pwUv', new THREE.BufferAttribute(uv, 2));
      g.setAttribute('pwRect', new THREE.BufferAttribute(rect, 4));
      g.setAttribute('color', new THREE.BufferAttribute(col, 3, true));
      m.material = mat;
    });
  }

  /**
   * The boiler wall's blocks (flyers when the brute bursts it; never hit
   * boxes): each block's faces painted on its own triangles — the wall's
   * painted block face across the front and back (continuous over the wall:
   * u / v from the block's place in it), the broken core on its edges.
   */
  paintWall(w: { pieces: THREE.Mesh[] } | null) {
    if (!w || !this.atlas.built) return;
    const mat = pwMaterial(this.atlas);
    const core = z2RubbleTile(this.atlas);
    for (const p of w.pieces) {
      const lm = p.material as THREE.MeshLambertMaterial;
      const face = this.pickFor('brick', 'brick|1.25|0.5', lm.color.getHex(), 'side');
      if (!face) continue;
      const g = (p.geometry = p.geometry.clone());
      const pos = g.getAttribute('position');
      const nrm = g.getAttribute('normal');
      const n = pos.count;
      const uv = new Float32Array(n * 2);
      const rect = new Int16Array(n * 4);
      const col = new Uint8Array(n * 3);
      _col.setHex(face.tint);
      for (let i = 0; i < n; i++) {
        _a.fromBufferAttribute(pos, i);
        const front = Math.abs(nrm.getZ(i)) > 0.7;
        const t = front ? face.tile : core;
        // Wall coordinates: the block's place in the wall (holder frame) + its own offset.
        const wx = _a.x + p.position.x;
        const wy = _a.y + p.position.y;
        uv[i * 2] = (front ? (nrm.getZ(i) > 0 ? wx : -wx) : nrm.getX(i) !== 0 ? _a.z * Math.sign(nrm.getX(i)) : wx) * PW_TPM;
        uv[i * 2 + 1] = (Math.abs(nrm.getY(i)) > 0.7 ? _a.z : wy) * PW_TPM;
        rect.set([t.x, t.y, t.w, t.h], i * 4);
        if (front) col.set([Math.round(_col.r * 255), Math.round(_col.g * 255), Math.round(_col.b * 255)], i * 3);
        else col.set([255, 255, 255], i * 3);
      }
      g.setAttribute('pwUv', new THREE.BufferAttribute(uv, 2));
      g.setAttribute('pwRect', new THREE.BufferAttribute(rect, 4));
      g.setAttribute('color', new THREE.BufferAttribute(col, 3, true));
      p.material = mat;
    }
  }

  /**
   * A dark side room seen through a doorway (a BackSide box): a moonlit window
   * on each of its long inner walls, so the doorway shows a room, not a void.
   */
  private roomGlimpse(b: PwBatch, m: THREE.Mesh, rel: THREE.Matrix4, mat: THREE.MeshLambertMaterial) {
    _col.setHex(mat.color.getHex());
    if (_col.r + _col.g + _col.b > 0.12 * 3) return;
    if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
    const bx = _box.copy(m.geometry.boundingBox!).applyMatrix4(rel);
    const sx = bx.max.x - bx.min.x;
    const sz = bx.max.z - bx.min.z;
    const sy = bx.max.y - bx.min.y;
    if (sy < 2 || Math.max(sx, sz) < 2.4) return;
    const t = nightWindow(this.atlas, Math.round(bx.min.x + bx.min.z) & 1);
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

  private scatter(b: PwBatch, pieces: Piece[], zone: string, floorY: number) {
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
              if (h < 0.018) this.dangle(b, _mm.makeTranslation(gx + 0.5, y, gz + 0.5), gx & 1);
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
      if (p.kind === 'wallLo' && !ext) this.brokenTiles(b, p, alongX, len, floorY);
      if (!ext && (p.kind === 'wallHi' || p.kind === 'wallLo')) this.bandDecals(b, p, alongX, len);
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

  /**
   * A roofline that breaks the box against the sky: a brick parapet over the
   * wall's top, a lit coping, and rooftop clutter (AC units, vent stacks, a
   * water tank, a mast with a beacon, a stair house, a dish) standing behind it.
   * `axis` z: a facade at z = `face` facing +z, from a0 to a1 along x; x: a side
   * face at x = `face` facing +x, from a0 to a1 along z.
   */
  private roofline(b: PwBatch, a0: number, a1: number, top: number, face: number, axis: 'x' | 'z') {
    const a = this.atlas;
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

  /**
   * Grime by rule along a wall: under the ceiling line (upper walls) and mop
   * splash above the skirting (wainscots), in 3 m slots, each with its own hash
   * and flip — the dirt never repeats with the wall's tile.
   */
  private bandDecals(b: PwBatch, p: Piece, alongX: boolean, len: number) {
    const bx = p.box;
    const hi = p.kind === 'wallHi';
    const slots = Math.floor(len / 3);
    for (let i = 0; i < slots; i++) {
      for (const side of [1, -1]) {
        const h = hash2(Math.round((alongX ? bx.min.x : bx.min.z) * 3) + i * 11, side + Math.round((alongX ? bx.min.z : bx.min.x) * 3), hi ? 81 : 83);
        if (h > (hi ? 0.5 : 0.4)) continue;
        const t = hi ? ceilingGrimeDecal(this.atlas, i & 1) : mopSplashDecal(this.atlas, i & 1);
        const w = t.w / PW_TPM;
        const hh = t.h / PW_TPM;
        if (w > len - 0.2) continue;
        const along = 0.1 + hash2(i, side, 85) * (len - w - 0.2);
        const y0 = hi ? bx.max.y - hh - 0.01 : bx.min.y + 0.15;
        const fc = alongX ? (side > 0 ? bx.max.z : bx.min.z) : side > 0 ? bx.max.x : bx.min.x;
        const off = 0.007 + (this.nDecal++ % 3) * 0.002;
        const ux = alongX ? (side > 0 ? X : NX) : side > 0 ? NZ : Z;
        const start = alongX ? (side > 0 ? bx.min.x : bx.max.x) : side > 0 ? bx.max.z : bx.min.z;
        if (alongX) _o.set(start + (side > 0 ? along : -along), y0, fc + side * off);
        else _o.set(fc + side * off, y0, start + (side > 0 ? -along : along));
        b.rect(_o, ux, Y, w, hh, t, { tint: decalTint(t, p.hex), flipU: h < 0.2 });
      }
    }
  }

  /** Knocked-off / cracked glazed tiles, snapped to the wall's tile grid (world-mapped from the floor). */
  private brokenTiles(b: PwBatch, p: Piece, alongX: boolean, len: number, floorY: number) {
    const spec = GLAZED[p.hex] ?? {};
    const tw = (spec.tw ?? 8) / PW_TPM;
    const th = (spec.th ?? 8) / PW_TPM;
    const bx = p.box;
    const n = Math.floor(len / 5);
    for (let i = 0; i < n; i++) {
      const h = hash2(Math.round(bx.min.x * 3) + i * 13, Math.round(bx.min.z * 3), 61);
      if (h > 0.35) continue;
      const t = brokenTilesDecal(this.atlas, Math.round(tw * PW_TPM), Math.round(th * PW_TPM), i & 1);
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

  pickFor(tex: TexName | undefined, preset: string, hex: number, face: 'up' | 'down' | 'side'): Pick | null {
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
        if (hex === 0xc8c8be) return own(fasciaTile(a, hex));
        return neutral(z2PaintTile(a, { hex: NEUTRAL_HEX }));
      case 'wallpaper|1|0.4':
        if (hex === 0x8e8670) return own(z2WallpaperTile(a, { hex }));
        // (The dark side rooms behind doors: the painted plaster reads the same in there.)
        return neutral(z2PaintTile(a, { hex: NEUTRAL_HEX }));
      case 'wallpaper|0.7|0.55':
        return neutral(z2CurtainTile(a, { hex: NEUTRAL_HEX }));
      case 'brick|1.25|0.5':
        if (hex === 0x3f5a4e || hex === 0x6a6c66) return own(z2BlockTile(a, { hex }));
        return neutral(z2BlockTile(a, { hex: NEUTRAL_HEX }));
      case 'brick|0.8|0.85':
        return neutral(brickTile(a, { hex: NEUTRAL_BRICK, grime: 0.7 }), NEUTRAL_BRICK);
      case 'concrete|1|0.8':
        if (hex === 0x4e4a44 && face === 'side') return own(z2StonePanelTile(a, { hex }));
        if (hex === 0x66665e && face === 'up') return neutral(z2ConcreteTile(a, { hex: NEUTRAL_HEX, joints: true }));
        if (hex === 0xa8a89e && face === 'side') return own(columnTile(a, hex));
        if (hex === 0x8a8a80) return own(curbTile(a, { hex }));
        return neutral(z2ConcreteTile(a, { hex: NEUTRAL_HEX, joints: true }));
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
        return own(z2WetAsphaltTile(a, 0x3a3e46));
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
        return neutral(z2EnamelTile(a, { hex: NEUTRAL_HEX }));
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
      if (BLOOD_HEX.has(hex)) return own(z2BloodTile(a, { hex }));
      return neutral(z2PlainTile(a, { hex: NEUTRAL_HEX }));
    }
    if (tex === 'water') return own(z2PlainTile(a, { hex }));
    return neutral(z2PlainTile(a, { hex: NEUTRAL_HEX }));
  }
}

/** Level bias of the tileable surfaces: their calm levels a step sooner (nothing crawls in motion). */
const Z2_SURF_BIAS = 1.0;
/** Level bias of signs: level 0 a little longer (letters stay whole at a distance). */
const Z2_SIGN_BIAS = -0.25;

/**
 * One painted zone mesh, up to three draws: its triangles re-ordered into
 * modules (`mods`), tileable surfaces (`surf`) and signs (`sign`), as
 * geometry groups.
 */
function splitMaterials(m: THREE.Mesh, mods: THREE.Material, surf: THREE.Material, sign: THREE.Material, signs: Set<number>) {
  const g = m.geometry;
  const idx = g.index!;
  const rect = g.getAttribute('pwRect');
  const parts: number[][] = [[], [], []];
  for (let t = 0; t < idx.count; t += 3) {
    const v = idx.getX(t);
    const k = rect.getZ(v) > 0 ? 1 : signs.has(rect.getX(v) * 65536 + rect.getY(v)) ? 2 : 0;
    parts[k].push(v, idx.getX(t + 1), idx.getX(t + 2));
  }
  const mats = [mods, surf, sign];
  const used = [0, 1, 2].filter((k) => parts[k].length);
  if (used.length === 1) {
    m.material = mats[used[0]];
    return;
  }
  const all = used.flatMap((k) => parts[k]);
  g.setIndex(g.getAttribute('position').count > 65535 ? new THREE.Uint32BufferAttribute(all, 1) : new THREE.Uint16BufferAttribute(all, 1));
  g.clearGroups();
  let start = 0;
  used.forEach((k, gi) => {
    g.addGroup(start, parts[k].length, gi);
    start += parts[k].length;
  });
  m.material = used.map((k) => mats[k]);
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

/** Mark a tile NEUTRAL (painted round `base`) and return it. */
function neutral0(t: PwTile, base: number): PwTile {
  t.neutral = base;
  return t;
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
const WORDS = ['HELP US', 'IT HUNGERS', 'RUN'];

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
const GLAZED: Record<number, { tw?: number; th?: number; bond?: boolean; grime?: number; grout?: number; calm?: boolean; foot?: boolean }> = {
  0x2a6258: { grime: 0.6 },
  0x2e6a5e: { grime: 0.5 },
  0x587478: { tw: 16, th: 12, grime: 0.8 },
  0x9fb2b4: { tw: 16, th: 12, grime: 0.4, grout: 0x7a8486, foot: false },
  0x2a6a56: { tw: 16, th: 16, grime: 0.5, calm: true },
  0x3a7462: { grime: 0.45, calm: true, foot: false },
};

/** Blood colours (C.blood, C.bloodFresh, C.bloodDark, the flesh-dark smears). */
const BLOOD_HEX = new Set([0x5c0909, 0x7e0d0d, 0x3a0505]);

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
void CYL_SIZE;
