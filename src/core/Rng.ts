/** Small, fast, seedable PRNG (mulberry32). Deterministic per seed. */
export class Rng {
  private s: number;
  constructor(seed = 1234567) {
    this.s = seed >>> 0 || 1;
  }
  /** Internal state: save it and assign it back to replay the same sequence. */
  get state(): number {
    return this.s;
  }
  set state(v: number) {
    this.s = v;
  }
  /** Uniform float in [0, 1). */
  next(): number {
    let t = (this.s += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  /** Uniform float in [a, b). */
  range(a: number, b: number): number {
    return a + (b - a) * this.next();
  }
  /** Integer in [a, b] inclusive. */
  int(a: number, b: number): number {
    return Math.floor(this.range(a, b + 1));
  }
  /** Symmetric float in [-a, a). */
  spread(a: number): number {
    return (this.next() * 2 - 1) * a;
  }
  chance(p: number): boolean {
    return this.next() < p;
  }
  pick<T>(arr: readonly T[]): T {
    return arr[Math.floor(this.next() * arr.length)];
  }
}
