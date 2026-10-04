import { describe, expect, it } from 'vitest';
import { AudioSystem } from '../../src/audio/Audio';
import { SFX } from '../../src/audio/Sfx';
import { SFX_META, PREWARM } from '../../src/audio/sfxMeta';
import { SFX_NAMES, MUSIC_IDS } from '../../src/audio/names';
import { TRACKS, parseChord } from '../../src/audio/tracks';
import { validateMusic } from '../../src/audio/Music';
import { Baker } from '../../src/audio/bake';
import { noiseData, runSync } from '../../src/audio/dsp';

describe('audio (node, no AudioContext)', () => {
  it('is inert and never throws without a context', () => {
    const a = new AudioSystem();
    a.unlock();
    for (const n of SFX_NAMES) a.play(n, { volume: 0.5, pitch: 1.2, pan: -0.5, vary: 0.1 });
    a.playMusic('zombie');
    a.setIntensity(0.7);
    a.update(0.016);
    a.suspend();
    a.resume();
    a.setVolumes(0.5, 0.5);
    a.setMuted(true);
    a.setMuted(false);
    a.setPaused(true);
    a.setPaused(false);
    a.stopSfx();
    a.playMusic('menu');
    a.playMusic(null);
    a.update(0.016);
    expect(a.ctx).toBeNull();
    expect(a.stats().state).toBe('none');
    expect(a.stats().baking).toBe(0);
  });

  it('every sound has a recipe and metadata', () => {
    for (const n of SFX_NAMES) {
      expect(typeof SFX[n], n).toBe('function');
      const m = SFX_META[n];
      expect(m, n).toBeTruthy();
      expect(m.len, n).toBeGreaterThan(0);
      expect(m.trim, n).toBeGreaterThan(0);
      expect(m.max, n).toBeGreaterThan(0);
    }
    expect(Object.keys(SFX).sort()).toEqual([...SFX_NAMES].sort());
    expect(Object.keys(SFX_META).sort()).toEqual([...SFX_NAMES].sort());
    for (const n of PREWARM) expect(SFX_META[n].cache, n).toBeGreaterThan(0);
  });

  it('music arrangements and instruments are well-formed', () => {
    expect(validateMusic()).toEqual([]);
    for (const id of MUSIC_IDS) expect(TRACKS[id], id).toBeTruthy();
  });

  it('chord tokens parse unambiguously', () => {
    expect(parseChord('0p')).toMatchObject({ root: 0, iv: [0, 7, 12] });
    expect(parseChord('7p')).toMatchObject({ root: 7, iv: [0, 7, 12] });
    expect(parseChord('10M')).toMatchObject({ root: 10, iv: [0, 4, 7] });
    expect(parseChord('-2m7')).toMatchObject({ root: -2, iv: [0, 3, 7, 10] });
    expect(parseChord('3')).toMatchObject({ root: 3, iv: [0, 4, 7] });
    // The old digit quality must not silently become a different root.
    expect(parseChord('05')).toMatchObject({ root: 5, iv: [0, 4, 7] });
    expect(parseChord('65')).toBeNull();
    expect(parseChord('0q')).toBeNull();
    expect(parseChord('0m!')).toBeNull();
    // Boss: C# power chords on the intended roots.
    const roots = TRACKS.boss.sections.A.chords.split(' ').map((c) => parseChord(c)!);
    expect(roots.map((c) => c.root)).toEqual([0, 0, 1, 0, 0, 0, 6, 7]);
    for (const c of roots) expect(c.iv).toEqual([0, 7, 12]);
  });

  it('baker time-slices jobs and matches a synchronous run', () => {
    const b = new Baker();
    b.add('n', noiseData(8000, 1));
    let steps = 0;
    while (!b.idle) {
      b.step(0);
      steps++;
    }
    expect(steps).toBeGreaterThan(2);
    const sliced = b.take<{ white: Float32Array; crackle: Float32Array }>('n')!;
    const whole = runSync(noiseData(8000, 1));
    expect(Array.from(sliced.white.slice(0, 64))).toEqual(Array.from(whole.white.slice(0, 64)));
    expect(Array.from(sliced.crackle.slice(-64))).toEqual(Array.from(whole.crackle.slice(-64)));
    expect(b.pending).toBe(0);
    b.add('m', noiseData(8000, 1));
    expect(b.take('m')).toBeUndefined();
    expect(b.takeNow('m')).toBeTruthy();
  });
});
