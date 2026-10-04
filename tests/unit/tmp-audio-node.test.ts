import { describe, expect, it } from 'vitest';
import { AudioSystem } from '../../src/audio/Audio';
import { SFX } from '../../src/audio/Sfx';
import { SFX_META, PREWARM } from '../../src/audio/sfxMeta';
import { SFX_NAMES, MUSIC_IDS } from '../../src/audio/names';
import { TRACKS } from '../../src/audio/tracks';

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
    a.playMusic(null);
    expect(a.ctx).toBeNull();
    expect(a.stats().state).toBe('none');
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

  it('music arrangements are well-formed', () => {
    for (const id of MUSIC_IDS) {
      const t = TRACKS[id];
      expect(t, id).toBeTruthy();
      for (const name of t.order) expect(t.sections[name], `${id}.${name}`).toBeTruthy();
      for (const [name, sec] of Object.entries(t.sections)) {
        const where = `${id}.${name}`;
        const chords = sec.chords.trim().split(/\s+/);
        expect(sec.bars % chords.length, where + ' chords').toBe(0);
        for (const c of chords) expect(/^-?\d+(m|M|5|d|s4|s2|m7|M7|7|a)$/.test(c), where + ' chord ' + c).toBe(true);
        for (const pat of [sec.bass, sec.arp, sec.stab]) if (pat) expect(pat.length, where).toBe(16);
        for (const d of [sec.drums, sec.fill]) {
          if (!d) continue;
          for (const [k, p] of Object.entries(d)) {
            expect(p!.length % 16, `${where} drum ${k}`).toBe(0);
            expect(/^[xXo.]+$/.test(p!), `${where} drum ${k}`).toBe(true);
          }
        }
        if (sec.lead) {
          const bars = sec.lead.split('|');
          expect(bars.length, where + ' lead bars').toBe(sec.bars);
          for (const [i, b] of bars.entries()) {
            const sum = b.trim().split(/\s+/).reduce((a, tok) => a + Number(tok.split(':')[1]), 0);
            expect(sum, `${where} lead bar ${i}`).toBe(16);
          }
        }
      }
    }
  });
});
