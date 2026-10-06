import * as THREE from 'three';
import { Kit } from '../../kit/ModelKit';
import { EnvKit } from '../../kit/EnvKit';
import { bake, glow, mat } from './bake';
import { beacon, box, cyl, floorQuad, frameZ, hazardBand, pipe, sign, slab, vent, wallX, wallZ } from './build';
import type { Ctx, RoomOut } from './ctx';
import { pixelText } from './font';
import { PUMP_SIDE_Z, ROOMS, TUNNEL, TUNNEL_SPOTS, dAtZ, railXAtZ } from './layout';
import { S } from './surf';

const _m = new THREE.Matrix4();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _q = new THREE.Quaternion();

/**
 * Instanced steam: each vent puffs a column of expanding, fading blobs.
 * One draw call for every vent in the zone.
 */
export function steamVents(ctx: Ctx, parent: THREE.Object3D, vents: { pos: THREE.Vector3; dir: THREE.Vector3; power: number }[]) {
  const per = 6;
  const mesh = new THREE.InstancedMesh(Kit.ico(0.3, 1), Kit.glow(0xc8ccd4, 0.55, true, 0.22), vents.length * per);
  mesh.frustumCulled = false;
  mesh.renderOrder = 4;
  parent.add(mesh);
  ctx.animators.push((_dt, t) => {
    if (!parent.visible) return;
    let i = 0;
    for (let k = 0; k < vents.length; k++) {
      const v = vents[k];
      // Bursty: strong puffs with lulls.
      const gust = 0.55 + 0.45 * Math.max(0, Math.sin(t * 0.9 + k * 2.1));
      for (let j = 0; j < per; j++) {
        const ph = (t * 0.85 + j / per + k * 0.31) % 1;
        const dist = ph * 2.2 * v.power;
        _p.copy(v.pos).addScaledVector(v.dir, dist);
        _p.y += ph * ph * 0.8;
        _p.x += Math.sin(t * 1.3 + j) * 0.12 * ph;
        const sc = (0.25 + ph * 1.6) * gust * (1 - ph * ph) * v.power;
        _s.setScalar(Math.max(0.001, sc));
        _m.compose(_p, _q, _s);
        mesh.setMatrixAt(i++, _m);
      }
    }
    mesh.instanceMatrix.needsUpdate = true;
  });
  return mesh;
}

// ─── Maintenance tunnel (walls follow the rail) ───────────────────────────

export function buildTunnel(ctx: Ctx): RoomOut & { alcove: THREE.Vector3 } {
  const root = new THREE.Group();
  root.name = 'tunnel';
  const stat = new THREE.Group();
  const shellG = new THREE.Group();
  const am = ctx.am;
  const curve = ctx.curve;
  const dA = dAtZ(TUNNEL.z0 - 0.2);
  const dB = dAtZ(TUNNEL.z1 + 0.2);
  const half = TUNNEL.half;
  const H = TUNNEL.h;
  const alcoveD = TUNNEL_SPOTS.alcove;
  const alcoveSide = -1;

  // Service-tunnel palette: bare cast concrete, green corrugated cladding at
  // waist height, a corrugated sheet ceiling, grated deck with hazard edges.
  const concrete = mat(0x666462, 'concrete', 1, 0.8);
  const paint = S.corrugated(0x3e5a48);
  const ceilMat = mat(0x4a4c52, 'corrugated', 1, 0.8);
  const step = 1.0;

  const deck = EnvKit.ribbon(curve, half * 2, S.grate(0x565a60), { from: dA, to: dB, step, y: 0.01 });
  deck.userData.pw = 'deck';
  stat.add(deck);
  for (const s of [-1, 1]) {
    const edge = EnvKit.ribbon(curve, 0.3, S.hazard(), { from: dA, to: dB, step, y: 0.02, offset: s * (half - 0.3) });
    edge.userData.pw = 'deck';
    stat.add(edge);
  }

  const pipeRuns: { side: number; y: number; r: number; m: THREE.Material; inset: number }[] = [
    { side: -1, y: 2.65, r: 0.17, m: S.metal(0x9a3e2a), inset: 0.32 },
    { side: -1, y: 2.15, r: 0.1, m: S.metal(0x3a7a50), inset: 0.25 },
    { side: 1, y: 2.55, r: 0.14, m: S.metal(0x7a7e86), inset: 0.3 },
    { side: 1, y: 0.55, r: 0.12, m: S.metal(0x2e5288), inset: 0.26 },
    { side: 1, y: 2.95, r: 0.07, m: S.metal(0xd0a820), inset: 0.2 },
  ];
  const prev: (THREE.Vector3 | null)[] = pipeRuns.map(() => null);
  let lampI = 0;
  for (let d = dA; d < dB - 0.01; d += step) {
    const d1 = Math.min(dB, d + step);
    const f0 = EnvKit.frameAt(curve, d);
    const f1 = EnvKit.frameAt(curve, d1);
    for (const s of [-1, 1]) {
      const inAlcove = s === alcoveSide && d + step > alcoveD - 1.1 && d < alcoveD + 1.1;
      const a = f0.pos.clone().addScaledVector(f0.right, s * (half + 0.15));
      const b = f1.pos.clone().addScaledVector(f1.right, s * (half + 0.15));
      const mid = a.clone().add(b).multiplyScalar(0.5);
      const len = a.distanceTo(b) + 0.06;
      const yaw = Math.atan2(b.x - a.x, b.z - a.z);
      if (!inAlcove) {
        Kit.add(shellG, Kit.box(0.3, H, len), concrete, mid.x, H / 2, mid.z, 0, yaw, 0);
        const ia = f0.pos.clone().addScaledVector(f0.right, s * (half - 0.01));
        const ib = f1.pos.clone().addScaledVector(f1.right, s * (half - 0.01));
        const im = ia.add(ib).multiplyScalar(0.5);
        Kit.add(stat, Kit.box(0.04, 1.2, len), paint, im.x, 0.6, im.z, 0, yaw, 0).userData.pw = 'clad';
      } else {
        Kit.add(stat, Kit.box(0.3, H - 2.6, len), concrete, mid.x, 2.6 + (H - 2.6) / 2, mid.z, 0, yaw, 0).userData.pw = 'alcoveTop';
      }
    }
    // Ceiling.
    const c = f0.pos.clone().add(f1.pos).multiplyScalar(0.5);
    Kit.add(shellG, Kit.box(half * 2 + 0.6, 0.25, f0.pos.distanceTo(f1.pos) + 0.06), ceilMat, c.x, H + 0.12, c.z, 0, Math.atan2(f1.pos.x - f0.pos.x, f1.pos.z - f0.pos.z), 0);
    // Pipes (straight runs between sample points, every 2 m).
    if (Math.round((d - dA) / step) % 2 === 0) {
      pipeRuns.forEach((r, i) => {
        if (r.side === alcoveSide && Math.abs(d - alcoveD) < 1.6 && r.y < 2.6) {
          prev[i] = null;
          return;
        }
        const p = f0.pos.clone().addScaledVector(f0.right, r.side * (half - r.inset)).setY(r.y);
        const q = prev[i];
        if (q) pipe(stat, r.m, q, p, r.r, 8);
        prev[i] = p;
      });
    }
    // Brackets, lamps, beacons.
    const k = Math.round((d - dA) / step);
    if (k % 3 === 0) {
      for (const s of [-1, 1]) {
        const p = f0.pos.clone().addScaledVector(f0.right, s * (half - 0.2));
        Kit.add(stat, Kit.box(0.08, 2.8, 0.08), S.metal(0x34363c), p.x, 1.5, p.z, 0, f0.heading, 0);
      }
    }
    if (k % 6 === 3) {
      const p = f0.pos.clone().setY(H - 0.12);
      const lm = lampI % 3 === 2 ? am.flicker : glow(0xffe6c0, 1.05);
      Kit.add(stat, Kit.box(0.5, 0.06, 0.2), S.metal(0x34363c), p.x, p.y, p.z, 0, f0.heading, 0);
      Kit.add(stat, Kit.box(0.4, 0.08, 0.14), lm, p.x, p.y - 0.06, p.z, 0, f0.heading, 0);
      for (const o of [-0.15, 0, 0.15]) {
        const q = p.clone().addScaledVector(f0.forward, o);
        Kit.add(stat, Kit.box(0.02, 0.12, 0.2), S.metal(0x1a1a1a), q.x, q.y - 0.1, q.z, 0, f0.heading, 0);
      }
      lampI++;
    }
    if (k % 9 === 5) {
      const s = k % 18 === 5 ? 1 : -1;
      const p = f0.pos.clone().addScaledVector(f0.right, s * (half - 0.12));
      beacon(stat, am.strobe, p.x, 2.0, p.z, f0.heading + (s > 0 ? Math.PI / 2 : -Math.PI / 2));
    }
  }

  // Wall signage + valves + junction boxes.
  const deco = (dd: number, s: number, fn: (g: THREE.Group) => void) => {
    const f = EnvKit.frameAt(curve, dd);
    const g = new THREE.Group();
    g.position.copy(f.pos).addScaledVector(f.right, s * (half - 0.03));
    g.rotation.y = f.heading + (s > 0 ? Math.PI / 2 : -Math.PI / 2);
    stat.add(g);
    fn(g);
  };
  deco(dA + 3, -1, (g) => pixelText(g, 'B-2', S.plain(0xe0b020), 0, 1.7, 0.02, 0.09, 0, 0.02));
  deco(dA + 15, 1, (g) => pixelText(g, 'PUMP ROOM', S.plain(0xe8e8e8), 0, 1.65, 0.02, 0.05, 0, 0.02));
  deco(dA + 15, 1, (g) => box(g, S.plain(0xe8e8e8), 0.95, 1.65, 0.02, 0.3, 0.06, 0.02));
  for (const [dd, s] of [
    [dA + 8, 1],
    [dA + 24, -1],
    [dA + 38, 1],
  ] as [number, number][]) {
    deco(dd, s, (g) => {
      box(g, S.metal(0x6a6e74), 0, 1.4, 0.12, 0.5, 0.7, 0.22);
      box(g, S.plain(0xe0b020), 0, 1.6, 0.24, 0.12, 0.12, 0.02);
      box(g, glow(0x40ff60, 1.2), 0.15, 1.25, 0.24, 0.04, 0.04, 0.02);
    });
  }
  for (const [dd, s] of [
    [dA + 12, -1],
    [dA + 31, 1],
  ] as [number, number][]) {
    deco(dd, s, (g) => {
      Kit.add(g, Kit.cyl(0.05, 0.05, 0.35, 6), S.metal(0x4a4e54), 0, 1.3, 0.17, Math.PI / 2, 0, 0);
      Kit.add(g, Kit.cyl(0.26, 0.26, 0.04, 12), S.metal(0xc02e1e), 0, 1.3, 0.35, Math.PI / 2, 0, 0);
    });
  }
  // Alcove (a raptor waits in here).
  {
    const f = EnvKit.frameAt(curve, alcoveD);
    const g = new THREE.Group();
    g.position.copy(f.pos).addScaledVector(f.right, alcoveSide * half);
    g.rotation.y = f.heading;
    stat.add(g);
    const sx = alcoveSide;
    box(g, mat(0x3a3a3c, 'concrete', 1, 0.8), sx * 2.2, 1.3, 0, 0.2, 2.6, 2.4);
    box(g, S.plain(0x1a1c20), sx * 1.1, 2.65, 0, 2.4, 0.1, 2.4);
    box(g, concrete, sx * 1.1, 1.3, 1.15, 2.4, 2.6, 0.2);
    box(g, concrete, sx * 1.1, 1.3, -1.15, 2.4, 2.6, 0.2);
    box(g, S.grate(0x3a3c40), sx * 1.1, 0.01, 0, 2.4, 0.02, 2.4);
    for (let i = 0; i < 3; i++) box(g, S.planks(0x6a5236), sx * (1.6 + (i % 2) * 0.3), 0.3 + Math.floor(i / 2) * 0.55, -0.6 + i * 0.5, 0.5, 0.5, 0.5).userData.pw = 'crate';
  }
  const alcove = EnvKit.besideRail(curve, alcoveD, alcoveSide * (half + 1.3));
  for (const vd of TUNNEL_SPOTS.vents) {
    const f = EnvKit.frameAt(curve, vd);
    vent(stat, f.pos.x, H - 0.02, f.pos.z, 0.8, 0.8);
  }

  // Steam leaks from the pipe runs.
  const vents: { pos: THREE.Vector3; dir: THREE.Vector3; power: number }[] = [];
  for (const [dd, s, y] of [
    [dA + 6, -1, 2.65],
    [dA + 20, 1, 2.55],
    [dA + 34, -1, 2.15],
    [dA + 46, 1, 0.55],
  ] as [number, number, number][]) {
    const f = EnvKit.frameAt(curve, dd);
    const pos = f.pos.clone().addScaledVector(f.right, s * (half - 0.45)).setY(y);
    vents.push({ pos, dir: f.right.clone().multiplyScalar(-s).setY(0.15).normalize(), power: 0.9 });
  }
  steamVents(ctx, root, vents);

  ctx.pw?.room('tunnel', { root, stat, shell: shellG });
  bake(stat);
  bake(shellG);
  root.add(stat, shellG);
  return { root, shell: shellG.children.slice(), alcove };
}

// ─── Pump room ────────────────────────────────────────────────────────────

export function buildPump(ctx: Ctx): RoomOut {
  const R = ROOMS.pump;
  const root = new THREE.Group();
  root.name = 'pump';
  const stat = new THREE.Group();
  const shellG = new THREE.Group();
  const am = ctx.am;
  const cx = railXAtZ(R.z0);
  const exitX = railXAtZ(R.z1);
  const sideZ = PUMP_SIDE_Z;

  // Pump-room palette: concrete shell, corrugated cladding, painted
  // machinery (all one metal recipe), oil-stained concrete floor.
  const concrete = mat(0x6e6a66, 'concrete', 1, 0.8);
  const band = S.corrugated(0x3e5a48);
  const steel = S.metal(0x5e646c);
  const green = S.metal(0x3e6a52);
  const rust = S.metal(0x9a5230);

  floorQuad(stat, mat(0x5a5854, 'concrete', 0.8, 0.85), R.x0, R.x1, R.z1, R.z0, 0.002);
  wallZ(shellG, concrete, R.z0, R.x0, R.x1, R.h, [{ c: cx, w: TUNNEL.half * 2 + 0.3, h: TUNNEL.h }]);
  wallZ(shellG, concrete, R.z1, R.x0, R.x1, R.h, [{ c: exitX, w: 4.4, h: 3.8 }]);
  wallX(shellG, concrete, R.x0, R.z0, R.z1, R.h, [{ c: sideZ, w: 3.2, h: 3.0 }]);
  wallX(shellG, concrete, R.x1, R.z0, R.z1, R.h, [{ c: sideZ, w: 3.2, h: 3.0 }]);
  slab(shellG, mat(0x4a4c52, 'corrugated', 1, 0.8), R.x0, R.x1, R.h, R.h + 0.3, R.z1, R.z0);
  for (const x of [R.x0 + 0.21, R.x1 - 0.21]) slab(stat, band, x - 0.03, x + 0.03, 0, 1.4, R.z1, R.z0).userData.pw = 'band';
  // Side tunnels (dark) behind the openings.
  for (const s of [-1, 1]) {
    const x = s < 0 ? R.x0 : R.x1;
    slab(stat, S.plain(0x0c0d10), Math.min(x + s * 0.2, x + s * 7), Math.max(x + s * 0.2, x + s * 7), 0, 3.2, sideZ - 1.7, sideZ + 1.7).userData.pw = 'void';
    hazardBand(stat, x - 0.2, x + 0.2, sideZ, 3.2);
    beacon(stat, am.strobe, x - s * 0.25, 3.3, sideZ + 2.0, s < 0 ? Math.PI / 2 : -Math.PI / 2);
  }
  // Two big horizontal tanks on cradles at the back corners.
  for (const s of [-1, 1]) {
    const tx = cx + s * 5.2;
    const tz = R.z1 + 3.2;
    Kit.add(stat, Kit.cyl(1.15, 1.15, 4.2, 14), green, tx, 1.55, tz, 0, 0, Math.PI / 2);
    Kit.add(stat, Kit.sphere(1.15, 14, 6), green, tx - 2.1, 1.55, tz, 0, 0, 0, 0.35, 1, 1);
    Kit.add(stat, Kit.sphere(1.15, 14, 6), green, tx + 2.1, 1.55, tz, 0, 0, 0, 0.35, 1, 1);
    for (const dx of [-1.3, 1.3]) box(stat, steel, tx + dx, 0.45, tz, 0.3, 0.9, 1.9);
    pipe(stat, rust, new THREE.Vector3(tx, 2.6, tz), new THREE.Vector3(tx, R.h, tz), 0.22, 10);
    Kit.add(stat, Kit.cyl(0.18, 0.18, 0.04, 12), glow(0xf0f0e0, 0.8), tx + s * -1.2, 1.9, tz + 1.16, Math.PI / 2, 0, 0);
  }
  // Pump motors along the side walls + overhead manifold.
  for (const s of [-1, 1]) {
    for (const z of [-279.5, -291]) {
      const mx = s < 0 ? R.x0 + 1.3 : R.x1 - 1.3;
      box(stat, steel, mx, 0.6, z, 1.4, 1.2, 1.6).userData.pw = 'pumpBox';
      Kit.add(stat, Kit.cyl(0.45, 0.45, 1.2, 12), S.metal(0x2e6098), mx, 1.55, z, 0, 0, Math.PI / 2);
      pipe(stat, rust, new THREE.Vector3(mx, 1.2, z), new THREE.Vector3(mx, R.h - 0.6, z), 0.16, 8);
    }
  }
  slab(stat, rust, R.x0 + 0.6, R.x1 - 0.6, R.h - 0.8, R.h - 0.5, -279.4, -279.7);
  slab(stat, rust, R.x0 + 0.6, R.x1 - 0.6, R.h - 0.8, R.h - 0.5, -290.9, -291.2);
  // Control console with blinking buttons.
  // (Tucked beside the entrance, out of the view from the tunnel-mouth hold.)
  const conX = cx + 5.6;
  box(stat, steel, conX, 0.55, R.z0 - 1.2, 1.6, 1.1, 0.6);
  for (let i = 0; i < 8; i++) box(stat, am.leds[i % 3], conX - 0.6 + (i % 4) * 0.4, 1.12, R.z0 - 1.0 - Math.floor(i / 4) * 0.2, 0.08, 0.04, 0.08);
  box(stat, am.screen, conX, 1.45, R.z0 - 1.48, 0.9, 0.5, 0.02);
  // Exit: blast-door frame into the containment wing.
  frameZ(stat, S.metal(0x3e444c), R.z1 + 0.1, exitX, 4.4, 3.8, 0.9);
  hazardBand(stat, exitX - 2.2, exitX + 2.2, R.z1 + 0.7, 0.6);
  sign(stat, 'CONTAINMENT WING', exitX, 4.5, R.z1 + 0.4, 0, 0.06, 0x6a1010, glow(0xffe0d0, 0.9));
  beacon(stat, am.strobe, exitX - 2.9, 3.6, R.z1 + 0.3, 0);
  beacon(stat, am.strobe, exitX + 2.9, 3.6, R.z1 + 0.3, 0);
  for (let z = R.z0 - 3; z > R.z1 + 2; z -= 6) {
    box(stat, S.metal(0x34363c), cx, R.h - 0.1, z, 0.6, 0.08, 0.3);
    box(stat, glow(0xffe6c0, 1.0), cx, R.h - 0.16, z, 0.5, 0.06, 0.2);
  }
  cyl(stat, S.metal(0x24262a), cx - 1.5, 0.01, -288, 0.5, 0.02, 10).userData.pw = 'drain';

  steamVents(ctx, root, [
    { pos: new THREE.Vector3(cx - 5.2, 2.7, R.z1 + 3.2), dir: new THREE.Vector3(0.3, 1, 0.2).normalize(), power: 1.0 },
    { pos: new THREE.Vector3(R.x1 - 1.3, 3.2, -291), dir: new THREE.Vector3(-1, 0.4, 0.3).normalize(), power: 0.8 },
  ]);

  ctx.pw?.room('pump', { root, stat, shell: shellG });
  bake(stat);
  bake(shellG);
  root.add(stat, shellG);
  return { root, shell: shellG.children.slice() };
}
