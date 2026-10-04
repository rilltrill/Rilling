import type { MusicId } from './names';

interface Track {
  bpm: number;
  /** Root frequency (Hz). */
  root: number;
  /** Semitone offsets of the bass pattern (16 steps, null = rest). */
  bass: (number | null)[];
  /** Kick / snare / hat patterns (16 steps). */
  kick: number[];
  snare: number[];
  hat: number[];
  /** Pad chord intervals (semitones). */
  pad: number[];
  /** Lead motif (16 steps, semitone offsets, null = rest) played at higher intensity. */
  lead: (number | null)[];
  wave: OscillatorType;
}

const _ = null;
const TRACKS: Record<MusicId, Track> = {
  menu: {
    bpm: 96, root: 55, wave: 'sawtooth',
    bass: [0, _, _, 0, _, _, 3, _, 0, _, _, 0, _, 5, 3, _],
    kick: [1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0],
    snare: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
    hat: [0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0],
    pad: [0, 3, 7], lead: [12, _, _, 15, _, _, 14, _, 12, _, _, 10, _, _, 7, _],
  },
  zombie: {
    bpm: 112, root: 49, wave: 'sawtooth',
    bass: [0, _, 0, _, 1, _, 0, _, 0, _, 0, _, 3, _, 1, _],
    kick: [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1],
    snare: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
    hat: [1, 0, 1, 1, 1, 0, 1, 0, 1, 0, 1, 1, 1, 0, 1, 1],
    pad: [0, 1, 7], lead: [12, _, 13, _, 12, _, _, _, 15, _, 13, _, 12, _, _, _],
  },
  zombie_drive: {
    bpm: 140, root: 49, wave: 'sawtooth',
    bass: [0, 0, 12, 0, 0, 12, 0, 0, 3, 3, 15, 3, 1, 1, 13, 1],
    kick: [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0],
    snare: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 1, 0],
    hat: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    pad: [0, 3, 7], lead: [12, _, 15, _, 17, _, 15, _, 12, _, 10, _, 12, _, _, _],
  },
  dino: {
    bpm: 104, root: 55, wave: 'triangle',
    bass: [0, _, _, 0, _, _, 5, _, 7, _, _, 5, _, _, 3, _],
    kick: [1, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 0, 1, 0],
    snare: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
    hat: [0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1],
    pad: [0, 5, 7], lead: [12, _, _, 14, 15, _, 14, _, 12, _, _, 10, 12, _, _, _],
  },
  dino_drive: {
    bpm: 150, root: 55, wave: 'sawtooth',
    bass: [0, 0, 7, 0, 0, 7, 0, 5, 3, 3, 10, 3, 5, 5, 12, 5],
    kick: [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0],
    snare: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 1],
    hat: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    pad: [0, 3, 7], lead: [12, 12, 15, _, 14, _, 12, _, 10, 10, 12, _, 7, _, _, _],
  },
  boss: {
    bpm: 150, root: 46, wave: 'sawtooth',
    bass: [0, 0, 0, 0, 1, 1, 0, 0, 6, 6, 5, 5, 1, 1, 0, 0],
    kick: [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 1],
    snare: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
    hat: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    pad: [0, 1, 6], lead: [12, _, 13, _, 18, _, 17, _, 13, _, 12, _, 6, _, 7, _],
  },
  results: {
    bpm: 120, root: 65, wave: 'square',
    bass: [0, _, 0, _, 5, _, 5, _, 7, _, 7, _, 5, _, 4, _],
    kick: [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0],
    snare: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
    hat: [0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0],
    pad: [0, 4, 7], lead: [12, _, 16, _, 19, _, 16, _, 17, _, 21, _, 19, _, _, _],
  },
  gameover: {
    bpm: 70, root: 41, wave: 'triangle',
    bass: [0, _, _, _, _, _, _, _, 1, _, _, _, _, _, _, _],
    kick: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    snare: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    hat: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    pad: [0, 3, 6], lead: [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  },
};

const semi = (root: number, n: number) => root * Math.pow(2, n / 12);

/** Tiny look-ahead step sequencer for procedural background music. */
export class MusicPlayer {
  private track: Track | null = null;
  private trackId: MusicId | null = null;
  private step = 0;
  private nextTime = 0;
  private gain: GainNode;
  private intensity = 0;

  constructor(private ctx: AudioContext, out: AudioNode, private noise: AudioBuffer) {
    this.gain = ctx.createGain();
    this.gain.gain.value = 0;
    this.gain.connect(out);
  }

  play(id: MusicId) {
    if (this.trackId === id) return;
    this.trackId = id;
    this.track = TRACKS[id];
    this.step = 0;
    const t = this.ctx.currentTime;
    this.nextTime = t + 0.1;
    this.gain.gain.cancelScheduledValues(t);
    this.gain.gain.setValueAtTime(0, t);
    this.gain.gain.linearRampToValueAtTime(1, t + 0.8);
  }

  stop() {
    this.trackId = null;
    this.track = null;
    const t = this.ctx.currentTime;
    this.gain.gain.cancelScheduledValues(t);
    this.gain.gain.setTargetAtTime(0, t, 0.2);
  }

  setIntensity(v: number) {
    this.intensity = Math.max(0, Math.min(1, v));
  }

  update(_dt: number) {
    if (!this.track || this.ctx.state !== 'running') return;
    const ahead = this.ctx.currentTime + 0.15;
    if (this.nextTime < this.ctx.currentTime - 0.5) this.nextTime = this.ctx.currentTime + 0.05;
    while (this.nextTime < ahead) {
      this.schedule(this.track, this.step, this.nextTime);
      this.nextTime += 60 / this.track.bpm / 4;
      this.step = (this.step + 1) % 64;
    }
  }

  private schedule(tr: Track, step: number, t: number) {
    const s = step % 16;
    const bar = Math.floor(step / 16);
    const stepDur = 60 / tr.bpm / 4;
    const b = tr.bass[s];
    if (b !== null) this.note(semi(tr.root, b + (bar === 3 ? 5 : 0)), t, stepDur * 1.8, 0.16, tr.wave, 500);
    if (tr.kick[s]) this.kick(t);
    if (tr.snare[s]) this.snare(t);
    if (tr.hat[s]) this.hat(t, s % 4 === 2 ? 0.05 : 0.025);
    if (s === 0) for (const iv of tr.pad) this.note(semi(tr.root * 4, iv + (bar === 3 ? 5 : 0)), t, stepDur * 15, 0.025, 'triangle', 1800, 0.4);
    const l = tr.lead[s];
    if (l !== null && this.intensity > 0.4) this.note(semi(tr.root * 4, l), t, stepDur * 1.5, 0.05 * this.intensity, 'square', 2500);
  }

  private note(freq: number, t: number, dur: number, vol: number, wave: OscillatorType, cutoff: number, attack = 0.01) {
    const o = this.ctx.createOscillator();
    o.type = wave;
    o.frequency.value = freq;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = cutoff;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(f).connect(g).connect(this.gain);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  private kick(t: number) {
    const o = this.ctx.createOscillator();
    o.frequency.setValueAtTime(140, t);
    o.frequency.exponentialRampToValueAtTime(40, t + 0.12);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.5, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
    o.connect(g).connect(this.gain);
    o.start(t);
    o.stop(t + 0.25);
  }

  private snare(t: number) {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 1800;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.18, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.15);
    src.connect(f).connect(g).connect(this.gain);
    src.start(t, Math.random());
    src.stop(t + 0.2);
  }

  private hat(t: number, vol: number) {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const f = this.ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = 7000;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    src.connect(f).connect(g).connect(this.gain);
    src.start(t, Math.random());
    src.stop(t + 0.08);
  }
}
