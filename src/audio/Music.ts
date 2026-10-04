import type { MusicId } from './names';
import { TRACKS, PARTS, parseChords, validateTracks, type Chord, type Part, type SectionDef, type TrackDef } from './tracks';
import { bedLoop, drumKit, type BedName, type DrumKey, type DrumKit } from './drums';
import { shaperCurve, type NoiseBank } from './dsp';
import { SFX, type SfxContext } from './Sfx';
import type { SfxName } from './names';

/**
 * Procedural music: a look-ahead 16th-note sequencer playing the arrangements
 * in tracks.ts. Monophonic parts (bass/arp/lead) are persistent synth voices
 * driven by automation (zero nodes per note), recycled every 8 bars so their
 * automation timelines stay short; drums are pre-synthesised buffers (two
 * nodes per hit); pads/stabs/bells allocate a handful of nodes per chord.
 *
 * Works on any BaseAudioContext: for offline rendering call play(), then
 * scheduleUntil(seconds), then render.
 */

const LOOKAHEAD = 0.22;
const RECYCLE_BARS = 8;
const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

const DRUM_LAYER: Record<DrumKey, Part> = { k: 'kick', T: 'kick', b: 'kick', s: 'beat', c: 'beat', h: 'beat', o: 'beat', p: 'beat', r: 'beat', x: 'beat', t: 'perc', m: 'perc' };
const DRUM_VOL: Record<DrumKey, number> = { k: 0.38, T: 0.42, b: 0.4, s: 0.5, c: 0.4, h: 0.16, o: 0.13, p: 0.16, r: 0.22, x: 0.18, t: 0.28, m: 0.25 };
const VEL: Record<string, number> = { X: 1, x: 0.8, o: 0.45 };

// ─── Instruments ──────────────────────────────────────────────────────────────

interface MonoPreset {
  osc: { type: OscillatorType; mult?: number; detune?: number; gain?: number }[];
  cutoff: number;
  env: number;
  q?: number;
  fAttack?: number;
  fDecay: number;
  fSustain?: number;
  keyTrack?: number;
  attack: number;
  decay?: number;
  sustain?: number;
  release: number;
  level: number;
  glide?: number;
  vib?: { rate: number; depth: number; delay: number };
  drive?: number;
  /** Fraction of the step length the note is held. */
  gate?: number;
}

const MONO: Record<string, MonoPreset> = {
  // bass
  pulse: { osc: [{ type: 'sawtooth' }, { type: 'square', mult: 0.5, gain: 0.5 }], cutoff: 160, env: 1300, q: 5, fDecay: 0.08, fSustain: 0.12, keyTrack: 1.5, attack: 0.004, decay: 0.2, sustain: 0.6, release: 0.05, level: 0.27, gate: 0.75 },
  drive: { osc: [{ type: 'sawtooth', detune: -7 }, { type: 'sawtooth', detune: 7 }, { type: 'sine', mult: 0.5, gain: 0.7 }], cutoff: 240, env: 1700, q: 3, fDecay: 0.09, fSustain: 0.2, keyTrack: 1, attack: 0.003, decay: 0.15, sustain: 0.75, release: 0.04, level: 0.17, drive: 2.5, gate: 0.8 },
  dist: { osc: [{ type: 'sawtooth' }, { type: 'square', detune: 9, gain: 0.6 }, { type: 'sine', mult: 0.5, gain: 0.8 }], cutoff: 380, env: 1500, q: 2, fDecay: 0.1, fSustain: 0.35, attack: 0.003, sustain: 0.85, release: 0.04, level: 0.13, drive: 7, gate: 0.82 },
  round: { osc: [{ type: 'triangle' }, { type: 'sine', mult: 0.5, gain: 0.8 }, { type: 'sawtooth', gain: 0.12 }], cutoff: 600, env: 900, q: 1, fDecay: 0.12, fSustain: 0.3, attack: 0.005, decay: 0.3, sustain: 0.55, release: 0.08, level: 0.25, gate: 0.85 },
  sub: { osc: [{ type: 'sine' }, { type: 'triangle', gain: 0.35 }, { type: 'sawtooth', gain: 0.06 }], cutoff: 500, env: 120, fDecay: 0.3, attack: 0.08, sustain: 1, release: 0.5, level: 0.085, gate: 0.95 },
  // arps
  pluck: { osc: [{ type: 'square' }], cutoff: 450, env: 3200, q: 4, fDecay: 0.06, fSustain: 0, keyTrack: 1, attack: 0.002, decay: 0.13, sustain: 0, release: 0.05, level: 0.15, gate: 0.6 },
  glass: { osc: [{ type: 'triangle' }, { type: 'sine', mult: 2, gain: 0.4 }], cutoff: 3000, env: 800, fDecay: 0.2, attack: 0.003, decay: 0.55, sustain: 0, release: 0.3, level: 0.15, gate: 0.9 },
  marimba: { osc: [{ type: 'sine' }, { type: 'sine', mult: 4, gain: 0.16 }, { type: 'triangle', gain: 0.3 }], cutoff: 4000, env: 0, fDecay: 0.1, attack: 0.002, decay: 0.24, sustain: 0, release: 0.06, level: 0.2, gate: 0.6 },
  saw: { osc: [{ type: 'sawtooth', detune: -5 }, { type: 'sawtooth', detune: 5 }], cutoff: 500, env: 2800, q: 3, fDecay: 0.07, fSustain: 0.05, keyTrack: 0.8, attack: 0.002, decay: 0.1, sustain: 0.15, release: 0.04, level: 0.1, gate: 0.6 },
  // leads
  theremin: { osc: [{ type: 'sine' }, { type: 'triangle', gain: 0.35 }], cutoff: 3000, env: 0, fDecay: 0.1, attack: 0.08, sustain: 1, release: 0.3, level: 0.075, glide: 0.06, vib: { rate: 5.5, depth: 30, delay: 0.12 }, gate: 0.96 },
  brass: { osc: [{ type: 'sawtooth', detune: -7 }, { type: 'sawtooth', detune: 7 }], cutoff: 350, env: 2300, q: 1.5, fAttack: 0.07, fDecay: 0.4, fSustain: 0.55, keyTrack: 1, attack: 0.04, sustain: 0.85, release: 0.12, level: 0.1, glide: 0.015, vib: { rate: 5.2, depth: 14, delay: 0.2 }, gate: 0.94 },
  sawLead: { osc: [{ type: 'sawtooth', detune: -10 }, { type: 'sawtooth', detune: 10 }, { type: 'square', mult: 0.5, gain: 0.3 }], cutoff: 1000, env: 2400, q: 2, fDecay: 0.2, fSustain: 0.5, keyTrack: 0.5, attack: 0.01, sustain: 0.85, release: 0.1, level: 0.085, glide: 0.02, vib: { rate: 6, depth: 12, delay: 0.15 }, gate: 0.94 },
};
// Leads named 'saw' use the lead variant.
const LEAD_ALIAS: Record<string, string> = { saw: 'sawLead' };

interface PadPreset {
  waves: OscillatorType[];
  detune: number;
  type: BiquadFilterType;
  cutoff: number;
  q: number;
  attack: number;
  release: number;
  level: number;
}
const PADS: Record<string, PadPreset> = {
  dark: { waves: ['sawtooth', 'sawtooth'], detune: 9, type: 'lowpass', cutoff: 650, q: 1, attack: 0.6, release: 0.9, level: 0.04 },
  strings: { waves: ['sawtooth', 'sawtooth'], detune: 12, type: 'lowpass', cutoff: 1500, q: 0.8, attack: 0.35, release: 0.6, level: 0.032 },
  choir: { waves: ['triangle', 'sawtooth'], detune: 7, type: 'lowpass', cutoff: 1000, q: 4, attack: 0.8, release: 1.2, level: 0.05 },
  warm: { waves: ['triangle', 'triangle'], detune: 6, type: 'lowpass', cutoff: 2000, q: 0.7, attack: 0.25, release: 0.5, level: 0.06 },
};

/** Persistent monophonic synth voice. */
class Mono {
  private oscs: { o: OscillatorNode; mult: number }[] = [];
  private filter: BiquadFilterNode;
  private vca: GainNode;
  private vibGain: GainNode | null = null;
  private vibOsc: OscillatorNode | null = null;
  private nodes: AudioNode[] = [];
  lastEnd = 0;

  constructor(private ctx: BaseAudioContext, readonly p: MonoPreset, dest: AudioNode, at: number) {
    this.filter = ctx.createBiquadFilter();
    this.filter.type = 'lowpass';
    this.filter.Q.value = p.q ?? 0.8;
    this.filter.frequency.value = p.cutoff;
    this.vca = ctx.createGain();
    this.vca.gain.value = 0;
    if (p.drive) {
      const w = ctx.createWaveShaper();
      w.curve = shaperCurve(p.drive) as Float32Array<ArrayBuffer>;
      this.filter.connect(w).connect(this.vca);
      this.nodes.push(w);
    } else this.filter.connect(this.vca);
    this.vca.connect(dest);
    if (p.vib) {
      this.vibOsc = ctx.createOscillator();
      this.vibOsc.frequency.value = p.vib.rate;
      this.vibGain = ctx.createGain();
      this.vibGain.gain.value = 0;
      this.vibOsc.connect(this.vibGain);
      this.vibOsc.start(at);
    }
    for (const spec of p.osc) {
      const o = ctx.createOscillator();
      o.type = spec.type;
      o.detune.value = spec.detune ?? 0;
      o.frequency.value = 110 * (spec.mult ?? 1);
      const g = ctx.createGain();
      g.gain.value = spec.gain ?? 1;
      o.connect(g).connect(this.filter);
      if (this.vibGain) this.vibGain.connect(o.detune);
      o.start(at);
      this.oscs.push({ o, mult: spec.mult ?? 1 });
      this.nodes.push(g);
    }
  }

  note(t: number, f: number, dur: number, vel: number) {
    const p = this.p;
    const nyq = this.ctx.sampleRate * 0.45;
    for (const { o, mult } of this.oscs) {
      const fp = o.frequency;
      fp.cancelScheduledValues(t);
      if (p.glide && this.lastEnd > t - 0.05) fp.setTargetAtTime(f * mult, t, p.glide);
      else fp.setValueAtTime(f * mult, t);
    }
    const g = this.vca.gain;
    g.cancelScheduledValues(t);
    const peak = p.level * vel;
    g.setTargetAtTime(peak, t, Math.max(0.001, p.attack / 3));
    const sus = p.sustain ?? 1;
    if (sus < 1) g.setTargetAtTime(peak * sus, t + p.attack, Math.max(0.004, (p.decay ?? 0.2) / 3));
    const end = t + Math.max(dur, p.attack);
    g.setTargetAtTime(0, end, Math.max(0.004, p.release / 3));
    const ff = this.filter.frequency;
    ff.cancelScheduledValues(t);
    const base = Math.min(nyq, p.cutoff + f * (p.keyTrack ?? 0));
    const top = Math.min(nyq, base + p.env * vel);
    const fa = p.fAttack ?? 0.003;
    ff.setTargetAtTime(top, t, Math.max(0.001, fa / 3));
    ff.setTargetAtTime(base + (top - base) * (p.fSustain ?? 0), t + fa, Math.max(0.004, p.fDecay / 3));
    if (this.vibGain && p.vib) {
      const vg = this.vibGain.gain;
      vg.cancelScheduledValues(t);
      vg.setTargetAtTime(0, t, 0.02);
      if (dur > p.vib.delay) vg.setTargetAtTime(p.vib.depth, t + p.vib.delay, 0.12);
    }
    this.lastEnd = end;
  }

  stop(at: number) {
    for (const { o } of this.oscs) o.stop(at);
    this.vibOsc?.stop(at);
  }

  disconnect() {
    try {
      for (const { o } of this.oscs) o.disconnect();
      this.vibOsc?.disconnect();
      this.vibGain?.disconnect();
      for (const n of this.nodes) n.disconnect();
      this.filter.disconnect();
      this.vca.disconnect();
    } catch {
      /* already gone */
    }
  }
}

// ─── Arrangement compilation ──────────────────────────────────────────────────

interface Sec {
  def: SectionDef;
  chords: Chord[];
  drums: [DrumKey, string][];
  fill: [DrumKey, string][] | null;
  lead: { notes: ({ semi: number; len: number } | undefined)[]; len: number } | null;
}
interface BarRef {
  sec: Sec;
  b: number;
  first: boolean;
  last: boolean;
}

function parseLead(str: string): Sec['lead'] {
  const notes: ({ semi: number; len: number } | undefined)[] = [];
  let pos = 0;
  for (const tok of str.replace(/\|/g, ' ').trim().split(/\s+/)) {
    const [a, b] = tok.split(':');
    const len = Math.max(1, Number(b) || 1);
    if (a !== '_') notes[pos] = { semi: Number(a), len };
    pos += len;
  }
  return { notes, len: pos };
}

function drumList(d: SectionDef['drums']): [DrumKey, string][] {
  return d ? (Object.entries(d) as [DrumKey, string][]) : [];
}

const compiled = new Map<MusicId, { bars: BarRef[]; loopBar: number }>();
function compile(id: MusicId, def: TrackDef) {
  let c = compiled.get(id);
  if (c) return c;
  const secs = new Map<string, Sec>();
  for (const [name, sd] of Object.entries(def.sections)) {
    secs.set(name, { def: sd, chords: parseChords(sd.chords), drums: drumList(sd.drums), fill: sd.fill ? drumList(sd.fill) : null, lead: sd.lead ? parseLead(sd.lead) : null });
  }
  const bars: BarRef[] = [];
  let loopBar = 0;
  def.order.forEach((name, i) => {
    const sec = secs.get(name)!;
    if (i === (def.loop ?? 0)) loopBar = bars.length;
    for (let b = 0; b < sec.def.bars; b++) bars.push({ sec, b, first: b === 0, last: b === sec.def.bars - 1 });
  });
  c = { bars, loopBar };
  compiled.set(id, c);
  return c;
}

/** Chord root folded into -5..+6 semitones so voices stay near the key. */
const fold = (root: number) => {
  let r = ((root % 12) + 12) % 12;
  if (r > 6) r -= 12;
  return r;
};

// ─── One playing track ────────────────────────────────────────────────────────

/** Debug/test knobs shared by a player's tracks. */
export interface MusicDebug {
  /** Only this part is audible (mix analysis). */
  solo: Part | null;
}

/**
 * Where the player gets its pre-synthesised samples. The live game bakes them
 * in the background (AudioSystem), so either may be null for the first moments:
 * a track starts straight away on its synths and the drums join as soon as
 * the kit exists; ambience beds fade in once they exist.
 */
export interface MusicAssets {
  kit(): DrumKit | null;
  bed(name: BedName): AudioBuffer | null;
}

/** Ambience beds per ambience kind: [bed, level, playback rate]. */
const BEDS: Record<NonNullable<TrackDef['amb']>, [BedName, number, number][]> = {
  city: [['wind', 0.11, 1]],
  storm: [['wind', 0.15, 0.7]],
  wind: [['wind', 0.15, 0.7]],
  jungle: [
    ['insects', 0.07, 1],
    ['wind', 0.06, 1.3],
  ],
};

class TrackPlayer {
  readonly out: GainNode;
  private parts = {} as Record<Part, GainNode>;
  private partOn = {} as Record<Part, number>;
  private bass: Mono | null = null;
  private arp: Mono | null = null;
  private lead: Mono | null = null;
  private retired: { m: Mono; at: number }[] = [];
  private fxNodes: AudioNode[] = [];
  private step = 0;
  private nextTime = 0;
  private readonly stepDur: number;
  private readonly bars: BarRef[];
  private readonly loopBar: number;
  private stopped = false;
  private beds: AudioBufferSourceNode[] = [];
  /** Beds still waiting for their loop to be baked. */
  private bedsTodo: [BedName, number, number][] = [];
  private nextEvent = 0;
  private nextBigEvent = 0;
  killAt = Infinity;

  constructor(
    private ctx: BaseAudioContext,
    readonly id: MusicId,
    private def: TrackDef,
    dest: AudioNode,
    verb: AudioNode | null,
    private dbg: MusicDebug,
    private noise: { white: AudioBuffer; bank?: NoiseBank } | null,
    private assets: MusicAssets,
  ) {
    this.stepDur = 60 / def.bpm / 4;
    const c = compile(id, def);
    this.bars = c.bars;
    this.loopBar = c.loopBar;
    this.out = ctx.createGain();
    this.out.gain.value = 0;
    this.out.connect(dest);

    // Echo for arps/leads (dotted eighth).
    const dIn = ctx.createGain();
    const delay = ctx.createDelay(2);
    delay.delayTime.value = this.stepDur * 3;
    const fb = ctx.createGain();
    fb.gain.value = 0.32;
    const dlp = ctx.createBiquadFilter();
    dlp.type = 'lowpass';
    dlp.frequency.value = 2400;
    const wet = ctx.createGain();
    wet.gain.value = 0.32;
    dIn.connect(delay);
    delay.connect(dlp).connect(fb).connect(delay);
    delay.connect(wet).connect(this.out);
    this.fxNodes.push(dIn, delay, fb, dlp, wet);

    const verbSend: Partial<Record<Part, number>> = { pad: 0.35, lead: 0.3, arp: 0.2, beat: 0.1, perc: 0.22, stab: 0.25, kick: 0.04, amb: 0.55 };
    const echoSend: Partial<Record<Part, number>> = { arp: 0.35, lead: 0.22 };
    for (const p of PARTS) {
      const g = ctx.createGain();
      g.gain.value = 0;
      g.connect(this.out);
      this.parts[p] = g;
      this.partOn[p] = 0;
      const es = echoSend[p];
      if (es) {
        const s = ctx.createGain();
        s.gain.value = es;
        g.connect(s).connect(dIn);
        this.fxNodes.push(s);
      }
      const vs = verbSend[p];
      if (verb && vs) {
        const s = ctx.createGain();
        s.gain.value = vs;
        g.connect(s).connect(verb);
        this.fxNodes.push(s);
      }
    }
  }

  start(t: number, fade: number, startBar = 0) {
    this.nextTime = t;
    this.step = startBar * 16;
    this.makeVoices(t);
    this.bedsTodo = this.def.amb ? BEDS[this.def.amb].slice() : [];
    this.startBeds(t, 0.05);
    this.nextEvent = t + 2 + Math.random() * 4;
    this.nextBigEvent = t + 10 + Math.random() * 10;
    const g = this.out.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(0, t);
    g.linearRampToValueAtTime(1, t + Math.max(0.05, fade));
  }

  private makeVoices(t: number) {
    const def = this.def;
    this.bass = new Mono(this.ctx, MONO[def.bass] ?? MONO.round, this.parts.bass, t);
    this.arp = def.arp && MONO[def.arp] ? new Mono(this.ctx, MONO[def.arp], this.parts.arp, t) : null;
    const lp = def.lead ? LEAD_ALIAS[def.lead] ?? def.lead : '';
    this.lead = lp && MONO[lp] ? new Mono(this.ctx, MONO[lp], this.parts.lead, t) : null;
  }

  /** Swap in fresh synth voices so automation timelines never grow unbounded. */
  private recycle(t: number) {
    for (const m of [this.bass, this.arp, this.lead]) {
      if (!m) continue;
      const end = Math.max(t, m.lastEnd) + m.p.release + 0.3;
      m.stop(end);
      this.retired.push({ m, at: end + 0.1 });
    }
    this.makeVoices(t - 0.02);
  }

  fadeOut(t: number, dur: number) {
    this.stopped = true;
    const g = this.out.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(0, t + dur);
    this.killAt = t + dur + 0.2;
    for (const b of this.beds) b.stop(t + dur + 0.1);
  }

  setIntensity(I: number, now: number, immediate: boolean) {
    const def = this.def;
    const level = def.reactive === false ? 1 : Math.max(def.floor ?? 0, I);
    for (const p of PARTS) {
      const th = def.layers?.[p] ?? 0;
      let v = 1;
      if (th > 0) {
        const x = clamp01((level - th + 0.08) / 0.16);
        v = x * x * (3 - 2 * x);
      }
      if (Math.abs(v - this.partOn[p]) < 0.02 && !immediate) continue;
      this.partOn[p] = v;
      const target = this.dbg.solo && this.dbg.solo !== p ? 0 : v * (def.mix?.[p] ?? 1);
      const g = this.parts[p].gain;
      if (immediate) {
        g.cancelScheduledValues(now);
        g.setValueAtTime(target, now);
      } else g.setTargetAtTime(target, now, 0.45);
    }
  }

  private on(p: Part) {
    return this.partOn[p] > 0.02;
  }

  scheduleUntil(time: number, now: number) {
    if (this.stopped) return;
    // Fell behind (tab stall, long frame)? Skip ahead on the step grid.
    if (this.nextTime < now - 0.05) {
      const skip = Math.ceil((now - this.nextTime) / this.stepDur);
      this.step += skip;
      this.nextTime += skip * this.stepDur;
    }
    while (this.nextTime < time) {
      if (this.step > 0 && this.step % (16 * RECYCLE_BARS) === 0) this.recycle(this.nextTime);
      this.scheduleStep(this.step, this.nextTime);
      this.nextTime += this.stepDur;
      this.step++;
    }
    if (this.retired.length && this.retired[0].at < now) {
      const r = this.retired.shift()!;
      r.m.disconnect();
    }
  }

  private barAt(n: number): BarRef {
    const bars = this.bars;
    if (n < bars.length) return bars[n];
    const loopLen = bars.length - this.loopBar;
    return bars[this.loopBar + ((n - bars.length) % loopLen)];
  }

  private scheduleStep(step: number, t: number) {
    const s16 = step % 16;
    const barN = Math.floor(step / 16);
    const bar = this.barAt(barN);
    const sec = bar.sec;
    const sd = sec.def;
    const def = this.def;
    const chord = sec.chords[bar.b % sec.chords.length];
    const r = fold(chord.root);
    const sDur = this.stepDur;
    const local = bar.b * 16 + s16;

    // Drums.
    const drums = bar.last && sec.fill ? sec.fill : sec.drums;
    for (const [k, pat] of drums) {
      const c = pat[local % pat.length];
      if (c === '.' || c === undefined) continue;
      this.hit(k, t, VEL[c] ?? 0.8);
    }
    if (bar.first && s16 === 0 && barN > 0 && sd.crash !== false) this.hit('x', t, 0.8);
    if (s16 === 0 && this.bedsTodo.length) this.startBeds(t, 2);
    if (s16 === 0 && def.amb && this.on('amb')) this.ambience(t, sDur * 16);
    if (sd.riser && bar.last && s16 === 0 && this.on('beat')) this.riser(t, sDur * 16);

    // Bass.
    if (sd.bass && this.bass && this.on('bass')) {
      const c = sd.bass[s16 % sd.bass.length];
      const off = bassOffset(c, chord);
      if (off !== null) {
        let len = 1;
        while (sd.bass[(s16 + len) % sd.bass.length] === '-' && s16 + len < 16) len++;
        const vel = s16 % 4 === 0 ? 1 : 0.86;
        this.bass.note(t, mtof(def.key + r + off), len * sDur * (this.bass.p.gate ?? 0.8), vel);
      }
    }

    // Pad: once per run of identical chords.
    if (s16 === 0 && sd.pad !== false && def.pad && this.on('pad')) {
      const prev = bar.b > 0 ? sec.chords[(bar.b - 1) % sec.chords.length] : null;
      if (!prev || prev.key !== chord.key || bar.first) {
        let run = 1;
        while (bar.b + run < sd.bars && sec.chords[(bar.b + run) % sec.chords.length].key === chord.key) run++;
        const preset = typeof sd.pad === 'string' ? sd.pad : def.pad;
        this.pad(t, run * 16 * sDur, chord, r, PADS[preset] ?? PADS.dark);
      }
    }

    // Arp.
    if (sd.arp && this.arp && this.on('arp')) {
      const c = sd.arp[s16 % sd.arp.length];
      if (c >= '0' && c <= '9') {
        const idx = c.charCodeAt(0) - 48;
        const iv = chord.iv;
        const semi = iv[idx % iv.length] + 12 * Math.floor(idx / iv.length);
        const vel = s16 % 4 === 0 ? 1 : 0.8;
        this.arp.note(t, mtof(def.key + 24 + (def.arpOct ?? 0) * 12 + r + semi), sDur * (this.arp.p.gate ?? 0.6), vel);
      }
    }

    // Lead.
    if (sec.lead && this.on('lead')) {
      const n = sec.lead.notes[local % sec.lead.len];
      if (n) {
        const f = mtof(def.key + 24 + (def.leadOct ?? 0) * 12 + n.semi);
        const dur = n.len * sDur;
        if (def.lead === 'bell') this.bellNote(t, f, dur);
        else if (this.lead) this.lead.note(t, f, dur * (this.lead.p.gate ?? 0.94), 0.9 + 0.1 * Math.random());
      }
    }

    // Stabs.
    if (sd.stab && def.stab && this.on('stab')) {
      const c = sd.stab[s16 % sd.stab.length];
      if (c === 'X' || c === 'x') this.stab(t, c === 'X' ? sDur * 2.5 : sDur * 1.2, chord, r, def.stab);
    }
  }

  // ─── Ambience ───────────────────────────────────────────────────────────────

  /** Start whichever ambience loops are available (the rest retry each bar), fading in over `fade` s. */
  private startBeds(t: number, fade: number) {
    for (let i = this.bedsTodo.length - 1; i >= 0; i--) {
      const [name, level, rate] = this.bedsTodo[i];
      const buf = this.assets.bed(name);
      if (!buf) continue;
      this.bedsTodo.splice(i, 1);
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      src.playbackRate.value = rate;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(level, t + fade);
      src.connect(g).connect(this.parts.amb);
      src.start(t, Math.random() * buf.duration);
      this.beds.push(src);
      this.fxNodes.push(g);
    }
  }

  /** Occasional distant events, rolled once per bar. */
  private ambience(t: number, barDur: number) {
    const amb = this.def.amb!;
    if (amb === 'wind') return;
    if (t >= this.nextEvent) {
      const at = t + Math.random() * barDur;
      const r = Math.random();
      if (amb === 'jungle') {
        this.bird(at);
        this.nextEvent = t + 2.5 + Math.random() * 5;
      } else if (amb === 'city') {
        if (r < 0.35) this.siren(at);
        else if (r < 0.6) this.howl(at);
        else this.distant(r < 0.85 ? 'zombie_groan' : 'metal_clang', at, 0.3, 900);
        this.nextEvent = t + 7 + Math.random() * 9;
      } else {
        this.distant('thunder', at, 0.45, 700);
        this.nextEvent = t + 12 + Math.random() * 14;
      }
    }
    if (amb === 'jungle' && t >= this.nextBigEvent) {
      const at = t + Math.random() * barDur;
      this.distant(Math.random() < 0.6 ? 'roar_distant' : 'ptero_cry', at, 0.35, 1400);
      this.nextBigEvent = t + 18 + Math.random() * 18;
    }
  }

  /** A far-away SFX recipe: quiet, darkened, mostly reverb. */
  private distant(name: SfxName, at: number, vol: number, lp: number) {
    if (!this.noise) return;
    const ctx = this.ctx;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = lp;
    const g = ctx.createGain();
    g.gain.value = vol;
    g.connect(f).connect(this.parts.amb);
    const s: SfxContext = { ctx, out: g, t: at, pitch: 0.85 + Math.random() * 0.25, noise: this.noise.white, bank: this.noise.bank };
    try {
      SFX[name](s);
    } catch {
      /* cosmetic */
    }
  }

  /** Synth birdsong: whistles, trills and descending calls. */
  private bird(at: number) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    const vol = 0.05 + Math.random() * 0.05;
    const p = o.frequency;
    const a = g.gain;
    a.setValueAtTime(0, at);
    const kind = Math.floor(Math.random() * 3);
    const base = 1700 + Math.random() * 1600;
    let end = at;
    const chirp = (t0: number, f0: number, f1: number, d: number) => {
      p.setValueAtTime(f0, t0);
      p.exponentialRampToValueAtTime(f1, t0 + d);
      a.setValueAtTime(0, t0);
      a.linearRampToValueAtTime(vol, t0 + d * 0.2);
      a.linearRampToValueAtTime(0, t0 + d);
      end = t0 + d;
    };
    if (kind === 0) {
      chirp(at, base, base * 1.45, 0.24);
      chirp(at + 0.3, base * 1.4, base * 1.1, 0.2);
    } else if (kind === 1) {
      const n = 6 + Math.floor(Math.random() * 6);
      for (let i = 0; i < n; i++) chirp(at + i * 0.06, base * (i % 2 ? 1.12 : 1), base * (i % 2 ? 1.05 : 1.15), 0.04);
    } else {
      for (let i = 0; i < 3; i++) chirp(at + i * 0.2, base * 1.3 * (1 - i * 0.06), base * 0.9, 0.12);
    }
    o.connect(g).connect(this.parts.amb);
    o.start(at);
    o.stop(end + 0.05);
  }

  /** Far-off air-raid style siren wail. */
  private siren(at: number) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = 'triangle';
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 1100;
    const g = ctx.createGain();
    const D = 6;
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(0.05, at + 1.5);
    g.gain.setValueAtTime(0.05, at + D - 2);
    g.gain.linearRampToValueAtTime(0, at + D);
    for (let i = 0; i < 3; i++) {
      o.frequency.setValueAtTime(480, at + i * 2);
      o.frequency.linearRampToValueAtTime(760, at + i * 2 + 1.1);
      o.frequency.linearRampToValueAtTime(480, at + i * 2 + 2);
    }
    o.connect(f).connect(g).connect(this.parts.amb);
    o.start(at);
    o.stop(at + D + 0.05);
  }

  /** Distant dog/wolf howl. */
  private howl(at: number) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    const v = ctx.createOscillator();
    v.frequency.value = 5.5;
    const vg = ctx.createGain();
    vg.gain.value = 12;
    v.connect(vg).connect(o.detune);
    const base = 480 + Math.random() * 120;
    o.frequency.setValueAtTime(base, at);
    o.frequency.exponentialRampToValueAtTime(base * 1.5, at + 0.45);
    o.frequency.exponentialRampToValueAtTime(base * 1.2, at + 1.9);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(0.045, at + 0.3);
    g.gain.setValueAtTime(0.045, at + 1.3);
    g.gain.linearRampToValueAtTime(0, at + 2);
    o.connect(g).connect(this.parts.amb);
    o.start(at);
    v.start(at);
    o.stop(at + 2.05);
    v.stop(at + 2.05);
  }

  private hit(k: DrumKey, t: number, vel: number) {
    const layer = DRUM_LAYER[k];
    const kit = this.assets.kit();
    if (!kit || !this.on(layer)) return;
    const src = this.ctx.createBufferSource();
    src.buffer = kit[k];
    const g = this.ctx.createGain();
    g.gain.value = DRUM_VOL[k] * vel * (0.94 + Math.random() * 0.06);
    src.connect(g).connect(this.parts[layer]);
    src.start(t);
  }

  private riser(t: number, dur: number) {
    const kit = this.assets.kit();
    if (!kit) return;
    const src = this.ctx.createBufferSource();
    src.buffer = kit.riser;
    src.playbackRate.value = Math.max(0.5, Math.min(2.5, 2 / dur));
    const g = this.ctx.createGain();
    g.gain.value = 0.22;
    src.connect(g).connect(this.parts.beat);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  private pad(t: number, dur: number, chord: Chord, r: number, p: PadPreset) {
    const ctx = this.ctx;
    const key = this.def.key;
    const lo = key + 19;
    const notes = chord.iv.slice(0, 4).map((iv) => {
      let n = key + 24 + r + iv;
      while (n < lo) n += 12;
      while (n >= lo + 12) n -= 12;
      return n;
    });
    notes.push(key + 12 + r);
    const f = ctx.createBiquadFilter();
    f.type = p.type;
    f.Q.value = p.q;
    f.frequency.setValueAtTime(p.cutoff * 0.7, t);
    f.frequency.linearRampToValueAtTime(p.cutoff, t + dur * 0.5);
    f.frequency.linearRampToValueAtTime(p.cutoff * 0.75, t + dur);
    const g = ctx.createGain();
    const end = t + dur;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(p.level, t + p.attack);
    g.gain.setValueAtTime(p.level, end);
    g.gain.linearRampToValueAtTime(0, end + p.release);
    f.connect(g).connect(this.parts.pad);
    notes.forEach((n, i) => {
      p.waves.forEach((w, j) => {
        const o = ctx.createOscillator();
        o.type = w;
        o.frequency.value = mtof(n);
        o.detune.value = (j === 0 ? -1 : 1) * p.detune * (1 + i * 0.13);
        o.connect(f);
        o.start(t);
        o.stop(end + p.release + 0.05);
      });
    });
  }

  private stab(t: number, dur: number, chord: Chord, r: number, kind: string) {
    const ctx = this.ctx;
    const key = this.def.key;
    const root = key + 12 + r;
    const notes = kind === 'power' ? [root, root + 7, root + 12] : [root + 12, root + 12 + chord.iv[1], root + 19, root + 24];
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.Q.value = 2;
    const top = kind === 'power' ? 2600 : 3200;
    f.frequency.setValueAtTime(top, t);
    f.frequency.setTargetAtTime(kind === 'power' ? 500 : 900, t + 0.01, 0.08);
    const g = ctx.createGain();
    const lvl = kind === 'power' ? 0.07 : 0.05;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(lvl, t + (kind === 'power' ? 0.004 : 0.02));
    g.gain.setTargetAtTime(0, t + dur, 0.05);
    let dest: AudioNode = g;
    if (kind === 'power') {
      const w = ctx.createWaveShaper();
      w.curve = shaperCurve(3) as Float32Array<ArrayBuffer>;
      w.connect(g);
      dest = w;
    }
    f.connect(dest);
    g.connect(this.parts.stab);
    for (const n of notes) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = mtof(n);
      o.detune.value = (Math.random() - 0.5) * 14;
      o.connect(f);
      o.start(t);
      o.stop(t + dur + 0.35);
    }
  }

  private bellNote(t: number, f: number, dur: number) {
    const ctx = this.ctx;
    const car = ctx.createOscillator();
    car.frequency.value = f;
    const mod = ctx.createOscillator();
    mod.frequency.value = f * 3.5;
    const mg = ctx.createGain();
    mg.gain.setValueAtTime(f * 1.6, t);
    mg.gain.exponentialRampToValueAtTime(f * 0.08, t + 0.8);
    mod.connect(mg).connect(car.frequency);
    const g = ctx.createGain();
    const len = Math.max(1.4, dur * 1.2);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.24, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    car.connect(g).connect(this.parts.lead);
    car.start(t);
    mod.start(t);
    car.stop(t + len + 0.05);
    mod.stop(t + len + 0.05);
  }

  dispose() {
    this.stopped = true;
    const t = this.ctx.currentTime;
    for (const b of this.beds) {
      try {
        b.stop(t + 0.05);
        b.disconnect();
      } catch {
        /* already stopped */
      }
    }
    this.beds.length = 0;
    for (const m of [this.bass, this.arp, this.lead]) {
      if (!m) continue;
      try {
        m.stop(t + 0.05);
      } catch {
        /* already stopped */
      }
      m.disconnect();
    }
    for (const r of this.retired) r.m.disconnect();
    this.retired.length = 0;
    try {
      for (const p of PARTS) this.parts[p].disconnect();
      for (const n of this.fxNodes) n.disconnect();
      this.out.disconnect();
    } catch {
      /* already gone */
    }
  }
}

function bassOffset(c: string | undefined, chord: Chord): number | null {
  switch (c) {
    case 'R': return 0;
    case 'O': return 12;
    case 'L': return -12;
    case '5': return 7;
    case '3': return chord.iv[1] ?? 4;
    case 'b': return 10;
    case '4': return 5;
    case '2': return 14;
    default: return null;
  }
}

// ─── Public player ────────────────────────────────────────────────────────────

export class MusicPlayer {
  private cur: TrackPlayer | null = null;
  private dying: TrackPlayer[] = [];
  private readonly assets: MusicAssets;
  private target = 0;
  private level = 0;
  private lastApplied = -1;
  private slowDt = 0;
  readonly debug: MusicDebug = { solo: null };

  private noise: { white: AudioBuffer; bank?: NoiseBank } | null;

  /**
   * `noise`: the SFX noise bank (or a white-noise buffer) used by ambience events.
   * `assets`: sample source; default builds the kit/beds synchronously on first use
   * (offline renders, tests).
   */
  constructor(
    private ctx: BaseAudioContext,
    private out: AudioNode,
    noise?: NoiseBank | AudioBuffer | null,
    private verb: AudioNode | null = null,
    assets?: MusicAssets,
  ) {
    if (!noise) this.noise = null;
    else if ('white' in noise) this.noise = { white: noise.white, bank: noise };
    else this.noise = { white: noise };
    this.assets = assets ?? { kit: () => drumKit(ctx), bed: (n) => bedLoop(ctx, n) };
  }

  get current(): MusicId | null {
    return this.cur?.id ?? null;
  }

  /** Start (cross-fade to) a track. `startBar` skips into the arrangement (tests). */
  play(id: MusicId, startBar = 0) {
    if (this.cur?.id === id) return;
    const def = TRACKS[id];
    if (!def) return;
    // Resolve the kit (may synthesise it, offline) before reading the clock, so
    // the track never starts in the past and drops its first steps.
    this.assets.kit();
    const t = this.ctx.currentTime;
    if (this.cur) {
      this.cur.fadeOut(t, 1.1);
      this.dying.push(this.cur);
    }
    const tp = new TrackPlayer(this.ctx, id, def, this.out, this.verb, this.debug, this.noise, this.assets);
    tp.setIntensity(this.level, t, true);
    tp.start(t + 0.06, def.fadeIn ?? (this.cur ? 0.9 : 0.5), startBar);
    this.cur = tp;
  }

  stop() {
    if (!this.cur) return;
    this.cur.fadeOut(this.ctx.currentTime, 1.6);
    this.dying.push(this.cur);
    this.cur = null;
  }

  /** Intensity hint 0..1 (enemy pressure, bosses). Smoothed: rises fast, falls slowly. */
  setIntensity(v: number, immediate = false) {
    this.target = clamp01(v);
    if (immediate) {
      this.level = this.target;
      this.cur?.setIntensity(this.level, this.ctx.currentTime, true);
      this.lastApplied = this.level;
    }
  }

  update(dt: number) {
    const k = this.target > this.level ? 1 - Math.exp(-dt / 0.7) : 1 - Math.exp(-dt / 3.2);
    this.level += (this.target - this.level) * k;
    const now = this.ctx.currentTime;
    if (this.cur && Math.abs(this.level - this.lastApplied) > 0.015) {
      this.cur.setIntensity(this.level, now, false);
      this.lastApplied = this.level;
    }
    // Look further ahead when frames are slow so the music never starves.
    this.slowDt = Math.max(dt, this.slowDt * 0.97);
    if (this.ctx.state === 'running') this.scheduleUntil(now + Math.max(LOOKAHEAD, Math.min(1, this.slowDt * 2.5 + 0.05)));
    for (let i = this.dying.length - 1; i >= 0; i--) {
      if (now > this.dying[i].killAt) {
        this.dying[i].dispose();
        this.dying.splice(i, 1);
      }
    }
  }

  /** Schedule everything up to `time` (seconds, ctx clock). Used by update() and offline renders. */
  scheduleUntil(time: number) {
    this.cur?.scheduleUntil(time, this.ctx.currentTime);
  }

  /** Stop and release every voice immediately. */
  dispose() {
    this.cur?.dispose();
    for (const d of this.dying) d.dispose();
    this.dying.length = 0;
    this.cur = null;
  }
}

/** Arrangement + instrument sanity check (unit tests): empty when every track is playable. */
export function validateMusic(): string[] {
  const errs = validateTracks();
  for (const [id, t] of Object.entries(TRACKS)) {
    if (!MONO[t.bass]) errs.push(`${id}: unknown bass preset "${t.bass}"`);
    if (t.arp && !MONO[t.arp]) errs.push(`${id}: unknown arp preset "${t.arp}"`);
    if (t.lead && t.lead !== 'bell' && !MONO[LEAD_ALIAS[t.lead] ?? t.lead]) errs.push(`${id}: unknown lead preset "${t.lead}"`);
    if (t.pad && !PADS[t.pad]) errs.push(`${id}: unknown pad preset "${t.pad}"`);
    for (const [name, sec] of Object.entries(t.sections)) if (typeof sec.pad === 'string' && !PADS[sec.pad]) errs.push(`${id}.${name}: unknown pad "${sec.pad}"`);
  }
  return errs;
}
