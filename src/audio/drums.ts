import { JsBiquad, mulberry, synthBuffer } from './dsp';

/**
 * Procedural drum kit for the music sequencer. Each sound is computed sample
 * by sample in plain JS once per AudioContext (~10 ms), so a drum hit at
 * playback is just a BufferSource + Gain.
 */
export type DrumKey = 'k' | 's' | 'c' | 'h' | 'o' | 'p' | 'r' | 't' | 'm' | 'T' | 'x' | 'b';
export type DrumKit = Record<DrumKey, AudioBuffer> & {
  riser: AudioBuffer;
  /** Seamless ambience loops. */
  wind: AudioBuffer;
  insects: AudioBuffer;
};

const kits = new WeakMap<BaseAudioContext, DrumKit>();

export function drumKit(ctx: BaseAudioContext): DrumKit {
  let kit = kits.get(ctx);
  if (!kit) {
    kit = buildKit(ctx);
    kits.set(ctx, kit);
  }
  return kit;
}

const TAU = Math.PI * 2;

function buildKit(ctx: BaseAudioContext): DrumKit {
  const sr = ctx.sampleRate;
  const rnd = mulberry(4242);
  const n = () => rnd() * 2 - 1;

  // Pitch-swept sine drum (kick / toms / taiko).
  const swept = (len: number, f0: number, f1: number, fTau: number, aTau: number, drive: number, extra?: (t: number) => number) => {
    let ph = 0;
    return synthBuffer(ctx, len, (t) => {
      const f = f1 + (f0 - f1) * Math.exp(-t / fTau);
      ph += (TAU * f) / sr;
      const x = Math.sin(ph) * Math.exp(-t / aTau) + (extra ? extra(t) : 0);
      return Math.tanh(x * drive);
    });
  };

  const clickLp = new JsBiquad(sr, 'lowpass', 5000);
  const k = swept(0.45, 160, 46, 0.032, 0.2, 1.7, (t) => clickLp.run(n() * Math.exp(-t / 0.003)) * 0.6);

  const snHp = new JsBiquad(sr, 'highpass', 1400, 0.8);
  const s = synthBuffer(ctx, 0.32, (t) => {
    const tone = (Math.sin(TAU * 185 * t) + 0.55 * Math.sin(TAU * 330 * t)) * Math.exp(-t / 0.045) * 0.7;
    return tone + snHp.run(n()) * Math.exp(-t / 0.1) * 0.9;
  });

  const clBp = new JsBiquad(sr, 'bandpass', 1150, 1.3);
  const c = synthBuffer(ctx, 0.32, (t) => {
    let e = 0;
    for (const at of [0, 0.011, 0.022]) if (t >= at) e = Math.max(e, Math.exp(-(t - at) / 0.005));
    if (t >= 0.03) e = Math.max(e, 0.7 * Math.exp(-(t - 0.03) / 0.08));
    return clBp.run(n()) * e;
  });

  // Hats: noise + a cluster of detuned squares (808 style) through a high-pass.
  const metal = (t: number) => {
    let v = 0;
    for (const f of [410, 607, 739, 1045, 1080, 1600]) v += Math.sin(TAU * f * 2 * t) > 0 ? 1 : -1;
    return v / 6;
  };
  const hHp = new JsBiquad(sr, 'highpass', 7200, 0.9);
  const h = synthBuffer(ctx, 0.07, (t) => hHp.run(n() * 0.7 + metal(t) * 0.5) * Math.exp(-t / 0.016));
  const oHp = new JsBiquad(sr, 'highpass', 6800, 0.9);
  const o = synthBuffer(ctx, 0.42, (t) => oHp.run(n() * 0.7 + metal(t) * 0.5) * Math.exp(-t / 0.14));

  const pBp = new JsBiquad(sr, 'bandpass', 6500, 1.4);
  const p = synthBuffer(ctx, 0.09, (t) => pBp.run(n()) * Math.min(1, t / 0.012) * Math.exp(-t / 0.028));

  const r = synthBuffer(ctx, 0.08, (t) => Math.sin(TAU * 1720 * t) * Math.exp(-t / 0.012) + Math.sin(TAU * 860 * t) * Math.exp(-t / 0.02) * 0.5);

  const tomLp = new JsBiquad(sr, 'lowpass', 900);
  const t = swept(0.5, 130, 82, 0.06, 0.24, 1.3, (tt) => tomLp.run(n()) * Math.exp(-tt / 0.02) * 0.3);
  const mLp = new JsBiquad(sr, 'lowpass', 1200);
  const m = swept(0.4, 190, 128, 0.05, 0.2, 1.3, (tt) => mLp.run(n()) * Math.exp(-tt / 0.018) * 0.3);

  const tkLp = new JsBiquad(sr, 'lowpass', 650);
  let ph2 = 0;
  const T = synthBuffer(ctx, 0.9, (tt) => {
    const f = 64 + 52 * Math.exp(-tt / 0.05);
    ph2 += (TAU * f * 1.58) / sr;
    const body = Math.sin(ph2) * Math.exp(-tt / 0.11) * 0.3;
    return body + tkLp.run(n()) * Math.exp(-tt / 0.03) * 0.5;
  });
  // Layer the main taiko body (separate pass so the phase accumulators stay independent).
  const Tbody = swept(0.9, 116, 64, 0.05, 0.36, 1.4);
  mixInto(T, Tbody);

  const xHp = new JsBiquad(sr, 'highpass', 4200, 0.7);
  const x = synthBuffer(ctx, 1.6, (tt) => xHp.run(n() * 0.8 + metal(tt * 1.37) * 0.6) * Math.min(1, tt / 0.002) * Math.exp(-tt / 0.5));

  const bLp = new JsBiquad(sr, 'lowpass', 420);
  const b = swept(1.6, 100, 38, 0.12, 0.6, 1.8, (tt) => bLp.run(n()) * Math.exp(-tt / 0.25) * 0.5);

  const rz = new JsBiquad(sr, 'bandpass', 300, 2);
  const riser = synthBuffer(ctx, 2, (tt, i) => {
    if (i % 64 === 0) rz.set('bandpass', 300 * Math.pow(5000 / 300, tt / 2), 2.2);
    return rz.run(n()) * Math.pow(tt / 2, 2.2);
  });

  return { k, s, c, h, o, p, r, t, m, T, x, b, riser, wind: windLoop(ctx), insects: insectLoop(ctx) };
}

/** 8 s of gusting wind that loops seamlessly (all modulation completes whole cycles). */
function windLoop(ctx: BaseAudioContext): AudioBuffer {
  const sr = ctx.sampleRate;
  const L = 8;
  const len = Math.floor(sr * L);
  const fade = Math.floor(sr * 0.25);
  const rnd = mulberry(99);
  const bp = new JsBiquad(sr, 'bandpass', 500, 0.8);
  const raw = new Float32Array(len + fade);
  let br = 0;
  for (let i = 0; i < len + fade; i++) {
    const t = (i % len) / sr;
    if (i % 128 === 0) bp.set('bandpass', 380 + 260 * Math.sin((TAU * t) / L) + 140 * Math.sin((TAU * 3 * t) / L + 1), 0.9);
    br = br * 0.985 + (rnd() * 2 - 1) * 0.15;
    const gust = 0.55 + 0.3 * Math.sin((TAU * t) / L + 0.5) + 0.15 * Math.sin((TAU * 5 * t) / L);
    raw[i] = bp.run(br + (rnd() * 2 - 1) * 0.05) * gust;
  }
  return loopBuffer(ctx, raw, len, fade);
}

/** 4 s of jungle insects (cicada buzz + cricket chirps) that loops seamlessly. */
function insectLoop(ctx: BaseAudioContext): AudioBuffer {
  const sr = ctx.sampleRate;
  const L = 4;
  const len = Math.floor(sr * L);
  const fade = Math.floor(sr * 0.2);
  const rnd = mulberry(7);
  const hp = new JsBiquad(sr, 'highpass', 6000, 0.7);
  const raw = new Float32Array(len + fade);
  for (let i = 0; i < len + fade; i++) {
    const t = (i % len) / sr;
    let v = 0;
    // Cicadas: buzzing carriers pulsed at 28–41 Hz, swelling slowly.
    const cic: [number, number, number][] = [[4200, 28, 0], [5150, 35, 1.7], [6300, 41, 3.1]];
    for (const [f, pr, ph] of cic) {
      const pulse = Math.max(0, Math.sin(TAU * pr * t)) ** 3;
      const swell = 0.5 + 0.5 * Math.sin((TAU * t) / L + ph);
      v += Math.sin(TAU * f * t) * pulse * swell * 0.22;
    }
    // Crickets: triplet chirps every half second.
    const ct = t % 0.5;
    if (ct < 0.09) {
      const k = ct % 0.03;
      if (k < 0.018) v += Math.sin(TAU * 2900 * t) * Math.sin((Math.PI * k) / 0.018) * 0.35;
    }
    v += hp.run(rnd() * 2 - 1) * 0.04;
    raw[i] = v;
  }
  return loopBuffer(ctx, raw, len, fade);
}

function loopBuffer(ctx: BaseAudioContext, raw: Float32Array, len: number, fade: number): AudioBuffer {
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let peak = 0;
  for (let i = 0; i < len; i++) {
    d[i] = i < fade ? raw[i] * (i / fade) + raw[len + i] * (1 - i / fade) : raw[i];
    peak = Math.max(peak, Math.abs(d[i]));
  }
  if (peak > 0) for (let i = 0; i < len; i++) d[i] *= 0.9 / peak;
  return buf;
}

function mixInto(dst: AudioBuffer, src: AudioBuffer) {
  const d = dst.getChannelData(0);
  const s = src.getChannelData(0);
  let peak = 0;
  for (let i = 0; i < d.length; i++) {
    d[i] = d[i] + (i < s.length ? s[i] : 0);
    peak = Math.max(peak, Math.abs(d[i]));
  }
  if (peak > 0.95) for (let i = 0; i < d.length; i++) d[i] *= 0.95 / peak;
}
