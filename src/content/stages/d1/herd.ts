import * as THREE from 'three';
import { Kit } from '../../kit/ModelKit';
import type { World } from '../../../gameplay/World';
import { bake } from './props';

/**
 * Harmless herbivore scenery: a duck-billed stampede that thunders across the
 * road, and long-necks grazing at the edge of the meadow. Everything is drawn
 * with four InstancedMeshes (bodies + legs per species) and animated by hand.
 */

const _m = new THREE.Matrix4();
const _p = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _qb = new THREE.Quaternion();
const _s = new THREE.Vector3(1, 1, 1);
const _e = new THREE.Euler(0, 0, 0, 'YXZ');
const _hip = new THREE.Vector3();
const _c = new THREE.Color();

interface Runner {
  from: THREE.Vector3;
  to: THREE.Vector3;
  yaw: number;
  speed: number;
  delay: number;
  scale: number;
  phase: number;
  len: number;
}

function hadroBody(): THREE.BufferGeometry {
  const g = new THREE.Group();
  const blob = Kit.ico(1, 1);
  Kit.add(g, blob, Kit.mat(0xffffff), 0, 2.1, 0, 0, 0, 0, 0.85, 0.85, 1.6);
  Kit.add(g, Kit.cone(0.6, 3.6, 6), Kit.mat(0xffffff), 0, 2.2, -2.7, -Math.PI / 2 - 0.06, 0, 0);
  Kit.add(g, Kit.box(0.45, 0.5, 1.4), Kit.mat(0xffffff), 0, 2.75, 1.45, -0.7, 0, 0);
  Kit.add(g, Kit.box(0.42, 0.46, 0.8), Kit.mat(0xffffff), 0, 3.3, 2.05);
  Kit.add(g, Kit.box(0.5, 0.14, 0.55), Kit.mat(0xffffff), 0, 3.12, 2.6);
  Kit.add(g, Kit.cone(0.13, 1.2, 4), Kit.mat(0xffffff), 0, 3.75, 1.55, -1.15, 0, 0);
  for (const sx of [-1, 1]) Kit.add(g, Kit.box(0.14, 0.8, 0.16), Kit.mat(0xffffff), sx * 0.4, 1.55, 1.05, 0.3, 0, 0);
  return bake(g);
}

function sauroBody(): THREE.BufferGeometry {
  const g = new THREE.Group();
  Kit.add(g, Kit.ico(1, 1), Kit.mat(0xffffff), 0, 5.6, 0, 0, 0, 0, 2.2, 2.0, 3.6);
  Kit.add(g, Kit.cyl(0.42, 0.85, 9.5, 7), Kit.mat(0xffffff), 0, 10.0, 4.6, 0.62, 0, 0);
  Kit.add(g, Kit.box(0.7, 0.65, 1.4), Kit.mat(0xffffff), 0, 14.1, 7.6, 0.2, 0, 0);
  Kit.add(g, Kit.cone(1.0, 10, 7), Kit.mat(0xffffff), 0, 4.6, -7.4, -Math.PI / 2 - 0.15, 0, 0);
  return bake(g);
}

function legGeo(w: number, h: number, d: number): THREE.BufferGeometry {
  const g = new THREE.Group();
  Kit.add(g, Kit.box(w, h, d), Kit.mat(0xffffff), 0, -h / 2, 0);
  Kit.add(g, Kit.box(w * 1.2, h * 0.12, d * 1.5), Kit.mat(0xffffff), 0, -h * 0.94, d * 0.2);
  return bake(g);
}

export class Herd {
  readonly root = new THREE.Group();
  private hBody: THREE.InstancedMesh;
  private hLegs: THREE.InstancedMesh;
  private sBody: THREE.InstancedMesh;
  private sLegs: THREE.InstancedMesh;
  private runners: Runner[] = [];
  private giants: Runner[] = [];
  private startT = -1;
  private dustT = 0;
  private stompT = 0;
  private honkT = 0;
  private time = 0;
  private done = false;
  /** Long-necks are shown while the rig is between these rail distances. */
  giantsRange: [number, number] = [0, 0];

  constructor(hadros: { from: THREE.Vector3; to: THREE.Vector3; delay: number; speed: number; scale: number }[], giants: { from: THREE.Vector3; to: THREE.Vector3; speed: number }[]) {
    const mat = Kit.mat(0xffffff);
    this.hBody = new THREE.InstancedMesh(hadroBody(), mat, hadros.length);
    this.hLegs = new THREE.InstancedMesh(legGeo(0.36, 2.0, 0.46), mat, hadros.length * 2);
    this.sBody = new THREE.InstancedMesh(sauroBody(), mat, giants.length);
    this.sLegs = new THREE.InstancedMesh(legGeo(0.95, 5.0, 1.0), mat, giants.length * 4);
    const hCols = [0x7d8a44, 0x9c7f42, 0x6f7c56, 0x8e8a5a, 0xa48a4e];
    hadros.forEach((h, i) => {
      _p.subVectors(h.to, h.from);
      this.runners.push({ ...h, yaw: Math.atan2(_p.x, _p.z), phase: i * 1.7, len: _p.length() });
      _c.setHex(hCols[i % hCols.length]);
      this.hBody.setColorAt(i, _c);
      _c.multiplyScalar(0.75);
      this.hLegs.setColorAt(i * 2, _c);
      this.hLegs.setColorAt(i * 2 + 1, _c);
    });
    giants.forEach((h, i) => {
      _p.subVectors(h.to, h.from);
      this.giants.push({ ...h, delay: 0, scale: 1, yaw: Math.atan2(_p.x, _p.z), phase: i * 2.3, len: _p.length() });
      _c.setHex(i % 2 ? 0x8a8676 : 0x7c7a66);
      this.sBody.setColorAt(i, _c);
      _c.multiplyScalar(0.8);
      for (let k = 0; k < 4; k++) this.sLegs.setColorAt(i * 4 + k, _c);
    });
    for (const m of [this.hBody, this.hLegs, this.sBody, this.sLegs]) {
      m.frustumCulled = false;
      m.visible = false;
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.root.add(m);
    }
  }

  dispose() {
    for (const m of [this.hBody, this.hLegs, this.sBody, this.sLegs]) m.dispose();
  }

  get active() {
    return this.startT >= 0;
  }

  start(time: number) {
    if (this.startT < 0 && !this.done) this.startT = time;
  }

  update(dt: number, world: World) {
    this.time += dt;
    // ── Stampede ──
    if (this.startT >= 0) {
      const t = world.time - this.startT;
      let any = false;
      for (let i = 0; i < this.runners.length; i++) {
        const r = this.runners[i];
        const tt = t - r.delay;
        const k = tt <= 0 ? 0 : (tt * r.speed) / r.len;
        const vis = tt > 0 && k < 1;
        any ||= vis;
        const ph = tt * r.speed * 0.42 + r.phase;
        _p.lerpVectors(r.from, r.to, Math.min(1, Math.max(0, k)));
        const bob = Math.abs(Math.sin(ph)) * 0.35 * r.scale;
        _p.y += bob - (vis ? 0 : 200);
        _e.set(0.08 + Math.sin(ph * 2) * 0.05, r.yaw, Math.sin(ph) * 0.04);
        _qb.setFromEuler(_e);
        _s.setScalar(r.scale);
        _m.compose(_p, _qb, _s);
        this.hBody.setMatrixAt(i, _m);
        for (let s = 0; s < 2; s++) {
          const side = s === 0 ? 1 : -1;
          _hip.set(side * 0.42, 2.05, -0.2).multiplyScalar(r.scale).applyQuaternion(_qb).add(_p);
          _e.set(Math.sin(ph + s * Math.PI) * 0.75, r.yaw, 0);
          _q.setFromEuler(_e);
          _m.compose(_hip, _q, _s);
          this.hLegs.setMatrixAt(i * 2 + s, _m);
        }
      }
      this.hBody.visible = any;
      this.hLegs.visible = any;
      this.hBody.instanceMatrix.needsUpdate = true;
      this.hLegs.instanceMatrix.needsUpdate = true;
      if (any) {
        this.dustT -= dt;
        if (this.dustT <= 0) {
          this.dustT = 0.09;
          const r = this.runners[Math.floor(world.rng.next() * this.runners.length)];
          const tt = t - r.delay;
          const k = (tt * r.speed) / r.len;
          if (k > 0 && k < 1) {
            _p.lerpVectors(r.from, r.to, k);
            world.fx.dust(_p, 1.4, 0xa89070);
          }
        }
        this.stompT -= dt;
        if (this.stompT <= 0) {
          this.stompT = 0.32;
          world.audio.play('stomp', { volume: 0.45, vary: 0.25 });
          world.rig.shake(0.05);
        }
        this.honkT -= dt;
        if (this.honkT <= 0) {
          this.honkT = world.rng.range(0.9, 1.8);
          world.audio.play('dino_roar', { volume: 0.4, pitch: world.rng.range(1.5, 1.9) });
        }
      } else if (t > 1) {
        this.startT = -1;
        this.done = true;
      }
    }
    // ── Long-necks ──
    const d = world.rig.d;
    const show = d >= this.giantsRange[0] && d <= this.giantsRange[1];
    this.sBody.visible = show;
    this.sLegs.visible = show;
    if (!show) return;
    for (let i = 0; i < this.giants.length; i++) {
      const g = this.giants[i];
      const k = Math.min(1, ((this.time * g.speed) % g.len) / g.len);
      _p.lerpVectors(g.from, g.to, k);
      const ph = this.time * g.speed * 0.5 + g.phase;
      _p.y += Math.sin(ph * 2) * 0.12;
      _e.set(0, g.yaw, Math.sin(ph) * 0.02);
      _qb.setFromEuler(_e);
      _s.setScalar(1);
      _m.compose(_p, _qb, _s);
      this.sBody.setMatrixAt(i, _m);
      for (let k2 = 0; k2 < 4; k2++) {
        const sx = k2 % 2 ? 1 : -1;
        const sz = k2 < 2 ? 1.9 : -1.6;
        _hip.set(sx * 1.15, 5.2, sz).applyQuaternion(_qb).add(_p);
        const swing = Math.sin(ph + (k2 === 0 || k2 === 3 ? 0 : Math.PI)) * 0.3;
        _e.set(swing, g.yaw, 0);
        _q.setFromEuler(_e);
        _m.compose(_hip, _q, _s);
        this.sLegs.setMatrixAt(i * 4 + k2, _m);
      }
    }
    this.sBody.instanceMatrix.needsUpdate = true;
    this.sLegs.instanceMatrix.needsUpdate = true;
  }
}
