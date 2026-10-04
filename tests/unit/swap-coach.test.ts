import { describe, expect, it } from 'vitest';
import { Save } from '../../src/core/Save';

const KEY = 'overrun.save.v1';

function storage(initial?: unknown): Storage {
  const map = new Map<string, string>();
  if (initial !== undefined) map.set(KEY, JSON.stringify(initial));
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (k: string) => map.get(k) ?? null,
    key: (i: number) => [...map.keys()][i] ?? null,
    removeItem: (k: string) => void map.delete(k),
    setItem: (k: string, v: string) => void map.set(k, String(v)),
  };
}

describe('weapon-switch coaching counter (Save.swaps)', () => {
  it('starts at 0 and reads old saves without the field as 0', () => {
    expect(new Save(storage()).data.swaps).toBe(0);
    expect(new Save(storage({ version: 1, seenTutorial: true })).data.swaps).toBe(0);
  });

  it('round-trips and sanitises junk', () => {
    const st = storage();
    const s = new Save(st);
    s.data.swaps = 2;
    s.persist();
    expect(new Save(st).data.swaps).toBe(2);
    for (const bad of [-4, 'lots', null, Infinity]) {
      expect(new Save(storage({ version: 1, swaps: bad })).data.swaps).toBe(0);
    }
    expect(new Save(storage({ version: 1, swaps: 2.7 })).data.swaps).toBe(2);
  });

  it('a save reset brings the coaching back', () => {
    const st = storage({ version: 1, swaps: 3 });
    const s = new Save(st);
    s.reset();
    expect(s.data.swaps).toBe(0);
  });
});
