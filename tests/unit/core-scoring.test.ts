import { describe, expect, it, vi } from 'vitest';
import { HEADSHOT_BONUS, Scoring, gradeFor } from '../../src/gameplay/Scoring';

function hits(s: Scoring, n: number) {
  for (let i = 0; i < n; i++) s.shot(true);
}

describe('Scoring — combo multiplier', () => {
  it('steps up by 0.5x every 5 consecutive hits and caps at 4x', () => {
    const s = new Scoring();
    const seen: number[] = [];
    for (let i = 0; i <= 60; i++) {
      seen[i] = s.multiplier;
      s.shot(true);
    }
    expect(seen[0]).toBe(1);
    expect(seen[4]).toBe(1);
    expect(seen[5]).toBe(1.5);
    expect(seen[9]).toBe(1.5);
    expect(seen[10]).toBe(2);
    expect(seen[30]).toBe(4);
    expect(seen[60]).toBe(4);
    expect(Math.max(...seen)).toBe(4);
  });

  it('announces each multiplier step once', () => {
    const s = new Scoring();
    const onMult = vi.fn();
    s.onMultiplier = onMult;
    hits(s, 50);
    expect(onMult.mock.calls.map((c) => c[0])).toEqual([1.5, 2, 2.5, 3, 3.5, 4]);
  });

  it('a miss or breakCombo resets the combo but not maxCombo', () => {
    const s = new Scoring();
    hits(s, 12);
    s.shot(false);
    expect(s.combo).toBe(0);
    expect(s.multiplier).toBe(1);
    expect(s.maxCombo).toBe(12);
    hits(s, 3);
    s.breakCombo();
    expect(s.combo).toBe(0);
    expect(s.maxCombo).toBe(12);
  });
});

describe('Scoring — points & accuracy', () => {
  it('accuracy is hits / shots (0 before any shot)', () => {
    const s = new Scoring();
    expect(s.accuracy).toBe(0);
    hits(s, 3);
    s.shot(false);
    expect(s.accuracy).toBeCloseTo(0.75);
    expect(s.shots).toBe(4);
    expect(s.hits).toBe(3);
  });

  it('applies the multiplier to points (rounded) unless told not to', () => {
    const s = new Scoring();
    hits(s, 5); // 1.5x
    expect(s.add(101)).toBe(152);
    expect(s.add(100, false)).toBe(100);
    expect(s.score).toBe(252);
  });

  it('headshot kills earn the headshot bonus', () => {
    const s = new Scoring();
    expect(s.kill(100, false)).toBe(100);
    expect(s.kill(100, true)).toBe(Math.round(100 * (1 + HEADSHOT_BONUS)));
    expect(s.kills).toBe(2);
    expect(s.headshots).toBe(1);
  });

  it('score never drops below zero', () => {
    const s = new Scoring();
    s.add(50);
    s.add(-1000, false);
    expect(s.score).toBe(0);
  });
});

describe('Scoring — results & bonuses', () => {
  it('totals score plus accuracy / headshot / combo / no-damage / rescue bonuses', () => {
    const s = new Scoring();
    hits(s, 10);
    for (let i = 0; i < 10; i++) s.shot(false); // 50 % accuracy
    s.kill(100, true);
    s.rescues = 2;
    const r = s.results('z1', 0);
    const b = Object.fromEntries(r.bonuses.map((x) => [x.label, x.points]));
    expect(b.ACCURACY).toBe(2500);
    expect(b.HEADSHOTS).toBe(100);
    expect(b['MAX COMBO']).toBe(10 * 40);
    expect(b['NO DAMAGE']).toBe(5000);
    expect(b.RESCUES).toBe(1000);
    expect(r.total).toBe(r.score + r.bonuses.reduce((n, x) => n + x.points, 0));
    expect(r.stageId).toBe('z1');
    expect(r.accuracy).toBeCloseTo(0.5);
  });

  it('accuracy bonus rounds to 50 and is omitted without shots; damage removes NO DAMAGE', () => {
    const s = new Scoring();
    const empty = s.results('z1', 3);
    expect(empty.bonuses).toEqual([]);
    expect(empty.total).toBe(0);
    hits(s, 2);
    s.shot(false); // 66.7 %
    const r = s.results('z1', 1);
    expect(r.bonuses.find((x) => x.label === 'ACCURACY')!.points).toBe(3350);
    expect(r.bonuses.some((x) => x.label === 'NO DAMAGE')).toBe(false);
  });
});

describe('gradeFor — boundaries', () => {
  it('S needs everything: ≥85 % accuracy, no damage, ≥35 % headshots, ≥30 combo', () => {
    expect(gradeFor(0.85, 0, 0, 0.35, 30)).toBe('S');
    expect(gradeFor(0.849, 0, 0, 0.35, 30)).toBe('A');
    expect(gradeFor(0.85, 0, 0, 0.34, 30)).toBe('A');
    expect(gradeFor(0.85, 0, 0, 0.35, 29)).toBe('A');
    expect(gradeFor(0.85, 1, 0, 0.35, 30)).toBe('A');
  });

  it('accuracy and damage tiers', () => {
    // accuracy tiers: ≥.85 → 3, ≥.7 → 2, ≥.5 → 1; damage 0 → 2, ≤2 → 1
    expect(gradeFor(0.7, 2, 0, 0, 0)).toBe('B'); // 2 + 1 = 3
    expect(gradeFor(0.69, 2, 0, 0, 0)).toBe('C'); // 1 + 1 = 2
    expect(gradeFor(0.5, 3, 0, 0, 0)).toBe('C'); // 1
    expect(gradeFor(0.49, 3, 0, 0, 0)).toBe('D'); // 0
    expect(gradeFor(0.85, 0, 0, 0, 0)).toBe('A'); // 3 + 2 = 5
  });

  it('continues cost two points each and shooting civilians one each', () => {
    expect(gradeFor(0.85, 0, 1, 0.35, 30)).toBe('A'); // 7 - 2
    expect(gradeFor(0.85, 0, 2, 0.35, 30)).toBe('B'); // 7 - 4
    expect(gradeFor(0.85, 0, 0, 0.35, 30, 1)).toBe('A'); // 7 - 1
    expect(gradeFor(0.85, 0, 0, 0.35, 30, 6)).toBe('C'); // 7 - 6
    expect(gradeFor(0, 5, 3, 0, 0, 2)).toBe('D');
  });
});
