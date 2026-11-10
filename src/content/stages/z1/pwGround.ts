import * as THREE from 'three';
import type { PwAtlas, PwTile } from '../../pixelworld/atlas';
import type { PwBatch } from '../../pixelworld/batch';
import { PW_TPM } from '../../pixelworld/canvas';
import { decalSub, z1GroundDecals, Z1_DECALS, type Z1DecalName } from '../../pixelworld/z1ground';
import { z1KerbFaceTile, z1RoadOrder, z1RoadTile, z1WalkTile } from '../../pixelworld/z1road';
import { hash2 } from '../../pixelworld/surfaces';
import { texStd } from './bake';
import { ALLEY_N, ALLEY_S, CROSS_Z0, CROSS_Z1, GAS_Z0, GAS_Z1, MAIN_FACADE, SECOND_E, SECOND_W, SECOND_X, SQ_X0, SQ_X1, SQ_Z0, SQ_Z1 } from './layout';
import { M } from './props';
import { zoneFor, type ZoneId } from './town';

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
  constructor(readonly atlas: PwAtlas) {
    this.sheet = z1GroundDecals(atlas);
    this.road = [z1RoadTile(atlas, 0), z1RoadTile(atlas, 1), z1RoadTile(atlas, 2)];
    this.walk = [z1WalkTile(atlas, 0), z1WalkTile(atlas, 1)];
    this.kerb = z1KerbFaceTile(atlas);
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
      // (Main Street runs on through the junction for now: module index continues from zone A's 13.)
      this.street(b, 0, -60, -205, 1, 13);
      this.walkStrip(b, 6, F, -60, CROSS_Z0, -1, { n: true });
      this.walkStrip(b, 6, F, CROSS_Z1, -205, -1, { s: true });
      this.walkStrip(b, -F, -6, -60, CROSS_Z0, 1, { n: true });
      this.walkStrip(b, -F, -6, CROSS_Z1, ALLEY_S, 1, { s: true, n: true });
      this.walkStrip(b, -F, -6, ALLEY_N, -205, 1, { s: true });
    } else if (id === 'C') {
      this.street(b, SECOND_X, -110, -200, 2);
      this.walkStrip(b, SECOND_E - 3.5, SECOND_E, -110, ALLEY_S, -1, { n: true });
      this.walkStrip(b, SECOND_E - 3.5, SECOND_E, ALLEY_N, -200, -1, { s: true });
      this.walkStrip(b, SECOND_W, SECOND_W + 3.5, -110, GAS_Z0, 1, { n: true });
    } else if (id === 'D') {
      this.street(b, SECOND_X, -200, SQ_Z0, 2, 12);
      this.walkStrip(b, SECOND_E - 3.5, SECOND_E, -200, SQ_Z0, -1, { n: true });
      this.walkStrip(b, SECOND_W, SECOND_W + 3.5, GAS_Z1, SQ_Z0, 1, { s: true, n: true });
    }
    // The classic ground this replaces.
    const roads = new Set<THREE.Material>([texStd(0x23262e, 0.42, 0.1, 'asphalt', 1, 0.85)]);
    const out: THREE.Object3D[] = [];
    zone.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh || Array.isArray(m.material)) return;
      const p = (m.geometry as THREE.BoxGeometry).parameters as { width?: number; height?: number; depth?: number } | undefined;
      if (!p) return;
      const mat = m.material;
      // Street planes (not the cross street yet: it keeps its plane until the junction is painted).
      if (roads.has(mat) && m.geometry.type === 'PlaneGeometry' && p.width === 12) out.push(m);
      else if ((mat === M.yellowPaint || mat === M.whitePaint) && p.height === 0.012 && !(p.width === 0.55)) out.push(m);
      else if (mat === M.sidewalk && p.height === 0.15) out.push(m);
      else if (mat === M.curb && p.height === 0.17) out.push(m);
    });
    return out;
  }

  /**
   * A decal centred at (x, z), `w` × `h` metres (default: its painted size),
   * turned by `yaw` (radians, around +Y; at 0 the decal's up runs toward −Z).
   */
  decal(b: PwBatch, name: Z1DecalName, x: number, y: number, z: number, yaw = 0, w?: number, h?: number, flip = false) {
    const r = Z1_DECALS[name];
    const W = w ?? r.w / PW_TPM;
    const H = h ?? r.h / PW_TPM;
    const c = Math.cos(yaw);
    const s = Math.sin(yaw);
    _u.set(c, 0, -s);
    _v.set(-s, 0, -c);
    _o.set(x, y, z).addScaledVector(_u, -W / 2).addScaledVector(_v, -H / 2);
    b.rect(_o, _u, _v, W, H, this.sheet, { sub: decalSub(this.sheet, name), flipU: flip });
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
    for (const m of found) {
      const tag = m.userData.pwGround as string;
      m.updateMatrixWorld(true);
      m.matrixWorld.decompose(_p, _q, _s);
      _e.setFromQuaternion(_q, 'YXZ');
      const yaw = _e.y;
      const g = m.geometry as THREE.CylinderGeometry & THREE.BoxGeometry;
      const k = hash2(Math.round(_p.x * 10), Math.round(_p.z * 10), 3);
      if (tag === 'puddle') {
        const r = g.parameters.radiusTop;
        const name: Z1DecalName = r > 1.9 ? 'puddleA' : r > 1.45 ? 'puddleC' : 'puddleB';
        const want = (2 * r) / (Z1_DECALS[name].w / PW_TPM);
        // Scale toward the classic puddle (within reason: painted texels stay near the stage density).
        const f = Math.min(1.3, Math.max(0.8, want));
        this.decal(b, name, _p.x, ROAD_Y, _p.z, yaw, (Z1_DECALS[name].w / PW_TPM) * f, (Z1_DECALS[name].h / PW_TPM) * f, k > 0.5);
      } else if (tag === 'manhole') this.decal(b, 'manhole', _p.x, ROAD_Y + 0.002, _p.z, Math.round(k * 4) * (Math.PI / 2));
      else if (tag === 'blood') {
        const w = Math.min(2.6, g.parameters.radiusTop * 3.4);
        this.decal(b, 'blood', _p.x, 0.024, _p.z, yaw, w, w * 0.75, k > 0.5);
      } else if (tag === 'paper') {
        const p = g.parameters;
        const name: Z1DecalName = k < 0.4 ? 'paperA' : k < 0.75 ? 'paperB' : 'paperC';
        const y = isSidewalk(_p.x, _p.z) ? WALK_Y + 0.002 : 0.028;
        this.decal(b, name, _p.x, y, _p.z, yaw, Math.max(0.4, p.width * 1.4), Math.max(0.4, p.depth * 1.2));
      } else if (tag === 'skid') {
        // One streak of the skid sheet along the box's long axis (its local z).
        const p = g.parameters;
        const r = Z1_DECALS.skid;
        const c = Math.cos(yaw);
        const s = Math.sin(yaw);
        // Box local z (along) in world: (sin yaw, 0, cos yaw); decal u runs along it.
        _u.set(s, 0, c);
        _v.set(c, 0, -s).negate();
        _o.set(_p.x, 0.021, _p.z).addScaledVector(_u, -p.depth / 2).addScaledVector(_v, -0.15);
        const sub = decalSub(this.sheet, 'skid');
        b.rect(_o, _u, _v, p.depth, 0.3, this.sheet, { sub: { x: sub.x + Math.floor(k * 64), y: sub.y + r.h - 16, w: 64, h: 10 } });
      } else if (tag === 'trail') trails.add(m.userData.pwTrail);
      // ('drop': blood drops round a pool — the painted pool has its own spatter.)
    }
    for (const t of trails) {
      const L = t.len * 0.7;
      const n = Math.max(1, Math.round(L / 2));
      const seg = L / n;
      const dx = Math.sin(t.ry);
      const dz = Math.cos(t.ry);
      for (let i = 0; i < n; i++) {
        const d = seg * (i + 0.5);
        this.decal(b, 'bloodTrail', t.x + dx * d, 0.025, t.z + dz * d, t.ry - Math.PI / 2, seg, 1.2, i % 2 === 1);
      }
    }
    return [...found, ...ground];
  }

  /** The PixelWorld-only street dressing of one zone. */
  dress(b: PwBatch, id: ZoneId) {
    const put = (name: Z1DecalName, x: number, y: number, z: number, yaw = 0, w?: number, h?: number, flip = false) => {
      if (zoneFor(x, z) === id) this.decal(b, name, x, y, z, yaw, w, h, flip);
    };
    const H = (a: number, k: number) => hash2(Math.round(a * 7), k, 911);
    // Main Street (x −6…6, z 38…−200) and Second Street (x −64…−52, z −110…−262).
    const streets: { cx: number; z0: number; z1: number; skip: [number, number][] }[] = [
      { cx: 0, z0: 36, z1: -196, skip: [[CROSS_Z0 + 1, CROSS_Z1 - 1]] },
      { cx: SECOND_X, z0: -112, z1: SQ_Z0 + 2, skip: [[ALLEY_S + 1, ALLEY_N - 1]] },
    ];
    const inSkip = (z: number, skip: [number, number][]) => skip.some(([a, c]) => z <= a && z >= c);
    for (const st of streets) {
      // Storm drains at both curbs every 26 m.
      for (let z = st.z0 - 9; z > st.z1; z -= 26) {
        for (const side of [-1, 1]) if (!inSkip(z, st.skip)) put('drain', st.cx + side * 5.72, ROAD_Y, z, Math.PI / 2 * side, undefined, undefined, side < 0);
      }
      // Oil under the parking lanes and the driving lanes, potholes, tar patches.
      for (let z = st.z0 - 4; z > st.z1; z -= 7.3) {
        if (inSkip(z, st.skip)) continue;
        const h = H(z, st.cx);
        const side = h > 0.5 ? 1 : -1;
        if (h < 0.55) put('oil', st.cx + side * (1.6 + H(z, 3) * 2.6), ROAD_Y, z + H(z, 4) * 3, H(z, 5) * 3);
        if (H(z, 6) > 0.8) put('pothole', st.cx - side * (0.8 + H(z, 7) * 3.5), ROAD_Y + 0.001, z + 1.5, H(z, 8) * 3);
        if (H(z, 9) > 0.78) put('patch', st.cx + (H(z, 10) - 0.5) * 6, ROAD_Y - 0.001, z - 2, H(z, 11) > 0.5 ? 0 : Math.PI / 2);
        if (H(z, 12) > 0.88) put('puddleB', st.cx + side * (2 + H(z, 13) * 2.5), ROAD_Y + 0.002, z - 3, H(z, 14) * 3, undefined, undefined, H(z, 15) > 0.5);
      }
      // Sidewalk dressing: litter, gum, utility covers, cellar hatches by the shop fronts.
      const walkX = st.cx === 0 ? [7.6, -7.6] : [SECOND_E - 1.75, SECOND_W + 1.75];
      for (let z = st.z0 - 2; z > st.z1; z -= 3.7) {
        for (const wx of walkX) {
          if (st.cx === 0 && z < CROSS_Z0 + 1 && z > CROSS_Z1 - 1) continue;
          if (st.cx !== 0 && z < ALLEY_S + 1 && z > ALLEY_N - 1) continue;
          const h = H(z, wx);
          if (h < 0.2) put(h < 0.1 ? 'paperA' : 'paperB', wx + (H(z, 21) - 0.5) * 2.2, WALK_Y + 0.002, z, H(z, 22) * 6, 0.45, 0.45);
          else if (h < 0.32) put('gum', wx + (H(z, 23) - 0.5) * 2, WALK_Y + 0.001, z, 0);
          else if (h < 0.38) put('utility', wx + (H(z, 24) - 0.5) * 1.2, WALK_Y + 0.001, z, 0);
          else if (h > 0.93) put('cellar', wx + Math.sign(wx - st.cx) * 0.55, WALK_Y + 0.001, z, 0);
          else if (h > 0.86) put('leaves', wx + (H(z, 25) - 0.5) * 2, WALK_Y + 0.002, z, H(z, 26) * 6);
          else if (h > 0.82) put('can', wx + (H(z, 27) - 0.5) * 2.4, WALK_Y + 0.002, z, H(z, 28) * 6);
        }
      }
    }
    // Before the intersection: SLOW and a lane arrow (readable heading north, −Z).
    put('slow', -3, ROAD_Y + 0.003, CROSS_Z0 + 16, 0, 2.4, 1.2);
    put('arrow', -3, ROAD_Y + 0.003, CROSS_Z0 + 9, 0, 1.2, 1.2);
    put('slow', 3, ROAD_Y + 0.003, CROSS_Z1 - 14, Math.PI, 2.4, 1.2);
    put('slow', SECOND_X - 3, ROAD_Y + 0.003, -120, 0, 2.4, 1.2);
    // The cross street (x −60…60 at z −88…−102): drains, oil, a long tar snake patch.
    for (let x = -56; x <= 56; x += 9) {
      if (Math.abs(x) < 8) continue;
      put('oil', x, ROAD_Y, (CROSS_Z0 + CROSS_Z1) / 2 + (H(x, 31) - 0.5) * 8, H(x, 32) * 3);
      if (H(x, 33) > 0.6) put('patch', x + 3, ROAD_Y - 0.001, (CROSS_Z0 + CROSS_Z1) / 2 + (H(x, 34) - 0.5) * 6, Math.PI / 2);
    }
    // The alley (x −48…−10, z −151.5…−158.5): puddles, oil, litter, a drain down the middle.
    for (let x = -46; x < -10; x += 4.3) {
      const h = H(x, 41);
      const z = (ALLEY_S + ALLEY_N) / 2 + (H(x, 42) - 0.5) * 5;
      if (h < 0.3) put('puddleB', x, ROAD_Y + 0.002, z, H(x, 43) * 3);
      else if (h < 0.55) put('oil', x, ROAD_Y, z, H(x, 44) * 3);
      else if (h < 0.8) put(h < 0.68 ? 'paperA' : 'paperC', x, 0.026, z, H(x, 45) * 6, 0.45, 0.45);
      else put('leaves', x, 0.026, z, H(x, 46) * 6);
    }
    put('drain', -29, ROAD_Y, (ALLEY_S + ALLEY_N) / 2, 0);
    put('manhole', -38, ROAD_Y + 0.002, (ALLEY_S + ALLEY_N) / 2 + 1, 0.4);
    // The town square: puddles in the low flags, leaves round the trees, litter, blood by the butcher's.
    for (let i = 0; i < 26; i++) {
      const x = SQ_X0 + 2 + H(i, 51) * (SQ_X1 - SQ_X0 - 4);
      const z = SQ_Z0 - 2 - H(i, 52) * (SQ_Z0 - SQ_Z1 - 4);
      const h = H(i, 53);
      const name: Z1DecalName = h < 0.25 ? 'puddleC' : h < 0.45 ? 'leaves' : h < 0.7 ? 'paperA' : h < 0.85 ? 'paperB' : 'gum';
      put(name, x, 0.022, z, H(i, 54) * 6, name.startsWith('paper') ? 0.45 : undefined, name.startsWith('paper') ? 0.45 : undefined);
    }
    put('blood', -58, 0.024, -298.5, 0.3, 2.4, 1.8);
    put('bloodTrail', -55.5, 0.025, -295.5, -0.6, 2.2, 1.2);
    put('bloodTrail', -53.6, 0.025, -294.2, -0.6, 2.2, 1.2, true);
  }
}

/** On a sidewalk slab (Main Street / Second Street sidewalks), for decal heights. */
function isSidewalk(x: number, z: number): boolean {
  if (z > -205 && Math.abs(x) >= 6 && Math.abs(x) <= 9.5 && !(z < CROSS_Z0 && z > CROSS_Z1)) return true;
  if (z < -110 && z > SQ_Z0 && ((x >= SECOND_E - 3.5 && x <= SECOND_E) || (x >= SECOND_W && x <= SECOND_W + 3.5))) return true;
  return false;
}
