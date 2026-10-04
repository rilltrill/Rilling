import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { RailRig } from '../../src/gameplay/RailRig';
import type { V3 } from '../../src/core/types';

const DT = 1 / 60;

function rig(points: V3[]) {
  const r = new RailRig(new THREE.PerspectiveCamera(60, 844 / 390, 0.05, 400));
  r.setPath(points);
  return r;
}

/** Quarter circle turning right: starts heading -Z at the origin, ends heading +X at (R, 0, -R). */
function rightTurn(R = 40, n = 12): V3[] {
  const pts: V3[] = [];
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * (Math.PI / 2);
    pts.push([R - R * Math.cos(a), 0, -R * Math.sin(a)]);
  }
  return pts;
}

function close(v: THREE.Vector3, x: number, y: number, z: number, eps = 0.05) {
  expect(v.x).toBeCloseTo(x, -Math.log10(eps));
  expect(v.y).toBeCloseTo(y, -Math.log10(eps));
  expect(v.z).toBeCloseTo(z, -Math.log10(eps));
}

describe('RailRig — movement', () => {
  it('measures the rail and starts at d = 0, stopped', () => {
    const r = rig([[0, 0, 0], [0, 0, -100]]);
    expect(r.length).toBeCloseTo(100, 1);
    expect(r.d).toBe(0);
    expect(r.speed).toBe(0);
    expect(r.arrived).toBe(true);
  });

  it('moveTo cruises at the requested speed, decelerates and stops exactly on target', () => {
    const r = rig([[0, 0, 0], [0, 0, -100]]);
    r.moveTo(50, 3);
    let t = 0;
    let maxSpeed = 0;
    let lastD = 0;
    const tail: number[] = [];
    while (!r.arrived && t < 60) {
      r.update(DT);
      t += DT;
      maxSpeed = Math.max(maxSpeed, r.speed);
      expect(r.d).toBeGreaterThanOrEqual(lastD); // never goes backwards
      expect(r.d).toBeLessThanOrEqual(50 + 1e-6); // never overshoots
      lastD = r.d;
      if (50 - r.d < 1.5) tail.push(r.speed);
    }
    expect(r.arrived).toBe(true);
    expect(Math.abs(50 - r.d)).toBeLessThan(0.05);
    // …then settles exactly on the mark.
    for (let i = 0; i < 60; i++) r.update(DT);
    expect(r.d).toBe(50);
    expect(r.speed).toBe(0);
    expect(maxSpeed).toBeLessThanOrEqual(3 + 1e-6);
    expect(maxSpeed).toBeGreaterThan(2.9);
    // Roughly distance / speed plus accel/brake time.
    expect(t).toBeGreaterThan(50 / 3);
    expect(t).toBeLessThan(50 / 3 + 4);
    // Braking: speed over the last metre and a half only goes down.
    for (let i = 1; i < tail.length; i++) expect(tail[i]).toBeLessThanOrEqual(tail[i - 1] + 1e-9);
    expect(r.moving).toBe(false);
  });

  it('clamps targets to the rail and halt() stops early', () => {
    const r = rig([[0, 0, 0], [0, 0, -30]]);
    r.moveTo(999, 10);
    for (let i = 0; i < 60 * 30; i++) r.update(DT);
    expect(r.d).toBeCloseTo(r.length, 6);

    const r2 = rig([[0, 0, 0], [0, 0, -100]]);
    r2.moveTo(100, 4);
    for (let i = 0; i < 120; i++) r2.update(DT);
    r2.halt();
    const stopAt = r2.d;
    for (let i = 0; i < 300; i++) r2.update(DT);
    expect(r2.arrived).toBe(true);
    expect(Math.abs(r2.d - stopAt)).toBeLessThan(1.5);
  });

  it('drive mode accelerates harder than walking', () => {
    const walk = rig([[0, 0, 0], [0, 0, -200]]);
    const drive = rig([[0, 0, 0], [0, 0, -200]]);
    drive.setMode('drive');
    walk.moveTo(200, 15);
    drive.moveTo(200, 15);
    for (let i = 0; i < 60; i++) {
      walk.update(DT);
      drive.update(DT);
    }
    expect(drive.speed).toBeGreaterThan(walk.speed);
  });
});

describe('RailRig — coordinate conversions', () => {
  it('rel() maps [right, up, forward] to rig-local (+x right, +y up, -z forward)', () => {
    const v = RailRig.rel([1, 2, 3]);
    expect([v.x, v.y, v.z]).toEqual([1, 2, -3]);
  });

  it('relToWorld on a straight rail heading -Z', () => {
    const r = rig([[0, 0, 0], [0, 0, -100]]);
    expect(r.headingAt(0)).toBeCloseTo(0, 5);
    close(r.relToWorld([-3, 0, 12]), -3, 0, -12);
    close(r.relToWorld([0, 1.5, 0]), 0, 1.5, 0);
  });

  it('headings follow a curved rail and relToWorld turns with it', () => {
    const R = 40;
    const r = rig(rightTurn(R));
    // Turning right = yaw decreasing from 0 to -90° (headingAt looks 4 m ahead).
    expect(Math.abs(r.headingAt(0))).toBeLessThan(0.1);
    expect(Math.abs(r.headingAt(r.length) + Math.PI / 2)).toBeLessThan(0.1);
    let prev = r.headingAt(0);
    for (let d = 2; d <= r.length - 4; d += 2) {
      const h = r.headingAt(d);
      expect(h).toBeLessThanOrEqual(prev + 1e-3);
      prev = h;
    }
    // Arc length of a quarter circle.
    expect(r.length).toBeCloseTo((Math.PI / 2) * R, 0);

    // Drive to the end; the rig frame now faces (roughly) +X.
    r.moveTo(r.length, 20);
    for (let i = 0; i < 60 * 30; i++) r.update(DT);
    const p = r.pointAt(r.d);
    close(p, R, 0, -R, 0.5);
    const h = r.space.rotation.y;
    expect(Math.abs(h + Math.PI / 2)).toBeLessThan(0.1);
    // Forward = (-sin h, 0, -cos h); right = (cos h, 0, -sin h).
    const ahead = r.relToWorld([0, 0, 10]).sub(p);
    close(ahead, -Math.sin(h) * 10, 0, -Math.cos(h) * 10, 0.01);
    expect(ahead.x).toBeGreaterThan(9.9); // 10 m ahead is +X
    const right = r.relToWorld([2, 1, 0]).sub(p);
    close(right, Math.cos(h) * 2, 1, -Math.sin(h) * 2, 0.01);
    expect(right.z).toBeGreaterThan(1.9); // right of +X is +Z
  });

  it('eyeWorld sits at walking eye height above the rail', () => {
    const r = rig([[0, 0, 0], [0, 0, -50]]);
    const eye = r.eyeWorld();
    expect(eye.y).toBeCloseTo(r.eyeHeight, 5);
    expect(r.eyeHeight).toBeGreaterThan(1.4);
    expect(r.eyeHeight).toBeLessThan(2);
  });
});
