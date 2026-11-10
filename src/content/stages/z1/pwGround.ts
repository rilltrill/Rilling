import * as THREE from 'three';
import type { PwAtlas, PwTile } from '../../pixelworld/atlas';
import { PwBatch } from '../../pixelworld/batch';
import { decalSub, z1ApronTile, z1ForecourtTile, z1GroundDecals, z1SquareFieldTile, z1SquarePathTile, Z1_DECALS, Z1_GLINT_NEUTRAL, type Z1DecalName } from '../../pixelworld/z1ground';
import { z1AlleyTile, z1CrosswalkTile, z1JunctionTile, z1KerbFaceTile, z1MarginTile, z1RoadOrder, z1RoadTile, z1WalkTile } from '../../pixelworld/z1road';
import { hash2 } from '../../pixelworld/surfaces';
import { Kit } from '../../kit/ModelKit';
import { texStd } from './bake';
import { ALLEY_N, ALLEY_S, CROSS_Z0, CROSS_Z1, GAS_Z0, GAS_Z1, MAIN_FACADE, SECOND_E, SECOND_W, SECOND_X, SQ_X0, SQ_X1, SQ_Z0, SQ_Z1 } from './layout';
import { M } from './props';
import { zoneFor, type ZoneId } from './town';
import { PW_POOL_GAIN, pwPoolColor } from './vfx';

/**
 * MAIN STREET ground decals in ART: PIXEL WORLD (z1/pixel.ts calls this per zone).
 *
 *  - The classic ground meshes tagged `userData.pwGround` by town.ts (puddles,
 *    manholes, blood pools / drops / trails, paper litter, skid marks) are
 *    replaced by painted decals with the same placement (position, yaw, size).
 *  - A hand-placed set of PixelWorld-only decals dresses the street the way a
 *    background artist would: storm drains along the curbs, oil under the
 *    parking lanes, potholes and tar patches, SLOW / arrow lettering before the
 *    intersection, cellar hatches and litter on the sidewalks, leaves under the
 *    street trees. Positions are fixed or hashed (never the world RNG).
 * Every decal is a cut-out quad a centimetre over its surface in the zone's
 * PixelWorld batch (one draw call per zone, never raycast).
 */

const _o = new THREE.Vector3();
const _u = new THREE.Vector3();
const _v = new THREE.Vector3();
const _p = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _e = new THREE.Euler();

/** Road surface height for decals (over the road planes at 0.01–0.012, under lane paint). */
const ROAD_Y = 0.019;
/** Sidewalk top (sidewalk boxes are 0.15 tall). */
const WALK_Y = 0.156;
/** The painted carriageway and the top of the painted walks. */
const ROAD_TOP = 0.01;
const WALK_TOP = 0.15;

const X = new THREE.Vector3(1, 0, 0);
const NX = new THREE.Vector3(-1, 0, 0);
const Y = new THREE.Vector3(0, 1, 0);
const Z = new THREE.Vector3(0, 0, 1);
const NZ = new THREE.Vector3(0, 0, -1);

export class Z1Ground {
  readonly sheet: PwTile;
  /** The road cross-section (three variants), the two walks (kerb on the left / on the right), the kerb's face. */
  private road: PwTile[];
  private walk: PwTile[];
  private kerb: PwTile;
  private junction: PwTile;
  private crosswalk: PwTile;
  private margin: PwTile;
  private alley: PwTile;
  private field: PwTile;
  private path: PwTile;
  private apron: PwTile;
  private forecourt: PwTile;
  constructor(readonly atlas: PwAtlas) {
    this.sheet = z1GroundDecals(atlas);
    this.road = [z1RoadTile(atlas, 0), z1RoadTile(atlas, 1), z1RoadTile(atlas, 2)];
    this.walk = [z1WalkTile(atlas, 0), z1WalkTile(atlas, 1)];
    this.kerb = z1KerbFaceTile(atlas);
    this.junction = z1JunctionTile(atlas);
    this.crosswalk = z1CrosswalkTile(atlas);
    this.margin = z1MarginTile(atlas);
    this.alley = z1AlleyTile(atlas);
    this.field = z1SquareFieldTile(atlas);
    this.path = z1SquarePathTile(atlas);
    this.apron = z1ApronTile(atlas);
    this.forecourt = z1ForecourtTile(atlas);
  }

  /** A wrap tile over x0…x1, zS → zN, mapped in world space (the pattern runs on across neighbouring pieces). */
  private field2(b: PwBatch, t: PwTile, x0: number, x1: number, zS: number, zN: number, y: number) {
    const u0 = (((x0 * t.density) % t.w) + t.w) % t.w;
    const v0 = (((-zS * t.density) % t.h) + t.h) % t.h;
    b.rect(_o.set(x0, y, zS), X, NZ, x1 - x0, zS - zN, t, { u0, v0 });
  }

  // ─── The ground itself ────────────────────────────────────────────────────

  /**
   * A street running north (−Z) from `zS` to `zN`, centred on `cx`: the 12 m cross-section module
   * laid 8 m at a time (west kerb = u 0, the far end up), the variants in the street's shuffled
   * order. `i0` = the index of the first module along the whole street (zones split a street).
   */
  private street(b: PwBatch, cx: number, zS: number, zN: number, salt: number, i0 = 0) {
    let i = i0;
    for (let z = zS; z > zN + 1e-6; z -= 8, i++) {
      const len = Math.min(8, z - zN);
      b.rect(_o.set(cx - 6, ROAD_TOP, z), X, NZ, 12, len, this.road[z1RoadOrder(i, salt)]);
    }
  }

  /**
   * A raised walk along a street heading north: x0…x1, `zS` → `zN`, its kerb on the `kerbSide`
   * (−1 = the west edge, 1 = the east edge). The top is one painted strip (kerbstones, flags, the
   * damp foot of the wall); the kerb is a FORM: the lit arris is the strip's first texels, its face
   * a shadowed band of its own with the gutter line at its foot. `ends` closes the strip's ends
   * with the same face (where a walk stops at a junction).
   */
  private walkStrip(b: PwBatch, x0: number, x1: number, zS: number, zN: number, kerbSide: -1 | 1, ends: { s?: boolean; n?: boolean } = {}) {
    const len = zS - zN;
    const t = this.walk[kerbSide < 0 ? 0 : 1];
    const h = WALK_TOP - ROAD_TOP;
    // (The walk module is 3.5 m wide; v runs north from the strip's south end, phased by the street so two strips never line up.)
    const v0 = Math.round(((-zS * 64) % t.h) + t.h) % t.h;
    b.rect(_o.set(x0, WALK_TOP, zS), X, NZ, x1 - x0, len, t, { v0 });
    // Kerb face, seen from the road (its joints in line with the kerbstones on top: u runs south on the west-facing one).
    if (kerbSide < 0) b.rect(_o.set(x0, ROAD_TOP, zN), Z, Y, len, h, this.kerb, { u0: (((-(v0 + len * 64)) % 512) + 512) % 512 });
    else b.rect(_o.set(x1, ROAD_TOP, zS), NZ, Y, len, h, this.kerb, { u0: v0 });
    if (ends.s) b.rect(_o.set(x0, ROAD_TOP, zS), X, Y, x1 - x0, h, this.kerb, { u0: 96 });
    if (ends.n) b.rect(_o.set(x1, ROAD_TOP, zN), NX, Y, x1 - x0, h, this.kerb, { u0: 288 });
  }

  /**
   * Lay the painted ground of a zone and return the classic meshes it stands in for (road planes,
   * lane paint, sidewalk and kerb boxes), which the caller removes before the zone is re-textured.
   */
  private lay(b: PwBatch, id: ZoneId, zone: THREE.Object3D): THREE.Object3D[] {
    const F = MAIN_FACADE;
    if (id === 'A') {
      this.street(b, 0, 40, -60, 1);
      this.walkStrip(b, 6, F, 40, -60, -1);
      this.walkStrip(b, -F, -6, 40, -60, 1);
    } else if (id === 'B') {
      // Main Street up to the junction, the junction's own painting, Main Street on to its end.
      this.street(b, 0, -60, CROSS_Z0, 1, 13);
      b.rect(_o.set(-6, ROAD_TOP, CROSS_Z0), X, NZ, 12, CROSS_Z0 - CROSS_Z1, this.junction);
      this.street(b, 0, CROSS_Z1, -205, 1, 17);
      // The crossings: bars over both ends of the junction, each with its stop line toward the traffic it stops.
      this.zebra(b, 0, CROSS_Z0 - 0.3, 1);
      this.zebra(b, 0, CROSS_Z1 + 0.3, -1);
      // The cross street's two arms: the same cross-section turned (far end = away from Main Street), with a
      // metre of concrete margin either side up to the buildings that front it.
      const zc = (CROSS_Z0 + CROSS_Z1) / 2;
      let i = 0;
      for (let x = 6; x < 65; x += 8, i++) {
        const len = Math.min(8, 65 - x);
        b.rect(_o.set(x, ROAD_TOP, zc - 6), Z, X, 12, len, this.road[z1RoadOrder(i, 3)]);
        b.rect(_o.set(-x, ROAD_TOP, zc + 6), NZ, NX, 12, len, this.road[z1RoadOrder(i, 4)]);
      }
      // (Margin: u 0 = the wall.)
      b.rect(_o.set(6, ROAD_TOP, CROSS_Z1), Z, X, 1, 59, this.margin);
      b.rect(_o.set(65, ROAD_TOP, CROSS_Z0), NZ, NX, 1, 59, this.margin);
      b.rect(_o.set(-6, ROAD_TOP, CROSS_Z0), NZ, NX, 1, 59, this.margin);
      b.rect(_o.set(-65, ROAD_TOP, CROSS_Z1), Z, X, 1, 59, this.margin);
      this.walkStrip(b, 6, F, -60, CROSS_Z0, -1, { n: true });
      this.walkStrip(b, 6, F, CROSS_Z1, -205, -1, { s: true });
      this.walkStrip(b, -F, -6, -60, CROSS_Z0, 1, { n: true });
      this.walkStrip(b, -F, -6, CROSS_Z1, ALLEY_S, 1, { s: true, n: true });
      this.walkStrip(b, -F, -6, ALLEY_N, -205, 1, { s: true });
      // The alley's mouth on Main Street: its floor runs out across the walk's gap to the kerb line.
      b.rect(_o.set(-6, ROAD_TOP, ALLEY_S), NZ, NX, 7, F - 6, this.alley, { v0: 0 });
    } else if (id === 'C') {
      // The alley, walked westward: u 0 = its south wall (the left hand), the far end up.
      b.rect(_o.set(-F, ROAD_TOP, ALLEY_S), NZ, NX, 7, -F - (SECOND_E - 3.5), this.alley, { v0: (F - 6) * 64 });
      this.street(b, SECOND_X, -110, -200, 2);
      this.walkStrip(b, SECOND_E - 3.5, SECOND_E, -110, ALLEY_S, -1, { n: true });
      this.walkStrip(b, SECOND_E - 3.5, SECOND_E, ALLEY_N, -200, -1, { s: true });
      this.walkStrip(b, SECOND_W, SECOND_W + 3.5, -110, GAS_Z0, 1, { n: true });
    } else if (id === 'D') {
      this.street(b, SECOND_X, -200, SQ_Z0, 2, 12);
      this.zebra(b, SECOND_X, SQ_Z0 + 3.3, 1);
      this.walkStrip(b, SECOND_E - 3.5, SECOND_E, -200, SQ_Z0, -1, { n: true });
      this.walkStrip(b, SECOND_W, SECOND_W + 3.5, GAS_Z1, SQ_Z0, 1, { s: true, n: true });
      // The gas station's forecourt slab, run out across the walk's gap to the kerb line (the lot's crossover).
      this.field2(b, this.forecourt, SECOND_W - 26, SECOND_W + 3.5, GAS_Z0, GAS_Z1, 0.012);
    } else if (id === 'E') {
      // The square: the calm path up the rail's line to PRIME MEATS, the patterned field either side of it,
      // the butcher's apron over the last 8 m.
      const px0 = SECOND_X - 3;
      const px1 = SECOND_X + 3;
      this.field2(b, this.field, SQ_X0 - 20, px0, SQ_Z0, SQ_Z1, ROAD_TOP);
      this.field2(b, this.field, px1, SQ_X1, SQ_Z0, SQ_Z1, ROAD_TOP);
      b.rect(_o.set(px0, ROAD_TOP, SQ_Z0), X, NZ, 6, SQ_Z0 - SQ_Z1, this.path);
      b.rect(_o.set(SECOND_X - 8, ROAD_TOP + 0.004, SQ_Z1 + 8), X, NZ, 16, 8, this.apron);
    }
    // The classic ground this replaces.
    const roads = new Set<THREE.Material>([texStd(0x23262e, 0.42, 0.1, 'asphalt', 1, 0.85), texStd(0x272a31, 0.5, 0.05, 'asphalt', 1.3, 0.9)]);
    // (Kit.tex is cached: the square's flags and the forecourt's slab are the instances town.ts used.)
    const flagsMat = Kit.tex('tiles', 0x4c4943, 0.5, 0.9);
    const slabMat = Kit.tex('concrete', 0x45464b, 0.9);
    const out: THREE.Object3D[] = [];
    zone.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh || Array.isArray(m.material)) return;
      const p = (m.geometry as THREE.BoxGeometry).parameters as { width?: number; height?: number; depth?: number } | undefined;
      if (!p) return;
      const mat = m.material;
      if ((roads.has(mat) || mat === flagsMat || mat === slabMat) && m.geometry.type === 'PlaneGeometry') out.push(m);
      else if ((mat === M.yellowPaint || mat === M.whitePaint) && p.height === 0.012) out.push(m);
      else if (mat === M.sidewalk && p.height === 0.15) out.push(m);
      else if (mat === M.curb && p.height === 0.17) out.push(m);
    });
    return out;
  }

  /**
   * A zebra crossing over a street centred on `cx`. `z` = the edge of its bars next to the stop line; `dir` 1
   * stops traffic heading north (the bars run from `z` three metres north, the stop line lies south of
   * them), −1 traffic heading south.
   */
  private zebra(b: PwBatch, cx: number, z: number, dir: 1 | -1) {
    // (The tile is painted bars up, stop line down; its bars start 58 texels above its lower edge.)
    const off = 58 / 64;
    if (dir > 0) b.rect(_o.set(cx - 6, ROAD_TOP + 0.006, z + off), X, NZ, 12, 4, this.crosswalk);
    else b.rect(_o.set(cx + 6, ROAD_TOP + 0.006, z - off), NX, Z, 12, 4, this.crosswalk);
  }

  /**
   * A decal centred at (x, z), `w` × `h` metres (default: its painted size),
   * turned by `yaw` (radians, around +Y; at 0 the decal's up runs toward −Z).
   */
  decal(b: PwBatch, name: Z1DecalName, x: number, y: number, z: number, yaw = 0, w?: number, h?: number, flip = false, tintRGB?: readonly number[]) {
    const r = Z1_DECALS[name];
    const W = w ?? r.w / this.sheet.density;
    const H = h ?? r.h / this.sheet.density;
    const c = Math.cos(yaw);
    const s = Math.sin(yaw);
    _u.set(c, 0, -s);
    _v.set(-s, 0, -c);
    _o.set(x, y, z).addScaledVector(_u, -W / 2).addScaledVector(_v, -H / 2);
    b.rect(_o, _u, _v, W, H, this.sheet, { sub: decalSub(this.sheet, name), flipU: flip, tintRGB });
  }

  /**
   * What the stage's fixed lights lay on the wet ground under them: one or two glint decals (a path of
   * broken strokes, painted neutral) per ground pool, tinted to the light. A batch of its own (the pools
   * are known only after the zones are built); one draw for the stage.
   */
  glints(pools: readonly { x: number; y: number; z: number; r: number; color: number; wallYaw?: number }[]): PwBatch {
    const b = new PwBatch(this.atlas);
    const col = new THREE.Color();
    const base = new THREE.Color(Z1_GLINT_NEUTRAL);
    const hsl = { h: 0, s: 0, l: 0 };
    pools.forEach((d, i) => {
      if (d.wallYaw !== undefined) return;
      // (Headlamps and the floodlight lay none: their pools fall on the lanes the horde comes down, and a
      // patch of pale strokes there would be the brightest thing on the enemies' floor.)
      col.setHex(d.color).getHSL(hsl);
      if (hsl.l > 0.8) return;
      // (Every glint a little under its light's own colour.)
      pwPoolColor(col, d.color, 1 / PW_POOL_GAIN);
      const tint = [Math.min(1, (col.r / base.r) * 0.8), Math.min(1, (col.g / base.g) * 0.8), Math.min(1, (col.b / base.b) * 0.8)];
      const yaw = inAlley(d.x, d.z) ? Math.PI / 2 : 0;
      const y = isSidewalk(d.x, d.z) ? WALK_Y + 0.004 : ROAD_Y + 0.008;
      this.decal(b, i % 2 ? 'glintB' : 'glintA', d.x, y, d.z, yaw, undefined, undefined, i % 3 === 0, tint);
      // A big pool (a street lamp, the marquee) lays a second patch nearer the walker.
      if (d.r > 4.6) {
        const off = 1.7;
        this.decal(b, i % 2 ? 'glintA' : 'glintB', d.x + (yaw ? off : i % 2 ? 0.5 : -0.5), y, d.z + (yaw ? (i % 2 ? 0.5 : -0.5) : off), yaw, undefined, undefined, i % 3 !== 0, tint);
      }
    });
    return b;
  }

  /** Replace the tagged classic ground meshes of a zone (returns them for removal). */
  replaceTagged(b: PwBatch, zone: THREE.Object3D): THREE.Object3D[] {
    const found: THREE.Mesh[] = [];
    zone.traverse((o) => {
      if (o.userData.pwGround) found.push(o as THREE.Mesh);
    });
    // (The zone groups are named `zone<id>` by town.ts.)
    const ground = this.lay(b, zone.name.slice(-1) as ZoneId, zone);
    const trails = new Set<{ x: number; z: number; len: number; ry: number }>();
    const D = this.sheet.density;
    for (const m of found) {
      const tag = m.userData.pwGround as string;
      m.updateMatrixWorld(true);
      m.matrixWorld.decompose(_p, _q, _s);
      _e.setFromQuaternion(_q, 'YXZ');
      const yaw = _e.y;
      const g = m.geometry as THREE.CylinderGeometry & THREE.BoxGeometry;
      const k = hash2(Math.round(_p.x * 10), Math.round(_p.z * 10), 3);
      // Mirrored lights run toward the walker: decals with them lie along the way the rail takes there.
      const along = inAlley(_p.x, _p.z) ? Math.PI / 2 : 0;
      if (tag === 'puddle') {
        // A long sheet along the street where the classic puddle was big, a broad one across the lane otherwise.
        const r = g.parameters.radiusTop;
        const name: Z1DecalName = r > 1.9 ? 'puddleA' : r > 1.7 ? 'puddleD' : r > 1.45 ? 'puddleC' : 'puddleB';
        this.decal(b, name, _p.x, ROAD_Y, _p.z, along, undefined, undefined, k > 0.5);
      } else if (tag === 'manhole') this.decal(b, 'manhole', _p.x, ROAD_Y + 0.002, _p.z, along);
      else if (tag === 'blood') {
        const w = Math.min(2.6, g.parameters.radiusTop * 3.4);
        this.decal(b, 'blood', _p.x, 0.024, _p.z, yaw, w, w * 0.8, k > 0.5);
      } else if (tag === 'paper') {
        // Half of the classic scraps, each a drawn piece of litter at its painted size.
        if (k > 0.55) continue;
        const name: Z1DecalName = k < 0.2 ? 'paperA' : k < 0.34 ? 'paperB' : k < 0.42 ? 'paperC' : k < 0.48 ? 'can' : 'bottle';
        const y = isSidewalk(_p.x, _p.z) ? WALK_Y + 0.002 : 0.028;
        this.decal(b, name, _p.x, y, _p.z, Math.round(yaw / 0.4) * 0.4);
      } else if (tag === 'skid') {
        // One streak of the skid sheet along the box's long axis (its local z).
        const p = g.parameters;
        const c = Math.cos(yaw);
        const s = Math.sin(yaw);
        // Box local z (along) in world: (sin yaw, 0, cos yaw); decal u runs along it.
        _u.set(s, 0, c);
        _v.set(c, 0, -s).negate();
        _o.set(_p.x, 0.021, _p.z).addScaledVector(_u, -p.depth / 2).addScaledVector(_v, -0.08);
        const sub = decalSub(this.sheet, 'skid');
        const len = Math.min(Z1_DECALS.skid.w - 4, Math.round(p.depth * D));
        // (The lower streak of the sheet: canvas rows 44…58.)
        b.rect(_o, _u, _v, len / D, 14 / D, this.sheet, { sub: { x: sub.x + 2 + Math.floor(k * (Z1_DECALS.skid.w - 4 - len)), y: sub.y + 5, w: len, h: 14 } });
      } else if (tag === 'trail') trails.add(m.userData.pwTrail);
      // ('drop': blood drops round a pool — the painted pool has its own cast-off.)
    }
    for (const t of trails) {
      const L = t.len * 0.7;
      const n = Math.max(1, Math.round(L / 2));
      const seg = L / n;
      const dx = Math.sin(t.ry);
      const dz = Math.cos(t.ry);
      for (let i = 0; i < n; i++) {
        const d = seg * (i + 0.5);
        this.decal(b, 'bloodTrail', t.x + dx * d, 0.025, t.z + dz * d, t.ry - Math.PI / 2, seg, 1.5, i % 2 === 1);
      }
    }
    return [...found, ...ground];
  }

  /** The PixelWorld-only street dressing of one zone: the story told on the ground. */
  dress(b: PwBatch, id: ZoneId) {
    const put = (name: Z1DecalName, x: number, y: number, z: number, yaw = 0, w?: number, h?: number, flip = false) => {
      if (zoneFor(x, z) === id) this.decal(b, name, x, y, z, yaw, w, h, flip);
    };
    const H = (a: number, k: number) => hash2(Math.round(a * 7), k, 911);
    // The barricade (the cordon failed from the inside): spent shells, a cap, glass by the cruisers.
    put('shells', -1.6, ROAD_Y + 0.004, -3.2, 0.3);
    put('shells', 2.2, ROAD_Y + 0.004, -9.5, -0.5);
    put('hat', 0.9, ROAD_Y + 0.006, -6.4, 0.6);
    put('glass', -3.8, ROAD_Y + 0.003, -5.5, 0.2);
    put('glass', 4.2, ROAD_Y + 0.003, -11, -0.3);
    // Legends: SLOW and an arrow before the junction from each side (laid long: they read from the walker's eye),
    // KEEP CLEAR across Second Street in front of the police station (read coming out of the alley).
    put('slow', -3, ROAD_Y + 0.003, CROSS_Z0 + 17, 0, 2.5, 2.0);
    put('arrow', -3, ROAD_Y + 0.003, CROSS_Z0 + 10, 0, 1.0, 2.2);
    put('slow', 3, ROAD_Y + 0.003, CROSS_Z1 - 15, Math.PI, 2.5, 2.0);
    put('slow', SECOND_X - 3, ROAD_Y + 0.003, -120, 0, 2.5, 2.0);
    put('keepClear', SECOND_X + 2, ROAD_Y + 0.003, (ALLEY_S + ALLEY_N) / 2, Math.PI / 2, 4, 1.8);
    // The burnt car: a scorch ring under it, glass thrown across the lane, bottles from the looted liquor store.
    put('scorch', 3.2, ROAD_Y + 0.001, -66.5, 0.1, 4.4, 3.3);
    put('glass', 0.8, ROAD_Y + 0.004, -65, 0.4);
    put('bottle', 5.3, ROAD_Y + 0.006, -61.5, 1.9);
    put('bottle', 5.6, ROAD_Y + 0.006, -70.2, 0.4);
    put('can', 5.1, ROAD_Y + 0.006, -72.8, 2.6);
    // The gas station: fuel on the wet slab from the pumps toward the drums.
    put('fuel', -73.5, 0.03, (GAS_Z0 + GAS_Z1) / 2 + 2.5, 0.25, 4.6, 1.3);
    put('fuel', -70, 0.03, (GAS_Z0 + GAS_Z1) / 2 - 3, -0.5, 3.5, 1.0, true);
    // The bus: gouges where it slid, homework stuck to the wet road, glass.
    put('gouge', -56.2, ROAD_Y + 0.002, -239.5, -0.38, 1, 3);
    put('gouge', -59.4, ROAD_Y + 0.002, -241, -0.3, 1, 3, true);
    put('pages', -57.6, ROAD_Y + 0.005, -243.2, 0.2);
    put('pages', -60.4, ROAD_Y + 0.005, -246.5, -0.6, undefined, undefined, true);
    put('glass', -56.5, ROAD_Y + 0.004, -245.2, 0.1);
    // PRIME MEATS: the pool by the door and the drag that leads to it.
    put('blood', -58, 0.024, -298.5, 0.3, 2.4, 1.9);
    put('drag', -56.6, 0.025, -294.4, -0.35, 1.5, 3);
    put('drag', -59.8, 0.025, -291.2, 0.3, 1.5, 3, true);
    // Walks: litter and small street things, sparse (the modules carry the rest).
    const walks: [number, number, number, [number, number][]][] = [
      [7.75, 36, -200, [[CROSS_Z0 + 1, CROSS_Z1 - 1]]],
      [-7.75, 36, -200, [[CROSS_Z0 + 1, CROSS_Z1 - 1], [ALLEY_S + 1, ALLEY_N - 1]]],
      [SECOND_E - 1.75, -112, SQ_Z0 + 2, [[ALLEY_S + 1, ALLEY_N - 1]]],
      [SECOND_W + 1.75, -112, SQ_Z0 + 2, [[GAS_Z0 + 1, GAS_Z1 - 1]]],
    ];
    for (const [wx, z0, z1, skip] of walks) {
      for (let z = z0; z > z1; z -= 4.3) {
        if (skip.some(([a, c]) => z <= a && z >= c)) continue;
        const h = H(z, wx);
        const x = wx + (H(z, 21) - 0.5) * 2.4;
        if (h < 0.16) put(h < 0.07 ? 'paperA' : h < 0.12 ? 'paperB' : 'paperC', x, WALK_Y + 0.002, z, Math.round(H(z, 22) * 15) * 0.4);
        else if (h < 0.24) put('gum', x, WALK_Y + 0.001, z, 0);
        else if (h < 0.29) put('utility', x, WALK_Y + 0.001, z, 0);
        else if (h > 0.9) put('leaves', x, WALK_Y + 0.002, z, H(z, 26) * 6);
        else if (h > 0.84) put(h > 0.87 ? 'can' : 'bottle', x, WALK_Y + 0.004, z, H(z, 28) * 6);
      }
    }
    // The alley: a long puddle in the tar, litter along the walls.
    for (let x = -46; x < -12; x += 5.1) {
      const h = H(x, 41);
      const z = h > 0.5 ? ALLEY_S - 1.2 - H(x, 42) : ALLEY_N + 1.2 + H(x, 42);
      if (h < 0.25 || h > 0.8) put(h < 0.25 ? 'paperA' : 'paperC', x, 0.026, z, Math.round(H(x, 45) * 15) * 0.4);
      else if (h < 0.5) put('leaves', x, 0.026, z, H(x, 46) * 6);
      else if (h < 0.62) put('bottle', x, 0.026, z, H(x, 47) * 6);
    }
    put('puddleD', -20.5, ROAD_Y + 0.002, ALLEY_S - 2.2, Math.PI / 2);
    // The town square: rain standing in the low flags off the path, leaves round the trees, litter.
    for (let i = 0; i < 22; i++) {
      const x = SQ_X0 + 2 + H(i, 51) * (SQ_X1 - SQ_X0 - 4);
      const z = SQ_Z0 - 2 - H(i, 52) * (SQ_Z0 - SQ_Z1 - 4);
      const h = H(i, 53);
      // (Nothing new on the path the horde walks.)
      if (Math.abs(x - SECOND_X) < 3.4) continue;
      const name: Z1DecalName = h < 0.14 ? 'puddleB' : h < 0.42 ? 'leaves' : h < 0.66 ? 'paperA' : h < 0.8 ? 'paperB' : h < 0.9 ? 'bottle' : 'gum';
      put(name, x, 0.022, z, name === 'puddleB' ? 0 : H(i, 54) * 6);
    }
  }
}

/** In the alley (walked westward), for the way decals with mirrored lights lie. */
function inAlley(x: number, z: number): boolean {
  return x < -MAIN_FACADE + 0.5 && x > SECOND_E - 3.5 && z < ALLEY_S && z > ALLEY_N;
}

/** On a sidewalk slab (Main Street / Second Street sidewalks), for decal heights. */
function isSidewalk(x: number, z: number): boolean {
  if (z > -205 && Math.abs(x) >= 6 && Math.abs(x) <= 9.5 && !(z < CROSS_Z0 && z > CROSS_Z1)) return true;
  if (z < -110 && z > SQ_Z0 && ((x >= SECOND_E - 3.5 && x <= SECOND_E) || (x >= SECOND_W && x <= SECOND_W + 3.5))) return true;
  return false;
}
