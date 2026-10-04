import { describe, expect, it } from 'vitest';
import { cleanInitials, defaultHiScores, HISCORE_SLOTS, Save } from '../../src/core/Save';
import { DEFAULT_SETTINGS } from '../../src/core/types';

const KEY = 'overrun.save.v1';

class FakeStorage implements Storage {
  map = new Map<string, string>();
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
    this.map.set(k, String(v));
  }
}

describe('Save — arcade hi-score tables', () => {
  it('starts with full, descending factory tables for both campaigns', () => {
    const s = new Save(new FakeStorage());
    for (const c of ['zombie', 'dino']) {
      const t = s.hiScores(c);
      expect(t).toHaveLength(HISCORE_SLOTS);
      for (let i = 1; i < t.length; i++) expect(t[i - 1].score).toBeGreaterThan(t[i].score);
      for (const e of t) expect(e.initials).toMatch(/^[A-Z0-9. ]{3}$/);
    }
    expect(s.hiScores('zombie')[0].initials).toBe('ZMB');
    expect(s.hiScores('dino')[0].initials).toBe('RAP');
    expect(s.hiScores('zombie')).toEqual(defaultHiScores('zombie'));
  });

  it('qualifies only scores that beat the 10th entry', () => {
    const s = new Save(new FakeStorage());
    const t = s.hiScores('zombie');
    const last = t[t.length - 1].score;
    expect(s.qualifies('zombie', last)).toBe(false); // a tie doesn't knock anyone out
    expect(s.qualifies('zombie', last + 1)).toBe(true);
    expect(s.qualifies('zombie', 0)).toBe(false);
    expect(s.qualifies('zombie', -5)).toBe(false);
    expect(s.qualifies('zombie', Number.NaN)).toBe(false);
    expect(s.hiScoreRank('zombie', t[0].score + 1)).toBe(0);
    expect(s.hiScoreRank('zombie', t[0].score)).toBe(1); // ties rank below the incumbent
  });

  it('addHiScore inserts in order, keeps 10 rows, cleans initials and remembers them', () => {
    const st = new FakeStorage();
    const s = new Save(st);
    const before = s.hiScores('dino');
    const score = before[2].score + 10;
    const rank = s.addHiScore('dino', { initials: 'k9x!', score, stage: 'd2' });
    expect(rank).toBe(2);
    const t = s.hiScores('dino');
    expect(t).toHaveLength(HISCORE_SLOTS);
    expect(t[2]).toEqual({ initials: 'K9X', score, stage: 'd2' });
    expect(t[3]).toEqual(before[2]);
    expect(t.map((e) => e.initials)).not.toContain('YOU'); // the old 10th place drops off
    expect(s.data.lastInitials).toBe('K9X');
    // Persisted and reloaded.
    const again = new Save(st);
    expect(again.hiScores('dino')[2]).toEqual({ initials: 'K9X', score, stage: 'd2' });
    expect(again.data.lastInitials).toBe('K9X');
    // The other campaign is untouched.
    expect(again.hiScores('zombie')).toEqual(defaultHiScores('zombie'));
  });

  it('addHiScore refuses scores that do not qualify', () => {
    const s = new Save(new FakeStorage());
    expect(s.addHiScore('zombie', { initials: 'LOW', score: 1, stage: 'z1' })).toBe(-1);
    expect(s.hiScores('zombie')).toEqual(defaultHiScores('zombie'));
    expect(s.data.lastInitials).toBe('');
  });

  it('a new top score becomes the cabinet HI', () => {
    const s = new Save(new FakeStorage());
    const top = s.topHiScore(['zombie', 'dino']);
    expect(top).toBe(Math.max(defaultHiScores('zombie')[0].score, defaultHiScores('dino')[0].score));
    s.addHiScore('zombie', { initials: 'ACE', score: top + 1, stage: 'ALL' });
    expect(s.topHiScore(['zombie', 'dino'])).toBe(top + 1);
  });

  it('pads short initials and keeps spaces / dots', () => {
    expect(cleanInitials('a')).toBe('A  ');
    expect(cleanInitials('j.d')).toBe('J.D');
    expect(cleanInitials('ABCDE')).toBe('ABC');
    expect(cleanInitials(undefined)).toBe('   ');
    expect(cleanInitials('ü@#')).toBe('   ');
  });

  it('loads old saves without tables (backward compatible) and repairs bad tables', () => {
    const st = new FakeStorage();
    st.setItem(KEY, JSON.stringify({ version: 1, seenTutorial: true, campaignBest: { zombie: 999 }, settings: { quality: 'low' } }));
    const s = new Save(st);
    expect(s.data.seenTutorial).toBe(true);
    expect(s.data.campaignBest.zombie).toBe(999);
    expect(s.settings).toEqual({ ...DEFAULT_SETTINGS, quality: 'low' });
    expect(s.data.hiscores).toEqual({});
    expect(s.data.lastInitials).toBe('');
    expect(s.hiScores('zombie')).toEqual(defaultHiScores('zombie'));

    st.setItem(
      KEY,
      JSON.stringify({
        hiscores: {
          zombie: [
            { initials: 'abc', score: 5, stage: 'z1' },
            { initials: 'TOP', score: 900, stage: 'ALL' },
            { initials: 'BAD', score: 'lots' },
            null,
            { initials: 'NEG', score: -1 },
          ],
          dino: 'not a table',
        },
        lastInitials: 42,
      }),
    );
    const r = new Save(st);
    expect(r.hiScores('zombie')).toEqual([
      { initials: 'TOP', score: 900, stage: 'ALL' },
      { initials: 'ABC', score: 5, stage: 'z1' },
    ]);
    // A short stored table still has room: any positive score qualifies.
    expect(r.qualifies('zombie', 1)).toBe(true);
    expect(r.hiScores('dino')).toEqual(defaultHiScores('dino'));
    expect(r.data.lastInitials).toBe('');
  });

  it('stores the continues a run used (only when > 0) and cleans bad values on load', () => {
    const st = new FakeStorage();
    const s = new Save(st);
    const top = s.hiScores('zombie')[0].score;
    expect(s.addHiScore('zombie', { initials: 'ONE', score: top + 2, stage: 'ALL', continues: 0 })).toBe(0);
    expect(s.addHiScore('zombie', { initials: 'CON', score: top + 1, stage: 'ALL', continues: 3.7 })).toBe(1);
    expect(s.hiScores('zombie')[0]).toEqual({ initials: 'ONE', score: top + 2, stage: 'ALL' });
    expect(s.hiScores('zombie')[1]).toEqual({ initials: 'CON', score: top + 1, stage: 'ALL', continues: 3 });
    expect(new Save(st).hiScores('zombie')[1].continues).toBe(3);

    st.setItem(
      KEY,
      JSON.stringify({
        hiscores: {
          dino: [
            { initials: 'AAA', score: 30, stage: 'd1', continues: 'x' },
            { initials: 'BBB', score: 20, stage: 'd1', continues: -2 },
            { initials: 'CCC', score: 10, stage: 'd1', continues: 1e9 },
          ],
        },
      }),
    );
    expect(new Save(st).hiScores('dino')).toEqual([
      { initials: 'AAA', score: 30, stage: 'd1' },
      { initials: 'BBB', score: 20, stage: 'd1' },
      { initials: 'CCC', score: 10, stage: 'd1', continues: 99 },
    ]);
  });

  it('reset restores the factory tables but keeps settings', () => {
    const st = new FakeStorage();
    const s = new Save(st);
    s.updateSettings({ retro: 'pixel' });
    s.addHiScore('zombie', { initials: 'ME ', score: 999999, stage: 'ALL' });
    s.reset();
    expect(s.hiScores('zombie')).toEqual(defaultHiScores('zombie'));
    expect(s.settings.retro).toBe('pixel');
    expect(new Save(st).hiScores('zombie')).toEqual(defaultHiScores('zombie'));
  });
});
