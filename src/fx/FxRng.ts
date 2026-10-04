/**
 * Allocation-free random source for visual effects (FX never affects gameplay, so
 * it doesn't need the seeded world RNG).
 *
 * The core `Rng` keeps its state in a plain number field that grows past the
 * small-integer range (a boxed double), so each step stores a new heap number;
 * hundreds of calls per blood burst added kilobytes of garbage per frame during
 * heavy gore. Here the xorshift32 state lives in an Int32Array, so a step is pure
 * integer maths plus a typed-array write, and the small methods inline into the
 * spawn loops (no boxed return values).
 */
const INV24 = 1 / 16777216;

export class FxRng {
  private s = new Int32Array(1);

  constructor(seed = 0x2545f491) {
    this.s[0] = seed | 0 || 1;
  }

  /** Uniform in [0, 1). */
  next(): number {
    let x = this.s[0];
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this.s[0] = x;
    return (x >>> 8) * INV24;
  }

  /** Uniform in [a, b). */
  range(a: number, b: number): number {
    return a + (b - a) * this.next();
  }

  /** Integer in [a, b] inclusive. */
  int(a: number, b: number): number {
    return a + ((this.next() * (b - a + 1)) | 0);
  }

  /** Symmetric in [-a, a). */
  spread(a: number): number {
    return (this.next() * 2 - 1) * a;
  }

  chance(p: number): boolean {
    return this.next() < p;
  }
}
