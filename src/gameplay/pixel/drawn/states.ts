import { CIVCOWER, CIVPLEAD, CIVRUN, CIVSTAND, CIVWALK, ZDEATH, ZIDLE, ZLUNGE, ZSHAMBLE, ZSTAGGER, ZWINDUP } from './poses';
import type { PoseKey } from './skeleton';

/**
 * DRAWN FIGURES: which drawn frame a rig state shows. Pure functions (the entity passes numbers),
 * so a test can walk every state. Sprite frames are quantised: the drawing changes about 12 times
 * a second at most, like a sprite sheet, not continuously with the rig.
 */

export interface FramePick {
  frames: readonly PoseKey[];
  frame: number;
}

const _pick: FramePick = { frames: ZIDLE, frame: 0 };

function pick(f: readonly PoseKey[], i: number): FramePick {
  _pick.frames = f;
  _pick.frame = ((i % f.length) + f.length) % f.length;
  return _pick;
}

/** Cycle position (0..1) of a phase angle → one of `n` frames. */
export function cycleFrame(phase: number, n: number): number {
  const t = (phase / (Math.PI * 2)) % 1;
  return Math.floor((t < 0 ? t + 1 : t) * n) % n;
}

/**
 * A zombie: `state` and seconds in it; `windup` duration; `phase` the walk phase (radians, one
 * cycle = 2π); `speed` over ground (m/s); `deathT` the fall duration.
 */
export function zombieFrame(state: string, t: number, windup: number, phase: number, speed: number, deathT: number): FramePick {
  if (state === 'dying') return pick(ZDEATH, Math.min(ZDEATH.length - 1, Math.floor((t / Math.max(0.1, deathT)) * ZDEATH.length)));
  if (state === 'stagger') return pick(ZSTAGGER, t < 0.14 ? 0 : 1);
  if (state === 'windup' || state === 'recover') {
    const p = t / Math.max(0.1, windup);
    return pick(ZWINDUP, state === 'recover' ? ZWINDUP.length - 1 : Math.min(ZWINDUP.length - 1, Math.floor(p * ZWINDUP.length)));
  }
  if (state === 'lunge' || state === 'pounce') return pick(ZLUNGE, 0);
  if (speed < 0.25) return pick(ZIDLE, 0);
  return pick(ZSHAMBLE, cycleFrame(phase, ZSHAMBLE.length));
}

/** Metres a running stride covers: the feet stay planted on the street when the cycle is driven by distance. */
export const RUN_STRIDE = 2.0;
/** Metres a walking step covers, backing away. */
const BACK_STRIDE = 1.2;

/** A civilian's phase → frame. `travel` = metres moved over the ground (the run cycle follows it, not the clock). */
export function civilianFrame(phase: string, phaseT: number, shot: boolean, age: number, travel: number): FramePick {
  if (shot) return pick(ZDEATH, Math.min(ZDEATH.length - 1, Math.floor((age / 0.7) * ZDEATH.length)));
  switch (phase) {
    case 'flee':
    case 'leave':
    case 'arrive':
    case 'stumble':
    case 'fall':
      return pick(CIVRUN, cycleFrame((travel / RUN_STRIDE) * Math.PI * 2, CIVRUN.length));
    case 'backaway':
      // The walk played backwards: facing the threat, stepping away from it.
      return pick(CIVWALK, CIVWALK.length - 1 - cycleFrame((travel / BACK_STRIDE) * Math.PI * 2, CIVWALK.length));
    case 'cower':
    case 'hide':
      return pick(CIVCOWER, 0);
    case 'plead':
    case 'startle':
    case 'grabbed':
      return pick(CIVPLEAD, 0);
    case 'thanks':
      return pick(CIVSTAND, 0);
    default:
      return phaseT >= 0 ? pick(CIVSTAND, 0) : pick(CIVSTAND, 0);
  }
}
