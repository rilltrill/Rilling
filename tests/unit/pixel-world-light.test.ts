import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { DEFAULT_SETTINGS } from '../../src/core/types';
import { MONITOR, MONITOR_LEVELS, MONITOR_TOP } from '../../src/core/RetroPass';
import { PW_PAL_BRIGHT, PW_PAL_DEEP, PW_PAL_W } from '../../src/content/pixelworld/canvas';
import { clearPwCache, PwAtlas } from '../../src/content/pixelworld/atlas';
import { pwMaterial } from '../../src/content/pixelworld/material';
import {
  PW_EDGE_MAX, PW_LIGHT_OUT, PW_MOOD_DEFAULT, pwAces, pwBandChroma, pwBayer, pwChroma, pwFilmHex, pwFogBand, pwGlowSteps, pwInvAces, pwLattice, pwLight, pwLightSteps,
  pwLitColumn, pwLuma, pwMonitorLevel, pwMood, pwMoodBoot, pwMoodNow, pwMoodTweak, pwSceneFor, pwShadeAmount, pwStepLight, pwToLinear, pwToSrgb, type PwMood,
} from '../../src/content/pixelworld/light';
import { ALL_STAGES } from '../../src/content';
import { World } from '../../src/gameplay/World';
import { StageRunner } from '../../src/gameplay/StageRunner';
import { AudioSystem } from '../../src/audio/Audio';
import { Z1_MOOD } from '../../src/content/stages/z1/pixel';
import { Z2_MOOD } from '../../src/content/stages/z2/pixel';
import { Z3_MOOD } from '../../src/content/stages/z3/pixel';
import { D1_MOOD } from '../../src/content/stages/d1/pixel';
import { D2_MOOD } from '../../src/content/stages/d2/pixel';
import { D3_MOOD } from '../../src/content/stages/d3/pixel';
import { nullHud } from './sim';

/**
 * PIXEL-ART LIGHT (content/pixelworld/light.ts): the arithmetic of the shader, in its TypeScript
 * twins — light to tone steps, the band's tint, fog bands, and the round trip through the arcade
 * monitor's tone curve and colour lattice.
 */

const mood = (m: Partial<PwMood> = {}): PwMood => ({ ...PW_MOOD_DEFAULT, ...m });
const STAGE_MOODS: Record<string, Partial<PwMood>> = { z1: Z1_MOOD, z2: Z2_MOOD, z3: Z3_MOOD, d1: D1_MOOD, d2: D2_MOOD, d3: D3_MOOD };

describe('PixelWorld light: steps', () => {
  it('light at the pivot leaves paint as painted; each stop moves it `steps` tones; lo / hi bound it', () => {
    const m = mood({ pivot: 0.4, steps: 1, lo: -2, hi: 2 });
    expect(pwLightSteps(0.4, m)).toBe(0);
    expect(pwLightSteps(0.8, m)).toBe(1);
    expect(pwLightSteps(0.2, m)).toBe(-1);
    expect(pwLightSteps(0.1, m)).toBe(-2);
    expect(pwLightSteps(0.001, m)).toBe(-2);
    expect(pwLightSteps(0, m)).toBe(-2);
    expect(pwLightSteps(100, m)).toBe(2);
    // A band is centred on its light: ± half a step of stops around it.
    const q = mood({ pivot: 0.5, steps: 0.75 });
    for (const s of [-2, -1, 0, 1, 2]) {
      const y = pwStepLight(s, q);
      expect(pwLightSteps(y, q)).toBe(s);
      expect(pwLightSteps(y * 2 ** (0.45 / 0.75), q)).toBe(s);
      expect(pwLightSteps(y * 2 ** (-0.45 / 0.75), q)).toBe(s);
    }
    expect(pwLightSteps(pwStepLight(0, q) * 2 ** (0.55 / 0.75), q)).toBe(1);
  });

  it('an evenly lit facet is never dithered; a gradient is, over `edge` pixels and no more than the widest edge', () => {
    const m = mood({ pivot: 0.5, steps: 1, edge: 4 });
    // Just under a band's edge (0.45 of a step up): every threshold rounds down while nothing changes across the frame…
    const y = 0.5 * 2 ** 0.45;
    for (const th of [0.125, 0.375, 0.625, 0.875]) expect(pwLightSteps(y, m, th, 0)).toBe(0);
    // … and with a gradient of 0.05 steps a pixel the edge is 0.2 steps wide: the top threshold alone flips.
    expect([0.125, 0.375, 0.625, 0.875].map((th) => pwLightSteps(y, m, th, 0.05))).toEqual([0, 0, 0, 1]);
    // Thresholds flip in order as the light rises (a texel changes once as an edge passes over it).
    let prev = 0;
    for (let k = 0; k <= 40; k++) {
      const yy = 0.5 * 2 ** (0.3 + (0.4 * k) / 40);
      const n = [0.125, 0.375, 0.625, 0.875].filter((th) => pwLightSteps(yy, m, th, 0.05) === 1).length;
      expect(n).toBeGreaterThanOrEqual(prev);
      prev = n;
    }
    expect(prev).toBe(4);
    // A cliff of light cannot dither a whole band away: the edge is at most PW_EDGE_MAX steps wide.
    expect(pwLightSteps(0.5 * 2 ** (0.5 - PW_EDGE_MAX / 2 - 0.02), m, 0.999, 100)).toBe(0);
    expect(pwLightSteps(0.5 * 2 ** (0.5 + PW_EDGE_MAX / 2 + 0.02), m, 0.001, 100)).toBe(1);
  });

  it('the dither is the 2 × 2 ordered pattern: a quarter, a checker, three quarters', () => {
    const t = [pwBayer(0, 0), pwBayer(1, 0), pwBayer(0, 1), pwBayer(1, 1)];
    expect([...t].sort()).toEqual([0.125, 0.375, 0.625, 0.875]);
    expect(t.reduce((a, b) => a + b) / 4).toBeCloseTo(0.5, 6);
    // The two lowest thresholds sit on a diagonal: half way through an edge the texels form a checker.
    const low = [[0, 0], [1, 0], [0, 1], [1, 1]].filter(([x, y]) => pwBayer(x, y) < 0.5);
    expect(low[0][0] !== low[1][0] && low[0][1] !== low[1][1]).toBe(true);
    // It repeats every two texels, also for negative coordinates (two's complement, as in the shader).
    for (let y = -4; y < 4; y++) for (let x = -4; x < 4; x++) expect(pwBayer(x, y)).toBe(pwBayer(x & 1, y & 1));
    // The shader states the same pattern.
    expect(PW_LIGHT_OUT).toContain('pwBayer(pwQ)');
  });

  it('glow texels move by their gain in whole steps; the lit column stays inside the palette row', () => {
    const m = mood({ steps: 0.75 });
    expect(pwGlowSteps(1, m)).toBe(0);
    expect(pwGlowSteps(2.2, m)).toBe(1);
    expect(pwGlowSteps(0.1, m)).toBe(-2);
    expect(pwGlowSteps(0, m)).toBeLessThan(-5);
    expect(pwLitColumn(3, 0)).toBe(PW_PAL_DEEP + 3);
    expect(pwLitColumn(0, -2)).toBe(PW_PAL_DEEP - 2);
    expect(pwLitColumn(0, -99)).toBe(0);
    expect(pwLitColumn(5, 99)).toBe(PW_PAL_W - 1);
  });

  it('every stage mood keeps its steps inside the extended ramp', () => {
    for (const [id, part] of Object.entries(STAGE_MOODS)) {
      const m = mood(part);
      expect(m.pivot, id).toBeGreaterThan(0);
      expect(m.steps, id).toBeGreaterThan(0.4);
      expect(m.steps, id).toBeLessThanOrEqual(1.5);
      expect(Number.isInteger(m.lo) && Number.isInteger(m.hi), id).toBe(true);
      expect(m.lo, id).toBeLessThanOrEqual(0);
      expect(m.hi, id).toBeGreaterThanOrEqual(0);
      // Tone 0 taken `lo` down and tone 5 taken `hi` up are still distinct palette entries.
      expect(-m.lo, id).toBeLessThanOrEqual(PW_PAL_DEEP);
      expect(m.hi, id).toBeLessThanOrEqual(PW_PAL_BRIGHT);
      expect(m.fogBands, id).toBeGreaterThanOrEqual(5);
      expect(m.fogBands, id).toBeLessThanOrEqual(8);
      expect(m.tint, id).toBeGreaterThanOrEqual(0);
      expect(m.tint, id).toBeLessThanOrEqual(1.5);
      expect(m.torch, id).toBeGreaterThanOrEqual(0);
      expect(m.torch, id).toBeLessThanOrEqual(1);
      expect(m.film, id).toBeGreaterThanOrEqual(0);
      expect(m.film, id).toBeLessThanOrEqual(1);
    }
  });
});

describe('PixelWorld light: tint, shade, fog', () => {
  it('a ring of light is ONE tint wherever the lamp’s falloff puts a texel inside it', () => {
    const m = mood({ pivot: 0.4, steps: 1, tint: 1 });
    const ambient = [0.05, 0.07, 0.16]; // a blue night sky
    const lamp = [1, 0.62, 0.3]; // a sodium lamp, somewhere in its falloff
    const yq = pwStepLight(1, m);
    const a = pwBandChroma(ambient, lamp.map((v) => v * 0.9), yq, m);
    const b = pwBandChroma(ambient, lamp.map((v) => v * 0.55), yq, m);
    for (let i = 0; i < 3; i++) expect(a[i]).toBeCloseTo(b[i], 5);
    // It is warm (red over blue), where the unlit street is the sky's blue.
    expect(a[0]).toBeGreaterThan(a[2]);
    const night = pwBandChroma(ambient, [0, 0, 0], pwStepLight(-1, m), m);
    expect(night[2]).toBeGreaterThan(night[0] * 1.5);
    // A tint does not change how bright the texel is: the chroma has luminance 1.
    expect(pwLuma(a[0], a[1], a[2])).toBeCloseTo(1, 1);
    // No light at all tints nothing.
    expect(pwBandChroma([0, 0, 0], [0, 0, 0], 0.1, m)).toEqual([1, 1, 1]);
  });

  it('`tint` scales the lean; 0 = the paint’s own colours whatever the lamps', () => {
    const e = [0.9, 0.2, 0.1];
    const full = pwBandChroma([0, 0, 0], e, 0.5, mood({ tint: 1 }));
    const half = pwBandChroma([0, 0, 0], e, 0.5, mood({ tint: 0.5 }));
    const none = pwBandChroma([0, 0, 0], e, 0.5, mood({ tint: 0 }));
    expect(none).toEqual([1, 1, 1]);
    expect(half[0]).toBeGreaterThan(1);
    expect(half[0]).toBeLessThan(full[0]);
    expect(half[2]).toBeGreaterThan(full[2]);
  });

  it('the shade comes in below the painted tone: half one step down, whole from two', () => {
    expect(pwShadeAmount(1)).toBe(0);
    expect(pwShadeAmount(0)).toBe(0);
    expect(pwShadeAmount(-1)).toBe(0.5);
    expect(pwShadeAmount(-2)).toBe(1);
    expect(pwShadeAmount(-4)).toBe(1);
    // A shade is a chroma: as bright as white, leaning its own way.
    const c = pwChroma(0x9a90e8);
    expect(pwLuma(c[0], c[1], c[2])).toBeCloseTo(1, 5);
    expect(c[2]).toBeGreaterThan(c[0]);
    expect(pwChroma(0xffffff).map((v) => +v.toFixed(4))).toEqual([1, 1, 1]);
  });

  it('fog comes in whole bands, clear to all fog, dithered only where it has a gradient', () => {
    const m = mood({ fogBands: 6, fogEdge: 4 });
    expect(pwFogBand(0, m)).toBe(0);
    expect(pwFogBand(1, m)).toBe(1);
    const seen = new Set<number>();
    let prev = 0;
    for (let k = 0; k <= 600; k++) {
      const b = pwFogBand(k / 600, m);
      expect(b).toBeGreaterThanOrEqual(prev);
      prev = b;
      seen.add(Math.round(b * 6));
    }
    expect([...seen]).toEqual([0, 1, 2, 3, 4, 5, 6]);
    // A wall facing the camera (one depth: no gradient) is one band, never a screen-door.
    for (const th of [0.125, 0.375, 0.625, 0.875]) expect(pwFogBand(0.249, m, th, 0)).toBe(pwFogBand(0.249, m));
    expect(new Set([0.125, 0.375, 0.625, 0.875].map((th) => pwFogBand(0.249, m, th, 0.05))).size).toBe(2);
  });
});

describe('PixelWorld light: palette-true through the arcade monitor', () => {
  it('the tone curve has an inverse', () => {
    for (const x of [0, 0.001, 0.02, 0.18, 0.5, 1, 2, 5]) expect(pwInvAces(pwAces(x))).toBeCloseTo(x, 4);
    for (const c of [0, 0.002, 0.04, 0.2, 0.5, 1]) expect(pwToLinear(pwToSrgb(c))).toBeCloseTo(c, 6);
  });

  it('a lattice colour written as its scene value comes back on its level after a half-float target: the monitor’s dither does nothing to it', () => {
    const exposure = 1.05;
    let worst = 0;
    for (let n = 0; n <= MONITOR_TOP; n++) {
      const x = pwSceneFor(n, exposure);
      // What the render target keeps of it.
      const stored = THREE.DataUtils.fromHalfFloat(THREE.DataUtils.toHalfFloat(x));
      const back = pwMonitorLevel(stored, exposure);
      worst = Math.max(worst, Math.abs(back - n));
      // The pass: floor(level + 0.5 + th), th the 4 × 4 ordered thresholds in ± 0.47.
      for (const th of [-15 / 32, 15 / 32]) expect(Math.floor(back + 0.5 + th), `level ${n}`).toBe(n);
    }
    expect(worst).toBeLessThan(0.03);
    // The top level is left to the monitor's own highlights (its scene value would feed the CRT bloom 3× as much).
    expect(MONITOR_TOP).toBe(MONITOR_LEVELS - 1);
    expect(pwSceneFor(MONITOR_LEVELS, exposure)).toBeGreaterThan(pwSceneFor(MONITOR_TOP, exposure) * 3);
    expect(pwLattice(1)).toBe(MONITOR_TOP);
    expect(pwLattice(0.5)).toBe(16);
    expect(pwLattice(-1)).toBe(0);
  });

  it('pwFilmHex is what the monitor shows of a colour that goes through its tone curve', () => {
    expect(pwFilmHex(0x000000)).toBe(0);
    // The curve's toe sinks dark paint (why the first pass's nights went muddy) and lifts mid tones.
    const dark = pwFilmHex(0x1c273d);
    for (const sh of [16, 8, 0]) {
      expect((dark >> sh) & 255).toBeLessThan((0x1c273d >> sh) & 255);
      expect((dark >> sh) & 255).toBeGreaterThan(0);
    }
    expect(pwFilmHex(0x808080) & 255).toBeGreaterThan(0x80);
    // It is the pass's own arithmetic: display = sRGB(aces(scene × exposure)).
    expect(pwFilmHex(0x808080) & 255).toBe(Math.round(pwToSrgb(pwAces(pwToLinear(0x80 / 255) * 1.05)) * 255));
  });

  it('the monitor link starts as "no pass": straight to the canvas, no lattice', () => {
    // (RetroPass.configure / render write it; nothing has made one here.)
    expect(MONITOR.uPwMon.value.x).toBe(0);
    expect(MONITOR.uPwMon.value.y).toBe(0);
    expect(MONITOR.uPwMon.value.z).toBe(MONITOR_TOP);
    expect(MONITOR.uPwMon.value.w).toBe(1);
  });
});

describe('PixelWorld light: moods and materials', () => {
  it('pwMood sets the uniforms of the materials made after it; a tweak shows in place; &pwmood overrides', () => {
    const u = pwMood({ pivot: 0.3, steps: 0.9, lo: -1, hi: 1, edge: 3, tint: 0.4, fogBands: 7, fogEdge: 2, shade: 0x9a90e8, torch: 0.25 });
    expect(pwMoodNow()).toBe(u);
    expect(u.uPwMood.value.toArray().map((v) => +v.toFixed(4))).toEqual([0.3, 0.9, -1, 1]);
    expect(u.uPwMood2.value.toArray().map((v) => +v.toFixed(4))).toEqual([3, 0.4, 7, 2]);
    expect(u.uPwMood3.value.x).toBe(0.25);
    // … and shows lit paint as painted, none of the monitor's tone curve on it.
    expect(u.uPwMood3.value.y).toBe(0);
    // (A mood that says nothing of the torch counts the spot lights like any lamp.)
    expect(PW_MOOD_DEFAULT.torch).toBe(1);
    expect(u.uPwWhite.value.toArray().map((v) => +v.toFixed(4))).toEqual([1, 1, 1]);
    expect(u.uPwShade.value.z).toBeGreaterThan(u.uPwShade.value.x);
    const atlas = new PwAtlas('light-test', { levels: 1 });
    atlas.tile('t', 16, 16, (c, k) => c.rect(0, 0, 16, 16, k.ramp(0x808080), 3));
    const a = pwMaterial(atlas);
    expect(a.defines!.PW_LIGHT).toBe('');
    expect((a.userData.pw as Record<string, unknown>).uPwMood).toBe(u.uPwMood);
    expect((a.userData.pw as Record<string, unknown>).uPwMon).toBe(MONITOR.uPwMon);
    pwMoodTweak({ pivot: 0.6 });
    expect(u.uPwMood.value.x).toBeCloseTo(0.6, 6);
    // Another mood: another material (cached per mood), the first keeps its own.
    const v = pwMood({ pivot: 0.9 });
    const b = pwMaterial(atlas);
    expect(b).not.toBe(a);
    expect((b.userData.pw as Record<string, unknown>).uPwMood).toBe(v.uPwMood);
    expect(pwMaterial(atlas, { mood: u })).toBe(a);
    // &pwlight=0: the first pass's light (no PW_LIGHT), for A/B captures.
    pwLight(false);
    expect(pwMaterial(atlas).defines!.PW_LIGHT).toBeUndefined();
    pwLight(true);
    // &pwmood=…
    pwMoodBoot('pivot:0.25,shade:0x8090ff,bogus:3,steps:x');
    const o = pwMood({ pivot: 0.9, steps: 0.8 });
    expect(o.mood.pivot).toBe(0.25);
    expect(o.mood.steps).toBe(0.8);
    expect(o.mood.shade).toBe(0x8090ff);
    pwMoodBoot(null);
    expect(pwMood({ pivot: 0.9 }).mood.pivot).toBe(0.9);
    clearPwCache();
  });

  for (const id of ['z1', 'z2', 'z3', 'd1', 'd2', 'd3']) {
    it(`${id}: every lit PixelWorld material of the stage is lit under the stage's mood`, { timeout: 120_000 }, () => {
      clearPwCache();
      const w = new World(new THREE.PerspectiveCamera(60, 844 / 390, 0.05, 400), new AudioSystem(), nullHud, { ...DEFAULT_SETTINGS }, 7);
      w.art = 'pixel';
      new StageRunner(w, ALL_STAGES.find((s) => s.id === id)!).start();
      const want = mood(STAGE_MOODS[id]);
      let lit = 0;
      w.scene.traverse((o) => {
        const m = o as THREE.Mesh;
        const mat = m.material as THREE.Material | undefined;
        if (!m.isMesh || !mat?.userData?.pw || mat.defines?.PW_LIGHT === undefined) return;
        lit++;
        const u = mat.userData.pw as { uPwMood: { value: THREE.Vector4 } };
        expect(u.uPwMood.value.x, `${id} ${mat.name}`).toBeCloseTo(want.pivot, 6);
        expect(u.uPwMood.value.y, `${id} ${mat.name}`).toBeCloseTo(want.steps, 6);
      });
      expect(lit).toBeGreaterThan(0);
      w.dispose();
      clearPwCache();
    });
  }
});
