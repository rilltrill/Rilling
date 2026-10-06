import * as THREE from 'three';
import type { Environment } from '../../../gameplay/StageTypes';
import type { World } from '../../../gameplay/World';
import { Destructible } from '../../../gameplay/Props';
import type { ShotHit, ShotOutcome } from '../../../gameplay/Entity';
import { EnvKit } from '../../kit/EnvKit';
import { Kit } from '../../kit/ModelKit';
import { Rng } from '../../../core/Rng';
import { clamp, smoothstep } from '../../../core/math';
import { Baker, Sink, type Prefab } from './bake';
import { Flora } from './flora';
import { Storm, STORM } from './weather';
import { Fire } from './fire';
import * as P from './props';
import { ditherPool, radialGeometry, retroHook, tx, type TexSpec } from './retro';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { D, GORGE_DEPTH, ROAD_HALF, railHeading, railLength, railPoint } from './layout';
import { FloraField, floraArtToggle, floraAtlas, floraReach } from '../../pixel/floraField';
import { D3_BIOME } from '../../pixel/floraBiomes';
import { BUSH, BUSH_WIDE, EAR, FERN, FERN_WIDE, JUNGLE_TREE, PALM } from '../../pixel/floraSpecies';
import { pixelWorld } from '../../../core/art';
import { D3PixelWorld, type TerrainKind } from './pixel';

/**
 * TYRANT CHASE environment — the park at night in a violent thunderstorm.
 *
 * Wet road through a rainforest of swaying palms; the T-rex paddock's torn
 * high-voltage fence (sparking cables, giant footprints across the road); the
 * dark visitor centre with its torn banners; a roadblock (overturned tour car,
 * fuel drums); a flooded mud stretch with a stuck utility truck; a wooden
 * trestle bridge over a river gorge (collapses on cue); and the helipad with
 * the rescue helicopter, blinking edge lights and a fuel tank for the finale.
 *
 * Static scenery is baked per 40 m chunk / side / band into a few vertex-
 * coloured meshes (see bake.ts) and hidden when beyond the fog.
 */

const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const _c = new THREE.Color();
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();

const FOG_NEAR = 7;
const FOG_FAR = 80;
const CHUNK = 60;

/** ART: SPRITES plants (pixel billboards) painted for this stage. */
const D3_FLORA = [JUNGLE_TREE, PALM, FERN, FERN_WIDE, BUSH, BUSH_WIDE, EAR];
/** What a vegetation prefab is in ART: SPRITES: species, size of the 3D plant (m: height, rotation-independent width), sway (m at the top), forced variants. */
interface FloraTag {
  key: string;
  h: number;
  w: number;
  sway: number;
  variants?: number[];
}
const floraTags = new WeakMap<Prefab, FloraTag>();
/** PIXEL WORLD: the size of a rock prefab (its boulder billboard). */
const rockTags = new WeakMap<Prefab, { w: number; h: number; y0: number }>();
const _box = new THREE.Box3();
const _origin = new THREE.Vector3();

let current: ParkEnv | null = null;

/** The live environment (set when the stage builds) — beats and the boss use it for set pieces. */
export function park(): ParkEnv | null {
  return current;
}

export function buildPark(world: World): Environment {
  current?.disposeSelf();
  const env = new ParkEnv(world);
  current = env;
  return env.environment;
}

const band = (x: number, a: number, b: number, edge: number) => smoothstep(a - edge, a, x) * (1 - smoothstep(b, b + edge, x));

/** Terrain height at rail distance d, `lat` metres right of the rail. */
export function terrainHeight(d: number, lat: number): number {
  const a = Math.abs(lat);
  const n1 = Math.sin(d * 0.023 + lat * 0.031) * 0.5 + Math.sin(d * 0.051 - lat * 0.07 + 1.7) * 0.3 + Math.sin(d * 0.11 + lat * 0.13) * 0.2;
  let hills = smoothstep(15, 50, a) * (3.5 + 3.5 * n1) + smoothstep(50, 95, a) * 6;
  hills += smoothstep(9, 22, a) * 0.35 * Math.sin(d * 0.31 + lat * 0.47) * Math.cos(d * 0.17 - lat * 0.29);
  let flat = 0;
  flat = Math.max(flat, band(d, 152, 218, 12) * band(lat, -62, 0, 10));
  flat = Math.max(flat, band(d, 522, 600, 12) * band(lat, -34, 34, 10));
  if (lat > 0) flat = Math.max(flat, 0.55 * band(d, 0, 124, 12));
  let h = hills * (1 - flat);
  const g = band(d, D.GORGE_FROM, D.GORGE_TO, 3.2);
  if (g > 0) {
    const bed = -GORGE_DEPTH + 0.6 * Math.sin(lat * 0.21 + d * 0.3);
    h = h + (bed - h) * g;
  }
  return h;
}

/** A fuel tank that only becomes vulnerable for the finale. */
export class FuelTank extends Destructible {
  armed = false;
  override onShot(hit: ShotHit): ShotOutcome {
    if (!this.armed) {
      this.world.fx.sparks(hit.point, hit.normal, 3);
      this.world.audio.play('hit_armor', { volume: 0.5, vary: 0.2 });
      return { kind: 'prop', counts: true };
    }
    return super.onShot(hit);
  }
}

interface Blinker {
  obj: THREE.Object3D;
  period: number;
  duty: number;
  phase: number;
}

interface FallingPiece {
  obj: THREE.Object3D;
  t0: number;
  vel: THREE.Vector3;
  spin: THREE.Vector3;
  splashed: boolean;
  started: boolean;
}

export class ParkEnv {
  readonly root = new THREE.Group();
  readonly environment: Environment;
  readonly baker = new Baker();
  readonly flora = new Flora();
  readonly storm: Storm;
  readonly hemi: THREE.HemisphereLight;
  readonly moon: THREE.DirectionalLight;
  readonly fog: THREE.Fog;
  /** The one movable accent light (sparks, beacons, fires). */
  readonly point: THREE.PointLight;
  private len: number;
  private time = 0;
  private cullT = 0;
  private culled: THREE.Mesh[] = [];
  // Rail samples for world → (d, lat) projection.
  private sx: Float32Array;
  private sz: Float32Array;
  private sd0 = -80;
  private sStep = 1;
  private puddleMat: THREE.MeshLambertMaterial;
  private poolMat: THREE.MeshBasicMaterial;
  /** Lamp light-pool disc with the radial `aR` attribute (dithered falloff). */
  private poolGeo: THREE.BufferGeometry;
  private blinkers: Blinker[] = [];
  private flickers: { obj: THREE.Object3D; seed: number }[] = [];
  // Paddock.
  private sparkPts: THREE.Vector3[] = [];
  private sparkGlows: THREE.Mesh[] = [];
  private sparkT = 0;
  // Visitor centre.
  private visitor!: P.VisitorParts;
  private doorsT = -1;
  private doorVel: THREE.Vector3[] = [];
  // Roadblock.
  private car = new THREE.Group();
  private carInner = new THREE.Group();
  private palmLog = new THREE.Group();
  private horses: THREE.Group[] = [];
  private drums: Destructible[] = [];
  private blastT = -1;
  private carVel = new THREE.Vector3();
  private carSpin = 0;
  private carLanded = false;
  private logVel = 0;
  // Mud.
  mud = false;
  /** World position (feet) on the stuck truck's flatbed, where the worker waits to be rescued. */
  readonly mudPerch = new THREE.Vector3();
  private mudT = 0;
  private revT = 0;
  // Bridge.
  private bridgeSegs: THREE.Group[] = [];
  private towers: THREE.Group[] = [];
  private falling: FallingPiece[] = [];
  private collapseT = -1;
  bridgeDown = false;
  /** The intact bridge baked as one piece (a few draw calls); swapped for the loose pieces when it collapses. */
  private bridgeWhole = new THREE.Group();
  // Helipad.
  private pad!: P.HelipadParts;
  private heli!: P.HeliParts;
  private heliSpin = 0.4;
  private heliTarget = 0.4;
  tank: FuelTank | null = null;
  private tankPos = new THREE.Vector3();
  /** Called when the fuel tank explodes (boss hooks this). */
  onTankBlast: ((p: THREE.Vector3) => void) | null = null;
  private fires: { fire: Fire; pos: THREE.Vector3 }[] = [];
  private padBarrels: Destructible[] = [];
  private groups = new Map<string, THREE.Group>();
  private sinks = new Map<string, Sink>();
  /**
   * ART: SPRITES vegetation: every plant as a hand-pixelled billboard (one
   * instanced draw, swaying with the storm's wind). The 3D vegetation sinks go
   * under `veg3D`; `vegPx` holds the billboards and the roadside rocks (baked
   * from `pxSinks`); the ART setting shows one or the other, live.
   */
  private flora2d: FloraField;
  private veg3D = new THREE.Group();
  private vegPx = new THREE.Group();
  private pxSinks = new Map<string, Sink>();
  private untoggle: (() => void) | null = null;
  private plazaPalms: Prefab[] = [];
  /** Optional per-frame hook for the jeep view model (set by the stage). */
  onUpdate: ((dt: number) => void) | null = null;
  /** ART: PIXEL WORLD painter (null in CLASSIC / PIXEL CAST: those build exactly as before). */
  private pw: D3PixelWorld | null = null;
  /** Night readability: the accent light trails the compy pack in the fence / plaza fights. */
  private packPos = new THREE.Vector3();
  private packBlend = 0;

  constructor(readonly world: World) {
    this.len = railLength();
    const scene = world.scene;
    const q = world.settings.quality === 'high' ? 2 : world.settings.quality === 'medium' ? 1 : 0;
    scene.background = new THREE.Color(STORM.fog);
    this.fog = new THREE.Fog(STORM.fog, FOG_NEAR, FOG_FAR);
    scene.fog = this.fog;
    const lights = EnvKit.lights(this.root, {
      sky: STORM.hemiSky,
      ground: STORM.hemiGround,
      hemi: STORM.hemi,
      sun: STORM.moon,
      sunIntensity: STORM.moonI,
      sunDir: [-0.5, 0.9, 0.35],
    });
    this.hemi = lights.hemi;
    this.moon = lights.sun;
    this.point = new THREE.PointLight(0xffffff, 0, 26, 1.6);
    this.root.add(this.point);
    this.storm = new Storm(this.hemi, this.moon, this.fog, q);
    this.storm.groundAt = (x, z) => this.groundAt(x, z);
    this.root.add(this.storm.group);
    if (pixelWorld(world)) {
      // PIXEL WORLD: the painted storm panorama replaces the sky dome; the strikes draw painted forks.
      const pw = (this.pw = new D3PixelWorld());
      this.baker.pixel = true;
      this.root.add(pw.buildBackdrop(railPoint(this.len / 2, new THREE.Vector3())));
    }
    this.flora2d = new FloraField(floraAtlas(D3_FLORA, D3_BIOME, 'd3'), {
      far: FOG_FAR + 8,
      rim: 0x8aa4d8,
      rimStrength: 0.22,
      // Matched to the 3D storm vegetation's brightness; headlights / beacons tint, never bleach.
      gain: 0.74,
      localCap: 0.3,
      time: this.baker.uniforms.uTime,
      wind: this.baker.uniforms.uWind,
    });
    this.veg3D.name = 'd3-veg3d';
    this.vegPx.name = 'd3-vegPx';
    this.root.add(this.veg3D, this.vegPx);

    // Rain-rippled water: the ripple texture modulates the sky-sheen emissive
    // too (it flashes with the lightning), so puddles never read as flat decals.
    this.puddleMat = retroHook(
      Kit.track(new THREE.MeshLambertMaterial({ color: 0x2a3850, emissive: new THREE.Color(0x0c1426), flatShading: true })),
      // (strength > 1 over-drives the ripple contrast so it survives the CRT's colour quantisation)
      { mode: 'uniform', spec: { name: 'water', scale: 1.6, strength: 1.8 }, emissive: true },
    );
    this.poolMat = ditherPool(
      Kit.track(
        new THREE.MeshBasicMaterial({ color: 0xffb860, transparent: true, opacity: 0.15, depthWrite: false, fog: true, blending: THREE.AdditiveBlending }),
      ),
    );
    this.poolGeo = radialGeometry(Kit.cyl(3.4, 3.4, 0.02, 14), 3.4);

    // Rail samples.
    const n = Math.ceil((this.len + 160) / this.sStep);
    this.sx = new Float32Array(n);
    this.sz = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      this.frameXZ(this.sd0 + i * this.sStep, _v);
      this.sx[i] = _v.x;
      this.sz[i] = _v.z;
    }

    this.buildTerrain();
    this.buildRoad();
    this.buildVegetation();
    this.buildPaddock();
    this.buildLamps();
    this.buildVisitorCentre();
    this.buildRoadblock();
    this.buildMud();
    this.buildBridge();
    this.buildHelipad();
    // PIXEL WORLD: the boss stretch's set dressing (painted only).
    this.pw?.bossDressing((d, lat) => this.at(d, lat, 0), (d) => this.heading(d));
    this.spawnTank(world);
    for (const g of this.groups.values()) this.commit(g);
    for (const sink of this.sinks.values()) {
      for (const m of sink.build(this.baker)) {
        this.veg3D.add(m);
        this.culled.push(m);
      }
    }
    for (const sink of this.pxSinks.values()) {
      for (const m of sink.build(this.baker)) {
        this.vegPx.add(m);
        this.culled.push(m);
      }
    }
    this.vegPx.add(this.flora2d.build());
    this.untoggle = floraArtToggle(scene, [this.vegPx], [this.veg3D]);
    if (this.pw) {
      const pw = this.pw;
      pw.finish(this.root, this.culled, this.vegPx);
      this.storm.usePixelSky(pw.boltMat, (i) => pw.boltGeometry(i));
    }

    scene.add(this.root);
    // Per-occluder bullet-impact surfaces.
    for (const m of this.visitor.shell.children) m.userData.surface = 'concrete';
    this.car.traverse((o) => (o.userData.surface = 'metal'));

    this.environment = {
      root: this.root,
      occluders: [...this.visitor.shell.children, this.car],
      groundAt: (x, z) => this.groundAt(x, z),
      surface: 'dirt',
      update: (dt, w) => this.update(dt, w),
      dispose: () => this.disposeSelf(),
    };
  }

  disposeSelf() {
    if (current === this) current = null;
    this.untoggle?.();
    this.untoggle = null;
    this.onTankBlast = null;
    this.onUpdate = null;
  }

  // ─── Rail geometry helpers ────────────────────────────────────────────────

  /** Rail XZ at d, extrapolated straight beyond both ends. */
  frameXZ(d: number, out: THREE.Vector3): THREE.Vector3 {
    const dd = clamp(d, 0, this.len);
    railPoint(dd, out);
    if (d !== dd) {
      const h = railHeading(dd);
      const k = d - dd;
      out.x += -Math.sin(h) * k;
      out.z += -Math.cos(h) * k;
    }
    out.y = 0;
    return out;
  }

  /** World point beside the rail on the terrain (+up). */
  at(d: number, lat: number, up = 0, out = new THREE.Vector3()): THREE.Vector3 {
    this.frameXZ(d, out);
    const h = railHeading(clamp(d, 0, this.len));
    out.x += Math.cos(h) * lat;
    out.z += -Math.sin(h) * lat;
    out.y = terrainHeight(d, lat) + up;
    return out;
  }

  heading(d: number): number {
    return railHeading(clamp(d, 0, this.len - 0.01));
  }

  /** Place `o` beside the rail at (d, lat), yawed to the rail + `yaw`, on the terrain. */
  place(o: THREE.Object3D, d: number, lat: number, yaw = 0, up = 0): THREE.Object3D {
    this.at(d, lat, up, o.position);
    o.rotation.y = this.heading(d) + yaw;
    return o;
  }

  /** Yaw offset that turns an object's +Z toward the road from side `lat`. */
  static faceRoad(lat: number): number {
    return lat < 0 ? Math.PI / 2 : -Math.PI / 2;
  }

  /** World (x, z) → rail distance + lateral offset (nearest rail sample). */
  project(x: number, z: number): { d: number; lat: number } {
    const n = this.sx.length;
    let best = 0;
    let bd = Infinity;
    for (let i = 0; i < n; i += 8) {
      const dx = x - this.sx[i];
      const dz = z - this.sz[i];
      const dd = dx * dx + dz * dz;
      if (dd < bd) {
        bd = dd;
        best = i;
      }
    }
    const lo = Math.max(0, best - 8);
    const hi = Math.min(n - 1, best + 8);
    for (let i = lo; i <= hi; i++) {
      const dx = x - this.sx[i];
      const dz = z - this.sz[i];
      const dd = dx * dx + dz * dz;
      if (dd < bd) {
        bd = dd;
        best = i;
      }
    }
    const d = this.sd0 + best * this.sStep;
    const h = railHeading(clamp(d, 0, this.len - 0.01));
    const dx = x - this.sx[best];
    const dz = z - this.sz[best];
    return { d: d + (-dx * Math.sin(h) - dz * Math.cos(h)), lat: dx * Math.cos(h) - dz * Math.sin(h) };
  }

  groundAt(x: number, z: number): number {
    const { d, lat } = this.project(x, z);
    if (!this.bridgeDown && d > D.BRIDGE_FROM - 1 && d < D.BRIDGE_TO + 1 && Math.abs(lat) < ROAD_HALF + 0.6) return 0;
    if (d > D.PAD - D.PAD_HALF && d < D.PAD + D.PAD_HALF && Math.abs(lat) < D.PAD_HALF) return 0.28;
    return terrainHeight(d, lat);
  }

  // ─── Builders ─────────────────────────────────────────────────────────────

  /** Static-prop chunk group for rail distance d (baked together at the end of the build). */
  private propChunk(d: number): THREE.Group {
    return this.chunkGroup(`p${Math.floor(d / CHUNK)}`);
  }

  /** Vegetation sink (prefab placements) for rail distance d on one side. */
  private vegSink(d: number, _side: number): Sink {
    // Both roadsides share a sink per chunk: they're almost always on screen
    // together, and it halves the vegetation draw calls.
    const key = `v${Math.floor(d / CHUNK)}`;
    let s = this.sinks.get(key);
    if (!s) {
      s = new Sink();
      this.sinks.set(key, s);
    }
    return s;
  }

  /**
   * ART: SPRITES stand-in for a vegetation prefab placed at `pos` (foot) with
   * uniform `scale`: a pixel billboard for a plant, or — for a rock — the same
   * prefab again in the SPRITES-only rock sink.
   */
  private floraPut(p: Prefab, d: number, pos: THREE.Vector3, scale: number) {
    const tag = floraTags.get(p);
    const rock = !tag && this.pw ? rockTags.get(p) : undefined;
    if (rock) {
      // PIXEL WORLD: a rock is a boulder billboard of its size.
      this.pw!.stone(pos.x, pos.y, pos.z, rock.w * scale, rock.h * scale);
      return;
    }
    if (!tag) {
      const key = `r${Math.floor(d / CHUNK)}`;
      let sk = this.pxSinks.get(key);
      if (!sk) this.pxSinks.set(key, (sk = new Sink()));
      sk.add(p, _m);
      return;
    }
    // A sprite whose aspect suits the 3D plant, never more than 1.15× as tall as it (see FloraField.fit).
    this.flora2d.fit(tag.key, pos.x, pos.y - 0.06, pos.z, tag.w * scale, tag.h * scale, {
      sway: tag.sway * scale,
      variants: tag.variants,
      aspectTol: tag.key === 'jungleTree' ? 2.2 : undefined,
    });
  }

  private chunkGroup(key: string): THREE.Group {
    let g = this.groups.get(key);
    if (!g) {
      g = new THREE.Group();
      g.name = key;
      this.groups.set(key, g);
    }
    return g;
  }

  /** Bake a group, add it to the root and register its meshes for fog culling. */
  private commit(g: THREE.Group, cull = true): THREE.Mesh[] {
    const meshes = this.baker.bake(g);
    this.root.add(g);
    if (cull) for (const m of meshes) this.culled.push(m);
    return meshes;
  }

  /** Merge the lamp light pools (keeps the radial `aR` attribute) and register them for culling. */
  private commitPools(g: THREE.Group) {
    g.updateMatrixWorld(true);
    const geos: THREE.BufferGeometry[] = [];
    for (const c of [...g.children]) {
      const m = c as THREE.Mesh;
      if (!m.isMesh || m.userData.noMerge) continue;
      geos.push(m.geometry.clone().applyMatrix4(m.matrixWorld));
      g.remove(m);
    }
    this.root.add(g);
    for (const c of g.children) {
      const m = c as THREE.Mesh;
      m.geometry.computeBoundingSphere();
    }
    if (!geos.length) return;
    const merged = mergeGeometries(geos, false);
    geos.forEach((x) => x.dispose());
    if (!merged) return;
    merged.computeBoundingSphere();
    const mesh = new THREE.Mesh(Kit.track(merged), this.poolMat);
    mesh.matrixAutoUpdate = false;
    g.add(mesh);
    this.culled.push(mesh);
  }

  /** Merge a single-material group (puddles, light pools) and register it for culling. */
  private commitMerged(g: THREE.Group) {
    EnvKit.mergeStatic(g);
    this.root.add(g);
    for (const c of g.children) {
      const m = c as THREE.Mesh;
      if (!m.isMesh) continue;
      m.geometry.computeBoundingSphere();
      if (!m.userData.noMerge) this.culled.push(m);
    }
  }

  private buildTerrain() {
    const cols = [-95, -72, -56, -44, -34, -26, -20, -15, -11.5, -8.5, -6.5, -5, -3.8, 0, 3.8, 5, 6.5, 8.5, 11.5, 15, 20, 26, 34, 44, 56, 72, 95];
    const rows: number[] = [];
    for (let d = -70; d <= this.len + 70; ) {
      rows.push(d);
      const nearGorge = (d > D.GORGE_FROM - 7 && d < D.GORGE_FROM + 3) || (d > D.GORGE_TO - 3 && d < D.GORGE_TO + 7);
      d += nearGorge ? 1 : 3;
    }
    // Grass / mud / rock picked per texel from per-vertex coverage through an
    // ordered dither (chunky 90s terrain blend) — still one draw call per chunk.
    const layers: [TexSpec, TexSpec, TexSpec] = [
      { name: 'grass', scale: 0.8, strength: 0.85 },
      { name: 'dirt', scale: 0.8, strength: 0.9 },
      { name: 'rock', scale: 0.55, strength: 0.95 },
    ];
    const mat = retroHook(Kit.track(new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true })), {
      mode: 'terrain',
      layers,
      ditherCells: 4,
    });
    // Textured mid-tones (lifted a touch so the verges never crush to black through the CRT pass).
    const mud = new THREE.Color(0x4a3d2e);
    const grass = new THREE.Color(0x34492d);
    const hill = new THREE.Color(0x263f28);
    const rock = new THREE.Color(0x54524a);
    const bed = new THREE.Color(0x2c3632);
    const plaza = new THREE.Color(0x3a3a34);
    const mudDeep = new THREE.Color(0x33281c);
    const perChunk = 34;
    for (let r0 = 0; r0 < rows.length - 1; r0 += perChunk) {
      const r1 = Math.min(rows.length - 1, r0 + perChunk);
      const pos: number[] = [];
      const col: number[] = [];
      const tw: number[] = [];
      const idx: number[] = [];
      const nc = cols.length;
      for (let r = r0; r <= r1; r++) {
        const d = rows[r];
        for (const lat of cols) {
          this.at(d, lat, 0, _v);
          pos.push(_v.x, _v.y, _v.z);
          const a = Math.abs(lat);
          const y = _v.y;
          _c.copy(grass).lerp(mud, 1 - smoothstep(8, 17, a)).lerp(hill, smoothstep(20, 45, a));
          if (y < -1) _c.lerp(rock, clamp(-y / 5, 0, 1));
          if (y < -GORGE_DEPTH + 2) _c.lerp(bed, 0.7);
          if (d > D.MUD_FROM - 4 && d < D.MUD_TO + 4 && a < 12) _c.lerp(mudDeep, 0.7 * (1 - smoothstep(6, 12, a)));
          if (lat < -4 && lat > -26 && d > 160 && d < 208) _c.lerp(plaza, 0.5);
          const k = 0.9 + 0.2 * Math.sin(d * 1.37 + lat * 2.11) * Math.cos(d * 0.71 - lat * 1.3);
          col.push(_c.r * k, _c.g * k, _c.b * k);
          // Texture coverage: churned mud along the verges / mud stretch / plaza, rock in the gorge.
          let dirt = 1 - smoothstep(6.5, 13, a);
          if (d > D.MUD_FROM - 6 && d < D.MUD_TO + 6) dirt = Math.max(dirt, 1 - smoothstep(9, 15, a));
          if (lat < -4 && lat > -26 && d > 160 && d < 208) dirt = Math.max(dirt, 0.65);
          const blot = Math.sin(d * 0.37 + lat * 0.53) * Math.sin(d * 0.21 - lat * 0.41);
          dirt = clamp(dirt + blot * 0.25 * (1 - smoothstep(14, 30, a)), 0, 1);
          let rockW = y < -0.6 ? clamp((-y - 0.6) / 3.5, 0, 1) : 0;
          rockW = Math.max(rockW, smoothstep(0.55, 0.85, blot) * smoothstep(26, 50, a) * 0.8);
          tw.push(dirt, rockW);
        }
      }
      if (this.pw) {
        // PIXEL WORLD: the same grid, painted (a tile per cell from its coverage, the classic colour as a tint).
        this.pixelTerrain(pos, col, tw, rows, cols, r0, r1);
        continue;
      }
      for (let r = 0; r < r1 - r0; r++) {
        for (let c = 0; c < nc - 1; c++) {
          const a = r * nc + c;
          const b = a + 1;
          const cc = a + nc;
          const dd = cc + 1;
          // Rows advance along -Z-ish (forward); columns left → right. Faces +Y.
          idx.push(a, cc, b, b, cc, dd);
        }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      g.setAttribute('aTexW', new THREE.Float32BufferAttribute(tw, 2));
      g.setIndex(idx);
      g.computeVertexNormals();
      // Ensure upward facing (flip if the winding came out downward).
      const nrm = g.attributes.normal as THREE.BufferAttribute;
      let up = 0;
      for (let i = 0; i < nrm.count; i += 17) up += nrm.getY(i);
      if (up < 0) {
        const ix = g.index!;
        for (let i = 0; i < ix.count; i += 3) {
          const t = ix.getX(i + 1);
          ix.setX(i + 1, ix.getX(i + 2));
          ix.setX(i + 2, t);
        }
        g.computeVertexNormals();
      }
      g.computeBoundingSphere();
      const m = new THREE.Mesh(Kit.track(g), mat);
      m.matrixAutoUpdate = false;
      this.root.add(m);
      this.culled.push(m);
    }
  }

  /** PIXEL WORLD terrain: each grid cell painted with the tile its coverage calls for, tinted by the classic colours. */
  private pixelTerrain(pos: number[], col: number[], tw: number[], rows: number[], cols: number[], r0: number, r1: number) {
    const pw = this.pw!;
    const nc = cols.length;
    const P = (i: number) => new THREE.Vector3(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]);
    const grass = new THREE.Color(0x34492d);
    const mudC = new THREE.Color(0x433426);
    const rockC = new THREE.Color(0x5c5a52);
    const tint = (i: number, base: THREE.Color) =>
      _c.setRGB(clamp(col[i * 3] / base.r, 0.45, 1), clamp(col[i * 3 + 1] / base.g, 0.45, 1), clamp(col[i * 3 + 2] / base.b, 0.45, 1)).getHex();
    for (let r = 0; r < r1 - r0; r++) {
      const d = (rows[r0 + r] + rows[r0 + r + 1]) / 2;
      for (let c = 0; c < nc - 1; c++) {
        const a = r * nc + c;
        const b = a + 1;
        const cc = a + nc;
        const dd = cc + 1;
        const ys = [pos[a * 3 + 1], pos[b * 3 + 1], pos[cc * 3 + 1], pos[dd * 3 + 1]];
        const yAvg = (ys[0] + ys[1] + ys[2] + ys[3]) / 4;
        const steep = Math.max(...ys) - Math.min(...ys);
        const lat = (cols[c] + cols[c + 1]) / 2;
        const rockW = (tw[a * 2 + 1] + tw[b * 2 + 1] + tw[cc * 2 + 1] + tw[dd * 2 + 1]) / 4;
        let kind: TerrainKind = 'floor';
        if (yAvg < -GORGE_DEPTH + 2.5) kind = 'bed';
        else if (yAvg < -0.8 || steep > 2.6 || rockW > 0.55) kind = 'rock';
        else if (d > D.MUD_FROM - 6 && d < D.MUD_TO + 6 && Math.abs(lat) < 13) kind = 'mud';
        const base = kind === 'mud' ? mudC : kind === 'rock' || kind === 'bed' ? rockC : grass;
        const A = P(a);
        const B = P(b);
        const C = P(cc);
        const Dd = P(dd);
        // Upward winding (counter-clockwise from above), the classic diagonal b–cc.
        _v.subVectors(B, A);
        _w.subVectors(C, A);
        if (_v.cross(_w).y >= 0) pw.terrainCell(C, A, B, Dd, kind, [tint(cc, base), tint(a, base), tint(b, base), tint(dd, base)]);
        else pw.terrainCell(B, A, C, Dd, kind, [tint(b, base), tint(a, base), tint(cc, base), tint(dd, base)]);
      }
    }
  }

  /** Flat strip following the rail between d0 and d1 at lateral [l0, l1]. */
  private strip(d0: number, d1: number, l0: number, l1: number, y: number, step = 2): THREE.BufferGeometry {
    const pos: number[] = [];
    const idx: number[] = [];
    let n = 0;
    for (let d = d0; d <= d1 + 0.001; d += step) {
      const dd = Math.min(d, d1);
      this.at(dd, l0, 0, _v);
      pos.push(_v.x, y, _v.z);
      this.at(dd, l1, 0, _w);
      pos.push(_w.x, y, _w.z);
      if (n > 0) {
        const a = (n - 1) * 2;
        idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
      n++;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    const nrm = g.attributes.normal as THREE.BufferAttribute;
    if (nrm.count && nrm.getY(0) < 0) {
      const ix = g.index!;
      for (let i = 0; i < ix.count; i += 3) {
        const t = ix.getX(i + 1);
        ix.setX(i + 1, ix.getX(i + 2));
        ix.setX(i + 2, t);
      }
      g.computeVertexNormals();
    }
    g.computeBoundingSphere();
    return Kit.track(g);
  }

  private buildRoad() {
    // Wet night asphalt: dark, cool, with a strong speckle so the road reads at speed.
    const asphalt = tx('asphalt', 0x3a3d44, 0.9, 1);
    const mudMat = tx('dirt', 0x433426, 1, 1);
    const segs: [number, number, THREE.Material][] = [];
    const pushRange = (a: number, b: number) => {
      for (let d = a; d < b; d += 60) segs.push([d, Math.min(b, d + 60), asphalt]);
    };
    pushRange(-60, D.MUD_FROM);
    segs.push([D.MUD_FROM, D.MUD_TO, mudMat]);
    pushRange(D.MUD_TO, D.BRIDGE_FROM - 1.5);
    pushRange(D.BRIDGE_TO + 1.5, D.PAD - D.PAD_HALF + 0.5);
    for (const [a, b, mat] of segs) {
      if (this.pw) {
        // PIXEL WORLD: the painted road (or the mud stretch) and its muddy verges.
        this.pw.road(a, b, (d) => this.at(d, 0, 0), mat === mudMat);
        continue;
      }
      const m = new THREE.Mesh(this.strip(a, b, -ROAD_HALF, ROAD_HALF, 0.02), mat);
      this.root.add(m);
      this.culled.push(m);
    }

    // Markings, cracks, puddles — baked per chunk.
    const rng = new Rng(901);
    // Paint shares the road's asphalt projection: worn into the surface.
    const line = tx('asphalt', 0x9a8a40, 0.9, 0.7, { emissive: 0x1a160a, emissiveIntensity: 1 });
    const edge = tx('asphalt', 0x96968e, 0.9, 0.7, { emissive: 0x161616, emissiveIntensity: 1 });
    const patch = tx('asphalt', 0x2c2e32, 1.4, 1);
    const roadOk = (d: number) =>
      d < D.MUD_FROM - 1 || (d > D.MUD_TO + 1 && d < D.BRIDGE_FROM - 2) || (d > D.BRIDGE_TO + 2 && d < D.PAD - D.PAD_HALF - 1);
    for (let c0 = -60; c0 < D.PAD; c0 += CHUNK) {
      const pg = new THREE.Group();
      for (let d = c0; d < c0 + CHUNK; d += 1) {
        if (!roadOk(d)) continue;
        const g = this.propChunk(d);
        const h = this.heading(d);
        if (this.pw) {
          // PIXEL WORLD: dashes, edge lines and patches are painted into the road; puddles become animated decals
          // (the same draws, so they lie where the classic ones do).
          if (d % 6 === 0) rng.chance(0.85);
          if (d % 3 === 0) for (let s = 0; s < 2; s++) rng.chance(0.3);
          if (rng.chance(0.06)) {
            rng.range(0.8, 2);
            rng.range(0.6, 2.4);
            rng.spread(2.5);
            rng.spread(0.4);
          }
          if (rng.chance(0.12)) {
            const r = rng.range(0.5, 1.4);
            const lat = rng.spread(3);
            const yaw = h + rng.range(0, 3);
            const sz = rng.range(1.2, 2.2);
            this.pw.puddle(this.at(d, lat, 0.045), yaw, r, r * sz, d);
          }
          continue;
        }
        if (d % 6 === 0 && rng.chance(0.85)) {
          const m = Kit.add(g, Kit.box(0.14, 0.02, 2.6), line);
          this.place(m, d, 0, 0, 0.035);
          m.rotation.y = h;
        }
        if (d % 3 === 0) {
          for (const s of [-1, 1]) {
            if (rng.chance(0.3)) continue;
            const m = Kit.add(g, Kit.box(0.12, 0.02, 2.7), edge);
            this.place(m, d, s * (ROAD_HALF - 0.3), 0, 0.03);
            m.rotation.y = h;
          }
        }
        if (rng.chance(0.06)) {
          const m = Kit.add(g, Kit.box(rng.range(0.8, 2), 0.02, rng.range(0.6, 2.4)), patch);
          this.place(m, d, rng.spread(2.5), rng.spread(0.4), 0.028);
        }
        if (rng.chance(0.12)) {
          const r = rng.range(0.5, 1.4);
          const m = Kit.add(pg, Kit.cyl(r, r, 0.02, 9), this.puddleMat);
          this.place(m, d, rng.spread(3), rng.range(0, 3), 0.04);
          m.scale.set(1, 1, rng.range(1.2, 2.2));
        }
      }
      this.commitMerged(pg);
    }
  }

  /** Is (d, lat) free for vegetation? */
  private vegOk(d: number, lat: number): boolean {
    const a = Math.abs(lat);
    if (a < ROAD_HALF + 0.9) return false;
    if (d > D.GORGE_FROM - 5 && d < D.GORGE_TO + 5) return a > 9 && (d < D.GORGE_FROM - 2 || d > D.GORGE_TO + 2);
    if (d > 150 && d < 220 && lat < -3 && lat > -60) return lat < -52 || (lat > -7 && (d < 158 || d > 211));
    if (d > 522 && d < 600 && a < 34) return false;
    if (d > D.FENCE_FROM - 3 && d < D.FENCE_TO + 3 && lat > D.FENCE_SIDE - 2 && lat < D.FENCE_SIDE + 1.8) return false;
    if (d > D.HOLD_MUD - 2 && d < D.HOLD_MUD + 14 && lat < -3 && lat > -11) return false;
    if (d > D.GAP_FROM - 4 && d < D.GAP_TO + 6 && lat > 3 && lat < 19) return false;
    if (d > D.GAP_FROM + 2 && d < D.GAP_TO + 10 && lat < -3 && lat > -16) return false;
    if (d > D.ROADBLOCK - 4 && d < D.ROADBLOCK + 4 && a < 7) return false;
    // Clear verge right of the roadblock: the stranded ranger stands there in plain view.
    if (d > D.ROADBLOCK - 10 && d < D.ROADBLOCK - 3 && lat > 3 && lat < 10.5) return false;
    return true;
  }

  private buildVegetation() {
    const rng = new Rng(1234);
    const f = this.flora;
    const end = this.len + 40;
    // Pre-baked variants, stamped by matrix (fast: no per-plant Object3Ds).
    const vr = new Rng(4321);
    // `flora` = the pixel species standing in for the plant in ART: SPRITES (its size measured on the 3D plant).
    const V = (n: number, make: () => THREE.Object3D, flora?: { key: string; sway: number; variants?: number[] }): Prefab[] =>
      Array.from({ length: n }, () => {
        const holder = new THREE.Group();
        holder.add(make());
        let tag: FloraTag | null = null;
        if (flora) {
          holder.updateMatrixWorld(true);
          _box.setFromObject(holder);
          // Width: rotation-independent reach from the foot (the prefab is placed turned).
          tag = { ...flora, h: _box.max.y, w: floraReach(holder, _origin) };
        }
        let rock: { w: number; h: number; y0: number } | null = null;
        if (!flora && this.pw) {
          holder.updateMatrixWorld(true);
          _box.setFromObject(holder);
          rock = { w: floraReach(holder, _origin), h: _box.max.y - Math.max(0, _box.min.y), y0: Math.max(0, _box.min.y) };
        }
        const p = this.baker.prefab(holder);
        if (tag) floraTags.set(p, tag);
        if (rock) rockTags.set(p, rock);
        return p;
      });
    const palms = V(10, () => f.palm(vr), { key: 'palm', sway: 0.75, variants: [0, 1, 2] });
    const tallPalms = V(6, () => f.palm(vr, vr.range(9, 13.5)), { key: 'palm', sway: 0.9, variants: [0, 1, 2] });
    const leaningPalms = V(3, () => f.palm(vr, vr.range(7, 11), 0.35), { key: 'palm', sway: 0.8, variants: [3] });
    const trees = V(6, () => f.jungleTree(vr), { key: 'jungleTree', sway: 0.3 });
    const farTrees = V(6, () => f.jungleTree(vr, vr.range(12, 18), 0), { key: 'jungleTree', sway: 0.3 });
    const ferns = V(6, () => f.fern(vr), { key: 'fern', sway: 0.2 });
    const bigFerns = V(3, () => f.fern(vr, vr.range(1.3, 1.8)), { key: 'fern', sway: 0.3 });
    const ears = V(4, () => f.earPlant(vr), { key: 'ear', sway: 0.18 });
    const bigEars = V(2, () => f.earPlant(vr, vr.range(1.3, 1.9)), { key: 'ear', sway: 0.26 });
    const bushes = V(4, () => f.bush(vr, vr.range(0.6, 1.1)), { key: 'bush', sway: 0.05 });
    const bigBushes = V(4, () => f.bush(vr), { key: 'bush', sway: 0.07 });
    const hugeBushes = V(3, () => f.bush(vr, vr.range(1.4, 2.2)), { key: 'bush', sway: 0.1 });
    const rocks = V(4, () => {
      const g = new THREE.Group();
      g.add(f.rock(vr, vr.range(0.3, 0.8)));
      return g;
    });
    const put = (list: Prefab[], d: number, lat: number, side: number) => {
      this.at(d, lat, -0.05, _v);
      _q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, rng.range(0, Math.PI * 2));
      _s.setScalar(rng.range(0.85, 1.15));
      _m.compose(_v, _q, _s);
      const p = list[rng.int(0, list.length - 1)];
      this.vegSink(d, side).add(p, _m);
      this.floraPut(p, d, _v, _s.x);
    };
    for (let c0 = -70; c0 < end; c0 += CHUNK) {
      for (const side of [-1, 1] as const) {
        // Verge: ferns, ear plants, bushes, rocks.
        for (let d = c0; d < c0 + CHUNK; d += 2.3) {
          const dd = d + rng.spread(0.8);
          const lat = side * rng.range(4.6, 7.5);
          if (!this.vegOk(dd, lat)) continue;
          const r = rng.next();
          put(r < 0.5 ? ferns : r < 0.68 ? ears : r < 0.88 ? bushes : rocks, dd, lat, side);
        }
        // Near: palms + bushes.
        for (let d = c0; d < c0 + CHUNK; d += 4.2) {
          const dd = d + rng.spread(1.6);
          const lat = side * rng.range(7.5, 14);
          if (!this.vegOk(dd, lat)) continue;
          const r = rng.next();
          put(r < 0.5 ? palms : r < 0.75 ? bigBushes : r < 0.9 ? bigFerns : bigEars, dd, lat, side);
        }
        // Mid: palms + rainforest giants.
        for (let d = c0; d < c0 + CHUNK; d += 3.6) {
          const dd = d + rng.spread(1.6);
          const lat = side * rng.range(14, 32);
          if (!this.vegOk(dd, lat)) continue;
          const r = rng.next();
          put(r < 0.45 ? tallPalms : r < 0.88 ? trees : hugeBushes, dd, lat, side);
        }
        // Far: big trees on the hills.
        for (let d = c0; d < c0 + CHUNK; d += 6.5) {
          const dd = d + rng.spread(2.5);
          const lat = side * rng.range(32, 70);
          if (!this.vegOk(dd, lat)) continue;
          put(rng.chance(0.7) ? farTrees : tallPalms, dd, lat, side);
        }
      }
    }
    // Gorge rim plants hanging over the drop and the river.
    for (let i = 0; i < 26; i++) {
      const s = i % 2 ? 1 : -1;
      const d = i < 13 ? D.GORGE_FROM - 2.5 - rng.range(0, 2) : D.GORGE_TO + 2.5 + rng.range(0, 2);
      put(rng.chance(0.5) ? bigFerns : leaningPalms, d, s * rng.range(6, 40), s);
    }
    this.plazaPalms = palms;
  }

  private buildPaddock() {
    const g = this.propChunk(D.FENCE_FROM + 40);
    const S = D.FENCE_SIDE;
    const cableMat = tx('metal', 0x303236, 4, 0.5);
    const step = 6;
    const pylonAt: THREE.Vector3[] = [];
    const inGap = (d: number) => d > D.GAP_FROM && d < D.GAP_TO;
    const pw = this.pw;
    for (let d = D.FENCE_FROM; d <= D.FENCE_TO; d += step) {
      const p = this.at(d, S, 0);
      pylonAt.push(p);
      if (inGap(d)) {
        // Snapped pylon stump with bent rebar.
        const stump = P.pylon(3.2, false);
        stump.rotation.z = 0.25;
        this.place(stump, d, S, ParkEnv.faceRoad(S));
        stump.rotation.x = -0.35;
        g.add(stump);
        if (pw) pw.pylon(stump, 3.2, false, pylonAt.length, d);
        for (let i = 0; i < 4; i++) {
          const ra = new THREE.Vector3(p.x + (i - 1.5) * 0.2, 3.1, p.z);
          const rb = new THREE.Vector3(p.x + (i - 1.5) * 0.4, 4.1 + i * 0.2, p.z + 0.5);
          if (pw) pw.rebar(ra, rb, d);
          else P.beam(g, ra, rb, 0.03, cableMat, 3);
        }
        continue;
      }
      const py = P.pylon(9.5);
      this.place(py, d, S, ParkEnv.faceRoad(S));
      g.add(py);
      if (pw) pw.pylon(py, 9.5, true, pylonAt.length, d);
    }
    const hs = [1.3, 2.8, 4.3, 5.8, 7.3, 8.6];
    for (let i = 0; i < pylonAt.length - 1; i++) {
      const d0 = D.FENCE_FROM + i * step;
      const d1 = d0 + step;
      const a = pylonAt[i];
      const b = pylonAt[i + 1];
      if (inGap(d0) || inGap(d1)) continue;
      if (pw) {
        // PIXEL WORLD: the six wires of the span as one painted cut-out panel.
        pw.wireSpan(a, b, i, d0);
        continue;
      }
      for (const h of hs) P.cable(g, _v.set(a.x, h, a.z).clone(), _w.set(b.x, h, b.z).clone(), 0.18, 0.03, cableMat, 2);
    }
    // Torn cables hanging from the pylons either side of the gap, live ends sparking on the road verge.
    const spark = Kit.glow(0xbfe0ff, 2.4);
    for (const [dp, dir] of [[D.GAP_FROM - 1, 1], [D.GAP_TO + 1, -1]] as const) {
      const base = this.at(dp, S, 0);
      for (let i = 0; i < hs.length; i++) {
        if (i % 2 === 1 && dir < 0) continue;
        const end = this.at(dp + dir * (2.5 + i * 0.9), S - 1.2 - (i % 3) * 1.2, 0.15);
        if (pw) pw.cable(new THREE.Vector3(base.x, hs[i], base.z), end, 0.35 + i * 0.12, this.at(dp, S - 1, 0).sub(base).setY(0).normalize(), dp);
        else P.cable(g, new THREE.Vector3(base.x, hs[i], base.z), end, 0.35 + i * 0.12, 0.03, cableMat, 3);
        if (i % 2 === 0) {
          this.sparkPts.push(end.clone().setY(0.25));
          const s = Kit.add(this.root, Kit.sphere(0.12, 6, 4), spark, end.x, 0.2, end.z);
          this.sparkGlows.push(s);
        }
      }
    }
    // Warning signs facing the road.
    for (const d of [20, D.GAP_TO + 4, 98]) {
      const s = P.dangerSign();
      this.place(s, d, S - 1.0, ParkEnv.faceRoad(S), 2.6);
      if (d === D.GAP_TO + 4) s.rotation.z = -0.3;
      g.add(s);
      pw?.dangerBoard(s, d, d);
    }
    // Crushed tour car by the gap (foreshadowing) and a goat-tether post.
    const car = P.tourCar(true);
    this.place(car, D.GAP_TO + 8, 6.6, 0.55);
    car.rotation.z = 0.08;
    g.add(car);
    pw?.staticCar(car, true, D.GAP_TO + 8);
    // Giant footprints from the gap across the road into the jungle on the left.
    const prints = new THREE.Group();
    const steps = 7;
    for (let i = 0; i < steps; i++) {
      const t = i / (steps - 1);
      const d = D.GAP_FROM + 5 + t * 12;
      const lat = S - 2 - t * 18;
      const p = this.at(d, lat, 0);
      const p2 = this.at(d + 2, lat - 3, 0);
      const yaw = Math.atan2(p2.x - p.x, p2.z - p.z);
      const off = (i % 2 ? 1 : -1) * 0.7;
      if (pw) pw.footprint(p.x + Math.cos(yaw) * off, p.y + 0.05, p.z - Math.sin(yaw) * off, yaw, 1.45, Math.abs(lat) < ROAD_HALF + 0.3, d);
      else P.footprint(prints, this.puddleMat, p.x + Math.cos(yaw) * off, p.z - Math.sin(yaw) * off, yaw, 1.45);
    }
    this.commitMerged(prints);
  }

  private buildLamps() {
    const rng = new Rng(77);
    let side = 1;
    for (let c0 = -20; c0 < D.PAD; c0 += CHUNK) {
      const pools = new THREE.Group();
      for (let d = Math.max(c0, 12); d < c0 + CHUNK; d += 26) {
        const g = this.propChunk(d);
        side = -side;
        if (d > D.GORGE_FROM - 6 && d < D.GORGE_TO + 6) continue;
        if (d > D.FENCE_FROM && d < D.FENCE_TO && side > 0) continue;
        if (d > D.ROADBLOCK - 6 && d < D.ROADBLOCK + 3) continue;
        const r = rng.next();
        const kind = r < 0.68 ? 'on' : r < 0.84 ? 'off' : 'flicker';
        const lp = P.lampPost(kind === 'on');
        const lat = side * (ROAD_HALF + 1.4);
        this.place(lp.root, d, lat, ParkEnv.faceRoad(lat));
        if (kind === 'flicker') {
          lp.bulb.material = Kit.glow(P.PAL.warm, 1.6);
          lp.bulb.userData.noMerge = true;
          this.flickers.push({ obj: lp.bulb, seed: rng.range(0, 100) });
        }
        g.add(lp.root);
        this.pw?.lampPost(lp.root, lp.bulb, kind, d);
        if (kind !== 'off') {
          const pool = Kit.add(pools, this.poolGeo, this.poolMat);
          this.at(d, lat - Math.sign(lat) * 1.5, 0.06, pool.position);
          pool.scale.set(1, 1, 1.25);
          pool.rotation.y = this.heading(d);
          if (kind === 'flicker') {
            pool.material = ditherPool(Kit.track(this.poolMat.clone()));
            this.flickers.push({ obj: pool, seed: this.flickers[this.flickers.length - 1].seed });
            pool.userData.noMerge = true;
          }
        }
      }
      this.commitPools(pools);
    }
    // Direction signs.
    const s1 = P.roadSign('< VISITOR CENTER');
    this.place(s1, D.HOLD_VISITOR - 30, -(ROAD_HALF + 2.2), ParkEnv.faceRoad(-1) - 0.5);
    this.propChunk(D.HOLD_VISITOR - 30).add(s1);
    this.pw?.roadSign(s1, '< VISITOR CENTER', 0.09, D.HOLD_VISITOR - 30);
    const s2 = P.roadSign('HELIPAD >');
    this.place(s2, D.BOSS_START + 60, ROAD_HALF + 2.3, ParkEnv.faceRoad(1) + 0.4);
    this.propChunk(D.BOSS_START + 60).add(s2);
    this.pw?.roadSign(s2, 'HELIPAD >', 0.09, D.BOSS_START + 60);
    const s3 = P.roadSign('BRIDGE');
    this.place(s3, D.MUD_TO + 8, -(ROAD_HALF + 2.2), ParkEnv.faceRoad(-1) - 0.45);
    this.propChunk(D.MUD_TO + 8).add(s3);
    this.pw?.roadSign(s3, 'BRIDGE', 0.09, D.MUD_TO + 8);
  }

  private buildVisitorCentre() {
    const v = P.visitorCentre();
    this.visitor = v;
    this.place(v.root, D.VISITOR, D.VISITOR_SIDE, ParkEnv.faceRoad(D.VISITOR_SIDE));
    v.root.position.y = 0;
    // Plaza paving between the road and the steps.
    const plaza = new THREE.Group();
    Kit.add(plaza, Kit.box(46, 0.08, 21), tx('tiles', 0x626058, 0.55, 0.85), 0, 0.04, 15.4);
    for (const sx of [-21, 21]) {
      Kit.add(plaza, Kit.box(2.2, 0.8, 2.2), tx('brick', 0x7a5a48, 1.4, 0.9), sx, 0.4, 20);
    }
    // Tilted floodlight mast (lights dead) and a ticket kiosk.
    const mast = new THREE.Group();
    mast.position.set(15, 0, 12);
    mast.rotation.z = 0.32;
    plaza.add(mast);
    Kit.add(mast, Kit.cyl(0.14, 0.2, 10, 6), tx('metal', 0x44484c, 2.5, 0.7), 0, 5, 0);
    Kit.add(mast, Kit.box(2, 0.8, 0.5), tx('metal', 0x2a2c30, 2.5, 0.7), 0, 10, 0);
    const kiosk = new THREE.Group();
    kiosk.position.set(-15, 0, 13);
    plaza.add(kiosk);
    Kit.add(kiosk, Kit.box(3, 2.6, 2.4), tx('planks', 0x6e543a, 1.4, 0.9), 0, 1.3, 0);
    Kit.add(kiosk, Kit.cone(2.6, 1.6, 4), tx('bark', P.PAL.thatch, 0.9, 1), 0, 3.4, 0, 0, Math.PI / 4, 0);
    Kit.add(kiosk, Kit.box(1.6, 0.8, 0.06), Kit.glow(0xffc070, 0.6), 0, 1.6, 1.22);
    plaza.add(v.plaza);
    v.root.add(plaza);
    // PIXEL WORLD: the lodge, plaza and doors painted (the roofs read from the classic shell first).
    const pw = this.pw;
    const flick = pw ? pw.visitorCentre(v, plaza) : null;
    // Bake the shell (+ plaza, incl. the fountain — not an occluder: compys
    // land in it); doors / flickering windows / beacon stay live.
    const shellMeshes = this.baker.bake(v.shell);
    if (pw) {
      // PIXEL WORLD: the baked shell stays the bullet occluder, hidden (and out of the fog culling, which shows meshes).
      for (const m of v.shell.children) m.visible = false;
    } else for (const m of shellMeshes) this.culled.push(m);
    this.baker.bake(plaza).forEach((m) => this.culled.push(m));
    if (flick) this.flickers.push({ obj: flick, seed: 13 });
    else for (const m of v.flicker) this.flickers.push({ obj: m, seed: 13 });
    this.blinkers.push({ obj: v.beacon, period: 1.1, duty: 0.5, phase: 0 });
    for (const [side, d] of [[-1, v.doorL], [1, v.doorR]] as [number, THREE.Group][]) {
      for (const c of d.children) {
        // Bake each door into a single mesh (it animates as a whole).
        const grp = c as THREE.Group;
        pw?.door(grp, side);
        this.baker.bake(grp);
      }
    }
    this.root.add(v.root);
    // Palms in the plaza planters.
    v.root.updateMatrixWorld(true);
    for (const [i, sx] of [-21, 21].entries()) {
      _v.set(sx, 0.8, 20);
      v.root.localToWorld(_v);
      _m.compose(_v, _q.identity(), _s.setScalar(1));
      if (this.plazaPalms.length) {
        const p = this.plazaPalms[i % this.plazaPalms.length];
        this.vegSink(D.VISITOR, -1).add(p, _m);
        this.floraPut(p, D.VISITOR, _v, 1);
      }
    }
  }

  /** World position of the visitor-centre doorway (ground). */
  doorWorld(out = new THREE.Vector3()): THREE.Vector3 {
    this.visitor.root.updateMatrixWorld();
    return this.visitor.root.localToWorld(out.copy(this.visitor.door));
  }

  private buildRoadblock() {
    const d = D.ROADBLOCK;
    // Overturned tour car across the right lane: upside-down on its crushed
    // roof, broadside, so its windows, livery stripes and wheels face the jeep
    // (on its side it read as a plain crate).
    const car = P.tourCar(true);
    this.carInner = car;
    car.rotation.z = Math.PI;
    car.position.set(0, 1.76, 0);
    this.car.add(car);
    this.baker.bake(car);
    // PIXEL WORLD: the baked car stays the (hidden) occluder; a painted one follows it when it flies.
    this.pw?.followCar(car, true);
    this.pw?.drumTiles();
    this.place(this.car, d, 1.7, Math.PI / 2 - 0.2);
    this.root.add(this.car);
    // Fallen palm across the left lane.
    const log = this.flora.brokenPalm(new Rng(8), 8);
    log.position.y = 0.25;
    this.palmLog.add(log);
    this.pw?.palmLog(log, 8);
    this.baker.bake(log);
    this.place(this.palmLog, d + 1.5, -2.6, Math.PI / 2 + 0.25);
    this.root.add(this.palmLog);
    // Sawhorses with blinking amber lamps.
    for (const [lat, yaw] of [[-2.4, 0.1], [3.4, -0.15]] as const) {
      const s = P.sawhorse();
      this.pw?.sawhorse(s.root, s.lamp);
      this.baker.bake(s.root); // the blinking lamp is flagged noMerge and stays live
      this.place(s.root, d - 2.4, lat, yaw);
      this.horses.push(s.root);
      this.blinkers.push({ obj: s.lamp, period: 0.9, duty: 0.45, phase: lat > 0 ? 0.45 : 0 });
      this.root.add(s.root);
    }
  }

  /** Spawn the shootable fuel drums at the roadblock (call at the hold). */
  spawnRoadblockDrums(world: World) {
    if (this.drums.length || this.blastT >= 0) return;
    for (const [dd, lat] of [[-3.6, 3.7], [-3.2, -3.9], [-1.4, 5.0]] as const) {
      const p = this.at(D.ROADBLOCK + dd, lat, 0);
      const drum = new Destructible(world, {
        model: this.bakedDrum(false),
        pos: p,
        hp: 1,
        points: 200,
        explode: { radius: 5.5, damage: 9 },
        onDestroy: (w) => this.blastRoadblock(w, p),
      });
      this.drums.push(world.add(drum));
      this.pw?.drum(drum.root, false);
    }
  }

  get roadblockBlasted(): boolean {
    return this.blastT >= 0;
  }

  /** Blow the roadblock apart (drums shot, or forced after the hold). */
  blastRoadblock(world: World, at?: THREE.Vector3) {
    if (this.blastT >= 0) {
      if (at) this.addFire(at, 0.8, world);
      return;
    }
    this.blastT = 0;
    const p = at ?? this.at(D.ROADBLOCK, 0, 0.6);
    for (const dr of this.drums) if (!dr.removed) world.later(0.15 + world.rng.next() * 0.2, () => dr.destroy());
    world.explode(p.clone().setY(0.8), 6, 10);
    world.fx.explosion(this.car.getWorldPosition(_v).setY(1.2), 1.4);
    world.audio.play('crash', { volume: 1 });
    world.rig.shake(0.6);
    world.hitStop(0.05);
    // Car launched off the road to the right, tumbling.
    const h = this.heading(D.ROADBLOCK);
    this.carVel.set(Math.cos(h) * 6.5, 7.5, -Math.sin(h) * 6.5);
    this.carVel.x += -Math.sin(h) * 2;
    this.carVel.z += -Math.cos(h) * 2;
    this.carSpin = 4.5;
    this.logVel = 6;
    this.addFire(p.clone().setY(0), 1.1, world);
  }

  private addFire(p: THREE.Vector3, size: number, world: World | null) {
    if (this.fires.length >= 6) return;
    const pw = this.pw;
    const f = new Fire(p.clone().setY(this.groundAt(p.x, p.z)), size, this.fires.length + 1, pw ? (w, h) => pw.flameCard(w, h) : undefined);
    this.root.add(f.group);
    this.fires.push({ fire: f, pos: f.group.position.clone() });
    if (world) world.fx.explosion(_v.copy(f.group.position).setY(f.group.position.y + 0.5), 0.6);
  }

  private buildMud() {
    const g = this.propChunk(D.HOLD_MUD);
    const rut = tx('dirt', 0x2a1e12, 2, 1);
    // (PIXEL WORLD: the ruts are painted into the mud road.)
    for (let d = D.MUD_FROM + 1; d < D.MUD_TO - 1 && !this.pw; d += 1.5) {
      for (const lat of [-1.0, 1.0]) {
        const m = Kit.add(g, Kit.box(0.42, 0.02, 1.7), rut);
        this.place(m, d, lat + Math.sin(d * 0.4) * 0.12, Math.sin(d * 0.3) * 0.05, 0.035);
      }
    }
    // Stuck utility truck on the left verge.
    const t = P.maintenanceTruck();
    this.place(t.root, D.HOLD_MUD + 7, -6.6, 0.45);
    t.root.position.y = -0.35;
    t.root.rotation.z = -0.1;
    t.root.rotation.x = 0.06;
    // Rear of the flatbed, beside the crane arm (the prop chunk group sits at the origin).
    t.root.updateMatrix();
    this.mudPerch.set(-0.55, 1.76, -2.2).applyMatrix4(t.root.matrix);
    for (const h of t.hazards) this.blinkers.push({ obj: h, period: 0.8, duty: 0.5, phase: h.position.x > 0 ? 0.4 : 0 });
    g.add(t.root);
    this.pw?.truck(t.root, D.HOLD_MUD);
    // Muddy pools.
    const pools = new THREE.Group();
    const rng = new Rng(31);
    for (let i = 0; i < 9; i++) {
      const r = rng.range(0.8, 1.8);
      if (this.pw) {
        // PIXEL WORLD: muddy rain pools (animated), where the classic ones lie.
        const d = rng.range(D.MUD_FROM + 2, D.MUD_TO - 2);
        const lat = rng.spread(4.5);
        const yaw = this.heading(d) + rng.range(0, 3);
        this.pw.puddle(this.at(d, lat, 0.05), yaw, r, r * rng.range(1.3, 2.4), i, true);
        continue;
      }
      const m = Kit.add(pools, Kit.cyl(r, r, 0.02, 10), this.puddleMat);
      this.place(m, rng.range(D.MUD_FROM + 2, D.MUD_TO - 2), rng.spread(4.5), rng.range(0, 3), 0.045);
      m.scale.z = rng.range(1.3, 2.4);
    }
    this.commitMerged(pools);
  }

  private buildBridge() {
    const width = 7.6;
    const n = Math.round((D.BRIDGE_TO - D.BRIDGE_FROM) / 4);
    const segLen = (D.BRIDGE_TO - D.BRIDGE_FROM) / n;
    // Loose pieces (hidden until the collapse) + the same bridge baked whole.
    const whole = this.bridgeWhole;
    const piece = (make: () => THREE.Group, d: number, list: THREE.Group[]) => {
      const g = make();
      this.pw?.bridgePiece(g);
      this.baker.bake(g).forEach((m) => this.culled.push(m));
      const holder = new THREE.Group();
      holder.add(g);
      this.place(holder, d, 0, 0, 0);
      holder.position.y = 0;
      holder.visible = false;
      this.root.add(holder);
      list.push(holder);
      const copy = make();
      this.place(copy, d, 0, 0, 0);
      copy.position.y = 0;
      whole.add(copy);
    };
    for (let i = 0; i < n; i++) piece(() => P.bridgeSegment(segLen, width, i === 4), D.BRIDGE_FROM + segLen * (i + 0.5), this.bridgeSegs);
    for (let i = 1; i < n; i += 2) piece(() => P.trestle(GORGE_DEPTH, width), D.BRIDGE_FROM + segLen * i, this.towers);
    this.pw?.bridgeWhole(whole);
    this.commit(whole);
    // Concrete abutments + river.
    const g = new THREE.Group();
    const conc = tx('concrete', 0x6c6a64, 1, 1);
    for (const [d, dir] of [[D.BRIDGE_FROM, 1], [D.BRIDGE_TO, -1]] as const) {
      const a = Kit.add(g, Kit.box(width + 2, 6, 4), conc);
      this.place(a, d - dir * 1.5, 0, 0, 0);
      a.position.y = -3.05;
      for (const s of [-1, 1]) {
        const post = Kit.add(g, Kit.box(0.6, 1.6, 0.6), conc);
        this.place(post, d - dir * 1.2, s * (width / 2 + 0.3), 0, 0.8);
        post.position.y = 0.8;
      }
    }
    const water = tx('water', 0x264868, 0.7, 0.85, { emissive: 0x0a1a2a, emissiveIntensity: 1 });
    const mid = (D.GORGE_FROM + D.GORGE_TO) / 2;
    const river = Kit.add(g, Kit.box(240, 0.1, 14), water);
    this.place(river, mid, 0, Math.PI / 2, 0);
    river.position.y = -GORGE_DEPTH + 1.0;
    river.rotation.y = this.heading(mid);
    const foam = tx('water', 0x8a9aa8, 2.2, 0.6, { emissive: 0x1a2028, emissiveIntensity: 1 });
    const foams: THREE.Mesh[] = [];
    const rng = new Rng(17);
    for (let i = 0; i < 22; i++) {
      const lat = rng.spread(80);
      const rock = this.flora.rock(rng, rng.range(0.8, 2.2));
      this.at(mid + rng.spread(6), lat, 0, rock.position);
      rock.position.y = -GORGE_DEPTH + 0.8;
      g.add(rock);
      if (i % 2 === 0) {
        const f = Kit.add(g, Kit.box(rng.range(1.5, 3), 0.05, 0.5), foam);
        f.position.copy(rock.position).setY(-GORGE_DEPTH + 1.08);
        f.rotation.y = this.heading(mid) + Math.PI / 2 + rng.spread(0.3);
        foams.push(f);
      }
    }
    this.pw?.gorge(g, river, foams, mid);
    this.commit(g, false);
  }

  /** Lightning strikes the bridge and it collapses in a chain (rig should be past it). */
  collapseBridge(world: World) {
    if (this.collapseT >= 0) return;
    this.collapseT = 0;
    this.bridgeWhole.visible = false;
    for (const o of this.bridgeSegs) o.visible = true;
    for (const o of this.towers) o.visible = true;
    const mid = Math.floor(this.bridgeSegs.length / 2);
    const strikeAt = this.bridgeSegs[mid].position;
    _v.subVectors(strikeAt, world.camera.position);
    this.storm.strike(world, true, _v.clone());
    world.fx.explosion(_w.copy(strikeAt).setY(1.2), 1.1);
    world.fx.sparks(_w, null, 16);
    world.audio.play('explosion', { volume: 0.8 });
    // (No extra HUD flash: the close strike already brightens the scene once.)
    this.addFire(_w.copy(this.bridgeSegs[mid + 1].position), 0.7, null);
    this.bridgeDown = true;
    const rng = world.rng;
    this.bridgeSegs.forEach((s, i) => {
      const order = Math.abs(i - mid);
      this.falling.push({
        obj: s,
        t0: 0.15 + order * 0.32 + rng.range(0, 0.1),
        vel: new THREE.Vector3(rng.spread(1), rng.range(0, 1.5), rng.spread(1)),
        spin: new THREE.Vector3(rng.spread(1.6), rng.spread(0.6), rng.spread(1.2)),
        splashed: false,
        started: false,
      });
    });
    this.towers.forEach((t, i) => {
      this.falling.push({
        obj: t,
        t0: 0.4 + Math.abs(i - 2) * 0.45 + rng.range(0, 0.15),
        vel: new THREE.Vector3(0, 0, 0),
        spin: new THREE.Vector3(rng.spread(0.5), 0, (i % 2 ? 1 : -1) * rng.range(0.5, 0.9)),
        splashed: false,
        started: false,
      });
    });
  }

  private buildHelipad() {
    this.pad = P.helipad(D.PAD_HALF);
    this.place(this.pad.root, D.PAD, 0, 0, 0);
    this.pad.root.position.y = 0;
    for (const e of [this.pad.edgeA, this.pad.edgeB]) {
      this.pad.root.remove(e);
      e.position.set(0, 0, 0);
    }
    this.pw?.helipad(this.pad, D.PAD_HALF);
    this.baker.bake(this.pad.root).forEach((m) => this.culled.push(m));
    for (const e of [this.pad.edgeA, this.pad.edgeB]) {
      this.pad.root.add(e);
      this.baker.bake(e);
    }
    this.blinkers.push({ obj: this.pad.edgeA, period: 1.0, duty: 0.5, phase: 0 });
    this.blinkers.push({ obj: this.pad.edgeB, period: 1.0, duty: 0.5, phase: 0.5 });
    this.root.add(this.pad.root);

    this.heli = P.helicopter();
    this.place(this.heli.root, D.HELI, 0, -Math.PI / 2, 0);
    this.heli.root.position.y = 0.28;
    this.pw?.helicopter(this.heli);
    this.baker.bake(this.heli.body);
    this.baker.bake(this.heli.rotor);
    this.baker.bake(this.heli.tailRotor);
    this.blinkers.push({ obj: this.heli.beacon, period: 1.2, duty: 0.25, phase: 0 });
    this.blinkers.push({ obj: this.heli.strobe, period: 1.6, duty: 0.08, phase: 0.3 });
    this.root.add(this.heli.root);

    // Signage + finale fuel tank.
    const s = P.roadSign('HELIPAD', 0.11);
    this.place(s, D.PAD - D.PAD_HALF - 4, -(ROAD_HALF + 2.5), ParkEnv.faceRoad(-1) - 0.6);
    this.propChunk(D.PAD - D.PAD_HALF - 4).add(s);
    this.pw?.roadSign(s, 'HELIPAD', 0.11, D.PAD - D.PAD_HALF - 4);
  }

  /** Create the (initially sturdy) finale fuel tank entity. */
  spawnTank(world: World) {
    if (this.tank) return;
    const ft = P.fuelTank();
    this.baker.bake(ft.root);
    const pos = this.at(D.FUEL, D.FUEL_SIDE, 0);
    pos.y = 0;
    this.tankPos.copy(pos);
    const tank = new FuelTank(world, {
      model: ft.root,
      pos,
      hp: 4.5,
      points: 2500,
      explode: { radius: 9, damage: 25 },
      onDestroy: (w) => this.tankExploded(w),
    });
    tank.root.rotation.y = this.heading(D.FUEL) + 0.15;
    this.tank = world.add(tank);
    this.pw?.fuelTank(tank.root, ft.warn);
    this.blinkers.push({ obj: ft.warn, period: 0.5, duty: 0.5, phase: 0 });
  }

  /** Make the tank shootable and put explosive barrels by the pad entrance. */
  armFinale(world: World) {
    if (this.tank) this.tank.armed = true;
    if (this.padBarrels.length) return;
    for (const [dd, lat] of [[-21, 4.6], [-12, -5.2], [-8, 5.4]] as const) {
      const p = this.at(D.HELI_STOP + dd, lat, 0);
      const barrel = world.add(new Destructible(world, { model: this.bakedDrum(true), pos: p, hp: 1, points: 200, explode: { radius: 5, damage: 8 } }));
      this.padBarrels.push(barrel);
      this.pw?.drum(barrel.root, true);
    }
  }

  /** A fuel drum baked to one lit + one glow mesh (2 draw calls instead of 4). */
  private bakedDrum(red: boolean): THREE.Group {
    const g = fuelDrum(red);
    this.baker.bake(g);
    for (const c of g.children) (c as THREE.Mesh).geometry?.computeBoundingSphere();
    return g;
  }

  tankWorld(out = new THREE.Vector3()): THREE.Vector3 {
    return out.copy(this.tankPos);
  }

  private tankExploded(world: World) {
    const p = this.tankPos.clone().setY(1.6);
    world.hud.flash('#ffd8a0', 0.45);
    world.rig.shake(1);
    world.hitStop(0.08);
    world.audio.play('explosion', { volume: 1, pitch: 0.7 });
    for (let i = 0; i < 5; i++) {
      world.later(i * 0.09, () => {
        _v.copy(p);
        _v.x += world.rng.spread(2.5);
        _v.y += world.rng.range(0, 2.5);
        _v.z += world.rng.spread(2.5);
        world.fx.explosion(_v, 1.6 + world.rng.next() * 0.6);
      });
    }
    this.addFire(this.tankPos, 1.6, world);
    this.onTankBlast?.(p);
  }

  /** Spin the rotor up (finale). */
  heliSpinUp() {
    this.heliTarget = 28;
  }

  hideHeli() {
    this.heli.root.visible = false;
  }

  // ─── Set pieces ───────────────────────────────────────────────────────────

  /** Raptors smash the visitor-centre doors open. */
  burstDoors(world: World) {
    if (this.doorsT >= 0) return;
    this.doorsT = 0;
    const p = this.doorWorld(_v);
    p.y = 2;
    world.fx.debris(p, 0x5a3a24);
    world.fx.dust(p, 2, 0x6a6052);
    world.audio.play('door', { volume: 1 });
    world.audio.play('glass', { volume: 0.8 });
    world.audio.play('raptor_screech', { volume: 0.9, pitch: 0.9 });
    world.rig.shake(0.35);
    this.visitor.root.updateMatrixWorld();
    const fwd = new THREE.Vector3(0, 0, 1).transformDirection(this.visitor.root.matrixWorld);
    this.doorVel = [this.visitor.doorL, this.visitor.doorR].map((_, i) => fwd.clone().multiplyScalar(7 + i).setY(3.5 + i));
  }

  /** Lightning strike on demand (title card, set pieces). */
  strike(world: World, close = false) {
    this.storm.strike(world, close);
  }

  /** A close strike with its bolt toward a world position (thunder right away). */
  strikeAt(world: World, p: THREE.Vector3) {
    this.storm.strike(world, true, _v.subVectors(p, world.camera.position));
  }

  // ─── Update ───────────────────────────────────────────────────────────────

  private update(dt: number, w: World) {
    this.time += dt;
    const t = this.time;
    const rd = w.rig.d;
    this.storm.update(dt, w);
    this.pw?.update(dt, w.camera.position, this.storm.flash, this.storm.gust);
    this.baker.wind(dt, this.storm.gust);
    const flash = this.storm.flash;
    this.puddleMat.emissive.setRGB(0.03 + flash * 0.3, 0.052 + flash * 0.34, 0.105 + flash * 0.42);

    // Bullet-impact surface follows the terrain under the camera.
    this.environment.surface =
      rd > D.MUD_FROM - 2 && rd < D.MUD_TO + 4 ? 'water' : rd > D.BRIDGE_FROM - 4 && rd < D.BRIDGE_TO + 6 ? 'wood' : rd > D.PAD - 20 ? 'concrete' : 'dirt';

    // Blinkers + flickers. Reduced flashing: flickering lamps / windows hold steady
    // and the sparking fence glows shimmer instead of strobing.
    const calm = !!w.settings.reduceFlashes;
    for (const b of this.blinkers) b.obj.visible = ((t / b.period + b.phase) % 1) < b.duty;
    for (const f of this.flickers) {
      const s = Math.sin(t * 23 + f.seed) + Math.sin(t * 7.1 + f.seed * 2) + Math.sin(t * 1.3 + f.seed);
      f.obj.visible = calm || s > -0.4 || ((t * 3 + f.seed) % 1) < 0.08;
    }

    // Paddock sparks.
    if (rd < D.FENCE_TO + 40) {
      this.sparkT -= dt;
      for (let i = 0; i < this.sparkGlows.length; i++) {
        if (calm) {
          this.sparkGlows[i].visible = true;
          this.sparkGlows[i].scale.setScalar(0.75 + Math.sin(t * 2.3 + i * 1.7) * 0.2);
          continue;
        }
        const k = Math.sin(t * 31 + i * 2.3) + Math.sin(t * 13.7 + i);
        this.sparkGlows[i].visible = k > 0.6;
        this.sparkGlows[i].scale.setScalar(0.6 + Math.max(0, k) * 0.8);
      }
      if (this.sparkT <= 0 && this.sparkPts.length) {
        this.sparkT = w.rng.range(0.25, 0.7);
        const p = this.sparkPts[w.rng.int(0, this.sparkPts.length - 1)];
        w.fx.sparks(p, null, 6);
      }
    }

    // Visitor-centre doors flying off.
    if (this.doorsT >= 0 && this.doorsT < 3) {
      this.doorsT += dt;
      [this.visitor.doorL, this.visitor.doorR].forEach((dg, i) => {
        const v = this.doorVel[i];
        if (!v) return;
        v.y -= 14 * dt;
        this.visitor.root.updateMatrixWorld();
        dg.getWorldPosition(_v).addScaledVector(v, dt);
        if (_v.y < 0.15) {
          _v.y = 0.15;
          v.multiplyScalar(0.4);
          v.y = Math.abs(v.y) * 0.3;
        }
        this.visitor.root.worldToLocal(_v);
        dg.position.copy(_v);
        dg.rotation.x += (i ? -1 : 1) * dt * 3 * Math.min(1, v.length() / 4);
        dg.rotation.y += (i ? 1 : -1) * dt * 1.5 * Math.min(1, v.length() / 4);
      });
    }

    // Roadblock blast animation.
    if (this.blastT >= 0 && this.blastT < 4) {
      this.blastT += dt;
      if (!this.carLanded) {
        this.carVel.y -= 16 * dt;
        this.car.position.addScaledVector(this.carVel, dt);
        this.car.rotation.y += this.carSpin * 0.3 * dt;
        this.carInner.rotation.x += this.carSpin * dt;
        const g = this.groundAt(this.car.position.x, this.car.position.z);
        if (this.car.position.y < g && this.carVel.y < 0) {
          this.car.position.y = g;
          if (Math.abs(this.carVel.y) > 3) {
            this.carVel.y *= -0.3;
            this.carVel.x *= 0.5;
            this.carVel.z *= 0.5;
            this.carSpin *= 0.4;
            w.audio.play('crash', { volume: 0.8 });
            w.fx.dust(this.car.position, 1.6, 0x4a4036);
            w.rig.shake(0.2);
          } else {
            this.carLanded = true;
            this.carInner.rotation.x = Math.round(this.carInner.rotation.x / Math.PI) * Math.PI;
          }
        }
      }
      if (this.logVel > 0.05) {
        const h = this.heading(D.ROADBLOCK);
        this.palmLog.position.x -= Math.cos(h) * this.logVel * dt;
        this.palmLog.position.z += Math.sin(h) * this.logVel * dt;
        this.palmLog.children[0].rotation.z += this.logVel * dt * 2;
        this.logVel *= Math.exp(-2 * dt);
      }
      for (let i = 0; i < this.horses.length; i++) {
        const hs = this.horses[i];
        if (this.blastT < 1.2) {
          hs.position.y = Math.max(0, Math.sin(Math.min(1, this.blastT / 1.0) * Math.PI) * 3);
          hs.rotation.x += dt * (i ? 6 : -5);
          hs.position.x += (i ? 1 : -1) * dt * 4;
        }
      }
    }

    // PIXEL WORLD: the painted car rides on the flying (hidden) classic one.
    if (this.pw && this.blastT >= 0 && this.blastT < 4.5) this.pw.follow();

    // Mud: wheel spin spray + engine revs while bogged.
    if (this.mud) {
      this.mudT -= dt;
      this.revT -= dt;
      if (this.mudT <= 0) {
        this.mudT = 0.09;
        w.rig.space.updateMatrixWorld();
        for (const sx of [-0.95, 0.95]) {
          _v.set(sx, 0.4, 1.6 + w.rng.range(0, 0.6));
          w.rig.space.localToWorld(_v);
          w.fx.dust(_v, 0.55, 0x3a2a1a);
          // Front wheels churning: clods thrown up past the hood.
          _v.set(sx * 1.05, 0.7 + w.rng.range(0, 0.4), -2.2 + w.rng.range(0, 0.5));
          w.rig.space.localToWorld(_v);
          w.fx.dust(_v, 0.35, 0x4a3624);
        }
        if (w.rng.chance(0.3)) {
          _v.set(w.rng.spread(1), 0.6, 2.2);
          w.rig.space.localToWorld(_v);
          w.fx.debris(_v, 0x3a2a1a);
        }
      }
      if (this.revT <= 0) {
        this.revT = w.rng.range(1.5, 2.3);
        w.audio.play('engine_rev', { volume: 0.55, pitch: w.rng.range(0.8, 1.0) });
      }
    }

    // Bridge collapse.
    if (this.collapseT >= 0 && this.collapseT < 8) {
      this.collapseT += dt;
      for (const f of this.falling) {
        if (this.collapseT < f.t0) continue;
        const o = f.obj;
        if (!f.started) {
          f.started = true;
          w.audio.play('wood_break', { volume: 0.8, vary: 0.2 });
          w.fx.debris(_v.copy(o.position).setY(o.position.y + 0.2), 0x6e5236);
          w.rig.shake(0.08);
        }
        if (!o.visible) continue;
        f.vel.y -= 15 * dt;
        o.position.addScaledVector(f.vel, dt);
        o.rotation.x += f.spin.x * dt;
        o.rotation.y += f.spin.y * dt;
        o.rotation.z += f.spin.z * dt;
        if (!f.splashed && o.position.y < -GORGE_DEPTH + 2) {
          f.splashed = true;
          w.audio.play('splash', { volume: 0.7, vary: 0.2 });
          w.fx.dust(_v.copy(o.position).setY(-GORGE_DEPTH + 1.5), 2.4, 0xb8c8d8);
        }
        if (o.position.y < -GORGE_DEPTH - 4) o.visible = false;
      }
    }

    // Helicopter rotor + lift-off.
    this.heliSpin += (this.heliTarget - this.heliSpin) * Math.min(1, dt * 0.6);
    this.heli.rotor.rotation.y += this.heliSpin * dt;
    this.heli.tailRotor.rotation.x += this.heliSpin * 1.6 * dt;

    // Fires.
    let fireK = 0;
    let nearFire: THREE.Vector3 | null = null;
    let nearD = Infinity;
    for (const f of this.fires) {
      const dd = f.pos.distanceToSquared(w.camera.position);
      f.fire.update(dt, dd < 70 * 70 ? w : null);
      if (dd < nearD) {
        nearD = dd;
        nearFire = f.pos;
        fireK = f.fire.flicker;
      }
    }

    // Compys are tiny and olive at night: in the fence and plaza fights the
    // accent light drifts over the pack (centroid of live compys near the camera).
    const packZone = rd < D.FENCE_TO || (rd > 140 && rd < 225);
    let packN = 0;
    if (packZone) {
      _w.set(0, 0, 0);
      for (const e of w.enemies()) {
        if (e.name !== 'compy' || e.state === 'dying' || !e.hostile) continue;
        e.root.getWorldPosition(_s);
        if (_s.distanceToSquared(w.camera.position) > 32 * 32) continue;
        _w.add(_s);
        packN++;
      }
      if (packN) {
        _w.multiplyScalar(1 / packN);
        _w.y += 2.8;
        if (this.packBlend < 0.01) this.packPos.copy(_w);
        else this.packPos.lerp(_w, 1 - Math.exp(-4 * dt));
      }
    }
    this.packBlend += ((packN ? 1 : 0) - this.packBlend) * (1 - Math.exp(-3 * dt));
    const pb = packZone ? this.packBlend : 0;

    // The accent point light goes where the action is.
    const pl = this.point;
    if (rd < D.FENCE_TO && this.sparkPts.length) {
      pl.color.setHex(0xa8d0ff);
      this.at((D.GAP_FROM + D.GAP_TO) / 2, D.FENCE_SIDE - 3, 2.2, pl.position);
      pl.distance = 30;
      const arc = calm ? 90 + Math.sin(t * 2.1) * 15 : Math.sin(t * 31) + Math.sin(t * 13.7) > 0.4 ? 150 : 45;
      pl.intensity = arc * (rd < D.GAP_TO + 10 ? 1 : 0.4);
      if (pb > 0.01) {
        pl.position.lerp(this.packPos, pb * 0.8);
        pl.intensity += (110 - pl.intensity) * pb * 0.75;
      }
    } else if (rd > 140 && rd < 225) {
      pl.color.setHex(0xff3020);
      this.visitor.beacon.getWorldPosition(pl.position);
      pl.position.y += 0.8;
      pl.intensity = calm ? 70 + Math.sin((t / 1.1) * Math.PI * 2) * 30 : this.visitor.beacon.visible ? 140 : 25;
      pl.distance = 30;
      if (pb > 0.01) {
        // A warm pool over the pack (the red beacon would turn green compys black).
        pl.color.lerp(_c.setHex(0xffd0a0), pb);
        pl.position.lerp(this.packPos, pb * 0.85);
        pl.intensity += (95 - pl.intensity) * pb * 0.85;
        pl.distance = 26;
      }
    } else if (nearFire && nearD < 60 * 60) {
      pl.color.setHex(0xff8a30);
      pl.position.copy(nearFire).setY(nearFire.y + 1.6);
      pl.intensity = 50 + fireK * 70;
      pl.distance = 26;
    } else if (rd > D.ROADBLOCK - 30 && rd < D.ROADBLOCK + 10) {
      pl.color.setHex(0xffa020);
      this.at(D.ROADBLOCK - 2.4, 0, 1.6, pl.position);
      pl.intensity = calm ? 25 + Math.sin((t / 0.9) * Math.PI * 2) * 12 : ((t / 0.9) % 1) < 0.45 ? 45 : 5;
    } else if (rd > D.MUD_FROM - 20 && rd < D.MUD_TO + 10) {
      pl.color.setHex(0xffa020);
      this.at(D.HOLD_MUD + 7, -6, 2.6, pl.position);
      pl.intensity = calm ? 28 + Math.sin((t / 0.8) * Math.PI * 2) * 14 : ((t / 0.8) % 1) < 0.5 ? 50 : 6;
    } else if (rd > D.PAD - 60) {
      pl.color.setHex(0xff2a10);
      this.heli.beacon.getWorldPosition(pl.position);
      pl.intensity = calm ? 35 + Math.sin((t / 1.2) * Math.PI * 2) * 12 : this.heli.beacon.visible ? 60 : 10;
    } else {
      pl.intensity = 0;
    }

    // Fog culling (every 0.25 s).
    this.cullT -= dt;
    if (this.cullT <= 0) {
      this.cullT = 0.25;
      const cam = w.camera.position;
      const far = FOG_FAR + 6;
      for (const m of this.culled) {
        const bs = m.geometry.boundingSphere;
        if (!bs) continue;
        _v.copy(bs.center).applyMatrix4(m.matrixWorld);
        m.visible = _v.distanceTo(cam) - bs.radius * Math.max(m.scale.x, m.scale.z) < far;
      }
    }

    this.onUpdate?.(dt);
  }
}

/** Yellow-and-black fuel drum (roadblock / pad barrels). */
export function fuelDrum(red = false): THREE.Group {
  const g = new THREE.Group();
  const body = tx('metal', red ? 0xb3261e : 0xc8a028, 2, 0.6);
  const band = tx('metal', 0x2e2a22, 2, 0.7);
  Kit.add(g, Kit.cyl(0.34, 0.34, 0.95, 10), body, 0, 0.48, 0);
  Kit.add(g, Kit.cyl(0.35, 0.35, 0.07, 10), band, 0, 0.22, 0);
  Kit.add(g, Kit.cyl(0.35, 0.35, 0.07, 10), band, 0, 0.74, 0);
  Kit.add(g, Kit.box(0.32, 0.24, 0.02), Kit.glow(red ? 0xffd23a : 0xff5a1a, 1.2), 0, 0.5, 0.345);
  return g;
}
