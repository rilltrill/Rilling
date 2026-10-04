import type { SfxName } from './names';
import { makeNoiseBank, shaperCurve, sliceTrim, type NoiseBank, type NoiseKind } from './dsp';
import { SFX_META } from './sfxMeta';

/**
 * Procedural sound-effect recipes. Each recipe schedules WebAudio nodes on
 * `s.ctx` (a live AudioContext or an OfflineAudioContext — recipes never care)
 * starting at `s.t`, routes them into `s.out`, and returns its duration.
 *
 * Frequently used sounds are pre-rendered into buffers (see SFX_META.cache and
 * AudioSystem) so a 13 shots/s SMG costs two nodes per shot; everything else is
 * synthesised live. Randomness here is cosmetic (Math.random is fine: audio
 * never feeds back into gameplay).
 */
export interface SfxContext {
  ctx: BaseAudioContext;
  /** Destination for this voice. */
  out: AudioNode;
  /** Start time (ctx.currentTime). */
  t: number;
  /** Pitch multiplier including random variation. */
  pitch: number;
  /** 2 s of white noise (loops seamlessly). */
  noise: AudioBuffer;
  /** Coloured noise buffers; recipes fall back to `noise` without it. */
  bank?: NoiseBank;
  /** Variant index (pre-rendered variants use 0..n-1; live plays pick one at random). */
  variant?: number;
}

/** A recipe schedules nodes and returns its duration in seconds. */
export type SfxRecipe = (s: SfxContext) => number | void;

// ─── Small utilities ──────────────────────────────────────────────────────────

const R = Math.random;
const rnd = (a: number, b: number) => a + R() * (b - a);
const vIdx = (s: SfxContext, n: number) => ((s.variant ?? Math.floor(R() * 64)) % n + n) % n;
/** Frequency (scaled by pitch) clamped to a safe range for this context. */
const hz = (s: SfxContext, f: number) => Math.max(10, Math.min(f * s.pitch, s.ctx.sampleRate * 0.45));
const hzRaw = (s: SfxContext, f: number) => Math.max(10, Math.min(f, s.ctx.sampleRate * 0.45));
const pos = (v: number) => Math.max(0.0001, v);

function noiseBuf(s: SfxContext, kind: NoiseKind): AudioBuffer {
  return s.bank ? s.bank[kind] : s.noise;
}

/** Looping noise source started at a random offset. */
function noiseSrc(s: SfxContext, kind: NoiseKind, at: number, dur: number, rate = 1): AudioBufferSourceNode {
  const src = s.ctx.createBufferSource();
  src.buffer = noiseBuf(s, kind);
  src.loop = true;
  src.playbackRate.value = rate * s.pitch;
  src.start(at, R() * 1.8);
  src.stop(at + dur + 0.03);
  return src;
}

/**
 * Gain envelope: silence → peak in `attack` → hold → exponential decay.
 * Connected to `dest` (default s.out).
 */
function amp(s: SfxContext, peak: number, attack: number, decay: number, at = s.t, dest: AudioNode = s.out, hold = 0, linearAttack = false): GainNode {
  const g = s.ctx.createGain();
  const p = g.gain;
  const a = Math.max(0.0008, attack);
  p.setValueAtTime(0.0001, at);
  if (linearAttack) p.linearRampToValueAtTime(pos(peak), at + a);
  else p.exponentialRampToValueAtTime(pos(peak), at + a);
  if (hold > 0) p.setValueAtTime(pos(peak), at + a + hold);
  p.exponentialRampToValueAtTime(0.0001, at + a + hold + Math.max(0.005, decay));
  p.setValueAtTime(0, at + a + hold + Math.max(0.005, decay) + 0.001);
  g.connect(dest);
  return g;
}

function filt(s: SfxContext, type: BiquadFilterType, freq: number, q = 0.7, at = s.t, freqEnd?: number, dur = 0.1): BiquadFilterNode {
  const f = s.ctx.createBiquadFilter();
  f.type = type;
  f.frequency.setValueAtTime(hz(s, freq), at);
  if (freqEnd !== undefined) f.frequency.exponentialRampToValueAtTime(hz(s, freqEnd), at + Math.max(0.005, dur));
  f.Q.value = q;
  return f;
}

function shaper(s: SfxContext, drive: number, dest: AudioNode): WaveShaperNode {
  const w = s.ctx.createWaveShaper();
  w.curve = shaperCurve(drive) as Float32Array<ArrayBuffer>;
  w.oversample = '2x';
  w.connect(dest);
  return w;
}

function lfo(s: SfxContext, rate: number, depth: number, target: AudioParam, at: number, dur: number, type: OscillatorType = 'sine'): OscillatorNode {
  const o = s.ctx.createOscillator();
  o.type = type;
  o.frequency.value = rate;
  const g = s.ctx.createGain();
  g.gain.value = depth;
  o.connect(g).connect(target);
  o.start(at);
  o.stop(at + dur + 0.05);
  return o;
}

// ─── Building blocks (exported for reuse / tests) ─────────────────────────────

export function env(s: SfxContext, peak: number, attack: number, decay: number, at = s.t): GainNode {
  return amp(s, peak, attack, decay, at);
}

export interface NoiseOpts {
  peak: number;
  attack?: number;
  decay: number;
  type?: BiquadFilterType;
  freq: number;
  freqEnd?: number;
  q?: number;
  at?: number;
  rate?: number;
  kind?: NoiseKind;
  /** Waveshaper drive (grit). */
  drive?: number;
  hold?: number;
  linear?: boolean;
}

/** Filtered noise burst with a filter sweep. */
export function noiseBurst(s: SfxContext, o: NoiseOpts) {
  const at = o.at ?? s.t;
  const attack = o.attack ?? 0.002;
  const dur = attack + (o.hold ?? 0) + o.decay;
  const src = noiseSrc(s, o.kind ?? 'white', at, dur, o.rate ?? 1);
  const f = filt(s, o.type ?? 'lowpass', o.freq, o.q ?? 0.7, at, o.freqEnd, dur);
  const g = amp(s, o.peak, attack, o.decay, at, s.out, o.hold ?? 0, o.linear);
  if (o.drive) {
    const w = shaper(s, o.drive, g);
    src.connect(f).connect(w);
  } else src.connect(f).connect(g);
}

export interface ToneOpts {
  type?: OscillatorType;
  freq: number;
  freqEnd?: number;
  peak: number;
  attack?: number;
  decay: number;
  at?: number;
  detune?: number;
  hold?: number;
  /** Seconds for the glide to freqEnd (default: whole note). */
  glide?: number;
  vibrato?: number;
  vibratoDepth?: number;
  linear?: boolean;
}

export function tone(s: SfxContext, o: ToneOpts): OscillatorNode {
  const at = o.at ?? s.t;
  const attack = o.attack ?? 0.005;
  const dur = attack + (o.hold ?? 0) + o.decay;
  const osc = s.ctx.createOscillator();
  osc.type = o.type ?? 'sine';
  osc.frequency.setValueAtTime(hz(s, o.freq), at);
  if (o.freqEnd) osc.frequency.exponentialRampToValueAtTime(hz(s, o.freqEnd), at + (o.glide ?? dur));
  if (o.detune) osc.detune.value = o.detune;
  if (o.vibrato) lfo(s, o.vibrato, o.vibratoDepth ?? 20, osc.detune, at, dur);
  const g = amp(s, o.peak, attack, o.decay, at, s.out, o.hold ?? 0, o.linear);
  osc.connect(g);
  osc.start(at);
  osc.stop(at + dur + 0.05);
  return osc;
}

/** Pitch-dropping sine through a soft clipper: kick/punch/body. Harmonics keep it audible on phone speakers. */
export function thump(s: SfxContext, o: { f0: number; f1: number; peak: number; decay: number; at?: number; drive?: number; sweep?: number; attack?: number }) {
  const at = o.at ?? s.t;
  const osc = s.ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(hz(s, o.f0), at);
  osc.frequency.exponentialRampToValueAtTime(hz(s, o.f1), at + (o.sweep ?? o.decay * 0.6));
  const g = amp(s, o.peak, o.attack ?? 0.0015, o.decay, at);
  if (o.drive) {
    const pre = s.ctx.createGain();
    pre.gain.value = 1;
    pre.connect(shaper(s, o.drive, g));
    osc.connect(pre);
  } else osc.connect(g);
  osc.start(at);
  osc.stop(at + o.decay + 0.05);
}

/** Short band-passed noise click (mechanisms, cracks, ticks). */
export function click(s: SfxContext, o: { freq: number; peak: number; decay: number; at?: number; q?: number; kind?: NoiseKind }) {
  noiseBurst(s, { peak: o.peak, attack: 0.0006, decay: o.decay, type: 'bandpass', freq: o.freq, q: o.q ?? 3, at: o.at, kind: o.kind });
}

/** Metallic / bell partials, each decaying at its own rate. */
export function ping(s: SfxContext, o: { freq: number; peak: number; decay: number; at?: number; ratios?: number[]; glide?: number; type?: OscillatorType; vibrato?: number }) {
  const at = o.at ?? s.t;
  const ratios = o.ratios ?? [1, 2.76, 5.4, 8.93];
  ratios.forEach((r, i) => {
    const f = o.freq * r;
    if (f * s.pitch > s.ctx.sampleRate * 0.45) return;
    tone(s, {
      type: o.type ?? 'sine',
      freq: f,
      freqEnd: o.glide ? f * o.glide : undefined,
      peak: o.peak / (1 + i * 0.8),
      attack: 0.001,
      decay: o.decay / (1 + i * 0.6),
      at,
      vibrato: o.vibrato,
      vibratoDepth: o.vibrato ? 12 : undefined,
    });
  });
}

/** Two-operator FM bell: the "ding". */
export function bell(s: SfxContext, o: { freq: number; peak: number; decay: number; at?: number; ratio?: number; index?: number }) {
  const at = o.at ?? s.t;
  const car = s.ctx.createOscillator();
  car.frequency.value = hz(s, o.freq);
  const mod = s.ctx.createOscillator();
  mod.frequency.value = hz(s, o.freq * (o.ratio ?? 3.5));
  const mg = s.ctx.createGain();
  const idx = o.freq * s.pitch * (o.index ?? 1.2);
  mg.gain.setValueAtTime(idx, at);
  mg.gain.exponentialRampToValueAtTime(pos(idx * 0.05), at + o.decay * 0.6);
  mod.connect(mg).connect(car.frequency);
  car.connect(amp(s, o.peak, 0.001, o.decay, at));
  car.start(at);
  mod.start(at);
  car.stop(at + o.decay + 0.05);
  mod.stop(at + o.decay + 0.05);
  // A pure octave partial for sparkle.
  tone(s, { freq: o.freq * 2, peak: o.peak * 0.25, attack: 0.001, decay: o.decay * 0.4, at });
}

/** Wet "schlop": resonant filter sweep on noise, amplitude-wobbled. */
export function squelch(s: SfxContext, o: { freq: number; peak: number; decay: number; at?: number; wob?: number; q?: number }) {
  const at = o.at ?? s.t;
  const src = noiseSrc(s, 'pink', at, o.decay + 0.01);
  const f = filt(s, 'lowpass', o.freq * 1.8, o.q ?? 9, at, o.freq * 0.45, o.decay);
  const am = s.ctx.createGain();
  am.gain.value = 0.6;
  if (o.wob) lfo(s, o.wob, 0.4, am.gain, at, o.decay, 'triangle');
  const g = amp(s, o.peak, 0.003, o.decay, at);
  src.connect(f).connect(am).connect(g);
}

/** Low rolling rumble: brown noise with slow random-ish swells. */
export function rumble(s: SfxContext, o: { peak: number; attack: number; decay: number; freq: number; freqEnd: number; rate: number; at?: number; drive?: number }) {
  const at = o.at ?? s.t;
  const dur = o.attack + o.decay;
  const src = noiseSrc(s, 'brown', at, dur);
  const f = filt(s, 'lowpass', o.freq, 0.8, at, o.freqEnd, dur);
  const am = s.ctx.createGain();
  am.gain.value = 0.65;
  lfo(s, o.rate, 0.3, am.gain, at, dur);
  lfo(s, o.rate * 0.43, 0.2, am.gain, at, dur, 'triangle');
  const g = amp(s, o.peak, o.attack, o.decay, at, s.out, 0, true);
  if (o.drive) src.connect(f).connect(am).connect(shaper(s, o.drive, g));
  else src.connect(f).connect(am).connect(g);
}

// Formants (F1, F2, F3) of an adult male voice; creatures scale them by size.
const VOWELS = {
  a: [730, 1090, 2440],
  o: [570, 840, 2410],
  u: [300, 870, 2240],
  e: [530, 1840, 2480],
  i: [270, 2290, 3010],
  uh: [640, 1190, 2390],
  ae: [660, 1720, 2410],
} as const;
type Vowel = keyof typeof VOWELS;

export interface VoiceOpts {
  f0: number;
  dur: number;
  peak: number;
  /** Vowel path spread evenly over the duration. */
  vowels: Vowel[];
  /** Pitch contour: [time fraction, multiplier]. */
  contour?: [number, number][];
  /** Vocal tract size: 1 = human, 0.5 = huge beast, 1.3 = small creature. */
  size?: number;
  q?: number;
  /** Throat rattle (amplitude modulation) rate in Hz. */
  rattle?: number;
  rattleDepth?: number;
  /** Vibrato rate (Hz) and depth (fraction of f0). */
  wobble?: number;
  wobbleDepth?: number;
  /** Breath noise level through the formants. */
  breath?: number;
  drive?: number;
  attack?: number;
  /** Fraction of the duration spent decaying. */
  release?: number;
  wave?: OscillatorType;
  detune?: number;
  /** Sub-octave sine level (big creatures). */
  sub?: number;
  /** Post low-pass (distant sounds). */
  lowpass?: number;
  at?: number;
}

/**
 * Source-filter voice: detuned oscillators + breath noise through three
 * formant band-passes that glide along a vowel path, with vibrato, a throat
 * rattle and optional distortion. Zombies, dinosaurs, screams.
 */
export function voice(s: SfxContext, v: VoiceOpts) {
  const ctx = s.ctx;
  const at = v.at ?? s.t;
  const dur = v.dur;
  const size = v.size ?? 1;
  const f0 = v.f0 * s.pitch;
  const attack = v.attack ?? Math.min(0.12, dur * 0.15);
  const release = (v.release ?? 0.55) * dur;
  const hold = Math.max(0, dur - attack - release);

  // Output chain: [lowpass] ← env ← [drive] ← am ← formants
  let dest: AudioNode = s.out;
  if (v.lowpass) {
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = hzRaw(s, v.lowpass);
    lp.connect(s.out);
    dest = lp;
  }
  const out = ctx.createGain();
  out.gain.setValueAtTime(0.0001, at);
  out.gain.linearRampToValueAtTime(pos(v.peak), at + attack);
  out.gain.setValueAtTime(pos(v.peak), at + attack + hold);
  out.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  out.gain.setValueAtTime(0, at + dur + 0.001);
  out.connect(dest);
  const preDrive: AudioNode = v.drive ? shaper(s, v.drive, out) : out;
  const am = ctx.createGain();
  am.connect(preDrive);
  const rd = v.rattle ? (v.rattleDepth ?? 0.5) : 0;
  am.gain.value = 1 - rd * 0.5;
  if (v.rattle) lfo(s, v.rattle, rd * 0.5, am.gain, at, dur, 'triangle');

  // Formant bank.
  const formIn = ctx.createGain();
  const q = v.q ?? 4;
  const path = v.vowels.map((n) => VOWELS[n]);
  const fGains = [1, 0.6, 0.28];
  for (let k = 0; k < 3; k++) {
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = q * (k === 0 ? 1 : 1.4);
    bp.frequency.setValueAtTime(hzRaw(s, path[0][k] * size), at);
    for (let i = 1; i < path.length; i++) bp.frequency.linearRampToValueAtTime(hzRaw(s, path[i][k] * size), at + (dur * i) / (path.length - 1));
    const g = ctx.createGain();
    g.gain.value = fGains[k] * (1 + q * 0.25);
    formIn.connect(bp).connect(g).connect(am);
  }
  // A little dry body below the formants keeps big voices chesty.
  const body = ctx.createBiquadFilter();
  body.type = 'lowpass';
  body.frequency.value = hzRaw(s, f0 * 3);
  const bodyG = ctx.createGain();
  bodyG.gain.value = 0.18;
  formIn.connect(body).connect(bodyG).connect(am);

  // Sources.
  const contour = v.contour ?? [[0, 1], [1, 1]];
  const waves: OscillatorType[] = [v.wave ?? 'sawtooth', v.wave ?? 'sawtooth'];
  const det = v.detune ?? 9;
  waves.forEach((w, i) => {
    const o = ctx.createOscillator();
    o.type = w;
    o.detune.value = i === 0 ? -det : det;
    o.frequency.setValueAtTime(hzRaw(s, f0 * contour[0][1]), at + contour[0][0] * dur);
    for (let c = 1; c < contour.length; c++) o.frequency.linearRampToValueAtTime(hzRaw(s, f0 * contour[c][1]), at + contour[c][0] * dur);
    if (v.wobble) {
      lfo(s, v.wobble * (i === 0 ? 1 : 1.07), f0 * (v.wobbleDepth ?? 0.04), o.frequency, at, dur);
      lfo(s, v.wobble * 2.31, f0 * (v.wobbleDepth ?? 0.04) * 0.4, o.frequency, at, dur, 'triangle');
    }
    const g = ctx.createGain();
    g.gain.value = 0.5;
    o.connect(g).connect(formIn);
    o.start(at);
    o.stop(at + dur + 0.05);
  });
  if (v.breath) {
    const n = noiseSrc(s, 'pink', at, dur);
    const g = ctx.createGain();
    g.gain.value = v.breath * 1.6;
    n.connect(g).connect(formIn);
  }
  if (v.sub) {
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(hzRaw(s, f0 * 0.5 * contour[0][1]), at);
    for (let c = 1; c < contour.length; c++) o.frequency.linearRampToValueAtTime(hzRaw(s, f0 * 0.5 * contour[c][1]), at + contour[c][0] * dur);
    const g = ctx.createGain();
    g.gain.value = v.sub;
    o.connect(g).connect(am);
    o.start(at);
    o.stop(at + dur + 0.05);
  }
}

/** Monophonic brass-ish synth note (fanfares, stabs). */
function brass(s: SfxContext, o: { freq: number; at: number; dur: number; peak: number; bright?: number }) {
  const ctx = s.ctx;
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass';
  f.Q.value = 2;
  const b = o.bright ?? 1;
  f.frequency.setValueAtTime(hz(s, o.freq * 1.2), o.at);
  f.frequency.exponentialRampToValueAtTime(hz(s, o.freq * 6 * b), o.at + 0.06);
  f.frequency.exponentialRampToValueAtTime(hz(s, o.freq * 3 * b), o.at + o.dur);
  const g = amp(s, o.peak, 0.03, Math.max(0.08, o.dur * 0.5), o.at, s.out, o.dur * 0.5);
  f.connect(g);
  for (const d of [-8, 7]) {
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = hz(s, o.freq);
    osc.detune.value = d;
    lfo(s, 5.5, 10, osc.detune, o.at + 0.12, o.dur);
    osc.connect(f);
    osc.start(o.at);
    osc.stop(o.at + o.dur * 1.1 + 0.05);
  }
}

/** Plucked/arpeggiated synth note. */
function pluck(s: SfxContext, o: { freq: number; at: number; peak: number; decay: number; type?: OscillatorType; bright?: number }) {
  const f = filt(s, 'lowpass', o.freq * 8 * (o.bright ?? 1), 1.5, o.at, o.freq * 1.5, o.decay);
  const g = amp(s, o.peak, 0.004, o.decay, o.at, s.out, 0, true);
  f.connect(g);
  const osc = s.ctx.createOscillator();
  osc.type = o.type ?? 'square';
  osc.frequency.value = hz(s, o.freq);
  osc.connect(f);
  osc.start(o.at);
  osc.stop(o.at + o.decay + 0.05);
}

/** Many small random pings — glass, sparkle, debris. */
function tinkles(s: SfxContext, n: number, o: { lo: number; hi: number; peak: number; spread: number; decay: number; at?: number }) {
  const at = o.at ?? s.t;
  for (let i = 0; i < n; i++) {
    const t = at + Math.pow(R(), 1.6) * o.spread;
    tone(s, { freq: rnd(o.lo, o.hi), peak: o.peak * rnd(0.4, 1), attack: 0.001, decay: o.decay * rnd(0.4, 1), at: t });
  }
}

/** Reverse swell into a hit (banners, weapon get). */
function riser(s: SfxContext, o: { dur: number; peak: number; from: number; to: number; at?: number }) {
  const at = o.at ?? s.t;
  const src = noiseSrc(s, 'pink', at, o.dur);
  const f = filt(s, 'bandpass', o.from, 2.2, at, o.to, o.dur);
  const g = s.ctx.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(pos(o.peak), at + o.dur);
  g.gain.linearRampToValueAtTime(0.0001, at + o.dur + 0.02);
  g.connect(s.out);
  src.connect(f).connect(g);
}

/** Shotgun-style pump: chk (back) … chak (forward). */
function pump(s: SfxContext, at: number, vol = 1) {
  click(s, { freq: 1500, peak: 0.42 * vol, decay: 0.028, q: 2.5, at });
  thump(s, { f0: 380, f1: 200, peak: 0.16 * vol, decay: 0.025, at });
  noiseBurst(s, { peak: 0.12 * vol, attack: 0.012, decay: 0.045, type: 'bandpass', freq: 900, freqEnd: 2300, q: 2.2, at: at + 0.012 });
  const t2 = at + 0.105;
  click(s, { freq: 2500, peak: 0.55 * vol, decay: 0.022, q: 3.5, at: t2 });
  thump(s, { f0: 330, f1: 170, peak: 0.24 * vol, decay: 0.03, at: t2 });
  ping(s, { freq: 3150, peak: 0.035 * vol, decay: 0.07, at: t2 + 0.002, ratios: [1, 1.71] });
}

// ─── Weapons ──────────────────────────────────────────────────────────────────

function pistol(s: SfxContext) {
  const v = vIdx(s, 4);
  noiseBurst(s, { peak: 0.75, attack: 0.0005, decay: 0.03, type: 'highpass', freq: 1900 + v * 150 });
  noiseBurst(s, { peak: 0.75, attack: 0.0008, decay: 0.07, type: 'bandpass', freq: 1250 + v * 90, freqEnd: 650, q: 1.1, drive: 2 });
  thump(s, { f0: 420, f1: 95, peak: 0.85, decay: 0.11, drive: 3, sweep: 0.04 });
  noiseBurst(s, { kind: 'pink', peak: 0.28, attack: 0.005, decay: 0.3, type: 'lowpass', freq: 2400, freqEnd: 260 });
  click(s, { freq: 4300, peak: 0.1, decay: 0.012, q: 6, at: s.t + 0.06 });
  return 0.42;
}

function shotgun(s: SfxContext) {
  noiseBurst(s, { peak: 0.9, attack: 0.0005, decay: 0.045, type: 'highpass', freq: 1100 });
  noiseBurst(s, { kind: 'pink', peak: 0.95, attack: 0.002, decay: 0.42, type: 'lowpass', freq: 5200, freqEnd: 220, drive: 2.5 });
  thump(s, { f0: 190, f1: 42, peak: 1, decay: 0.32, drive: 4.5, sweep: 0.12 });
  noiseBurst(s, { kind: 'brown', peak: 0.35, attack: 0.01, decay: 0.45, type: 'lowpass', freq: 700, freqEnd: 120 });
  pump(s, s.t + 0.235, 0.9);
  return 0.5;
}

function smg(s: SfxContext) {
  // Light and tight: most energy 150 Hz–5 kHz so 13 shots/s doesn't fatigue.
  const v = vIdx(s, 5);
  noiseBurst(s, { peak: 0.5, attack: 0.0005, decay: 0.022, type: 'bandpass', freq: 3200 + v * 140, q: 0.6 });
  noiseBurst(s, { peak: 0.42, attack: 0.0008, decay: 0.045, type: 'bandpass', freq: 1500 + v * 110, q: 1.3, drive: 2 });
  thump(s, { f0: 380, f1: 120, peak: 0.5, decay: 0.05, drive: 2.5, sweep: 0.03 });
  noiseBurst(s, { kind: 'pink', peak: 0.13, attack: 0.004, decay: 0.12, type: 'lowpass', freq: 2000, freqEnd: 380 });
  return 0.17;
}

function magnum(s: SfxContext) {
  noiseBurst(s, { peak: 0.95, attack: 0.0005, decay: 0.05, type: 'highpass', freq: 1300 });
  noiseBurst(s, { peak: 0.8, attack: 0.001, decay: 0.13, type: 'bandpass', freq: 850, freqEnd: 380, q: 0.9, drive: 3 });
  thump(s, { f0: 170, f1: 36, peak: 1, decay: 0.45, drive: 5, sweep: 0.16 });
  rumble(s, { peak: 0.5, attack: 0.02, decay: 1.25, freq: 1000, freqEnd: 130, rate: 7, drive: 1.5 });
  // Slap-back echo off the buildings.
  noiseBurst(s, { kind: 'pink', peak: 0.26, attack: 0.004, decay: 0.24, type: 'bandpass', freq: 650, q: 0.8, at: s.t + 0.17 });
  thump(s, { f0: 120, f1: 42, peak: 0.32, decay: 0.24, at: s.t + 0.17, drive: 2 });
  // Cylinder click.
  click(s, { freq: 3600, peak: 0.08, decay: 0.015, q: 5, at: s.t + 0.26 });
  return 1.35;
}

function turret(s: SfxContext) {
  const v = vIdx(s, 5);
  thump(s, { f0: 220, f1: 56, peak: 0.85, decay: 0.085, drive: 4, sweep: 0.04 });
  noiseBurst(s, { kind: 'pink', peak: 0.6, attack: 0.001, decay: 0.07, type: 'bandpass', freq: 560 + v * 40, q: 1.6, drive: 3 });
  noiseBurst(s, { peak: 0.32, attack: 0.0005, decay: 0.02, type: 'highpass', freq: 2600 });
  ping(s, { freq: 1300 + v * 60, peak: 0.05, decay: 0.05, at: s.t + 0.028, ratios: [1, 2.3] });
  noiseBurst(s, { kind: 'brown', peak: 0.24, attack: 0.005, decay: 0.16, type: 'lowpass', freq: 900, freqEnd: 200 });
  return 0.24;
}

// ─── Recipes ──────────────────────────────────────────────────────────────────

export const SFX: Record<SfxName, SfxRecipe> = {
  pistol,
  shotgun,
  smg,
  magnum,
  turret,
  reload: (s) => {
    click(s, { freq: 3200, peak: 0.35, decay: 0.015, q: 5 });
    noiseBurst(s, { peak: 0.1, attack: 0.02, decay: 0.08, type: 'bandpass', freq: 1800, freqEnd: 1100, q: 3, at: s.t + 0.02 });
    const t2 = s.t + 0.3;
    click(s, { freq: 1500, peak: 0.5, decay: 0.03, q: 2.5, at: t2 });
    thump(s, { f0: 260, f1: 140, peak: 0.3, decay: 0.04, at: t2 });
    click(s, { freq: 4200, peak: 0.14, decay: 0.01, q: 6, at: t2 + 0.012 });
    return 0.42;
  },
  reload_done: (s) => {
    click(s, { freq: 2400, peak: 0.35, decay: 0.02, q: 4 });
    noiseBurst(s, { peak: 0.1, attack: 0.012, decay: 0.04, type: 'bandpass', freq: 1500, freqEnd: 2600, q: 2.5, at: s.t + 0.01 });
    click(s, { freq: 1700, peak: 0.55, decay: 0.03, q: 3, at: s.t + 0.075 });
    thump(s, { f0: 300, f1: 150, peak: 0.28, decay: 0.035, at: s.t + 0.075 });
    ping(s, { freq: 2900, peak: 0.05, decay: 0.12, at: s.t + 0.077, ratios: [1, 1.5] });
    return 0.25;
  },
  reload_shotgun: (s) => {
    // Three shells thumbed into the tube.
    for (let i = 0; i < 3; i++) {
      const at = s.t + 0.1 + i * 0.3;
      noiseBurst(s, { peak: 0.1, attack: 0.02, decay: 0.04, type: 'bandpass', freq: 1300, freqEnd: 2400, q: 2.5, at: at - 0.05 });
      click(s, { freq: 2200, peak: 0.42, decay: 0.022, q: 3, at });
      thump(s, { f0: 300, f1: 170, peak: 0.24, decay: 0.035, at });
      ping(s, { freq: 3400, peak: 0.03, decay: 0.05, at: at + 0.002, ratios: [1, 1.6] });
    }
    return 0.85;
  },
  reload_done_shotgun: (s) => {
    pump(s, s.t, 1.1);
    return 0.3;
  },
  reload_magnum: (s) => {
    // Cylinder swings out, brass tinkles to the floor, speed-loader in.
    click(s, { freq: 2800, peak: 0.4, decay: 0.015, q: 4 });
    for (let i = 0; i < 4; i++) click(s, { freq: 3600, peak: 0.12, decay: 0.006, q: 6, at: s.t + 0.025 + i * 0.014 });
    for (let i = 0; i < 4; i++) ping(s, { freq: rnd(2300, 3600), peak: 0.07, decay: 0.12, at: s.t + 0.22 + i * rnd(0.04, 0.08), ratios: [1, 2.42, 3.9] });
    const t2 = s.t + 0.72;
    click(s, { freq: 1400, peak: 0.42, decay: 0.03, q: 2.5, at: t2 });
    thump(s, { f0: 260, f1: 150, peak: 0.24, decay: 0.04, at: t2 });
    return 0.82;
  },
  reload_done_magnum: (s) => {
    click(s, { freq: 1900, peak: 0.5, decay: 0.025, q: 3 });
    thump(s, { f0: 330, f1: 160, peak: 0.26, decay: 0.035 });
    ping(s, { freq: 2600, peak: 0.05, decay: 0.15, at: s.t + 0.003, ratios: [1, 1.5] });
    // Hammer cock.
    click(s, { freq: 3500, peak: 0.3, decay: 0.012, q: 5, at: s.t + 0.14 });
    click(s, { freq: 2900, peak: 0.36, decay: 0.014, q: 5, at: s.t + 0.165 });
    return 0.28;
  },
  empty: (s) => {
    click(s, { freq: 3800, peak: 0.42, decay: 0.008, q: 5 });
    tone(s, { type: 'triangle', freq: 1150, freqEnd: 700, peak: 0.1, attack: 0.001, decay: 0.02 });
    click(s, { freq: 2600, peak: 0.16, decay: 0.01, q: 4, at: s.t + 0.045 });
    return 0.1;
  },
  overheat: (s) => {
    noiseBurst(s, { peak: 0.32, attack: 0.03, decay: 0.85, type: 'highpass', freq: 5200, freqEnd: 1800 });
    noiseBurst(s, { kind: 'pink', peak: 0.14, attack: 0.05, decay: 0.65, type: 'bandpass', freq: 2500, q: 2 });
    [1050, 880, 700].forEach((f, i) => tone(s, { type: 'square', freq: f, peak: 0.075, attack: 0.003, decay: 0.07, hold: 0.04, at: s.t + i * 0.13 }));
    ping(s, { freq: 1900, peak: 0.07, decay: 0.5, at: s.t + 0.04, ratios: [1, 2.4] });
    return 0.95;
  },
  bomb: (s) => {
    riser(s, { dur: 0.09, peak: 0.25, from: 1200, to: 6000 });
    const b = s.t + 0.08;
    noiseBurst(s, { peak: 0.9, attack: 0.0008, decay: 0.08, type: 'highpass', freq: 900, at: b });
    thump(s, { f0: 130, f1: 24, peak: 1, decay: 1.6, drive: 3.5, sweep: 0.5, at: b });
    noiseBurst(s, { kind: 'pink', peak: 1, attack: 0.003, decay: 1.5, type: 'lowpass', freq: 6000, freqEnd: 140, drive: 3, at: b });
    rumble(s, { peak: 0.55, attack: 0.1, decay: 2.1, freq: 450, freqEnd: 60, rate: 3, at: b });
    noiseBurst(s, { kind: 'crackle', peak: 0.45, attack: 0.08, decay: 1.9, type: 'bandpass', freq: 2400, q: 0.6, at: b + 0.1 });
    ping(s, { freq: 2200, peak: 0.08, decay: 1.2, at: b, ratios: [1, 1.5, 2.01] });
    return 2.5;
  },

  // ─── Impacts ────────────────────────────────────────────────────────────────
  hit_flesh: (s) => {
    const v = vIdx(s, 5);
    thump(s, { f0: 150 + v * 10, f1: 55, peak: 0.55, decay: 0.07, drive: 2 });
    squelch(s, { freq: 520 + v * 70, peak: 0.6, decay: 0.09 + v * 0.01, wob: 45 + v * 6 });
    noiseBurst(s, { peak: 0.26, attack: 0.001, decay: 0.035, type: 'bandpass', freq: 2100 + v * 250, q: 1.5 });
    return 0.18;
  },
  hit_head: (s) => {
    // Crunchy bone crack…
    for (let i = 0; i < 4; i++) click(s, { freq: rnd(1800, 4600), peak: rnd(0.3, 0.5), decay: 0.012, q: 2, at: s.t + i * rnd(0.005, 0.011) });
    thump(s, { f0: 210, f1: 58, peak: 0.6, decay: 0.08, drive: 3 });
    squelch(s, { freq: 850, peak: 0.6, decay: 0.15, wob: 55 });
    // …and the reward ding.
    bell(s, { freq: 1760, peak: 0.2, decay: 0.42, at: s.t + 0.028, ratio: 2.01, index: 0.6 });
    return 0.5;
  },
  hit_armor: (s) => {
    click(s, { freq: 4800, peak: 0.45, decay: 0.01, q: 1 });
    const v = vIdx(s, 3);
    if (v === 0) {
      // Ricochet whine "pyeww".
      const f = rnd(2700, 3600);
      tone(s, { freq: f, freqEnd: f * 0.55, peak: 0.22, attack: 0.002, decay: 0.34, vibrato: 32, vibratoDepth: 25 });
      tone(s, { freq: f * 1.51, freqEnd: f * 0.8, peak: 0.06, attack: 0.002, decay: 0.2 });
    } else if (v === 1) {
      // Clang.
      ping(s, { freq: rnd(1500, 2100), peak: 0.32, decay: 0.32, ratios: [1, 2.32, 4.25, 6.63] });
    } else {
      // Spang: short bright ping with a little glide.
      ping(s, { freq: rnd(2300, 2900), peak: 0.28, decay: 0.2, ratios: [1, 1.48, 2.9], glide: 0.86 });
      noiseBurst(s, { peak: 0.16, attack: 0.001, decay: 0.06, type: 'bandpass', freq: 3600, q: 2 });
    }
    return 0.4;
  },
  hit_world: (s) => {
    const v = vIdx(s, 4);
    click(s, { freq: 1500 + v * 300, peak: 0.42, decay: 0.025, q: 1.2 });
    thump(s, { f0: 230, f1: 110, peak: 0.22, decay: 0.03 });
    noiseBurst(s, { kind: 'crackle', peak: 0.22, attack: 0.005, decay: 0.14, type: 'highpass', freq: 2400 });
    return 0.18;
  },
  hit_projectile: (s) => {
    tone(s, { freq: 700, freqEnd: 170, peak: 0.42, attack: 0.001, decay: 0.05 });
    squelch(s, { freq: 1150, peak: 0.5, decay: 0.17, wob: 35 });
    noiseBurst(s, { kind: 'crackle', peak: 0.28, attack: 0.02, decay: 0.32, type: 'highpass', freq: 4400 });
    return 0.4;
  },
  gib: (s) => {
    thump(s, { f0: 140, f1: 40, peak: 0.8, decay: 0.2, drive: 3 });
    for (let i = 0; i < 4; i++) squelch(s, { freq: rnd(300, 900), peak: rnd(0.32, 0.55), decay: rnd(0.1, 0.2), wob: rnd(30, 70), at: s.t + rnd(0, 0.09) });
    noiseBurst(s, { kind: 'crackle', peak: 0.32, attack: 0.01, decay: 0.42, type: 'bandpass', freq: 1500, q: 0.8, at: s.t + 0.05 });
    return 0.62;
  },
  explosion: (s) => {
    const v = vIdx(s, 3);
    const b = [1, 0.8, 1.2][v];
    noiseBurst(s, { peak: 0.8, attack: 0.0008, decay: 0.06, type: 'highpass', freq: 900 });
    thump(s, { f0: 115 * b, f1: 28, peak: 1, decay: 1, drive: 3, sweep: 0.35 });
    noiseBurst(s, { kind: 'pink', peak: 0.9, attack: 0.004, decay: 1.15, type: 'lowpass', freq: 4500 * b, freqEnd: 150, drive: 2.5 });
    rumble(s, { peak: 0.42, attack: 0.05, decay: 1.5, freq: 520, freqEnd: 80, rate: 4 + v });
    noiseBurst(s, { kind: 'crackle', peak: 0.38, attack: 0.08, decay: 1.4, type: 'bandpass', freq: 2200, q: 0.6, at: s.t + 0.08 });
    return 1.95;
  },

  // ─── Zombies ────────────────────────────────────────────────────────────────
  zombie_groan: (s) => {
    const v = vIdx(s, 6);
    const paths: Vowel[][] = [['uh', 'o', 'u'], ['a', 'o', 'uh'], ['o', 'a', 'u'], ['uh', 'a', 'o', 'u'], ['u', 'uh', 'a', 'o'], ['o', 'uh', 'o']];
    const dur = rnd(0.95, 1.55);
    voice(s, {
      f0: rnd(68, 112),
      dur,
      peak: 0.62,
      vowels: paths[v],
      size: rnd(0.85, 1),
      q: 4,
      contour: [[0, 0.9], [0.3, rnd(1.05, 1.2)], [0.7, 1], [1, rnd(0.7, 0.85)]],
      rattle: rnd(18, 34),
      rattleDepth: rnd(0.4, 0.75),
      wobble: rnd(3, 6.5),
      wobbleDepth: rnd(0.03, 0.07),
      breath: 0.35,
      drive: 2.5,
      attack: 0.18,
      detune: 14,
    });
    return dur + 0.05;
  },
  zombie_attack: (s) => {
    voice(s, {
      f0: rnd(120, 155),
      dur: 0.65,
      peak: 0.72,
      vowels: ['a', 'ae', 'a', 'o'],
      q: 3,
      contour: [[0, 0.8], [0.15, 1.25], [0.6, 1.1], [1, 0.75]],
      rattle: rnd(32, 44),
      rattleDepth: 0.8,
      wobble: 9,
      wobbleDepth: 0.05,
      breath: 0.6,
      drive: 6,
      attack: 0.04,
    });
    noiseBurst(s, { kind: 'pink', peak: 0.2, attack: 0.03, decay: 0.5, type: 'bandpass', freq: 1500, q: 1.5 });
    return 0.7;
  },
  zombie_die: (s) => {
    voice(s, {
      f0: rnd(105, 125),
      dur: 1.05,
      peak: 0.62,
      vowels: ['a', 'o', 'u'],
      q: 3.5,
      contour: [[0, 1.1], [0.2, 1], [1, 0.45]],
      rattle: 24,
      rattleDepth: 0.65,
      wobble: 5,
      wobbleDepth: 0.05,
      breath: 0.5,
      drive: 3,
      attack: 0.02,
      release: 0.7,
    });
    for (let i = 0; i < 4; i++) squelch(s, { freq: rnd(250, 600), peak: rnd(0.15, 0.3), decay: rnd(0.05, 0.1), at: s.t + 0.45 + i * rnd(0.08, 0.14) });
    return 1.1;
  },
  brute_roar: (s) => {
    voice(s, {
      f0: rnd(50, 56),
      dur: 1.6,
      peak: 0.85,
      vowels: ['o', 'a', 'a', 'o'],
      size: 0.6,
      q: 3,
      contour: [[0, 0.85], [0.2, 1.15], [0.75, 1.05], [1, 0.7]],
      rattle: 22,
      rattleDepth: 0.7,
      wobble: 4,
      wobbleDepth: 0.04,
      breath: 0.7,
      drive: 7,
      sub: 0.6,
      attack: 0.12,
    });
    voice(s, { f0: 140, dur: 1.3, peak: 0.18, vowels: ['a', 'a', 'o'], size: 0.8, q: 3, contour: [[0, 0.9], [0.3, 1.1], [1, 0.8]], rattle: 30, rattleDepth: 0.8, drive: 5, breath: 0.4, at: s.t + 0.1 });
    return 1.7;
  },
  spit: (s) => {
    voice(s, { f0: 140, dur: 0.18, peak: 0.42, vowels: ['e', 'i'], breath: 1, rattle: 45, rattleDepth: 0.9, drive: 3, attack: 0.03 });
    const t = s.t + 0.15;
    noiseBurst(s, { kind: 'pink', peak: 0.5, attack: 0.01, decay: 0.16, type: 'bandpass', freq: 800, freqEnd: 3200, q: 2, at: t });
    tone(s, { freq: 500, freqEnd: 190, peak: 0.28, attack: 0.002, decay: 0.045, at: t });
    squelch(s, { freq: 900, peak: 0.25, decay: 0.1, at: t + 0.02 });
    return 0.4;
  },
  runner_shriek: (s) => {
    voice(s, {
      f0: rnd(270, 330),
      dur: 0.7,
      peak: 0.6,
      vowels: ['a', 'ae', 'e'],
      size: 1.05,
      q: 4,
      contour: [[0, 0.8], [0.15, 1.3], [0.7, 1.15], [1, 0.9]],
      rattle: 52,
      rattleDepth: 0.55,
      wobble: 7,
      wobbleDepth: 0.03,
      breath: 0.8,
      drive: 8,
      attack: 0.03,
    });
    return 0.75;
  },
  crawler_hiss: (s) => {
    voice(s, { f0: 95, dur: 0.8, peak: 0.45, vowels: ['e', 'i', 'e'], q: 3, rattle: 28, rattleDepth: 0.7, breath: 1.2, drive: 3, attack: 0.08 });
    noiseBurst(s, { peak: 0.18, attack: 0.1, decay: 0.6, type: 'highpass', freq: 3500 });
    return 0.85;
  },
  bloater_gurgle: (s) => {
    voice(s, { f0: 72, dur: 1.25, peak: 0.55, vowels: ['u', 'o', 'u'], size: 0.8, q: 4, rattle: 11, rattleDepth: 0.85, wobble: 3, wobbleDepth: 0.06, breath: 0.4, drive: 3, sub: 0.3 });
    for (let i = 0; i < 6; i++) squelch(s, { freq: rnd(200, 520), peak: rnd(0.12, 0.28), decay: rnd(0.05, 0.11), at: s.t + 0.1 + R() * 1 });
    return 1.3;
  },
  boss_roar: (s) => {
    const D = 2.1;
    voice(s, { f0: 44, dur: D, peak: 0.9, vowels: ['o', 'a', 'a', 'o', 'u'], size: 0.5, q: 3, contour: [[0, 0.8], [0.2, 1.15], [0.7, 1.05], [1, 0.7]], rattle: 20, rattleDepth: 0.7, wobble: 3.5, wobbleDepth: 0.04, breath: 0.9, drive: 10, sub: 0.8, attack: 0.18 });
    voice(s, { f0: 96, dur: D * 0.9, peak: 0.35, vowels: ['a', 'ae', 'a'], size: 0.7, q: 3, contour: [[0, 0.9], [0.3, 1.2], [1, 0.8]], rattle: 31, rattleDepth: 0.8, drive: 8, breath: 0.5, at: s.t + 0.06 });
    rumble(s, { peak: 0.4, attack: 0.2, decay: D, freq: 500, freqEnd: 120, rate: 8 });
    return D + 0.25;
  },

  // ─── Dinosaurs ──────────────────────────────────────────────────────────────
  compy_chirp: (s) => {
    const v = vIdx(s, 5);
    const n = 2 + (v % 2);
    const base = 2100 + v * 170;
    for (let i = 0; i < n; i++) {
      const at = s.t + i * rnd(0.065, 0.09);
      const f = base * rnd(0.92, 1.1);
      tone(s, { type: 'triangle', freq: f, freqEnd: f * 1.35, peak: 0.24, attack: 0.004, decay: 0.05, at, vibrato: 45, vibratoDepth: 80 });
      tone(s, { type: 'sine', freq: f * 2.02, freqEnd: f * 2.6, peak: 0.05, attack: 0.004, decay: 0.035, at });
    }
    return n * 0.09 + 0.08;
  },
  compy_die: (s) => {
    tone(s, { type: 'triangle', freq: 3000, freqEnd: 1100, peak: 0.24, attack: 0.003, decay: 0.17, vibrato: 38, vibratoDepth: 90 });
    squelch(s, { freq: 900, peak: 0.2, decay: 0.07 });
    return 0.24;
  },
  raptor_bark: (s) => {
    voice(s, { f0: rnd(260, 320), dur: 0.28, peak: 0.55, vowels: ['a', 'o'], size: 0.8, q: 3, contour: [[0, 0.8], [0.2, 1.2], [1, 0.7]], rattle: 60, rattleDepth: 0.4, drive: 5, breath: 0.4, attack: 0.02 });
    voice(s, { f0: rnd(400, 470), dur: 0.22, peak: 0.16, vowels: ['a', 'o'], size: 1, q: 5, contour: [[0, 0.9], [0.2, 1.15], [1, 0.75]], drive: 3, attack: 0.02 });
    return 0.32;
  },
  raptor_screech: (s) => {
    const v = vIdx(s, 4);
    // Bark…
    voice(s, { f0: 290 + v * 15, dur: 0.14, peak: 0.45, vowels: ['a', 'o'], size: 0.85, q: 3, rattle: 55, rattleDepth: 0.5, drive: 5, breath: 0.5, attack: 0.015, release: 0.4 });
    // …into the shriek.
    const f0 = 1050 + v * 90;
    voice(s, {
      f0,
      dur: 0.62,
      peak: 0.42,
      vowels: ['e', 'i', 'e'],
      size: 1.35,
      q: 3,
      contour: [[0, 0.8], [0.18, 1.18], [0.55, 1.08], [1, 0.72]],
      rattle: 75,
      rattleDepth: 0.45,
      wobble: 28,
      wobbleDepth: 0.025,
      breath: 0.6,
      drive: 4,
      attack: 0.04,
      at: s.t + 0.09,
    });
    noiseBurst(s, { kind: 'pink', peak: 0.12, attack: 0.05, decay: 0.45, type: 'bandpass', freq: 3200, q: 2, at: s.t + 0.1 });
    return 0.78;
  },
  raptor_die: (s) => {
    voice(s, { f0: 900, dur: 0.85, peak: 0.45, vowels: ['e', 'a', 'o'], size: 1.25, q: 3, contour: [[0, 1], [0.2, 0.95], [1, 0.32]], rattle: 40, rattleDepth: 0.6, wobble: 14, wobbleDepth: 0.04, breath: 0.6, drive: 4, attack: 0.02, release: 0.7 });
    for (let i = 0; i < 3; i++) squelch(s, { freq: rnd(300, 600), peak: 0.18, decay: 0.08, at: s.t + 0.5 + i * 0.11 });
    return 0.9;
  },
  dilo_hiss: (s) => {
    // Frill-rattle hiss…
    const src = noiseSrc(s, 'white', s.t, 0.85);
    const f = filt(s, 'bandpass', 3600, 1.2);
    const am = s.ctx.createGain();
    am.gain.value = 0.55;
    lfo(s, 34, 0.45, am.gain, s.t, 0.85, 'square');
    src.connect(f).connect(am).connect(amp(s, 0.36, 0.12, 0.7));
    // …then the eerie warbling hoot.
    voice(s, { f0: rnd(500, 560), dur: 0.62, peak: 0.34, vowels: ['u', 'o', 'u'], size: 1.2, q: 6, contour: [[0, 0.9], [0.3, 1.15], [1, 0.85]], wobble: 7, wobbleDepth: 0.06, breath: 0.15, drive: 1.5, at: s.t + 0.42, attack: 0.06 });
    return 1.08;
  },
  ptero_cry: (s) => {
    const f0 = rnd(780, 950);
    voice(s, { f0, dur: 0.85, peak: 0.5, vowels: ['a', 'e', 'a'], size: 1.25, q: 4, contour: [[0, 0.85], [0.15, 1.25], [0.5, 1.15], [1, 0.75]], wobble: 11, wobbleDepth: 0.035, breath: 0.3, drive: 3, attack: 0.04 });
    voice(s, { f0: f0 * 1.5, dur: 0.7, peak: 0.14, vowels: ['i', 'e'], size: 1.4, q: 5, contour: [[0, 0.85], [0.15, 1.25], [1, 0.8]], wobble: 11, wobbleDepth: 0.03, drive: 2, at: s.t + 0.04 });
    return 0.92;
  },
  trike_bellow: (s) => {
    voice(s, {
      f0: rnd(62, 72),
      dur: 1.5,
      peak: 0.8,
      vowels: ['u', 'o', 'o', 'u'],
      size: 0.7,
      q: 5,
      contour: [[0, 0.85], [0.25, 1.08], [0.8, 1], [1, 0.82]],
      wobble: 4.5,
      wobbleDepth: 0.025,
      rattle: 16,
      rattleDepth: 0.35,
      breath: 0.3,
      drive: 3,
      sub: 0.7,
      attack: 0.15,
    });
    return 1.55;
  },
  dino_roar: (s) => {
    const f0 = rnd(68, 88);
    voice(s, { f0, dur: 1.5, peak: 0.85, vowels: ['o', 'a', 'a', 'o'], size: 0.65, q: 3, contour: [[0, 0.85], [0.2, 1.15], [0.7, 1.05], [1, 0.72]], rattle: 24, rattleDepth: 0.6, wobble: 4, wobbleDepth: 0.04, breath: 0.7, drive: 6, sub: 0.4, attack: 0.1 });
    voice(s, { f0: f0 * 2.6, dur: 1.2, peak: 0.16, vowels: ['a', 'ae', 'a'], size: 0.9, q: 4, contour: [[0, 0.9], [0.25, 1.15], [1, 0.8]], rattle: 30, rattleDepth: 0.5, drive: 4, at: s.t + 0.08 });
    return 1.6;
  },
  dino_die: (s) => {
    voice(s, { f0: 76, dur: 1.9, peak: 0.8, vowels: ['a', 'o', 'u'], size: 0.65, q: 3, contour: [[0, 1.05], [0.15, 1], [1, 0.42]], rattle: 18, rattleDepth: 0.65, wobble: 3, wobbleDepth: 0.05, breath: 0.8, drive: 5, sub: 0.5, attack: 0.05, release: 0.75 });
    noiseBurst(s, { kind: 'pink', peak: 0.2, attack: 0.3, decay: 0.8, type: 'lowpass', freq: 900, freqEnd: 200, at: s.t + 1.1, linear: true });
    return 2.15;
  },
  rex_roar: (s) => {
    const D = 2.6;
    // Deep growl body.
    voice(s, { f0: 40, dur: D, peak: 1, vowels: ['o', 'a', 'a', 'o', 'u'], size: 0.42, q: 3.5, contour: [[0, 0.8], [0.15, 1.1], [0.45, 1.2], [0.8, 1], [1, 0.7]], rattle: 19, rattleDepth: 0.6, wobble: 3, wobbleDepth: 0.04, breath: 0.9, drive: 8, sub: 0.9, attack: 0.25 });
    // Mid tiger roar.
    voice(s, { f0: 105, dur: D * 0.9, peak: 0.5, vowels: ['a', 'a', 'o'], size: 0.6, q: 3, contour: [[0, 0.85], [0.2, 1.15], [0.6, 1.1], [1, 0.75]], rattle: 27, rattleDepth: 0.7, drive: 6, breath: 0.6, at: s.t + 0.08, attack: 0.2 });
    // High elephant-ish trumpet scream.
    voice(s, { f0: 480, dur: D * 0.7, peak: 0.16, vowels: ['a', 'e', 'a'], size: 1, q: 5, contour: [[0, 0.8], [0.25, 1.15], [0.7, 1.05], [1, 0.8]], wobble: 7, wobbleDepth: 0.03, drive: 3, at: s.t + 0.15, attack: 0.15 });
    rumble(s, { peak: 0.5, attack: 0.3, decay: D - 0.2, freq: 600, freqEnd: 150, rate: 9 });
    tone(s, { freq: 38, freqEnd: 30, peak: 0.55, attack: 0.35, decay: D - 0.3, linear: true });
    return D + 0.3;
  },
  stomp: (s) => {
    thump(s, { f0: 95, f1: 30, peak: 1, decay: 0.45, drive: 4, sweep: 0.2 });
    // Mid-range body so the impact survives small phone speakers.
    thump(s, { f0: 210, f1: 85, peak: 0.45, decay: 0.13, drive: 3, sweep: 0.06, attack: 0.003 });
    noiseBurst(s, { kind: 'pink', peak: 0.35, attack: 0.003, decay: 0.12, type: 'bandpass', freq: 280, q: 1.1 });
    noiseBurst(s, { kind: 'brown', peak: 0.6, attack: 0.004, decay: 0.35, type: 'lowpass', freq: 500, freqEnd: 90 });
    noiseBurst(s, { kind: 'crackle', peak: 0.16, attack: 0.02, decay: 0.28, type: 'bandpass', freq: 1800, q: 0.7 });
    return 0.52;
  },
  wing_flap: (s) => {
    noiseBurst(s, { kind: 'pink', peak: 0.5, attack: 0.05, decay: 0.16, type: 'bandpass', freq: 380, freqEnd: 260, q: 0.9 });
    thump(s, { f0: 120, f1: 60, peak: 0.25, decay: 0.08, at: s.t + 0.04 });
    return 0.25;
  },
  bite: (s) => {
    click(s, { freq: 2200, peak: 0.6, decay: 0.02, q: 1.5 });
    tone(s, { type: 'triangle', freq: 620, freqEnd: 200, peak: 0.32, attack: 0.001, decay: 0.04 });
    thump(s, { f0: 180, f1: 70, peak: 0.5, decay: 0.08, drive: 3 });
    squelch(s, { freq: 700, peak: 0.25, decay: 0.08, wob: 50, at: s.t + 0.02 });
    return 0.2;
  },
  whoosh: (s) => {
    const src = noiseSrc(s, 'pink', s.t, 0.42);
    const f = s.ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 1.3;
    f.frequency.setValueAtTime(hz(s, 280), s.t);
    f.frequency.exponentialRampToValueAtTime(hz(s, 1500), s.t + 0.2);
    f.frequency.exponentialRampToValueAtTime(hz(s, 350), s.t + 0.42);
    const g = s.ctx.createGain();
    g.gain.setValueAtTime(0.0001, s.t);
    g.gain.exponentialRampToValueAtTime(0.55, s.t + 0.19);
    g.gain.exponentialRampToValueAtTime(0.0001, s.t + 0.42);
    g.connect(s.out);
    src.connect(f).connect(g);
    return 0.45;
  },
  roar_distant: (s) => {
    voice(s, { f0: rnd(60, 75), dur: 2.1, peak: 0.6, vowels: ['o', 'a', 'o', 'u'], size: 0.55, q: 3, contour: [[0, 0.85], [0.3, 1.12], [1, 0.75]], rattle: 20, rattleDepth: 0.5, wobble: 3, wobbleDepth: 0.04, breath: 0.6, drive: 4, attack: 0.3, lowpass: 700 });
    return 2.2;
  },

  // ─── Player / feedback ──────────────────────────────────────────────────────
  player_hurt: (s) => {
    thump(s, { f0: 170, f1: 48, peak: 0.9, decay: 0.2, drive: 4 });
    noiseBurst(s, { kind: 'pink', peak: 0.55, attack: 0.002, decay: 0.2, type: 'lowpass', freq: 2500, freqEnd: 300 });
    voice(s, { f0: 128, dur: 0.3, peak: 0.42, vowels: ['uh', 'u'], q: 6, contour: [[0, 1.1], [1, 0.75]], breath: 0.4, drive: 2, attack: 0.01 });
    tone(s, { freq: 3520, peak: 0.04, attack: 0.04, decay: 0.85 });
    return 0.95;
  },
  heartbeat: (s) => {
    thump(s, { f0: 80, f1: 45, peak: 0.9, decay: 0.13, drive: 3, attack: 0.01 });
    noiseBurst(s, { kind: 'brown', peak: 0.35, attack: 0.008, decay: 0.08, type: 'lowpass', freq: 200 });
    thump(s, { f0: 72, f1: 42, peak: 0.65, decay: 0.12, drive: 3, at: s.t + 0.2, attack: 0.01 });
    return 0.38;
  },
  pickup: (s) => {
    [1319, 1661, 1976, 2637].forEach((f, i) => pluck(s, { freq: f, at: s.t + i * 0.045, peak: 0.2, decay: 0.2, type: 'square', bright: 0.6 }));
    tinkles(s, 5, { lo: 4000, hi: 6500, peak: 0.05, spread: 0.3, decay: 0.15, at: s.t + 0.1 });
    return 0.48;
  },
  pickup_health: (s) => {
    [523, 659, 784, 1047].forEach((f, i) => pluck(s, { freq: f, at: s.t + i * 0.06, peak: 0.22, decay: 0.3, type: 'triangle', bright: 1.5 }));
    for (const f of [523, 659, 784]) tone(s, { freq: f * 2, peak: 0.05, attack: 0.15, decay: 0.45, at: s.t + 0.18, linear: true });
    bell(s, { freq: 2093, peak: 0.08, decay: 0.5, at: s.t + 0.24, ratio: 2.01, index: 0.4 });
    return 0.8;
  },
  weapon_get: (s) => {
    pump(s, s.t, 1.1);
    const t = s.t + 0.2;
    riser(s, { dur: 0.16, peak: 0.18, from: 600, to: 4000, at: t - 0.16 });
    thump(s, { f0: 150, f1: 50, peak: 0.6, decay: 0.25, drive: 3, at: t });
    [440, 554, 659, 880].forEach((f, i) => brass(s, { freq: f, at: t + i * 0.055, dur: i === 3 ? 0.4 : 0.1, peak: 0.12 }));
    return 0.85;
  },
  combo: (s) => {
    bell(s, { freq: 1047, peak: 0.2, decay: 0.3, ratio: 2.01, index: 0.5 });
    bell(s, { freq: 1568, peak: 0.22, decay: 0.42, ratio: 2.01, index: 0.5, at: s.t + 0.07 });
    return 0.5;
  },
  civilian_scream: (s) => {
    const f0 = rnd(380, 520);
    voice(s, { f0, dur: 0.9, peak: 0.45, vowels: ['a', 'ae', 'e'], size: 1.18, q: 7, contour: [[0, 0.85], [0.12, 1.15], [0.6, 1.12], [1, 0.9]], wobble: 6, wobbleDepth: 0.04, breath: 0.3, drive: 2, attack: 0.04 });
    return 0.95;
  },
  civilian_saved: (s) => {
    [1047, 1319, 1568, 2093].forEach((f, i) => bell(s, { freq: f, peak: 0.13, decay: 0.45, at: s.t + i * 0.07, ratio: 2.01, index: 0.35 }));
    for (const f of [523, 659, 784]) tone(s, { type: 'triangle', freq: f, peak: 0.06, attack: 0.08, decay: 0.55, at: s.t + 0.05, linear: true });
    return 0.85;
  },
  civilian_shot: (s) => {
    for (const f of [233, 220]) tone(s, { type: 'square', freq: f, freqEnd: f * 0.5, peak: 0.16, attack: 0.005, decay: 0.32, hold: 0.12, glide: 0.45 });
    thump(s, { f0: 120, f1: 50, peak: 0.45, decay: 0.15, drive: 2 });
    return 0.5;
  },

  // ─── UI / flow ──────────────────────────────────────────────────────────────
  ui_click: (s) => {
    tone(s, { freq: 1900, freqEnd: 1500, peak: 0.16, attack: 0.001, decay: 0.035 });
    click(s, { freq: 5200, peak: 0.12, decay: 0.006, q: 2 });
    return 0.06;
  },
  ui_back: (s) => {
    tone(s, { freq: 950, freqEnd: 650, peak: 0.16, attack: 0.001, decay: 0.05 });
    click(s, { freq: 3500, peak: 0.08, decay: 0.006, q: 2 });
    return 0.08;
  },
  ui_start: (s) => {
    pump(s, s.t, 1);
    const t = s.t + 0.2;
    thump(s, { f0: 140, f1: 38, peak: 0.85, decay: 0.55, drive: 4, at: t });
    noiseBurst(s, { kind: 'pink', peak: 0.4, attack: 0.002, decay: 0.45, type: 'lowpass', freq: 3500, freqEnd: 200, at: t });
    for (const f of [147, 220, 294, 440]) brass(s, { freq: f, at: t, dur: 0.6, peak: 0.07, bright: 0.8 });
    return 1.05;
  },
  banner: (s) => {
    riser(s, { dur: 0.35, peak: 0.3, from: 300, to: 3200 });
    const t = s.t + 0.33;
    thump(s, { f0: 110, f1: 32, peak: 0.85, decay: 0.8, drive: 3, at: t });
    noiseBurst(s, { kind: 'pink', peak: 0.38, attack: 0.002, decay: 0.7, type: 'lowpass', freq: 2500, freqEnd: 150, at: t });
    ping(s, { freq: 196, peak: 0.12, decay: 1.1, at: t, ratios: [1, 2.76, 5.4] });
    return 1.5;
  },
  boss_warning: (s) => {
    // Low "braam" under a three-cycle klaxon.
    for (const f of [55, 82.4]) brass(s, { freq: f, at: s.t, dur: 1.6, peak: 0.28, bright: 2.5 });
    thump(s, { f0: 90, f1: 35, peak: 0.6, decay: 1, drive: 3 });
    const ctx = s.ctx;
    const f = filt(s, 'bandpass', 900, 1.8);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, s.t);
    g.gain.linearRampToValueAtTime(0.28, s.t + 0.08);
    g.gain.setValueAtTime(0.28, s.t + 2.1);
    g.gain.exponentialRampToValueAtTime(0.0001, s.t + 2.5);
    g.connect(s.out);
    const w = shaper(s, 3, g);
    f.connect(w);
    for (const det of [0, 12]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.detune.value = det;
      for (let i = 0; i < 3; i++) {
        const at = s.t + i * 0.8;
        o.frequency.setValueAtTime(hz(s, 520), at);
        o.frequency.linearRampToValueAtTime(hz(s, 820), at + 0.38);
        o.frequency.setValueAtTime(hz(s, 820), at + 0.4);
        o.frequency.linearRampToValueAtTime(hz(s, 520), at + 0.78);
      }
      o.connect(f);
      o.start(s.t);
      o.stop(s.t + 2.55);
    }
    return 2.6;
  },
  stage_clear: (s) => {
    // Ta-ta-ta TAAA, ta-TAAAA.
    const seq: [number, number, number][] = [
      [392, 0, 0.1], [523, 0.11, 0.1], [659, 0.22, 0.1], [784, 0.33, 0.42], [659, 0.8, 0.12], [784, 0.93, 0.85],
    ];
    for (const [f, at, d] of seq) {
      brass(s, { freq: f, at: s.t + at, dur: d, peak: 0.2, bright: 1.2 });
      brass(s, { freq: f / 2, at: s.t + at, dur: d, peak: 0.08 });
    }
    for (const f of [131, 196, 262, 330]) brass(s, { freq: f, at: s.t + 0.93, dur: 0.9, peak: 0.07, bright: 0.8 });
    thump(s, { f0: 120, f1: 45, peak: 0.6, decay: 0.4, drive: 2, at: s.t + 0.33 });
    thump(s, { f0: 120, f1: 45, peak: 0.7, decay: 0.6, drive: 2, at: s.t + 0.93 });
    noiseBurst(s, { peak: 0.14, attack: 0.002, decay: 1.1, type: 'highpass', freq: 6000, at: s.t + 0.93 });
    tinkles(s, 10, { lo: 3500, hi: 7000, peak: 0.04, spread: 1, decay: 0.25, at: s.t + 0.95 });
    return 2.1;
  },
  game_over: (s) => {
    ping(s, { freq: 65.4, peak: 0.3, decay: 2.6, ratios: [1, 2, 2.76, 4.07, 5.4] });
    thump(s, { f0: 70, f1: 40, peak: 0.6, decay: 1.2, drive: 2 });
    const seq: [number, number, number][] = [[392, 0.1, 0.45], [311, 0.6, 0.45], [262, 1.1, 0.45], [247, 1.6, 1.1]];
    for (const [f, at, d] of seq) brass(s, { freq: f, at: s.t + at, dur: d, peak: 0.16, bright: 0.6 });
    for (const f of [131, 156, 196]) brass(s, { freq: f, at: s.t + 0.1, dur: 2.2, peak: 0.05, bright: 0.5 });
    return 2.9;
  },
  continue_tick: (s) => {
    tone(s, { freq: 1500, peak: 0.3, attack: 0.001, decay: 0.03 });
    click(s, { freq: 3000, peak: 0.25, decay: 0.008, q: 3 });
    tone(s, { type: 'triangle', freq: 520, peak: 0.15, attack: 0.001, decay: 0.06 });
    return 0.12;
  },
  score_tick: (s) => {
    tone(s, { type: 'square', freq: 1760, peak: 0.07, attack: 0.001, decay: 0.03 });
    tone(s, { type: 'square', freq: 2637, peak: 0.06, attack: 0.001, decay: 0.04, at: s.t + 0.03 });
    return 0.09;
  },

  // ─── Vehicles / world ───────────────────────────────────────────────────────
  engine_rev: (s) => {
    const ctx = s.ctx;
    const D = 1.15;
    const f = filt(s, 'lowpass', 500, 2, s.t, 1800, 0.6);
    const g = amp(s, 0.45, 0.08, 0.6, s.t, s.out, 0.45);
    const w = shaper(s, 4, g);
    f.connect(w);
    const curve = (p: AudioParam, m: number) => {
      p.setValueAtTime(hz(s, 42 * m), s.t);
      p.exponentialRampToValueAtTime(hz(s, 125 * m), s.t + 0.55);
      p.exponentialRampToValueAtTime(hz(s, 95 * m), s.t + D);
    };
    for (const [type, m, det] of [['sawtooth', 1, -6], ['square', 0.5, 0], ['sawtooth', 1, 7]] as const) {
      const o = ctx.createOscillator();
      o.type = type;
      o.detune.value = det;
      curve(o.frequency, m);
      o.connect(f);
      o.start(s.t);
      o.stop(s.t + D + 0.05);
    }
    noiseBurst(s, { kind: 'brown', peak: 0.3, attack: 0.08, decay: 0.8, type: 'lowpass', freq: 500, hold: 0.2 });
    return D + 0.1;
  },
  crash: (s) => {
    thump(s, { f0: 110, f1: 35, peak: 0.95, decay: 0.45, drive: 4 });
    noiseBurst(s, { peak: 0.8, attack: 0.001, decay: 0.6, type: 'lowpass', freq: 5000, freqEnd: 300, drive: 2 });
    for (let i = 0; i < 5; i++) ping(s, { freq: rnd(300, 1400), peak: rnd(0.12, 0.25), decay: rnd(0.2, 0.6), at: s.t + R() * 0.3, ratios: [1, 2.32, 4.25] });
    for (let i = 0; i < 4; i++) noiseBurst(s, { peak: rnd(0.2, 0.4), attack: 0.001, decay: rnd(0.05, 0.12), type: 'bandpass', freq: rnd(1500, 4000), q: 1.5, at: s.t + R() * 0.35 });
    tinkles(s, 10, { lo: 3000, hi: 7500, peak: 0.07, spread: 0.6, decay: 0.2, at: s.t + 0.05 });
    return 1.3;
  },
  glass: (s) => {
    noiseBurst(s, { peak: 0.5, attack: 0.0008, decay: 0.035, type: 'highpass', freq: 2500 });
    tinkles(s, 14, { lo: 2500, hi: 7500, peak: 0.14, spread: 0.45, decay: 0.22 });
    noiseBurst(s, { peak: 0.2, attack: 0.003, decay: 0.4, type: 'highpass', freq: 5000 });
    return 0.75;
  },
  door: (s) => {
    thump(s, { f0: 125, f1: 58, peak: 0.85, decay: 0.25, drive: 3 });
    noiseBurst(s, { kind: 'pink', peak: 0.5, attack: 0.002, decay: 0.3, type: 'bandpass', freq: 380, q: 2 });
    const src = noiseSrc(s, 'white', s.t + 0.05, 0.3);
    const f = filt(s, 'bandpass', 1100, 3, s.t + 0.05);
    const am = s.ctx.createGain();
    am.gain.value = 0.5;
    lfo(s, 19, 0.5, am.gain, s.t + 0.05, 0.3, 'square');
    src.connect(f).connect(am).connect(amp(s, 0.18, 0.005, 0.28, s.t + 0.05));
    return 0.6;
  },
  thunder: (s) => {
    noiseBurst(s, { peak: 0.7, attack: 0.002, decay: 0.3, type: 'highpass', freq: 1200 });
    noiseBurst(s, { kind: 'crackle', peak: 0.55, attack: 0.01, decay: 0.6, type: 'bandpass', freq: 2000, q: 0.6 });
    rumble(s, { peak: 0.85, attack: 0.15, decay: 3, freq: 380, freqEnd: 70, rate: 2.3, at: s.t + 0.05 });
    tone(s, { freq: 45, freqEnd: 30, peak: 0.5, attack: 0.12, decay: 2.2 });
    return 3.3;
  },
  wood_break: (s) => {
    for (let i = 0; i < 4; i++) click(s, { freq: rnd(900, 2600), peak: rnd(0.35, 0.6), decay: rnd(0.015, 0.04), q: 2.5, at: s.t + i * rnd(0.012, 0.03) });
    thump(s, { f0: 180, f1: 80, peak: 0.55, decay: 0.12, drive: 2 });
    noiseBurst(s, { kind: 'pink', peak: 0.35, attack: 0.003, decay: 0.22, type: 'bandpass', freq: 750, q: 1.5 });
    noiseBurst(s, { kind: 'crackle', peak: 0.25, attack: 0.02, decay: 0.3, type: 'bandpass', freq: 2200, q: 1, at: s.t + 0.05 });
    return 0.5;
  },
  metal_clang: (s) => {
    click(s, { freq: 3000, peak: 0.45, decay: 0.012, q: 1 });
    ping(s, { freq: rnd(340, 420), peak: 0.35, decay: 1.1, ratios: [1, 2.76, 5.4, 8.93] });
    ping(s, { freq: rnd(900, 1100), peak: 0.15, decay: 0.5, ratios: [1, 2.32] });
    return 1.15;
  },
  alarm: (s) => {
    const ctx = s.ctx;
    const D = 2;
    const f = filt(s, 'bandpass', 1100, 1.2);
    const g = amp(s, 0.3, 0.02, 0.15, s.t, s.out, D - 0.2);
    const w = shaper(s, 2.5, g);
    f.connect(w);
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    for (let i = 0; i < 8; i++) {
      const at = s.t + i * 0.25;
      o.frequency.setValueAtTime(hz(s, 620), at);
      o.frequency.exponentialRampToValueAtTime(hz(s, 1250), at + 0.22);
    }
    o.connect(f);
    o.start(s.t);
    o.stop(s.t + D + 0.05);
    return D + 0.05;
  },
  helicopter: (s) => {
    const D = 3.5;
    const ctx = s.ctx;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, s.t);
    env.gain.exponentialRampToValueAtTime(0.7, s.t + D * 0.5);
    env.gain.exponentialRampToValueAtTime(0.0001, s.t + D);
    env.connect(s.out);
    const chopRate = ctx.createOscillator();
    chopRate.type = 'sawtooth';
    chopRate.frequency.setValueAtTime(14 * s.pitch, s.t);
    chopRate.frequency.linearRampToValueAtTime(15.5 * s.pitch, s.t + D * 0.45);
    chopRate.frequency.linearRampToValueAtTime(12.5 * s.pitch, s.t + D);
    const chop = ctx.createGain();
    chop.gain.value = 0.5;
    const depth = ctx.createGain();
    depth.gain.value = 0.5;
    chopRate.connect(depth).connect(chop.gain);
    chop.connect(env);
    const low = noiseSrc(s, 'brown', s.t, D);
    const lf = filt(s, 'lowpass', 320, 1);
    low.connect(lf).connect(chop);
    const slap = noiseSrc(s, 'pink', s.t, D);
    const sf = filt(s, 'bandpass', 1100, 1.5);
    const sg = ctx.createGain();
    sg.gain.value = 0.35;
    slap.connect(sf).connect(sg).connect(chop);
    chopRate.start(s.t);
    chopRate.stop(s.t + D + 0.05);
    tone(s, { freq: 2300, freqEnd: 2050, peak: 0.03, attack: D * 0.5, decay: D * 0.5, linear: true });
    return D + 0.05;
  },
  splash: (s) => {
    noiseBurst(s, { kind: 'pink', peak: 0.7, attack: 0.004, decay: 0.5, type: 'lowpass', freq: 3500, freqEnd: 500 });
    thump(s, { f0: 140, f1: 60, peak: 0.4, decay: 0.15 });
    for (let i = 0; i < 6; i++) squelch(s, { freq: rnd(400, 1200), peak: rnd(0.1, 0.22), decay: rnd(0.04, 0.09), at: s.t + 0.08 + R() * 0.5 });
    return 0.75;
  },
};

// ─── Offline rendering (pre-render cache + verification) ─────────────────────

type OfflineCtor = new (channels: number, length: number, sampleRate: number) => OfflineAudioContext;

/** OfflineAudioContext constructor (prefixed on old iOS), or null (node). */
export function offlineCtor(): OfflineCtor | null {
  const g = globalThis as unknown as { OfflineAudioContext?: OfflineCtor; webkitOfflineAudioContext?: OfflineCtor };
  return g.OfflineAudioContext ?? g.webkitOfflineAudioContext ?? null;
}

/** startRendering() that also works with the old callback-only WebKit API. */
export function renderOffline(ctx: OfflineAudioContext): Promise<AudioBuffer> {
  return new Promise((resolve, reject) => {
    let done = false;
    ctx.oncomplete = (e) => {
      if (!done) {
        done = true;
        resolve(e.renderedBuffer);
      }
    };
    try {
      const p = ctx.startRendering() as Promise<AudioBuffer> | undefined;
      if (p && typeof p.then === 'function')
        p.then(
          (b) => {
            if (!done) {
              done = true;
              resolve(b);
            }
          },
          (e) => {
            if (!done) {
              done = true;
              reject(e);
            }
          },
        );
    } catch (e) {
      reject(e);
    }
  });
}

/**
 * Render `variants` takes of a recipe into separate (trimmed, mono) buffers.
 * Rejects when offline rendering is unavailable.
 */
export async function renderSfx(
  name: SfxName,
  opts: { variants?: number; sampleRate?: number; bank?: NoiseBank; slot?: number; pitch?: number } = {},
): Promise<AudioBuffer[]> {
  const OAC = offlineCtor();
  if (!OAC) throw new Error('OfflineAudioContext unavailable');
  const meta = SFX_META[name];
  const n = Math.max(1, opts.variants ?? 1);
  const slot = (opts.slot ?? meta.len) + 0.1;
  const sr = opts.sampleRate ?? 44100;
  const ctx = new OAC(1, Math.ceil(sr * slot * n), sr);
  const bank = opts.bank ?? makeNoiseBank(ctx);
  const durs: number[] = [];
  for (let i = 0; i < n; i++) {
    const out = ctx.createGain();
    out.gain.value = meta.trim;
    out.connect(ctx.destination);
    const s: SfxContext = { ctx, out, t: i * slot + 0.002, pitch: opts.pitch ?? 1, noise: bank.white, bank, variant: i };
    durs.push(Math.min(slot - 0.002, (SFX[name](s) ?? meta.len) + 0.08));
  }
  const buf = await renderOffline(ctx);
  return durs.map((d, i) => sliceTrim(ctx, buf, i * slot, i * slot + d));
}
