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

/** Small, fast, seedable PRNG so generated buffers are reproducible. */
export function mulberry(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Make the end of `d` flow into its start so the buffer can loop without a click. */
function loopify(src: Float32Array, len: number, fade: number): Float32Array {
  const out = new Float32Array(len);
  for (let i = 0; i < len; i++) out[i] = src[i];
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

function toBuffer(ctx: BaseAudioContext, data: Float32Array): AudioBuffer {
  const buf = ctx.createBuffer(1, data.length, ctx.sampleRate);
  buf.getChannelData(0).set(data);
  return buf;
}

export function makeNoiseBank(ctx: BaseAudioContext, seconds = 2, seed = 0x5eed): NoiseBank {
  const sr = ctx.sampleRate;
  const len = Math.floor(sr * seconds);
  const fade = Math.floor(sr * 0.05);
  const total = len + fade;
  const rnd = mulberry(seed);

  const white = new Float32Array(total);
  for (let i = 0; i < total; i++) white[i] = rnd() * 2 - 1;

  // Paul Kellet's economy pink filter.
  const pink = new Float32Array(total);
  let b0 = 0, b1 = 0, b2 = 0;
  for (let i = 0; i < total; i++) {
    const w = white[i];
    b0 = 0.99765 * b0 + w * 0.099046;
    b1 = 0.963 * b1 + w * 0.2965164;
    b2 = 0.57 * b2 + w * 1.0526913;
    pink[i] = b0 + b1 + b2 + w * 0.1848;
  }
  normalise(pink);

  // Leaky integrator (brown) with DC blocking.
  const brown = new Float32Array(total);
  let acc = 0, prevIn = 0, prevOut = 0;
  for (let i = 0; i < total; i++) {
    acc = acc * 0.997 + white[i] * 0.06;
    // one-pole DC blocker
    const y = acc - prevIn + 0.999 * prevOut;
    prevIn = acc;
    prevOut = y;
    brown[i] = y;
  }
  normalise(brown);

  // Crackle: random little impulses with short noisy decays.
  const crackle = new Float32Array(total);
  let i = 0;
  while (i < total) {
    i += 20 + Math.floor(rnd() * rnd() * sr * 0.03);
    const amp = (0.25 + rnd() * 0.75) * (rnd() < 0.5 ? -1 : 1);
    const n = 8 + Math.floor(rnd() * 90);
    for (let k = 0; k < n && i + k < total; k++) crackle[i + k] += amp * Math.exp(-k / (n * 0.25)) * (rnd() * 2 - 1);
  }
  normalise(crackle);

  return {
    white: toBuffer(ctx, loopify(white, len, fade)),
    pink: toBuffer(ctx, loopify(pink, len, fade)),
    brown: toBuffer(ctx, loopify(brown, len, fade)),
    crackle: toBuffer(ctx, loopify(crackle, len, fade)),
  };
}

/** Stereo reverb impulse: decaying filtered noise, decorrelated per channel. */
export function makeImpulse(ctx: BaseAudioContext, seconds = 1.8, decay = 2.6, seed = 77): AudioBuffer {
  const sr = ctx.sampleRate;
  const len = Math.max(1, Math.floor(sr * seconds));
  const buf = ctx.createBuffer(2, len, sr);
  for (let ch = 0; ch < 2; ch++) {
    const rnd = mulberry(seed + ch * 101);
    const d = buf.getChannelData(ch);
    let lp = 0;
    for (let i = 0; i < len; i++) {
      const t = i / len;
      // Darken over time (air absorption): the one-pole coefficient grows.
      const k = 0.35 + 0.6 * t;
      lp = lp * k + (rnd() * 2 - 1) * (1 - k);
      // Short pre-delay ramp and exponential tail.
      const pre = Math.min(1, i / (sr * 0.012));
      d[i] = lp * pre * Math.pow(1 - t, decay) * 2.2;
    }
    // A few early reflections for a sense of space.
    for (let r = 0; r < 6; r++) {
      const at = Math.floor(sr * (0.011 + rnd() * 0.06));
      if (at < len) d[at] += (rnd() * 0.5 + 0.2) * (rnd() < 0.5 ? -1 : 1);
    }
  }
  return buf;
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

/** Build a mono AudioBuffer by evaluating `fn(i, t)` for `seconds`. */
export function synthBuffer(ctx: BaseAudioContext, seconds: number, fn: (t: number, i: number) => number, peak = 0.9): AudioBuffer {
  const sr = ctx.sampleRate;
  const len = Math.max(1, Math.floor(sr * seconds));
  const d = new Float32Array(len);
  for (let i = 0; i < len; i++) d[i] = fn(i / sr, i);
  // Fade the last 5 ms to avoid an end click.
  const f = Math.min(len, Math.floor(sr * 0.005));
  for (let i = 0; i < f; i++) d[len - 1 - i] *= i / f;
  normalise(d, peak);
  return toBuffer(ctx, d);
}
