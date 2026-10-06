import * as THREE from 'three';
import type { PwAtlas, PwTile } from '../../pixelworld/atlas';
import type { PwBatch } from '../../pixelworld/batch';
import { PW_TPM, PwRng } from '../../pixelworld/canvas';
import { hash2 } from '../../pixelworld/surfaces';
import {
  LANE_H, LANE_W, z3BloodDecal, z3SpillDecal, z3DebrisDecal, z3LaneTile, z3LineTile, z3MedianTile, z3OilDecal, z3PotholeDecal, z3ScorchDecal, z3ShoulderTile, z3SkidDecal,
  type LineKind,
} from '../../pixelworld/z3road';
import type { Ctx } from './scenery';
import { D } from './layout';

/**
 * HIGHWAY TO HELL's road in ART: PIXEL WORLD: the interstate's cross-section
 * laid as painted ribbons along the rail (each lane its own ribbon and its own
 * offset into the 16 m lane tile, so no two lanes repeat together), the
 * shoulders and the median strip, the lines as cut-out ribbons over them, and
 * decals laid by rule along each 50 m chunk (skids, oil, potholes, debris) —
 * the wrecks add their own (scorch, oil, glass, blood) where they stand.
 */

const Y = new THREE.Vector3(0, 1, 0);

/** Lateral bands (rig-relative x): [centre, width, kind]. */
type Band = { x: number; w: number; tile: () => PwTile; lane?: number; u0?: number };

export class Z3Road {
  readonly t: {
    lane: PwTile;
    spill: PwTile;
    shoulderL: PwTile;
    shoulderR: PwTile;
    median: PwTile;
    line: Record<LineKind, PwTile>;
    skid: PwTile[];
    oil: PwTile[];
    scorch: PwTile;
    blood: PwTile[];
    debris: PwTile;
    pothole: PwTile;
  };
  private bands: Band[];

  constructor(
    readonly atlas: PwAtlas,
    private ctx: Ctx,
  ) {
    const a = atlas;
    this.t = {
      lane: z3LaneTile(a),
      spill: z3SpillDecal(a),
      shoulderL: z3ShoulderTile(a, 'left'),
      shoulderR: z3ShoulderTile(a, 'right'),
      median: z3MedianTile(a),
      line: { dash: z3LineTile(a, 'dash'), white: z3LineTile(a, 'white'), yellow: z3LineTile(a, 'yellow') },
      skid: [z3SkidDecal(a, 0), z3SkidDecal(a, 1)],
      oil: [z3OilDecal(a, 0), z3OilDecal(a, 1)],
      scorch: z3ScorchDecal(a),
      blood: [z3BloodDecal(a, 0), z3BloodDecal(a, 1)],
      debris: z3DebrisDecal(a),
      pothole: z3PotholeDecal(a),
    };
    const t = this.t;
    this.bands = [
      { x: -20.6, w: 1.2, tile: () => t.shoulderR },
      { x: -18.1, w: 3.8, tile: () => t.lane, lane: 0, u0: LANE_W },
      { x: -14.3, w: 3.8, tile: () => t.lane, lane: 1, u0: LANE_W },
      { x: -10.5, w: 3.8, tile: () => t.lane, lane: 2, u0: LANE_W },
      { x: -7.1, w: 3.0, tile: () => t.median },
      { x: -3.733, w: 3.733, tile: () => t.lane, lane: 3 },
      { x: 0, w: 3.733, tile: () => t.lane, lane: 4 },
      { x: 3.733, w: 3.733, tile: () => t.lane, lane: 5 },
      { x: 7.0, w: 2.8, tile: () => t.shoulderL },
    ];
  }

  /** Rail points d0…d1 every 5 m (the classic road strip's own sampling). */
  private path(d0: number, d1: number): THREE.Vector3[] {
    const pts: THREE.Vector3[] = [];
    for (let d = d0; d <= d1 + 0.001; d += 5) pts.push(this.ctx.frame(Math.min(d, d1)).pos.clone());
    return pts;
  }

  /** Lay the painted road over rail distances d0…d1 (one classic road strip's stretch). */
  lay(b: PwBatch, d0: number, d1: number) {
    const pts = this.path(d0, d1);
    const v0 = d0 * PW_TPM;
    for (const band of this.bands) {
      const tile = band.tile();
      // Each lane slides its own way through the 16 m tile (and the oncoming lanes run mirrored).
      const off = band.lane !== undefined ? Math.floor(hash2(band.lane, 3, 17) * LANE_H) : Math.floor(hash2(Math.round(band.x), 4, 17) * tile.h);
      b.ribbon(pts, band.w, tile, { offset: band.x, y: 0, v0: v0 + off, u0: band.u0 ?? 0 });
    }
    const L = this.t.line;
    for (const [x, kind] of [
      [5.6, 'white'],
      [-5.6, 'yellow'],
      [-8.6, 'yellow'],
      [-20.0, 'white'],
      [-1.867, 'dash'],
      [1.867, 'dash'],
      [-12.4, 'dash'],
      [-16.2, 'dash'],
    ] as const) {
      b.ribbon(pts, 0.5, L[kind], { offset: x, y: 0.025, v0 });
    }
    this.decals(b, d0, d1);
  }

  /** Scattered road decals for one stretch (seeded by the stretch: never the world's RNG). */
  private decals(b: PwBatch, d0: number, d1: number) {
    const rng = new PwRng(Math.round(d0 * 13 + 7));
    const t = this.t;
    const len = d1 - d0;
    const n = Math.round(len / 9);
    for (let i = 0; i < n; i++) {
      const d = d0 + rng.next() * len;
      // Keep the tunnel bore's lanes cleaner (its walls are close).
      const inTunnel = d > D.TUNNEL_FROM && d < D.TUNNEL_TO;
      const x = rng.pick(inTunnel ? [-3.7, 0, 3.7] : [-3.7, 0, 3.7, -18.1, -14.3, -10.5, 7.0]) + rng.spread(1.2);
      const yaw = rng.spread(0.25);
      const r = rng.next();
      if (r < 0.32) this.decal(b, d, x, 1.25, 6, yaw + rng.spread(0.2), rng.pick(t.skid), 0.014);
      else if (r < 0.6) this.decal(b, d, x, 2.0, 1.5, rng.next() * 6, rng.pick(t.oil), 0.016);
      else if (r < 0.72) this.decal(b, d, x, 1.5, 1.25, rng.next() * 6, t.pothole, 0.015);
      else if (r < 0.85 && !inTunnel) this.decal(b, d, x, 2, 1.5, rng.next() * 6, t.debris, 0.017);
    }
  }

  /** A flat module on the road at rail distance d, x right, `w` × `l` metres (l along the rail), turned by `yaw`. */
  decal(b: PwBatch, d: number, x: number, w: number, l: number, yaw: number, tile: PwTile, y = 0.015) {
    const f = this.ctx.frame(d);
    const c = f.pos.clone().addScaledVector(f.right, x);
    const ax = f.right.clone().applyAxisAngle(Y, yaw);
    const az = f.forward.clone().applyAxisAngle(Y, yaw);
    const o = c.addScaledVector(ax, -w / 2).addScaledVector(az, -l / 2);
    o.y = f.pos.y + y;
    b.rect(o, ax, az, w, l, tile);
  }

  /** Decal at a world point (wrecks): `w` × `l` metres, `yaw` about +Y (0 = along −Z). */
  decalAt(b: PwBatch, p: THREE.Vector3, w: number, l: number, yaw: number, tile: PwTile, y = 0.012) {
    const ax = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
    const az = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
    const o = new THREE.Vector3(p.x, y, p.z).addScaledVector(ax, -w / 2).addScaledVector(az, -l / 2);
    b.rect(o, ax, az, w, l, tile);
  }
}
