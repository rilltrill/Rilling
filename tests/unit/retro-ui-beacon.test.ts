import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as THREE from 'three';

/**
 * Overlay2D threat beacons: an off-screen attack's edge indicator must never sit
 * behind a HUD panel (score, pause, lives/bomb, weapon, boss bar) or outside the
 * safe area, and a ring behind a panel must report that panel as veiled.
 * Runs in node: the canvas and window are minimal stubs.
 */

const W = 844;
const H = 390;
// HUD rects measured on the 844×390 landscape layout (boss fight).
const RECTS: [number, number, number, number][] = [
  [14, 10, 156, 62], // score + combo
  [790, 8, 834, 52], // pause
  [12, 326, 196, 380], // lives + bomb
  [618, 324, 832, 380], // weapon + reload
  [236, 8, 608, 58], // boss bar
];
const INSET = 36;

const g = globalThis as unknown as Record<string, unknown>;
const saved: Record<string, unknown> = {};

beforeAll(() => {
  saved.window = g.window;
  saved.document = g.document;
  const ctx = new Proxy({} as Record<string, unknown>, {
    get: (t, k) => (k in t ? t[k as string] : () => undefined),
    set: (t, k, v) => ((t[k as string] = v), true),
  });
  const canvas = {
    id: '',
    width: 0,
    height: 0,
    style: {} as Record<string, string>,
    classList: { toggle: () => undefined },
    getContext: () => ctx,
  };
  g.document = { createElement: () => canvas };
  g.window = { innerWidth: W, innerHeight: H, devicePixelRatio: 1, addEventListener: () => undefined };
});

afterAll(() => {
  g.window = saved.window;
  g.document = saved.document;
});

async function overlay() {
  const { Overlay2D } = await import('../../src/ui/Overlay2D');
  const o = new Overlay2D({ appendChild: () => undefined } as unknown as HTMLElement);
  o.setSafeArea(0, 0, W, H);
  RECTS.forEach((r, i) => o.setAvoid(i, ...r));
  return o;
}

describe('Overlay2D threat beacons', () => {
  it('stay inside the screen and clear of every HUD panel, in every direction', async () => {
    const o = await overlay();
    const t = { onScreen: false, x: 0, y: 0, base: 0, r: 0, p: 0.5, ang: 0 };
    for (let deg = 0; deg < 360; deg += 0.5) {
      t.ang = (deg * Math.PI) / 180;
      (o as unknown as { edgePoint(t: unknown): void }).edgePoint(t);
      expect(t.x, `x @${deg}°`).toBeGreaterThanOrEqual(INSET - 0.01);
      expect(t.x, `x @${deg}°`).toBeLessThanOrEqual(W - INSET + 0.01);
      expect(t.y, `y @${deg}°`).toBeGreaterThanOrEqual(INSET - 0.01);
      expect(t.y, `y @${deg}°`).toBeLessThanOrEqual(H - INSET + 0.01);
      for (const [x0, y0, x1, y1] of RECTS) {
        const inside = t.x > x0 - INSET + 0.5 && t.x < x1 + INSET - 0.5 && t.y > y0 - INSET + 0.5 && t.y < y1 + INSET - 0.5;
        expect(inside, `beacon @${deg}° (${t.x.toFixed(0)},${t.y.toFixed(0)}) overlaps panel ${[x0, y0, x1, y1]}`).toBe(false);
      }
      // Still points the right way: the beacon lies on the ray from the screen centre.
      const dx = t.x - W / 2;
      const dy = t.y - H / 2;
      expect(Math.hypot(dx, dy)).toBeGreaterThan(40);
      expect(Math.abs(Math.atan2(dy, dx) - Math.atan2(Math.sin(t.ang), Math.cos(t.ang)))).toBeLessThan(1e-6);
    }
  });

  it('a threat straight above (a thrown boulder at its apex) is flagged just under the boss bar', async () => {
    const o = await overlay();
    const t = { onScreen: false, x: 0, y: 0, base: 0, r: 0, p: 0.5, ang: -Math.PI / 2 };
    (o as unknown as { edgePoint(t: unknown): void }).edgePoint(t);
    expect(t.x).toBeCloseTo(W / 2, 3);
    expect(t.y).toBeGreaterThanOrEqual(58 + INSET - 1);
    expect(t.y).toBeLessThan(58 + INSET + 2);
  });

  it('draws rings and beacons in both modes and veils the boss bar when a ring is behind it', async () => {
    const o = await overlay();
    const cam = new THREE.PerspectiveCamera(58, W / H, 0.1, 500);
    cam.position.set(0, 1.6, 0);
    cam.lookAt(0, 1.6, -10);
    cam.updateMatrixWorld(true);
    const at = (x: number, y: number, z: number) => {
      const a = new THREE.Object3D();
      a.position.set(x, y, z);
      a.updateMatrixWorld(true);
      return a;
    };
    // Projects to ndc y ≈ 0.9 (top centre, under the boss bar), one above the view, one behind, one small.
    const behindBar = at(0, 1.6 + 10 * Math.tan(THREE.MathUtils.degToRad(29)) * 0.9, -10);
    const ents = [
      { removed: false, telegraph: { progress: 0.8, anchor: behindBar, radius: 0.45 } },
      { removed: false, telegraph: { progress: 0.3, anchor: at(0, 20, -8), radius: 0.45 } },
      { removed: false, telegraph: { progress: 0.9, anchor: at(1, 1, 8), radius: 0.45 } },
      { removed: false, telegraph: { progress: 0.75, anchor: at(1.5, 1, -14), radius: 0.18 } },
    ];
    const world = { camera: cam, entities: ents } as never;
    for (const grid of [0, 288]) {
      o.setPixelGrid(grid, grid ? Math.round((grid * H) / W) : 0);
      for (const rf of [false, true]) {
        o.reduceFlashes = rf;
        expect(() => o.draw(world, 1 / 60)).not.toThrow();
        expect(Array.from(o.veiled.slice(0, 5))).toEqual([0, 0, 0, 0, 1]);
      }
    }
    ents[0].removed = true;
    o.draw(world, 1 / 60);
    expect(o.veiled[4]).toBe(0);
  });
});
