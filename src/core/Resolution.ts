/**
 * Dynamic-resolution governor: decides when to render cheaper (a higher
 * `level` = fewer pixels) from measured frame intervals. Pure logic — the
 * Engine maps levels to retro line counts / pixel ratios.
 *
 * A downscale must prove it helped. Phones in Low Power Mode (and some thermal
 * states) cap requestAnimationFrame at 30 Hz however light the frame is; a naive
 * "slow → downscale" loop walks such a device to its floor and never recovers.
 * So a slow streak starts a probe: step down (up to PROBE_STEPS times) and
 * watch the frame interval. If it improves, keep the lower level. If nothing
 * improved, it was a refresh cap, not GPU load: go back to where the probe
 * started and hold while the interval stays at that cap.
 */

/** Seconds of frames averaged per decision. */
export const RES_WINDOW = 1.5;
/** Average frame interval (s) above which we're slow / below which we're comfortably fast. */
export const RES_SLOW = 1 / 45;
export const RES_FAST = 1 / 57;
/** Steps a probe may take before concluding that downscaling doesn't help. */
export const PROBE_STEPS = 3;
/** A step "helped" when the interval dropped below this fraction of the probe's start. */
const HELPED = 0.87;
/** Fast time (s) needed before stepping back up one level. */
const RECOVER_AFTER = 6;
/** A capped interval this much slower means the regime changed (real overload): probe again. */
const CAP_BREAK = 1.25;

export class ResolutionGovernor {
  /** 0 = full quality … maxLevel = cheapest. */
  level = 0;
  maxLevel = 0;
  /** Rounded frames per second of the last window. */
  fps = 60;
  /** > 0: frame interval (s) treated as a refresh-rate cap (no downscaling while it holds). */
  capAvg = 0;
  private accum = 0;
  private frames = 0;
  private goodTime = 0;
  private probe: { from: number; avg: number; steps: number } | null = null;

  /** New ladder (quality / display mode changed): back to full quality, forget history. */
  reset(maxLevel: number) {
    this.maxLevel = Math.max(0, Math.floor(maxLevel));
    this.level = 0;
    this.capAvg = 0;
    this.accum = 0;
    this.frames = 0;
    this.goodTime = 0;
    this.probe = null;
  }

  /** Feed one raw frame interval (s). Returns true when `level` changed. */
  sample(raw: number): boolean {
    if (!(raw > 0) || raw > 0.5) return false; // tab switch / hitch
    this.accum += raw;
    this.frames++;
    if (this.accum < RES_WINDOW) return false;
    const avg = this.accum / this.frames;
    const span = this.accum;
    this.accum = 0;
    this.frames = 0;
    this.fps = Math.round(1 / avg);
    const before = this.level;
    this.decide(avg, span);
    return this.level !== before;
  }

  private decide(avg: number, span: number) {
    const probe = this.probe;
    if (probe && avg < probe.avg * HELPED) this.probe = null; // the steps paid off: keep them
    if (this.capAvg > 0) {
      if (avg < RES_FAST || avg > this.capAvg * CAP_BREAK) this.capAvg = 0;
      else {
        // Sitting at a refresh cap: lower resolution wouldn't buy frames.
        this.goodTime = 0;
        return;
      }
    }
    if (avg > RES_SLOW) {
      this.goodTime = 0;
      const p = (this.probe ??= { from: this.level, avg, steps: 0 });
      if (p.steps >= PROBE_STEPS || this.level >= this.maxLevel) {
        if (p.steps > 0) {
          // Fewer pixels didn't make frames faster: a cap (or CPU-bound), not GPU load.
          this.level = p.from;
          this.capAvg = p.avg;
        }
        this.probe = null;
      } else {
        this.level++;
        p.steps++;
      }
    } else if (avg < RES_FAST) {
      this.probe = null;
      this.goodTime += span;
      if (this.goodTime > RECOVER_AFTER && this.level > 0) {
        this.level--;
        this.goodTime = 0;
      }
    } else {
      // Acceptable: stay put.
      this.probe = null;
      this.goodTime = 0;
    }
  }
}
