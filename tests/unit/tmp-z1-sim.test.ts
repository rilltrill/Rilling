import { it } from 'vitest';
import { ALL_STAGES } from '../../src/content';
import { simulateStage } from './sim';

it('z1 sim diag', { timeout: 200_000 }, () => {
  const st = ALL_STAGES.find((s) => s.id === 'z1')!;
  for (const seed of [99, 7, 1234]) {
    const r = simulateStage(st, { seed });
    console.log(seed, JSON.stringify({ c: r.completed, t: r.time.toFixed(1), boss: r.bossTime.toFixed(1), kills: r.kills, shots: r.shots, dmg: r.damageTaken, maxE: r.maxEntities, beat: r.beatLabel, err: r.errors }));
  }
});
