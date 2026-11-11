import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { PF, PixelFigure } from '../../src/gameplay/pixel/figure';
import { STEPS, celColor, celRamp, hexToOklch, Mat } from '../../src/gameplay/pixel/materials';
import { CAST_STAGE_LIGHT, CAST_STYLES, isCastLook } from '../../src/gameplay/pixel/look';
import { CEL_HAND, CEL_STAMP, HAND, stampInfo } from '../../src/gameplay/pixel/stamps';

/**
 * PIXEL CAST 2 (the cel look): the pure rules other painters build on — cel ramps,
 * the shade direction, flat caps that survive foreshortening, the look table.
 */

const lum = (hex: number) => 0.299 * ((hex >> 16) & 255) + 0.587 * ((hex >> 8) & 255) + 0.114 * (hex & 255);

function camera(): THREE.PerspectiveCamera {
  const c = new THREE.PerspectiveCamera(58, 844 / 390, 0.05, 400);
  c.position.set(0, 1.6, 0);
  c.lookAt(0, 1.2, -6);
  c.updateMatrixWorld();
  return c;
}

describe('cel ramps', () => {
  it('step up in lightness, with a clear shadow and a clear light step', () => {
    for (const [hex, kind] of [
      [0x4b5a6b, 'cloth'],
      [0xc8f020, 'cloth'],
      [0xe2e2da, 'cloth'],
      [0xd9a77f, 'live'],
      [0xa9b79a, 'dead'],
      [0x7a0c0c, 'gore'],
      [0x6a8a3a, 'hide'],
    ] as const) {
      const r = celRamp(hex, kind);
      expect(r).toHaveLength(STEPS);
      for (let i = 1; i < r.length; i++) expect(lum(r[i]), `${hex.toString(16)} step ${i}`).toBeGreaterThan(lum(r[i - 1]));
      const [L2] = hexToOklch(r[2]);
      const [L3] = hexToOklch(r[3]);
      const [L4] = hexToOklch(r[4]);
      expect(L3 - L2).toBeGreaterThan(0.06);
      // (A near-white has little room above it: its light step is small but real.)
      expect(L4 - L3).toBeGreaterThan(0.02);
    }
  });

  it('shadows lean violet on every ramp: skin never shades to orange-brown', () => {
    // Living skin (orange) goes toward red; dead skin (yellow-green) toward teal, and stays dull.
    const live = celRamp(0xd9a77f, 'live');
    const hLive = hexToOklch(live[3])[2];
    const hLiveSh = hexToOklch(live[1])[2];
    expect(hLiveSh).toBeLessThan(hLive);
    for (const skin of [0xb7af75, 0xa9b79a, 0x9a8a6a, 0xc8b89a]) {
      const dead = celRamp(skin, 'dead');
      const [, C3, h3] = hexToOklch(dead[3]);
      const [, C2, h2] = hexToOklch(dead[2]);
      // No dead face shares a living hue (living skins sit at 40°–80°).
      expect(h3, `dead base hue ${skin.toString(16)}`).toBeGreaterThan(95);
      expect(h3).toBeLessThan(200);
      expect(h2, 'dead shadow hue').toBeGreaterThan(h3);
      expect(C3).toBeLessThanOrEqual(0.075);
      expect(C2).toBeLessThanOrEqual(0.075);
    }
  });

  it('dark cloth, hair and leather are lifted to a blue-grey that keeps interior structure', () => {
    for (const [hex, kind] of [
      [0x2a2a30, 'cloth'],
      [0x111111, 'leather'],
      [0x1a1a1a, 'hair'],
      [0x2a2018, 'hair'],
    ] as const) {
      const r = celRamp(hex, kind);
      const [L3] = hexToOklch(r[3]);
      const [L4] = hexToOklch(r[4]);
      const [L2] = hexToOklch(r[2]);
      expect(L3, hex.toString(16)).toBeGreaterThanOrEqual(0.3);
      expect(L4 - L3).toBeGreaterThan(0.08);
      expect(L3 - L2).toBeGreaterThan(0.05);
    }
    // Near-greys take a blue-violet cast; a mouth interior or a pupil (no cel family) stays dark.
    const [, C, h] = hexToOklch(celRamp(0x2a2a30, 'cloth')[3]);
    expect(C).toBeGreaterThan(0.02);
    expect(h).toBeGreaterThan(240);
    expect(h).toBeLessThan(300);
    expect(lum(celColor(Mat.mouth(), 0))).toBeLessThan(40);
  });

  it('the legacy table is not touched by the cel table', () => {
    const id = Mat.cloth(0x2a2a31);
    // (Look 0 reads materialTable: its base stays the authored colour, not the lifted one.)
    expect(hexToOklch(celColor(id, 3))[0]).toBeGreaterThan(0.3);
  });
});

describe('cel figure helpers', () => {
  it('sideOf points away from the sprite light: right of an upright limb, under one that juts out', () => {
    const cam = camera();
    const f = new PixelFigure();
    f.begin(cam, 624, 288);
    const P = { x: 0, y: 0, z: 0 };
    const Q = { x: 0, y: 0, z: 0 };
    // Upright limb in front of the camera.
    const a = new THREE.Vector3(0, 1.4, -5);
    const b = new THREE.Vector3(0, 0.9, -5);
    const s = f.sideOf(a, b, 0.1);
    expect(s.length()).toBeCloseTo(0.1, 5);
    f.project(a, P);
    f.project(f.vec().copy(a).add(s), Q);
    expect(Q.x).toBeGreaterThan(P.x);
    expect(Math.abs(Q.y - P.y)).toBeLessThan(Math.abs(Q.x - P.x));
    // A limb held out sideways: its underside.
    const c = new THREE.Vector3(0.5, 1.4, -5);
    const u = f.sideOf(a, c, 0.1);
    f.project(f.vec().copy(a).add(u), Q);
    expect(Q.y).toBeLessThan(P.y);
    // The shade direction itself points right and down on screen.
    f.project(f.vec().copy(a).addScaledVector(f.shadeDir, 0.2), Q);
    expect(Q.x).toBeGreaterThan(P.x);
    expect(Q.y).toBeLessThan(P.y);
  });

  it('a cut cone seen side-on is cut flat; pointing at the camera it keeps its end disc', () => {
    const cam = camera();
    const f = new PixelFigure();
    // Side-on: nothing is drawn beyond the cut end.
    f.begin(cam, 624, 288);
    f.layer(0.001);
    f.cone(new THREE.Vector3(-0.3, 1.2, -5), new THREE.Vector3(0.3, 1.2, -5), 0.1, 0.1, 1).flag(PF.CUT_A | PF.CUT_B);
    expect(f.layout(1, 24, 256)).toBe(true);
    const P = { x: 0, y: 0, z: 0 };
    f.project(new THREE.Vector3(0.36, 1.2, -5), P);
    expect(f.sample((P.x - f.ox) / f.kpx, (P.y - f.oy) / f.kpx).layer).toBe(-1);
    f.project(new THREE.Vector3(0.2, 1.2, -5), P);
    expect(f.sample((P.x - f.ox) / f.kpx, (P.y - f.oy) / f.kpx).layer).toBe(0);
    // End-on: the cut end is a disc of the cone's radius.
    f.begin(cam, 624, 288);
    f.layer(0.001);
    f.cone(new THREE.Vector3(0, 1.2, -5), new THREE.Vector3(0, 1.21, -4.4), 0.1, 0.1, 1).flag(PF.CUT_A | PF.CUT_B);
    expect(f.layout(1, 24, 256)).toBe(true);
    f.project(new THREE.Vector3(0.07, 1.2, -5), P);
    expect(f.sample((P.x - f.ox) / f.kpx, (P.y - f.oy) / f.kpx).layer).toBe(0);
    f.project(new THREE.Vector3(0, 1.13, -5), P);
    expect(f.sample((P.x - f.ox) / f.kpx, (P.y - f.oy) / f.kpx).layer).toBe(0);
  });

  it('autoBand off marks every primitive NO_BAND (and only then)', () => {
    const cam = camera();
    const f = new PixelFigure();
    f.begin(cam, 624, 288);
    f.layer(0.01);
    f.cone(new THREE.Vector3(0, 1.4, -5), new THREE.Vector3(0, 0.9, -5), 0.05, 0.05, 1);
    f.autoBand = false;
    f.cone(new THREE.Vector3(0.2, 1.4, -5), new THREE.Vector3(0.2, 0.9, -5), 0.05, 0.05, 1);
    f.tri(new THREE.Vector3(0.4, 1.4, -5), new THREE.Vector3(0.5, 1.4, -5), new THREE.Vector3(0.45, 1.2, -5), 1);
    expect(f.get(0, 'flags') & PF.NO_BAND).toBe(0);
    expect(f.get(1, 'flags') & PF.NO_BAND).toBe(PF.NO_BAND);
    expect(f.get(2, 'flags') & PF.NO_BAND).toBe(PF.NO_BAND);
    f.begin(cam, 624, 288);
    expect(f.autoBand).toBe(true);
  });
});

describe('the look table', () => {
  it('holds the first look, the cel look and the drawn look; stage lights are a small named table', () => {
    expect(Object.keys(CAST_STYLES).sort()).toEqual(['0', 'b', 'd']);
    expect(isCastLook('b')).toBe(true);
    expect(isCastLook('a')).toBe(false);
    expect(isCastLook('c')).toBe(false);
    expect(CAST_STYLES['0'].cel).toBe(0);
    expect(CAST_STYLES.b.shadow).toBe(1);
    for (const id of ['z1', 'z2', 'z3', 'd1', 'd2', 'd3']) {
      const l = CAST_STAGE_LIGHT[id];
      expect(l, id).toBeDefined();
      // (The game reads first: a stage never sinks the cast more than one step.)
      expect(l.step).toBeGreaterThanOrEqual(-1);
      expect(l.accentAmount).toBeLessThanOrEqual(0.7);
    }
  });

  it('hands are stamps at every size: five size classes, eight directions', () => {
    for (const pose of [HAND.CLAW, HAND.OPEN, HAND.FIST, HAND.THUMB]) {
      expect(CEL_HAND[pose]).toHaveLength(3);
      for (const size of CEL_HAND[pose]) {
        expect(size).toHaveLength(8);
        // The hand's long side: a hand pointing straight up or down is narrower than it is long.
        for (const id of size) expect(Math.max(stampInfo(id).w, stampInfo(id).h)).toBeGreaterThanOrEqual(9);
      }
    }
    // Living eyes carry no white below the M size (a lone white pixel reads as a glowing pin).
    expect(stampInfo(CEL_STAMP.leye.calm[0]).w).toBe(1);
    expect(stampInfo(CEL_STAMP.leye.calm[3]).w).toBeLessThanOrEqual(5);
  });
});
