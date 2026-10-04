import { DEFAULT_SETTINGS, type Grade, type Settings } from './types';

const KEY = 'overrun.save.v1';

export interface StageBest {
  score: number;
  grade: Grade;
}

export interface SaveData {
  version: 1;
  settings: Settings;
  /** stageIds the player may select. The first stage of each campaign is always unlocked. */
  unlocked: string[];
  best: Record<string, StageBest>;
  /** Best full-campaign score keyed by campaign id. */
  campaignBest: Record<string, number>;
  seenTutorial: boolean;
}

const GRADE_ORDER: Grade[] = ['D', 'C', 'B', 'A', 'S'];

function fresh(): SaveData {
  return {
    version: 1,
    settings: { ...DEFAULT_SETTINGS },
    unlocked: [],
    best: {},
    campaignBest: {},
    seenTutorial: false,
  };
}

/** localStorage-backed persistence. Every access is guarded — storage can be unavailable. */
export class Save {
  data: SaveData;

  constructor(private storage: Storage | null = Save.tryStorage()) {
    this.data = this.load();
  }

  static tryStorage(): Storage | null {
    try {
      const s = globalThis.localStorage;
      const k = '__overrun_probe__';
      s.setItem(k, '1');
      s.removeItem(k);
      return s;
    } catch {
      return null;
    }
  }

  private load(): SaveData {
    const base = fresh();
    if (!this.storage) return base;
    try {
      const raw = this.storage.getItem(KEY);
      if (!raw) return base;
      const parsed = JSON.parse(raw) as Partial<SaveData>;
      return {
        ...base,
        ...parsed,
        settings: { ...DEFAULT_SETTINGS, ...(parsed.settings ?? {}) },
        unlocked: Array.isArray(parsed.unlocked) ? parsed.unlocked : [],
        best: parsed.best ?? {},
        campaignBest: parsed.campaignBest ?? {},
      };
    } catch {
      return base;
    }
  }

  persist(): void {
    if (!this.storage) return;
    try {
      this.storage.setItem(KEY, JSON.stringify(this.data));
    } catch {
      /* quota / private mode — ignore */
    }
  }

  get settings(): Settings {
    return this.data.settings;
  }

  updateSettings(patch: Partial<Settings>): void {
    this.data.settings = { ...this.data.settings, ...patch };
    this.persist();
  }

  isUnlocked(stageId: string): boolean {
    return this.data.unlocked.includes(stageId);
  }

  unlock(stageId: string): void {
    if (!this.isUnlocked(stageId)) {
      this.data.unlocked.push(stageId);
      this.persist();
    }
  }

  /** Records a stage result; returns true if it is a new best score. */
  recordStage(stageId: string, score: number, grade: Grade): boolean {
    const prev = this.data.best[stageId];
    const isBest = !prev || score > prev.score;
    const bestGrade =
      prev && GRADE_ORDER.indexOf(prev.grade) > GRADE_ORDER.indexOf(grade) ? prev.grade : grade;
    this.data.best[stageId] = { score: Math.max(score, prev?.score ?? 0), grade: bestGrade };
    this.persist();
    return isBest;
  }

  recordCampaign(campaignId: string, score: number): boolean {
    const prev = this.data.campaignBest[campaignId] ?? 0;
    if (score > prev) {
      this.data.campaignBest[campaignId] = score;
      this.persist();
      return true;
    }
    return false;
  }

  reset(): void {
    const settings = this.data.settings;
    this.data = fresh();
    this.data.settings = settings;
    this.persist();
  }
}
