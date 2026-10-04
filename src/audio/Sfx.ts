import type { SfxName } from './names';

export interface SfxContext {
  ctx: AudioContext;
  /** Destination for this voice. */
  out: AudioNode;
  /** Start time (ctx.currentTime). */
  t: number;
  /** Pitch multiplier including random variation. */
  pitch: number;
  /** 2 s of white noise. */
  noise: AudioBuffer;
}

/** A recipe schedules nodes and returns its duration in seconds. */
export type SfxRecipe = (s: SfxContext) => number | void;

// ─── Building blocks ──────────────────────────────────────────────────────────

export function env(s: SfxContext, peak: number, attack: number, decay: number, at = s.t): GainNode {
  const g = s.ctx.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), at + Math.max(0.001, attack));
  g.gain.exponentialRampToValueAtTime(0.0001, at + attack + decay);
  g.connect(s.out);
  return g;
}

export function noiseBurst(
  s: SfxContext,
  o: { peak: number; attack?: number; decay: number; type?: BiquadFilterType; freq: number; freqEnd?: number; q?: number; at?: number; rate?: number },
) {
  const at = o.at ?? s.t;
  const src = s.ctx.createBufferSource();
  src.buffer = s.noise;
  src.playbackRate.value = (o.rate ?? 1) * s.pitch;
  const f = s.ctx.createBiquadFilter();
  f.type = o.type ?? 'lowpass';
  f.frequency.setValueAtTime(o.freq * s.pitch, at);
  if (o.freqEnd) f.frequency.exponentialRampToValueAtTime(Math.max(20, o.freqEnd * s.pitch), at + (o.attack ?? 0.002) + o.decay);
  f.Q.value = o.q ?? 0.7;
  const g = env(s, o.peak, o.attack ?? 0.002, o.decay, at);
  src.connect(f).connect(g);
  src.start(at, Math.random() * 1.5);
  src.stop(at + (o.attack ?? 0.002) + o.decay + 0.05);
}

export function tone(
  s: SfxContext,
  o: { type?: OscillatorType; freq: number; freqEnd?: number; peak: number; attack?: number; decay: number; at?: number; detune?: number },
) {
  const at = o.at ?? s.t;
  const osc = s.ctx.createOscillator();
  osc.type = o.type ?? 'sine';
  osc.frequency.setValueAtTime(o.freq * s.pitch, at);
  if (o.freqEnd) osc.frequency.exponentialRampToValueAtTime(Math.max(10, o.freqEnd * s.pitch), at + (o.attack ?? 0.005) + o.decay);
  if (o.detune) osc.detune.value = o.detune;
  const g = env(s, o.peak, o.attack ?? 0.005, o.decay, at);
  osc.connect(g);
  osc.start(at);
  osc.stop(at + (o.attack ?? 0.005) + o.decay + 0.05);
}

/** Gunshot: transient crack + body thump + noisy tail. */
function gun(s: SfxContext, crack: number, body: number, tail: number, vol = 1) {
  noiseBurst(s, { peak: 0.9 * vol, decay: 0.05, type: 'highpass', freq: crack });
  tone(s, { type: 'triangle', freq: body, freqEnd: body * 0.3, peak: 0.8 * vol, decay: 0.12 });
  noiseBurst(s, { peak: 0.45 * vol, attack: 0.004, decay: tail, type: 'lowpass', freq: 3000, freqEnd: 300 });
  return tail + 0.1;
}

/** Growl/roar: detuned saws through a wobbling band-pass. */
function growl(s: SfxContext, base: number, dur: number, vol = 0.6, bright = 900) {
  const ctx = s.ctx;
  const f = ctx.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.setValueAtTime(bright * s.pitch, s.t);
  f.frequency.linearRampToValueAtTime(bright * 0.6 * s.pitch, s.t + dur);
  f.Q.value = 2.5;
  const g = env(s, vol, dur * 0.15, dur * 0.85);
  f.connect(g);
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 18 + Math.random() * 10;
  const lfoGain = ctx.createGain();
  lfoGain.gain.value = base * 0.25;
  lfo.connect(lfoGain);
  for (const det of [-12, 0, 9]) {
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(base * s.pitch, s.t);
    o.frequency.linearRampToValueAtTime(base * 0.75 * s.pitch, s.t + dur);
    o.detune.value = det;
    lfoGain.connect(o.frequency);
    o.connect(f);
    o.start(s.t);
    o.stop(s.t + dur + 0.05);
  }
  lfo.start(s.t);
  lfo.stop(s.t + dur + 0.05);
  noiseBurst(s, { peak: vol * 0.4, attack: dur * 0.1, decay: dur * 0.9, type: 'bandpass', freq: bright * 1.5, q: 1.2 });
  return dur;
}

function chirp(s: SfxContext, from: number, to: number, dur: number, vol = 0.4, type: OscillatorType = 'square') {
  tone(s, { type, freq: from, freqEnd: to, peak: vol, attack: 0.005, decay: dur });
  return dur;
}

function arpeggio(s: SfxContext, notes: number[], step: number, vol = 0.3, type: OscillatorType = 'square') {
  notes.forEach((n, i) => tone(s, { type, freq: n, peak: vol, attack: 0.005, decay: step * 1.6, at: s.t + i * step }));
  return notes.length * step + step;
}

// ─── Recipes ──────────────────────────────────────────────────────────────────

export const SFX: Record<SfxName, SfxRecipe> = {
  pistol: (s) => gun(s, 2500, 160, 0.18),
  shotgun: (s) => gun(s, 1500, 90, 0.42, 1.2),
  smg: (s) => gun(s, 3200, 200, 0.09, 0.7),
  magnum: (s) => gun(s, 1200, 70, 0.55, 1.3),
  turret: (s) => gun(s, 2800, 120, 0.1, 0.75),
  reload: (s) => {
    noiseBurst(s, { peak: 0.4, decay: 0.03, type: 'bandpass', freq: 3000, q: 4 });
    noiseBurst(s, { peak: 0.5, decay: 0.04, type: 'bandpass', freq: 2200, q: 5, at: s.t + 0.18 });
    return 0.3;
  },
  reload_done: (s) => {
    noiseBurst(s, { peak: 0.6, decay: 0.04, type: 'bandpass', freq: 1800, q: 6 });
    tone(s, { type: 'square', freq: 900, peak: 0.08, decay: 0.05, at: s.t + 0.02 });
    return 0.15;
  },
  empty: (s) => {
    noiseBurst(s, { peak: 0.35, decay: 0.02, type: 'highpass', freq: 4000 });
    return 0.1;
  },
  overheat: (s) => {
    noiseBurst(s, { peak: 0.4, attack: 0.05, decay: 0.8, type: 'highpass', freq: 3000, freqEnd: 800 });
    tone(s, { type: 'square', freq: 440, freqEnd: 220, peak: 0.15, decay: 0.4 });
    return 0.9;
  },
  bomb: (s) => {
    tone(s, { type: 'sine', freq: 90, freqEnd: 25, peak: 1, decay: 1.2 });
    noiseBurst(s, { peak: 1, attack: 0.005, decay: 1.4, freq: 2400, freqEnd: 120 });
    return 1.5;
  },
  hit_flesh: (s) => {
    noiseBurst(s, { peak: 0.6, decay: 0.08, type: 'lowpass', freq: 900, freqEnd: 200 });
    tone(s, { type: 'sine', freq: 140, freqEnd: 60, peak: 0.4, decay: 0.08 });
    return 0.15;
  },
  hit_head: (s) => {
    noiseBurst(s, { peak: 0.8, decay: 0.12, type: 'lowpass', freq: 1400, freqEnd: 200 });
    tone(s, { type: 'square', freq: 1600, freqEnd: 1200, peak: 0.12, decay: 0.08, at: s.t + 0.01 });
    return 0.2;
  },
  hit_armor: (s) => {
    tone(s, { type: 'triangle', freq: 2200, freqEnd: 1800, peak: 0.35, decay: 0.25 });
    noiseBurst(s, { peak: 0.3, decay: 0.05, type: 'highpass', freq: 5000 });
    return 0.3;
  },
  hit_world: (s) => {
    noiseBurst(s, { peak: 0.35, decay: 0.06, type: 'bandpass', freq: 2000, q: 1 });
    return 0.1;
  },
  hit_projectile: (s) => {
    noiseBurst(s, { peak: 0.6, decay: 0.15, type: 'lowpass', freq: 1800, freqEnd: 300 });
    tone(s, { type: 'square', freq: 700, freqEnd: 1400, peak: 0.12, decay: 0.1 });
    return 0.2;
  },
  gib: (s) => {
    noiseBurst(s, { peak: 0.7, decay: 0.25, type: 'lowpass', freq: 700, freqEnd: 120 });
    return 0.3;
  },
  explosion: (s) => {
    tone(s, { type: 'sine', freq: 110, freqEnd: 30, peak: 0.9, decay: 0.8 });
    noiseBurst(s, { peak: 0.9, attack: 0.005, decay: 1.1, freq: 3000, freqEnd: 150 });
    return 1.2;
  },
  zombie_groan: (s) => growl(s, 75 + Math.random() * 30, 1.1, 0.35, 500),
  zombie_attack: (s) => growl(s, 110, 0.6, 0.5, 900),
  zombie_die: (s) => growl(s, 90, 0.8, 0.45, 600),
  brute_roar: (s) => growl(s, 55, 1.4, 0.8, 400),
  spit: (s) => {
    noiseBurst(s, { peak: 0.5, attack: 0.02, decay: 0.25, type: 'bandpass', freq: 1200, freqEnd: 3000, q: 2 });
    return 0.3;
  },
  compy_chirp: (s) => chirp(s, 2400, 3600, 0.08, 0.2, 'triangle'),
  raptor_screech: (s) => {
    chirp(s, 1400, 700, 0.5, 0.25, 'sawtooth');
    noiseBurst(s, { peak: 0.3, attack: 0.02, decay: 0.45, type: 'bandpass', freq: 2500, q: 3 });
    return 0.55;
  },
  raptor_die: (s) => {
    chirp(s, 900, 300, 0.6, 0.25, 'sawtooth');
    return 0.6;
  },
  dino_roar: (s) => growl(s, 60, 1.6, 0.8, 500),
  dino_die: (s) => growl(s, 50, 1.8, 0.7, 350),
  rex_roar: (s) => {
    growl(s, 42, 2.4, 1, 380);
    tone(s, { type: 'sine', freq: 40, freqEnd: 30, peak: 0.6, attack: 0.2, decay: 2.2 });
    return 2.5;
  },
  stomp: (s) => {
    tone(s, { type: 'sine', freq: 70, freqEnd: 30, peak: 0.9, decay: 0.35 });
    noiseBurst(s, { peak: 0.4, decay: 0.25, freq: 400, freqEnd: 80 });
    return 0.4;
  },
  wing_flap: (s) => {
    noiseBurst(s, { peak: 0.35, attack: 0.04, decay: 0.15, type: 'lowpass', freq: 600 });
    return 0.2;
  },
  player_hurt: (s) => {
    tone(s, { type: 'sawtooth', freq: 220, freqEnd: 90, peak: 0.5, decay: 0.3 });
    noiseBurst(s, { peak: 0.6, decay: 0.2, freq: 1200, freqEnd: 200 });
    return 0.35;
  },
  heartbeat: (s) => {
    tone(s, { type: 'sine', freq: 60, freqEnd: 40, peak: 0.7, decay: 0.12 });
    tone(s, { type: 'sine', freq: 55, freqEnd: 38, peak: 0.5, decay: 0.12, at: s.t + 0.18 });
    return 0.35;
  },
  pickup: (s) => arpeggio(s, [660, 880, 1320], 0.06, 0.18),
  pickup_health: (s) => arpeggio(s, [523, 659, 784, 1046], 0.07, 0.2, 'triangle'),
  weapon_get: (s) => {
    noiseBurst(s, { peak: 0.5, decay: 0.05, type: 'bandpass', freq: 1500, q: 5 });
    return arpeggio(s, [440, 554, 659, 880], 0.07, 0.2);
  },
  combo: (s) => arpeggio(s, [880, 1175], 0.05, 0.15),
  civilian_scream: (s) => {
    tone(s, { type: 'sawtooth', freq: 700, freqEnd: 950, peak: 0.12, attack: 0.05, decay: 0.6 });
    return 0.7;
  },
  civilian_saved: (s) => arpeggio(s, [523, 784, 1046], 0.08, 0.18, 'triangle'),
  civilian_shot: (s) => {
    tone(s, { type: 'square', freq: 300, freqEnd: 150, peak: 0.3, decay: 0.5 });
    return 0.5;
  },
  ui_click: (s) => chirp(s, 1200, 900, 0.05, 0.15, 'square'),
  ui_back: (s) => chirp(s, 700, 500, 0.06, 0.15, 'square'),
  ui_start: (s) => {
    gun(s, 2500, 160, 0.2, 0.8);
    return arpeggio(s, [392, 523, 659, 784], 0.07, 0.15);
  },
  banner: (s) => {
    noiseBurst(s, { peak: 0.4, attack: 0.3, decay: 0.4, type: 'bandpass', freq: 800, freqEnd: 3000, q: 1 });
    tone(s, { type: 'sine', freq: 80, peak: 0.5, attack: 0.3, decay: 0.6 });
    return 1;
  },
  boss_warning: (s) => {
    for (let i = 0; i < 3; i++) tone(s, { type: 'square', freq: 440, peak: 0.2, decay: 0.25, at: s.t + i * 0.45 });
    for (let i = 0; i < 3; i++) tone(s, { type: 'square', freq: 330, peak: 0.2, decay: 0.2, at: s.t + i * 0.45 + 0.22 });
    return 1.5;
  },
  stage_clear: (s) => arpeggio(s, [523, 659, 784, 1046, 784, 1046], 0.11, 0.2),
  game_over: (s) => arpeggio(s, [392, 330, 262, 196], 0.25, 0.22, 'triangle'),
  continue_tick: (s) => chirp(s, 880, 880, 0.08, 0.15, 'square'),
  score_tick: (s) => chirp(s, 1800, 1800, 0.02, 0.08, 'square'),
  engine_rev: (s) => {
    tone(s, { type: 'sawtooth', freq: 60, freqEnd: 140, peak: 0.25, attack: 0.1, decay: 0.8 });
    return 0.9;
  },
  crash: (s) => {
    noiseBurst(s, { peak: 0.9, decay: 0.7, freq: 4000, freqEnd: 300 });
    tone(s, { type: 'sine', freq: 90, freqEnd: 30, peak: 0.7, decay: 0.4 });
    return 0.8;
  },
  glass: (s) => {
    for (let i = 0; i < 6; i++) tone(s, { type: 'sine', freq: 2500 + Math.random() * 3000, peak: 0.08, decay: 0.2, at: s.t + Math.random() * 0.15 });
    noiseBurst(s, { peak: 0.4, decay: 0.3, type: 'highpass', freq: 3000 });
    return 0.5;
  },
  door: (s) => {
    noiseBurst(s, { peak: 0.5, decay: 0.4, freq: 600, freqEnd: 100 });
    tone(s, { type: 'triangle', freq: 120, freqEnd: 80, peak: 0.3, decay: 0.3 });
    return 0.5;
  },
  thunder: (s) => {
    noiseBurst(s, { peak: 0.9, attack: 0.05, decay: 2.5, freq: 800, freqEnd: 60 });
    tone(s, { type: 'sine', freq: 45, freqEnd: 30, peak: 0.6, attack: 0.1, decay: 2 });
    return 2.7;
  },
};
