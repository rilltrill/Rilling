import { DEFAULT_SETTINGS, type Grade, type Settings } from './types';

const KEY = 'overrun.save.v1';

export interface StageBest {
  score: number;
  grade: Grade;
}

/** One row of an arcade hi-score table. */
export interface HiScoreEntry {
  /** Three characters: A–Z, 0–9, '.', ' '. */
  initials: string;
  score: number;
  /** Where the run ended: a stage id ('z2'), or 'ALL' for a cleared campaign. */
  stage: string;
  /** Continues the run used (shown as a small C1, C2… marker; 0 / missing = one credit). */
  continues?: number;
}

export const HISCORE_SLOTS = 10;
/** Characters allowed in initials (name entry cycles through these). */
export const INITIAL_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789. ';

export interface SaveData {
  version: 1;
  settings: Settings;
  /** stageIds the player may select. The first stage of each campaign is always unlocked. */
  unlocked: string[];
  best: Record<string, StageBest>;
  /** Best full-campaign score keyed by campaign id. */
  campaignBest: Record<string, number>;
  seenTutorial: boolean;
  /** Arcade top-10 tables keyed by campaign id (a missing table reads as the default one). */
  hiscores: Record<string, HiScoreEntry[]>;
  /** Initials entered last time (pre-filled on the next name entry). */
  lastInitials: string;
}

const GRADE_ORDER: Grade[] = ['D', 'C', 'B', 'A', 'S'];

/** Factory-set tables, like a cabinet fresh out of the crate. */
const DEFAULT_TABLES: Record<string, [string, number, string][]> = {
  zombie: [
    ['ZMB', 150000, 'ALL'],
    ['AAA', 125000, 'ALL'],
    ['RIP', 100000, 'z3'],
    ['GUN', 80000, 'z3'],
    ['BRN', 60000, 'z2'],
    ['DED', 45000, 'z2'],
    ['CPU', 30000, 'z2'],
    ['BOO', 20000, 'z1'],
    ['SEG', 15000, 'z1'],
    ['YOU', 10000, 'z1'],
  ],
  dino: [
    ['RAP', 150000, 'ALL'],
    ['REX', 125000, 'ALL'],
    ['AAA', 100000, 'd3'],
    ['DNA', 80000, 'd3'],
    ['AMB', 60000, 'd2'],
    ['CLV', 45000, 'd2'],
    ['TRI', 30000, 'd2'],
    ['PTR', 20000, 'd1'],
    ['IAN', 15000, 'd1'],
    ['YOU', 10000, 'd1'],
  ],
};

/** The default table for a campaign (a generic one for unknown ids). */
export function defaultHiScores(campaign: string): HiScoreEntry[] {
  const rows = DEFAULT_TABLES[campaign] ?? DEFAULT_TABLES.zombie;
  return rows.map(([initials, score, stage]) => ({ initials, score, stage }));
}

/** Continue count stored with an entry: a whole number 0–99 (anything else reads as 0). */
function cleanContinues(v: unknown): number {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) && n > 0 ? Math.min(99, n) : 0;
}

/** Upper-cases, strips unsupported characters and pads/clips to exactly 3 characters. */
export function cleanInitials(s: unknown): string {
  const up = typeof s === 'string' ? s.toUpperCase() : '';
  let out = '';
  for (const ch of up) if (INITIAL_CHARS.includes(ch)) out += ch;
  return (out + '   ').slice(0, 3);
}

function cleanTable(v: unknown): HiScoreEntry[] | null {
  if (!Array.isArray(v)) return null;
  const rows: HiScoreEntry[] = [];
  for (const r of v) {
    if (!r || typeof r !== 'object') continue;
    const e = r as Partial<HiScoreEntry>;
    const score = Number(e.score);
    if (!Number.isFinite(score) || score < 0) continue;
    const row: HiScoreEntry = { initials: cleanInitials(e.initials), score: Math.floor(score), stage: typeof e.stage === 'string' ? e.stage.slice(0, 8) : '' };
    const continues = cleanContinues(e.continues);
    if (continues > 0) row.continues = continues;
    rows.push(row);
  }
  rows.sort((a, b) => b.score - a.score);
  return rows.slice(0, HISCORE_SLOTS);
}

function fresh(): SaveData {
  return {
    version: 1,
    settings: { ...DEFAULT_SETTINGS },
    unlocked: [],
    best: {},
    campaignBest: {},
    seenTutorial: false,
    hiscores: {},
    lastInitials: '',
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
      const hiscores: Record<string, HiScoreEntry[]> = {};
      if (parsed.hiscores && typeof parsed.hiscores === 'object') {
        for (const [k, v] of Object.entries(parsed.hiscores)) {
          const t = cleanTable(v);
          if (t) hiscores[k] = t;
        }
      }
      return {
        ...base,
        ...parsed,
        settings: { ...DEFAULT_SETTINGS, ...(parsed.settings ?? {}) },
        unlocked: Array.isArray(parsed.unlocked) ? parsed.unlocked : [],
        best: parsed.best ?? {},
        campaignBest: parsed.campaignBest ?? {},
        hiscores,
        lastInitials: typeof parsed.lastInitials === 'string' ? cleanInitials(parsed.lastInitials).trimEnd() : '',
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

  // ─── Arcade hi-score tables ───────────────────────────────────────────────

  /** The campaign's top-10 table, best first (the factory table until someone beats it). */
  hiScores(campaign: string): HiScoreEntry[] {
    return this.data.hiscores[campaign] ?? defaultHiScores(campaign);
  }

  /** Where `score` would land in the table (0 = top), or -1 if it doesn't make the cut. Ties rank below. */
  hiScoreRank(campaign: string, score: number): number {
    if (!(score > 0)) return -1;
    const t = this.hiScores(campaign);
    let i = 0;
    while (i < t.length && t[i].score >= score) i++;
    return i < HISCORE_SLOTS ? i : -1;
  }

  /** True when `score` earns a place in the campaign's table (it must beat the 10th entry). */
  qualifies(campaign: string, score: number): boolean {
    return this.hiScoreRank(campaign, score) >= 0;
  }

  /** Inserts an entry; returns its rank (0 = top) or -1 when it didn't qualify. */
  addHiScore(campaign: string, entry: HiScoreEntry): number {
    const score = Math.floor(entry.score);
    const rank = this.hiScoreRank(campaign, score);
    if (rank < 0) return -1;
    const initials = cleanInitials(entry.initials);
    const table = this.hiScores(campaign).slice();
    const row: HiScoreEntry = { initials, score, stage: String(entry.stage ?? '').slice(0, 8) };
    const continues = cleanContinues(entry.continues);
    if (continues > 0) row.continues = continues;
    table.splice(rank, 0, row);
    this.data.hiscores[campaign] = table.slice(0, HISCORE_SLOTS);
    this.data.lastInitials = initials.trimEnd();
    this.persist();
    return rank;
  }

  /** Highest score across the given campaigns' tables (the cabinet's "HI"). */
  topHiScore(campaigns: string[]): number {
    let best = 0;
    for (const c of campaigns) best = Math.max(best, this.hiScores(c)[0]?.score ?? 0);
    return best;
  }

  reset(): void {
    const settings = this.data.settings;
    this.data = fresh();
    this.data.settings = settings;
    this.persist();
  }
}
