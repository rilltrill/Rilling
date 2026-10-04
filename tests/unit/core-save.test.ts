import { afterEach, describe, expect, it, vi } from 'vitest';
import { Save } from '../../src/core/Save';
import { DEFAULT_SETTINGS } from '../../src/core/types';

const KEY = 'overrun.save.v1';

/** Minimal in-memory Storage. `failWrites` simulates quota / Safari private mode. */
class FakeStorage implements Storage {
  map = new Map<string, string>();
  failWrites = false;
  get length() {
    return this.map.size;
  }
  clear() {
    this.map.clear();
  }
  getItem(k: string) {
    return this.map.has(k) ? this.map.get(k)! : null;
  }
  key(i: number) {
    return [...this.map.keys()][i] ?? null;
  }
  removeItem(k: string) {
    this.map.delete(k);
  }
  setItem(k: string, v: string) {
    if (this.failWrites) throw new DOMException('QuotaExceededError');
    this.map.set(k, String(v));
  }
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Save — defaults & loading', () => {
  it('starts with default settings and no progress', () => {
    const s = new Save(new FakeStorage());
    expect(s.settings).toEqual(DEFAULT_SETTINGS);
    expect(s.data.unlocked).toEqual([]);
    expect(s.data.best).toEqual({});
    expect(s.data.campaignBest).toEqual({});
    expect(s.data.version).toBe(1);
  });

  it('falls back to defaults on corrupt JSON', () => {
    const st = new FakeStorage();
    st.setItem(KEY, '{not json!!');
    const s = new Save(st);
    expect(s.settings).toEqual(DEFAULT_SETTINGS);
    expect(s.data.unlocked).toEqual([]);
  });

  it('merges partial / older saves with defaults and repairs bad fields', () => {
    const st = new FakeStorage();
    st.setItem(KEY, JSON.stringify({ settings: { sfxVolume: 0.1 }, unlocked: 'z2', best: { z1: { score: 10, grade: 'B' } } }));
    const s = new Save(st);
    expect(s.settings.sfxVolume).toBe(0.1);
    expect(s.settings.musicVolume).toBe(DEFAULT_SETTINGS.musicVolume);
    expect(s.data.unlocked).toEqual([]); // not an array → reset
    expect(s.data.best.z1).toEqual({ score: 10, grade: 'B' });
  });

  it('round-trips through storage', () => {
    const st = new FakeStorage();
    const a = new Save(st);
    a.updateSettings({ leftHanded: true, quality: 'low' });
    a.unlock('z2');
    a.recordStage('z1', 1234, 'A');
    const b = new Save(st);
    expect(b.settings.leftHanded).toBe(true);
    expect(b.settings.quality).toBe('low');
    expect(b.isUnlocked('z2')).toBe(true);
    expect(b.data.best.z1).toEqual({ score: 1234, grade: 'A' });
    expect(JSON.parse(st.getItem(KEY)!).settings.leftHanded).toBe(true);
  });
});

describe('Save — progress', () => {
  it('unlock is idempotent', () => {
    const s = new Save(new FakeStorage());
    s.unlock('d2');
    s.unlock('d2');
    expect(s.data.unlocked).toEqual(['d2']);
    expect(s.isUnlocked('d3')).toBe(false);
  });

  it('recordStage keeps the best score and the best grade independently', () => {
    const s = new Save(new FakeStorage());
    expect(s.recordStage('z1', 5000, 'S')).toBe(true);
    expect(s.recordStage('z1', 3000, 'A')).toBe(false);
    expect(s.data.best.z1).toEqual({ score: 5000, grade: 'S' });
    expect(s.recordStage('z1', 9000, 'B')).toBe(true);
    expect(s.data.best.z1).toEqual({ score: 9000, grade: 'S' });
    expect(s.recordStage('z2', 100, 'D')).toBe(true);
    expect(s.recordStage('z2', 50, 'C')).toBe(false);
    expect(s.data.best.z2).toEqual({ score: 100, grade: 'C' });
  });

  it('recordCampaign only stores improvements', () => {
    const s = new Save(new FakeStorage());
    expect(s.recordCampaign('zombie', 100)).toBe(true);
    expect(s.recordCampaign('zombie', 90)).toBe(false);
    expect(s.recordCampaign('zombie', 101)).toBe(true);
    expect(s.data.campaignBest.zombie).toBe(101);
  });

  it('reset clears progress but keeps settings', () => {
    const st = new FakeStorage();
    const s = new Save(st);
    s.updateSettings({ musicVolume: 0.2 });
    s.unlock('z2');
    s.recordStage('z1', 10, 'C');
    s.reset();
    expect(s.data.unlocked).toEqual([]);
    expect(s.data.best).toEqual({});
    expect(s.settings.musicVolume).toBe(0.2);
    expect(new Save(st).data.unlocked).toEqual([]);
  });
});

describe('Save — without storage', () => {
  it('works fully in memory when storage is unavailable', () => {
    const s = new Save(null);
    s.updateSettings({ haptics: false });
    s.unlock('z3');
    expect(s.settings.haptics).toBe(false);
    expect(s.isUnlocked('z3')).toBe(true);
    expect(() => s.persist()).not.toThrow();
  });

  it('swallows write failures (quota exceeded / private mode)', () => {
    const st = new FakeStorage();
    st.failWrites = true;
    const s = new Save(st);
    expect(() => s.updateSettings({ sfxVolume: 0.3 })).not.toThrow();
    expect(s.settings.sfxVolume).toBe(0.3);
  });

  it('tryStorage returns null when localStorage throws or is missing', () => {
    vi.stubGlobal('localStorage', {
      setItem() {
        throw new Error('SecurityError');
      },
      removeItem() {},
    });
    expect(Save.tryStorage()).toBeNull();
    vi.stubGlobal('localStorage', undefined);
    expect(Save.tryStorage()).toBeNull();
  });

  it('tryStorage returns a working storage', () => {
    const st = new FakeStorage();
    vi.stubGlobal('localStorage', st);
    expect(Save.tryStorage()).toBe(st);
    expect(st.length).toBe(0); // probe key cleaned up
  });
});
