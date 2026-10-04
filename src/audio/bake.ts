import type { Job } from './dsp';

interface Task {
  key: string;
  job: Job<unknown>;
  done: boolean;
  value: unknown;
}

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

/**
 * Time-sliced background synthesis. The heavy JS sample math (noise bank,
 * reverb impulse, drum kit, ambience loops) runs as resumable jobs a few ms per
 * frame, starting at boot, so the first tap only has to wrap finished arrays
 * into AudioBuffers instead of computing ~1.5 M samples inside the gesture.
 * Jobs run in queue order; `urgent` jobs jump the queue.
 */
export class Baker {
  private tasks: Task[] = [];

  add(key: string, job: Job<unknown>, urgent = false) {
    if (this.find(key)) return;
    const t: Task = { key, job, done: false, value: undefined };
    if (urgent) this.tasks.unshift(t);
    else this.tasks.push(t);
  }

  has(key: string): boolean {
    return !!this.find(key);
  }

  /** Remove and return a finished result (undefined while it is still running). */
  take<T>(key: string): T | undefined {
    const t = this.find(key);
    if (!t || !t.done) return undefined;
    this.drop(key);
    return t.value as T;
  }

  /** Finish a job right now (it is needed immediately), then remove and return it. */
  takeNow<T>(key: string): T | undefined {
    const t = this.find(key);
    if (!t) return undefined;
    while (!t.done) this.advance(t);
    this.drop(key);
    return t.value as T;
  }

  drop(key: string) {
    const i = this.tasks.findIndex((t) => t.key === key);
    if (i >= 0) this.tasks.splice(i, 1);
  }

  /** True when no job is left running (finished results may still be waiting to be taken). */
  get idle(): boolean {
    for (const t of this.tasks) if (!t.done) return false;
    return true;
  }

  get pending(): number {
    return this.tasks.length;
  }

  /** Advance jobs for up to `budgetMs` (overshoots by at most one CHUNK of samples). */
  step(budgetMs: number) {
    const end = now() + budgetMs;
    for (const t of this.tasks) {
      while (!t.done) {
        this.advance(t);
        if (now() >= end) return;
      }
    }
  }

  private advance(t: Task) {
    const r = t.job.next();
    if (r.done) {
      t.done = true;
      t.value = r.value;
    }
  }

  private find(key: string): Task | undefined {
    for (const t of this.tasks) if (t.key === key) return t;
    return undefined;
  }
}
