import type { Grade, StageResult } from '../core/types';

export const HEADSHOT_BONUS = 0.5;

/** Score, combo multiplier, accuracy stats and end-of-stage grading. */
export class Scoring {
  score = 0;
  combo = 0;
  maxCombo = 0;
  shots = 0;
  hits = 0;
  kills = 0;
  headshots = 0;
  rescues = 0;
  civiliansShot = 0;
  continues = 0;
  time = 0;
  onChange: () => void = () => {};
  /** Called when the multiplier steps up (for "x2 COMBO!" popups). */
  onMultiplier: (mult: number) => void = () => {};

  /** 1x, then +0.5x for every 5 consecutive hits, capped at 4x. */
  get multiplier(): number {
    return Math.min(4, 1 + Math.floor(this.combo / 5) * 0.5);
  }

  get accuracy(): number {
    return this.shots === 0 ? 0 : this.hits / this.shots;
  }

  /** Register a trigger pull. `hit` = at least one pellet hit something that counts. */
  shot(hit: boolean) {
    this.shots++;
    if (hit) {
      this.hits++;
      const before = this.multiplier;
      this.combo++;
      this.maxCombo = Math.max(this.maxCombo, this.combo);
      if (this.multiplier > before) this.onMultiplier(this.multiplier);
    } else {
      this.combo = 0;
    }
    this.onChange();
  }

  /** Add points scaled by the combo multiplier. Returns the points actually awarded. */
  add(base: number, applyMultiplier = true): number {
    const pts = Math.round(applyMultiplier ? base * this.multiplier : base);
    this.score = Math.max(0, this.score + pts);
    this.onChange();
    return pts;
  }

  kill(base: number, headshot: boolean): number {
    this.kills++;
    if (headshot) this.headshots++;
    return this.add(base * (headshot ? 1 + HEADSHOT_BONUS : 1));
  }

  breakCombo() {
    this.combo = 0;
    this.onChange();
  }

  /** Final tally for a stage, including bonuses and a letter grade. */
  results(stageId: string, damageTaken: number): StageResult {
    const acc = this.accuracy;
    const bonuses: { label: string; points: number }[] = [];
    if (this.shots > 0) bonuses.push({ label: 'ACCURACY', points: Math.round(acc * 5000 / 50) * 50 });
    if (this.headshots > 0) bonuses.push({ label: 'HEADSHOTS', points: this.headshots * 100 });
    if (this.maxCombo > 0) bonuses.push({ label: 'MAX COMBO', points: this.maxCombo * 40 });
    if (damageTaken === 0) bonuses.push({ label: 'NO DAMAGE', points: 5000 });
    if (this.rescues > 0) bonuses.push({ label: 'RESCUES', points: this.rescues * 500 });
    const bonusTotal = bonuses.reduce((s, b) => s + b.points, 0);
    const total = this.score + bonusTotal;
    return {
      stageId,
      score: this.score,
      kills: this.kills,
      headshots: this.headshots,
      shots: this.shots,
      hits: this.hits,
      accuracy: acc,
      maxCombo: this.maxCombo,
      rescues: this.rescues,
      civiliansShot: this.civiliansShot,
      damageTaken,
      continues: this.continues,
      time: this.time,
      bonuses,
      total,
      grade: gradeFor(acc, damageTaken, this.continues, this.headshots / Math.max(1, this.kills), this.maxCombo, this.civiliansShot),
    };
  }
}

export function gradeFor(
  accuracy: number,
  damageTaken: number,
  continues: number,
  headshotRatio: number,
  maxCombo: number,
  civiliansShot = 0,
): Grade {
  let pts = 0;
  pts += accuracy >= 0.85 ? 3 : accuracy >= 0.7 ? 2 : accuracy >= 0.5 ? 1 : 0;
  pts += damageTaken === 0 ? 2 : damageTaken <= 2 ? 1 : 0;
  pts += headshotRatio >= 0.35 ? 1 : 0;
  pts += maxCombo >= 30 ? 1 : 0;
  pts -= continues * 2;
  pts -= civiliansShot;
  if (pts >= 7) return 'S';
  if (pts >= 5) return 'A';
  if (pts >= 3) return 'B';
  if (pts >= 1) return 'C';
  return 'D';
}
