import { Decay, JsBiquad, Phase, RotOsc, mulberry, runSync, synth, toBuffer, CHUNK, type Job } from './dsp';

/**
 * Procedural drum kit and ambience loops for the music sequencer. Every sample
 * is computed in plain JS once; a drum hit at playback is just a BufferSource +
 * Gain. The math is written as resumable jobs (see dsp.ts `Job`) so the live
 * game can bake it in small slices before the first tap (AudioSystem), while
 * `drumKit(ctx)` / `bedLoop(ctx, name)` still build synchronously for offline
 * renders and tests.
 */
export type DrumKey = 'k' | 's' | 'c' | 'h' | 'o' | 'p' | 'r' | 't' | 'm' | 'T' | 'x' | 'b';
export type DrumKit = Record<DrumKey, AudioBuffer> & { riser: AudioBuffer };
export type DrumData = Record<DrumKey | 'riser', Float32Array>;

/** Seamless ambience loops under the music. */
export type BedName = 'wind' | 'insects';
export const BED_NAMES: BedName[] = ['wind', 'insects'];
/**
 * Beds are computed at reduced rates: the wind is band-passed below ~1 kHz and
 * the insects top out around 7 kHz, so the extra samples would be wasted work.
 */
export const BED_RATE: Record<BedName, number> = { wind: 22050, insects: 32000 };

const TAU = Math.PI * 2;
const MASK = CHUNK - 1;

const kits = new WeakMap<BaseAudioContext, DrumKit>();
const bedCache = new WeakMap<BaseAudioContext, Partial<Record<BedName, AudioBuffer>>>();

/** Synchronous kit for `ctx` (cached per context). */
export function drumKit(ctx: BaseAudioContext): DrumKit {
  let kit = kits.get(ctx);
  if (!kit) {
    kit = kitFrom(ctx, runSync(drumData(ctx.sampleRate)), ctx.sampleRate);
    kits.set(ctx, kit);
  }
  return kit;
}

/** Synchronous ambience loop for `ctx` (cached per context). */
export function bedLoop(ctx: BaseAudioContext, name: BedName): AudioBuffer {
  let c = bedCache.get(ctx);
  if (!c) bedCache.set(ctx, (c = {}));
  return (c[name] ??= toBuffer(ctx, runSync(bedData(name)), BED_RATE[name]));
}

/**
 * Drums with nothing much above ~6 kHz are synthesised at half the kit rate
 * (half the work); buffer sources resample them transparently.
 */
const HALF_RATE = new Set<keyof DrumData>(['k', 'r', 't', 'm', 'T', 'b']);
const rateOf = (k: keyof DrumData, sr: number) => (HALF_RATE.has(k) ? sr / 2 : sr);

/** Wrap DrumData computed at `sr` into buffers (cheap copies). */
export function kitFrom(ctx: BaseAudioContext, d: DrumData, sr: number): DrumKit {
  const out = {} as DrumKit;
  for (const k of Object.keys(d) as (keyof DrumData)[]) out[k] = toBuffer(ctx, d[k], rateOf(k, sr));
  return out;
}

export function bedData(name: BedName): Job<Float32Array> {
  return name === 'wind' ? windLoop(BED_RATE.wind) : insectLoop(BED_RATE.insects);
}

/** 808-style metallic cluster: six detuned square waves (phase-based, no trig). */
const METAL = [410, 607, 739, 1045, 1080, 1600].map((f) => f * 2);
function metal(t: number): number {
  let v = 0;
  for (let j = 0; j < 6; j++) v += (t * METAL[j]) % 1 < 0.5 ? 1 : -1;
  return v / 6;
}

/** The kit's sample data at `sr` (HALF_RATE drums at sr / 2), time-sliced. */
export function* drumData(sr: number): Job<DrumData> {
  const rnd = mulberry(4242);
  const n = () => rnd() * 2 - 1;
  const lo = sr / 2;

  // Pitch-swept sine drum (kick / toms / taiko), soft-clipped.
  const swept = (rate: number, len: number, f0: number, f1: number, fTau: number, aTau: number, drive: number, extra?: () => number) => {
    const ph = new Phase();
    const fe = new Decay(fTau, rate);
    const ae = new Decay(aTau, rate);
    return synth(rate, len, () => {
      const x = Math.sin(ph.add(f1 + (f0 - f1) * fe.next(), rate)) * ae.next() + (extra ? extra() : 0);
      return Math.tanh(x * drive);
    });
  };

  const clickLp = new JsBiquad(lo, 'lowpass', 5000);
  const clickE = new Decay(0.003, lo);
  const k = yield* swept(lo, 0.45, 160, 46, 0.032, 0.2, 1.7, () => clickLp.run(n() * clickE.next()) * 0.6);

  const snHp = new JsBiquad(sr, 'highpass', 1400, 0.8);
  const sn1 = new RotOsc(185, sr);
  const sn2 = new RotOsc(330, sr);
  const snTone = new Decay(0.045, sr);
  const snNoise = new Decay(0.1, sr);
  const s = yield* synth(sr, 0.32, () => {
    const tone = (sn1.next() + 0.55 * sn2.next()) * snTone.next() * 0.7;
    return tone + snHp.run(n()) * snNoise.next() * 0.9;
  });

  // Clap: three quick bursts and a short tail.
  const clBp = new JsBiquad(sr, 'bandpass', 1150, 1.3);
  const c = yield* synth(sr, 0.32, (t) => {
    let e = Math.exp(-t / 0.005);
    if (t >= 0.011) e = Math.max(e, Math.exp(-(t - 0.011) / 0.005));
    if (t >= 0.022) e = Math.max(e, Math.exp(-(t - 0.022) / 0.005));
    if (t >= 0.03) e = Math.max(e, 0.7 * Math.exp(-(t - 0.03) / 0.08));
    return clBp.run(n()) * e;
  });

  // Hats: noise + the metallic cluster through a high-pass.
  const hHp = new JsBiquad(sr, 'highpass', 7200, 0.9);
  const hE = new Decay(0.016, sr);
  const h = yield* synth(sr, 0.07, (t) => hHp.run(n() * 0.7 + metal(t) * 0.5) * hE.next());
  const oHp = new JsBiquad(sr, 'highpass', 6800, 0.9);
  const oE = new Decay(0.14, sr);
  const o = yield* synth(sr, 0.42, (t) => oHp.run(n() * 0.7 + metal(t) * 0.5) * oE.next());

  const pBp = new JsBiquad(sr, 'bandpass', 6500, 1.4);
  const p = yield* synth(sr, 0.09, (t) => pBp.run(n()) * Math.min(1, t / 0.012) * Math.exp(-t / 0.028));

  const r = yield* synth(lo, 0.08, (t) => Math.sin(TAU * 1720 * t) * Math.exp(-t / 0.012) + Math.sin(TAU * 860 * t) * Math.exp(-t / 0.02) * 0.5);

  const tomLp = new JsBiquad(lo, 'lowpass', 900);
  const tomE = new Decay(0.02, lo);
  const t = yield* swept(lo, 0.5, 130, 82, 0.06, 0.24, 1.3, () => tomLp.run(n()) * tomE.next() * 0.3);
  const mLp = new JsBiquad(lo, 'lowpass', 1200);
  const mE = new Decay(0.018, lo);
  const m = yield* swept(lo, 0.4, 190, 128, 0.05, 0.2, 1.3, () => mLp.run(n()) * mE.next() * 0.3);

  // Taiko: a skin overtone + stick noise, layered with the main swept body.
  const tkLp = new JsBiquad(lo, 'lowpass', 650);
  const tkF = new Decay(0.05, lo);
  const tkBody = new Decay(0.11, lo);
  const tkNoise = new Decay(0.03, lo);
  const ph2 = new Phase();
  const T = yield* synth(lo, 0.9, () => {
    const body = Math.sin(ph2.add((64 + 52 * tkF.next()) * 1.58, lo)) * tkBody.next() * 0.3;
    return body + tkLp.run(n()) * tkNoise.next() * 0.5;
  });
  mixInto(T, yield* swept(lo, 0.9, 116, 64, 0.05, 0.36, 1.4));

  const xHp = new JsBiquad(sr, 'highpass', 4200, 0.7);
  const xE = new Decay(0.5, sr);
  const x = yield* synth(sr, 1.6, (tt) => xHp.run(n() * 0.8 + metal(tt * 1.37) * 0.6) * Math.min(1, tt / 0.002) * xE.next());

  const bLp = new JsBiquad(lo, 'lowpass', 420);
  const bE = new Decay(0.25, lo);
  const b = yield* swept(lo, 1.6, 100, 38, 0.12, 0.6, 1.8, () => bLp.run(n()) * bE.next() * 0.5);

  const rz = new JsBiquad(sr, 'bandpass', 300, 2);
  const rEnv = { v: 0 };
  const riser = yield* synth(sr, 2, (tt, i) => {
    if (i % 64 === 0) {
      rz.set('bandpass', 300 * Math.pow(5000 / 300, tt / 2), 2.2);
      rEnv.v = Math.pow(tt / 2, 2.2);
    }
    return rz.run(n()) * rEnv.v;
  });

  return { k, s, c, h, o, p, r, t, m, T, x, b, riser };
}

/** 8 s of gusting wind that loops seamlessly (all modulation completes whole cycles). */
function* windLoop(sr: number): Job<Float32Array> {
  const L = 8;
  const len = Math.floor(sr * L);
  const fade = Math.floor(sr * 0.25);
  const rnd = mulberry(99);
  const bp = new JsBiquad(sr, 'bandpass', 500, 0.8);
  const raw = new Float32Array(len + fade);
  // Every modulator completes whole cycles in L seconds, so the overhang past
  // `len` continues seamlessly into the start.
  const g1 = new RotOsc(1 / L, sr, 0.5);
  const g5 = new RotOsc(5 / L, sr);
  let br = 0;
  for (let i = 0; i < len + fade; i++) {
    if (i % 128 === 0) {
      const t = (i % len) / sr;
      bp.set('bandpass', 380 + 260 * Math.sin((TAU * t) / L) + 140 * Math.sin((TAU * 3 * t) / L + 1), 0.9);
    }
    br = br * 0.985 + (rnd() * 2 - 1) * 0.15;
    const gust = 0.55 + 0.3 * g1.next() + 0.15 * g5.next();
    raw[i] = bp.run(br + (rnd() * 2 - 1) * 0.05) * gust;
    if ((i & MASK) === MASK) yield;
  }
  return loopData(raw, len, fade);
}

/** Cicadas: buzzing carriers pulsed at 28–41 Hz, swelling slowly ([carrier, pulse rate, swell phase]). */
const CICADAS: [number, number, number][] = [
  [4200, 28, 0],
  [5150, 35, 1.7],
  [6300, 41, 3.1],
];

/** 4 s of jungle insects (cicada buzz + cricket chirps) that loops seamlessly. */
function* insectLoop(sr: number): Job<Float32Array> {
  const L = 4;
  const len = Math.floor(sr * L);
  const fade = Math.floor(sr * 0.2);
  const rnd = mulberry(7);
  const hp = new JsBiquad(sr, 'highpass', 6000, 0.7);
  const raw = new Float32Array(len + fade);
  // All rates complete whole cycles in L seconds (seamless loop), see windLoop.
  const car = CICADAS.map(([f]) => new RotOsc(f, sr));
  const pul = CICADAS.map(([, pr]) => new RotOsc(pr, sr));
  const swl = CICADAS.map(([, , ph]) => new RotOsc(1 / L, sr, ph));
  const cricket = new RotOsc(2900, sr);
  for (let i = 0; i < len + fade; i++) {
    const t = (i % len) / sr;
    let v = 0;
    for (let j = 0; j < 3; j++) {
      const s = pul[j].next();
      const c = car[j].next();
      const swell = 0.5 + 0.5 * swl[j].next();
      if (s > 0) v += c * s * s * s * swell * 0.22;
    }
    // Crickets: triplet chirps every half second.
    const cr = cricket.next();
    const ct = t % 0.5;
    if (ct < 0.09) {
      const k = ct % 0.03;
      if (k < 0.018) v += cr * Math.sin((Math.PI * k) / 0.018) * 0.35;
    }
    v += hp.run(rnd() * 2 - 1) * 0.04;
    raw[i] = v;
    if ((i & MASK) === MASK) yield;
  }
  return loopData(raw, len, fade);
}

/** Crossfade the overhang into the start and normalise to 0.9. */
function loopData(raw: Float32Array, len: number, fade: number): Float32Array {
  const d = raw.slice(0, len);
  let peak = 0;
  for (let i = 0; i < len; i++) {
    if (i < fade) d[i] = raw[i] * (i / fade) + raw[len + i] * (1 - i / fade);
    peak = Math.max(peak, Math.abs(d[i]));
  }
  if (peak > 0) for (let i = 0; i < len; i++) d[i] *= 0.9 / peak;
  return d;
}

function mixInto(d: Float32Array, s: Float32Array) {
  let peak = 0;
  for (let i = 0; i < d.length; i++) {
    d[i] = d[i] + (i < s.length ? s[i] : 0);
    peak = Math.max(peak, Math.abs(d[i]));
  }
  if (peak > 0.95) for (let i = 0; i < d.length; i++) d[i] *= 0.95 / peak;
}
