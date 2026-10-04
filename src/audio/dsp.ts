/**
 * Low-level DSP helpers shared by the SFX recipes and the music player.
 * Everything here works on any BaseAudioContext (live or offline) and never
 * touches the DOM, so it is safe to import from node (unit tests).
 */

/** Noise sources used by the recipes. Every buffer loops seamlessly. */
export interface NoiseBank {
  white: AudioBuffer;
  /** -3 dB/oct: natural for blasts, wind, breath. */
  pink: AudioBuffer;
  /** -6 dB/oct: rumbles, thunder, engine. */
  brown: AudioBuffer;
  /** Sparse random impulses: crackle, debris, splatter. */
  crackle: AudioBuffer;
}

export type NoiseKind = keyof NoiseBank;

/** Mulberry32 state in an object field (a captured `let` would box a heap number per call). */
class Mulberry {
  a = 0;
  constructor(seed: number) {
    this.a = seed >>> 0;
  }
  next(): number {
    const a = (this.a = (this.a + 0x6d2b79f5) >>> 0);
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
}

/** Small, fast, seedable PRNG so generated buffers are reproducible. */
export function mulberry(seed: number): () => number {
  const m = new Mulberry(seed);
  return () => m.next();
}

// ─── Resumable synthesis jobs ─────────────────────────────────────────────────

/**
 * A resumable sample-synthesis job. Generators yield every CHUNK samples so the
 * heavy JS sample math can be time-sliced across frames (see bake.ts) instead
 * of stalling the first tap; `runSync` drives one to completion.
 */
export type Job<T> = Generator<void, T, void>;
export const CHUNK = 1024;
const MASK = CHUNK - 1;

export function runSync<T>(job: Job<T>): T {
  for (;;) {
    const r = job.next();
    if (r.done) return r.value;
  }
}

/** Mono AudioBuffer holding `data` at sample rate `sr` (any rate: sources resample). */
export function toBuffer(ctx: BaseAudioContext, data: Float32Array, sr = ctx.sampleRate): AudioBuffer {
  const buf = ctx.createBuffer(1, Math.max(1, data.length), sr);
  buf.getChannelData(0).set(data);
  return buf;
}

/** Make the end of `d` flow into its start so the buffer can loop without a click. */
function loopify(src: Float32Array, len: number, fade: number): Float32Array {
  const out = src.slice(0, len);
  for (let i = 0; i < fade; i++) {
    const a = i / fade;
    out[i] = src[i] * a + src[len + i] * (1 - a);
  }
  return out;
}

function normalise(d: Float32Array, peak = 0.95) {
  let m = 0;
  for (let i = 0; i < d.length; i++) m = Math.max(m, Math.abs(d[i]));
  if (m > 0) {
    const k = peak / m;
    for (let i = 0; i < d.length; i++) d[i] *= k;
  }
}

export type NoiseData = Record<NoiseKind, Float32Array>;

/** Sample data for a NoiseBank at `sr` (time-sliced). */
export function* noiseData(sr: number, seconds = 2, seed = 0x5eed): Job<NoiseData> {
  const len = Math.floor(sr * seconds);
  const fade = Math.floor(sr * 0.05);
  const total = len + fade;
  const rnd = mulberry(seed);

  const white = new Float32Array(total);
  for (let i = 0; i < total; i++) {
    white[i] = rnd() * 2 - 1;
    if ((i & MASK) === MASK) yield;
  }

  // Paul Kellet's economy pink filter + a leaky integrator (brown) with DC blocking.
  const pink = new Float32Array(total);
  const brown = new Float32Array(total);
  let b0 = 0, b1 = 0, b2 = 0;
  let acc = 0, prevIn = 0, prevOut = 0;
  for (let i = 0; i < total; i++) {
    const w = white[i];
    b0 = 0.99765 * b0 + w * 0.099046;
    b1 = 0.963 * b1 + w * 0.2965164;
    b2 = 0.57 * b2 + w * 1.0526913;
    pink[i] = b0 + b1 + b2 + w * 0.1848;
    acc = acc * 0.997 + w * 0.06;
    const y = acc - prevIn + 0.999 * prevOut;
    prevIn = acc;
    prevOut = y;
    brown[i] = y;
    if ((i & MASK) === MASK) yield;
  }
  normalise(pink);
  normalise(brown);
  yield;

  // Crackle: random little impulses with short noisy decays.
  const crackle = new Float32Array(total);
  let i = 0;
  let next = CHUNK;
  while (i < total) {
    i += 20 + Math.floor(rnd() * rnd() * sr * 0.03);
    const amp = (0.25 + rnd() * 0.75) * (rnd() < 0.5 ? -1 : 1);
    const n = 8 + Math.floor(rnd() * 90);
    for (let k = 0; k < n && i + k < total; k++) crackle[i + k] += amp * Math.exp(-k / (n * 0.25)) * (rnd() * 2 - 1);
    if (i >= next) {
      next = i + CHUNK;
      yield;
    }
  }
  normalise(crackle);

  return {
    white: loopify(white, len, fade),
    pink: loopify(pink, len, fade),
    brown: loopify(brown, len, fade),
    crackle: loopify(crackle, len, fade),
  };
}

/** Wrap NoiseData (computed at `sr`) into buffers. */
export function noiseBankFrom(ctx: BaseAudioContext, d: NoiseData, sr: number): NoiseBank {
  return { white: toBuffer(ctx, d.white, sr), pink: toBuffer(ctx, d.pink, sr), brown: toBuffer(ctx, d.brown, sr), crackle: toBuffer(ctx, d.crackle, sr) };
}

export function makeNoiseBank(ctx: BaseAudioContext, seconds = 2, seed = 0x5eed): NoiseBank {
  return noiseBankFrom(ctx, runSync(noiseData(ctx.sampleRate, seconds, seed)), ctx.sampleRate);
}

/** Stereo reverb impulse data: decaying filtered noise, decorrelated per channel (time-sliced). */
export function* impulseData(sr: number, seconds = 1.8, decay = 2.6, seed = 77): Job<Float32Array[]> {
  const len = Math.max(1, Math.floor(sr * seconds));
  const out: Float32Array[] = [];
  for (let ch = 0; ch < 2; ch++) {
    const rnd = mulberry(seed + ch * 101);
    const d = new Float32Array(len);
    let lp = 0;
    // The (1 - t)^decay tail is evaluated every 64 samples and interpolated (pow is slow).
    let e0 = 1, e1 = 1;
    for (let i = 0; i < len; i++) {
      const t = i / len;
      if ((i & 63) === 0) {
        e0 = Math.pow(1 - t, decay);
        e1 = Math.pow(Math.max(0, 1 - (i + 64) / len), decay);
      }
      // Darken over time (air absorption): the one-pole coefficient grows.
      const k = 0.35 + 0.6 * t;
      lp = lp * k + (rnd() * 2 - 1) * (1 - k);
      // Short pre-delay ramp and exponential tail.
      const pre = Math.min(1, i / (sr * 0.012));
      d[i] = lp * pre * (e0 + (e1 - e0) * ((i & 63) / 64)) * 2.2;
      if ((i & MASK) === MASK) yield;
    }
    // A few early reflections for a sense of space.
    for (let r = 0; r < 6; r++) {
      const at = Math.floor(sr * (0.011 + rnd() * 0.06));
      if (at < len) d[at] += (rnd() * 0.5 + 0.2) * (rnd() < 0.5 ? -1 : 1);
    }
    out.push(d);
  }
  return out;
}

/**
 * Stereo impulse buffer. A ConvolverNode needs its buffer at the context's own
 * sample rate, so `sr` must equal ctx.sampleRate when used for reverb.
 */
export function impulseFrom(ctx: BaseAudioContext, chans: Float32Array[], sr = ctx.sampleRate): AudioBuffer {
  const buf = ctx.createBuffer(chans.length, chans[0].length, sr);
  chans.forEach((d, ch) => buf.getChannelData(ch).set(d));
  return buf;
}

export function makeImpulse(ctx: BaseAudioContext, seconds = 1.8, decay = 2.6, seed = 77): AudioBuffer {
  return impulseFrom(ctx, runSync(impulseData(ctx.sampleRate, seconds, decay, seed)), ctx.sampleRate);
}

const curves = new Map<number, Float32Array>();
/** tanh soft-clip curve. `drive` ~1 (gentle) .. 20 (fuzz). Cached. */
export function shaperCurve(drive: number): Float32Array {
  const key = Math.round(drive * 10);
  let c = curves.get(key);
  if (!c) {
    const n = 1024;
    c = new Float32Array(n);
    const norm = Math.tanh(drive);
    for (let i = 0; i < n; i++) {
      const x = (i / (n - 1)) * 2 - 1;
      c[i] = Math.tanh(x * drive) / norm;
    }
    curves.set(key, c);
  }
  return c;
}

/** Copy `buf` (mono) cut to [start, end) seconds, dropping the silent tail. */
export function sliceTrim(ctx: BaseAudioContext, buf: AudioBuffer, start: number, end: number, floor = 0.0008): AudioBuffer {
  const sr = buf.sampleRate;
  const d = buf.getChannelData(0);
  const a = Math.max(0, Math.floor(start * sr));
  let b = Math.min(d.length, Math.floor(end * sr));
  while (b > a + 1 && Math.abs(d[b - 1]) < floor) b--;
  // Keep a few ms after the last audible sample and fade them out.
  const fade = Math.min(Math.floor(sr * 0.01), d.length - b);
  const len = Math.max(1, b - a + fade);
  const out = ctx.createBuffer(1, len, sr);
  const o = out.getChannelData(0);
  o.set(d.subarray(a, a + len));
  for (let i = 0; i < fade; i++) o[len - 1 - i] *= i / fade;
  return out;
}

/** Peak / RMS / non-finite count of a buffer (all channels). */
export function measure(buf: AudioBuffer): { peak: number; rms: number; nan: number; dur: number; audible: number } {
  let peak = 0, sum = 0, nan = 0, n = 0, last = 0;
  for (let ch = 0; ch < buf.numberOfChannels; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < d.length; i++) {
      const v = d[i];
      if (!Number.isFinite(v)) {
        nan++;
        continue;
      }
      const a = Math.abs(v);
      if (a > peak) peak = a;
      if (a > 0.001 && i > last) last = i;
      sum += v * v;
      n++;
    }
  }
  return { peak, rms: Math.sqrt(sum / Math.max(1, n)), nan, dur: buf.duration, audible: last / buf.sampleRate };
}

// ─── Pure-JS sample synthesis (music drums) ───────────────────────────────────

/** RBJ biquad for offline JS sample generation. */
export class JsBiquad {
  private b0 = 1; private b1 = 0; private b2 = 0; private a1 = 0; private a2 = 0;
  private x1 = 0; private x2 = 0; private y1 = 0; private y2 = 0;
  constructor(private sr: number, type: 'lowpass' | 'highpass' | 'bandpass', freq: number, q = 0.707) {
    this.set(type, freq, q);
  }
  set(type: 'lowpass' | 'highpass' | 'bandpass', freq: number, q = 0.707) {
    const w = (2 * Math.PI * Math.min(freq, this.sr * 0.45)) / this.sr;
    const cos = Math.cos(w), alpha = Math.sin(w) / (2 * q);
    let b0: number, b1: number, b2: number;
    if (type === 'lowpass') {
      b0 = (1 - cos) / 2; b1 = 1 - cos; b2 = (1 - cos) / 2;
    } else if (type === 'highpass') {
      b0 = (1 + cos) / 2; b1 = -(1 + cos); b2 = (1 + cos) / 2;
    } else {
      b0 = alpha; b1 = 0; b2 = -alpha;
    }
    const a0 = 1 + alpha;
    this.b0 = b0 / a0; this.b1 = b1 / a0; this.b2 = b2 / a0;
    this.a1 = (-2 * cos) / a0; this.a2 = (1 - alpha) / a0;
  }
  run(x: number): number {
    const y = this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2;
    this.x2 = this.x1; this.x1 = x; this.y2 = this.y1; this.y1 = y;
    return y;
  }
}

/**
 * Sine oscillator by complex rotation: four multiplies per sample instead of a
 * Math.sin call. Accurate to ~1e-12 over the few seconds of a baked sample.
 * (Fields start as numbers so V8 keeps them as in-place doubles: no boxing per sample.)
 */
export class RotOsc {
  private c = 0;
  private s = 0;
  private readonly cw: number = 0;
  private readonly sw: number = 0;
  constructor(freq: number, sr: number, phase = 0) {
    const w = (2 * Math.PI * freq) / sr;
    this.cw = Math.cos(w);
    this.sw = Math.sin(w);
    this.c = Math.cos(phase);
    this.s = Math.sin(phase);
  }
  /** sin(phase + 2π·f·n/sr) for n = 0, 1, 2, … */
  next(): number {
    const s = this.s, c = this.c;
    this.s = s * this.cw + c * this.sw;
    this.c = c * this.cw - s * this.sw;
    return s;
  }
}

/** exp(-t / tau) evaluated sample by sample as a running product (no Math.exp per sample). */
export class Decay {
  private v = 1;
  private readonly k: number = 0;
  constructor(tau: number, sr: number) {
    this.k = Math.exp(-1 / (tau * sr));
  }
  next(): number {
    const r = this.v;
    this.v *= this.k;
    return r;
  }
}

/** Running phase accumulator (radians) for swept oscillators. */
export class Phase {
  ph = 0;
  add(freq: number, sr: number): number {
    return (this.ph += (2 * Math.PI * freq) / sr);
  }
}

/**
 * Evaluate `fn(t, i)` for `seconds` at `sr` (time-sliced), fade the last 5 ms
 * to avoid an end click and normalise to `peak`.
 */
export function* synth(sr: number, seconds: number, fn: (t: number, i: number) => number, peak = 0.9): Job<Float32Array> {
  const len = Math.max(1, Math.floor(sr * seconds));
  const d = new Float32Array(len);
  for (let i = 0; i < len; i++) {
    d[i] = fn(i / sr, i);
    if ((i & MASK) === MASK) yield;
  }
  const f = Math.min(len, Math.floor(sr * 0.005));
  for (let i = 0; i < f; i++) d[len - 1 - i] *= i / f;
  normalise(d, peak);
  return d;
}
