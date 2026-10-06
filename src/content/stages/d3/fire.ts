import * as THREE from 'three';
import { Kit } from '../../kit/ModelKit';
import type { World } from '../../../gameplay/World';

const _v = new THREE.Vector3();

/**
 * A cheap burning fire: a few glowing flame cones that flicker and lick
 * upward, plus occasional smoke puffs and embers via world.fx. Rain doesn't
 * put it out (it's jet fuel).
 */
export class Fire {
  readonly group = new THREE.Group();
  private flames: { m: THREE.Mesh; ph: number; s: number; x: number; z: number }[] = [];
  private t = 0;
  private smokeT = 0;
  private seed: number;

  /**
   * `card` (ART: PIXEL WORLD): a painted, animated flame card `w` × `h` m (centred) instead of
   * each glowing cone — same placement and flicker.
   */
  constructor(
    pos: THREE.Vector3,
    private size = 1,
    seed = 1,
    card?: (w: number, h: number) => THREE.Mesh,
  ) {
    this.seed = seed;
    this.group.position.copy(pos);
    const outer = Kit.glow(0xff6a18, 1.5, true, 0.8);
    const inner = Kit.glow(0xffd060, 1.8, true, 0.9);
    const n = Math.max(3, Math.round(3 + size * 2));
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + seed;
      const r = (i === 0 ? 0 : 0.45) * size;
      const big = i % 2 === 0;
      const m = card ? card(1.1 * size * (big ? 1 : 0.7), 1.9 * size) : Kit.add(this.group, Kit.cone(0.35 * size * (big ? 1 : 0.7), 1.6 * size, 5), big ? outer : inner);
      if (card) {
        m.rotation.y = a;
        this.group.add(m);
      }
      m.position.set(Math.cos(a) * r, 0.8 * size, Math.sin(a) * r);
      m.renderOrder = 3;
      this.flames.push({ m, ph: i * 1.7 + seed * 3.1, s: big ? 1 : 0.75, x: m.position.x, z: m.position.z });
    }
  }

  /** 0..1 flicker brightness (for a point light). */
  flicker = 1;

  update(dt: number, world: World | null) {
    this.t += dt;
    let sum = 0;
    for (const f of this.flames) {
      const k = 0.75 + Math.sin(this.t * 13 + f.ph) * 0.15 + Math.sin(this.t * 23.7 + f.ph * 2) * 0.1;
      f.m.scale.set(f.s * (1.1 - k * 0.2), f.s * k * 1.15, f.s * (1.1 - k * 0.2));
      f.m.position.y = 0.8 * this.size * f.m.scale.y;
      f.m.position.x = f.x + Math.sin(this.t * 3 + f.ph) * 0.08 * this.size;
      f.m.position.z = f.z + Math.cos(this.t * 2.6 + f.ph) * 0.08 * this.size;
      sum += k;
    }
    this.flicker = sum / this.flames.length;
    if (world) {
      this.smokeT -= dt;
      if (this.smokeT <= 0) {
        this.smokeT = 0.35 + ((Math.sin(this.t * 7.3 + this.seed) + 1) * 0.15);
        this.group.getWorldPosition(_v);
        _v.y += 1.8 * this.size;
        world.fx.dust(_v, 0.8 * this.size, 0x1a1816);
        if (Math.sin(this.t * 5.1 + this.seed) > 0.3) world.fx.sparks(_v, null, 2);
      }
    }
  }
}
