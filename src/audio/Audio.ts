import { SFX, offlineCtor, renderSfx, type SfxContext } from './Sfx';
import { PREWARM, SFX_META } from './sfxMeta';
import { MusicPlayer } from './Music';
import { Baker } from './bake';
import { BED_NAMES, BED_RATE, bedData, bedLoop, drumData, kitFrom, type BedName, type DrumData, type DrumKit } from './drums';
import { impulseData, impulseFrom, makeImpulse, makeNoiseBank, noiseBankFrom, noiseData, runSync, toBuffer, type NoiseBank, type NoiseData } from './dsp';
import type { MusicId, PlayOptions, SfxName } from './names';

/**
 * Procedural audio engine (WebAudio). No audio files: every sound is synthesised
 * from oscillators + noise, so the game ships tiny and works offline.
 *
 * Graph:
 *   world voices → channel(pan, reverb send) → sfxBus ─┐
 *   reverb (convolver) ────────────────────────────────┼→ muffle → comp → limiter → master
 *   music → musicBus → duck ───────────────────────────┘      ↑
 *   UI / player voices → channel → uiBus ─────────────────────┘ (never muffled)
 *
 * Voices live on a fixed pool of channels (voice cap + priority stealing).
 * Hot sounds are pre-rendered into buffers in the background
 * (OfflineAudioContext) so a 13 shots/s SMG costs two nodes per shot; until a
 * sound's buffers are ready it is synthesised live.
 *
 * Browsers only allow audio after a user gesture — `unlock()` is called from
 * pointerdown/keydown by the game, and this class also listens for
 * touchend/click itself (older iOS only unlocks on those) and resumes the
 * context after iOS interruptions (calls, Siri, backgrounding).
 *
 * The sample math (noise bank, reverb impulse, music drum kit, ambience loops)
 * is baked from boot in a few ms per update() and in idle time (bake.ts), so
 * the first tap only wraps finished arrays into buffers. Anything not ready
 * yet simply joins later: music starts on its synths and the drums come in
 * when the kit is done, the reverb and ambience beds fade in.
 */

interface Channel {
  /** Voices connect here (stereo panner or a plain gain). */
  input: AudioNode;
  pan: StereoPannerNode | null;
  send: GainNode;
  name: SfxName | null;
  start: number;
  end: number;
  prio: number;
  voice: GainNode | null;
  src: AudioBufferSourceNode | null;
}

const WORLD_CHANNELS = 24;
const UI_CHANNELS = 8;
const MAX_FADING = 48;
/**
 * Major-scale steps for rising tick sequences (score count-up). One octave,
 * wrapping: long tallies roll up the scale again instead of climbing into
 * shrill territory.
 */
const SCALE = [0, 2, 4, 5, 7, 9, 11, 12];
/**
 * Rate the background bake assumes (most phones run at 48 kHz). Buffer sources
 * resample if the device differs; only the reverb impulse must match exactly,
 * and is re-baked at the real rate when it doesn't.
 */
const BAKE_RATE = 48000;
/**
 * Bake time slice per update(), as a share of the frame time (so slow devices
 * don't take proportionally longer) within [min, max] ms: generous on the
 * title screen (nothing to hear yet) and while music plays without its drums,
 * lighter otherwise.
 */
const BAKE_IDLE = { share: 0.2, min: 3, max: 10 };
const BAKE_URGENT = { share: 0.35, min: 5, max: 16 };
const BAKE_LIVE = { share: 0.12, min: 2, max: 6 };
/** Pre-rendering waits this long after unlock so it never piles onto the first tap. */
const RENDER_DELAY_MS = 400;

type AcGlobal = { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext };

function acCtor(): typeof AudioContext | null {
  const g = globalThis as unknown as AcGlobal;
  return g.AudioContext || g.webkitAudioContext || null;
}

const perfNow = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

export class AudioSystem {
  ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfxBus!: GainNode;
  private uiBus!: GainNode;
  private musicBus!: GainNode;
  private duck!: GainNode;
  private muffle!: BiquadFilterNode;
  private comp!: DynamicsCompressorNode;
  private limiter!: DynamicsCompressorNode;
  private verbIn!: GainNode;
  private musicVerb!: GainNode;
  private noise: AudioBuffer | null = null;
  private bank: NoiseBank | null = null;
  private music: MusicPlayer | null = null;
  private world: Channel[] = [];
  private ui: Channel[] = [];
  private fading: { node: AudioNode; at: number }[] = [];
  private sfxVol = 0.8;
  private musicVol = 0.55;
  private pendingMusic: MusicId | null = null;
  private pendingIntensity = 0;
  private lastPlayed = new Map<SfxName, number>();
  private lastVariant = new Map<SfxName, number>();
  private seq = new Map<SfxName, { n: number; t: number }>();
  private duckUntil = 0;
  private duckDepth = 0;
  private hiddenSuspend = false;
  private lastGun: SfxName = 'pistol';
  private comboStep = -1;
  private paused = false;
  private comboAt = -10;
  private gestureBound = false;
  // Background-baked samples.
  private baker: Baker | null = null;
  private idleQueued = false;
  private kit: DrumKit | null = null;
  private beds: Partial<Record<BedName, AudioBuffer>> = {};
  private verb: ConvolverNode | null = null;
  private impulseKey: string | null = null;
  // Pre-render cache.
  private buffers = new Map<SfxName, AudioBuffer[]>();
  private queue: SfxName[] = [];
  private queued = new Set<SfxName>();
  private rendering = false;
  private canRender = false;
  private renderFailures = 0;
  private renderAfter = 0;
  private cacheBytes = 0;
  muted = false;

  constructor() {
    this.bindGestures();
    this.startBake();
  }

  /** Queue the background sample synthesis (browser only; node tests stay inert). */
  private startBake() {
    if (typeof window === 'undefined' || !acCtor()) return;
    const b = new Baker();
    b.add('noise', noiseData(BAKE_RATE));
    b.add('drums', drumData(BAKE_RATE));
    b.add('impulse@' + BAKE_RATE, impulseData(BAKE_RATE, 1.7, 2.8));
    for (const n of BED_NAMES) b.add(n, bedData(n));
    this.baker = b;
    this.idleBake();
  }

  /**
   * Where the browser reports idle time (Chrome/Android/Firefox), also bake in
   * it, so slow frames don't slow the bake down; update() covers the rest (iOS).
   */
  private idleBake() {
    if (this.idleQueued || typeof window === 'undefined' || typeof window.requestIdleCallback !== 'function') return;
    const b = this.baker;
    if (!b || b.idle) return;
    this.idleQueued = true;
    window.requestIdleCallback((dl) => {
      this.idleQueued = false;
      const left = dl.timeRemaining() - 1;
      if (left > 1) this.baker?.step(Math.min(8, left));
      this.idleBake();
    });
  }

  get ready() {
    return !!this.ctx && this.ctx.state === 'running';
  }

  /** Create/resume the AudioContext. Safe to call repeatedly (call from user gestures). */
  unlock() {
    try {
      if (!this.ctx) this.init();
      const ctx = this.ctx;
      if (!ctx) return;
      if (ctx.state !== 'running' && !this.hiddenSuspend) {
        const p = ctx.resume();
        if (p && typeof p.catch === 'function') p.catch(() => {});
      }
    } catch (err) {
      console.warn('[audio] unavailable', err);
    }
  }

  private init() {
    if (typeof window === 'undefined') return;
    const AC = acCtor();
    if (!AC) return;
    let ctx: AudioContext;
    try {
      ctx = new AC({ latencyHint: 'interactive' });
    } catch {
      ctx = new AC();
    }
    this.ctx = ctx;
    // iOS 17+: mix with the player's own music and respect the silent switch, like native games.
    try {
      const nav = navigator as unknown as { audioSession?: { type: string } };
      if (nav.audioSession) nav.audioSession.type = 'ambient';
    } catch {
      /* not supported */
    }
    try {
      this.build(ctx);
    } catch (err) {
      // Leave the system inert rather than half-built.
      this.ctx = null;
      this.bank = null;
      this.music = null;
      this.verb = null;
      this.impulseKey = null;
      this.world = [];
      this.ui = [];
      try {
        ctx.close().catch(() => {});
      } catch {
        /* ignore */
      }
      throw err;
    }
  }

  private build(ctx: AudioContext) {
    this.limiter = ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -2.5;
    this.limiter.knee.value = 0;
    this.limiter.ratio.value = 20;
    this.limiter.attack.value = 0.001;
    this.limiter.release.value = 0.12;
    this.comp = ctx.createDynamicsCompressor();
    this.comp.threshold.value = -16;
    this.comp.knee.value = 12;
    this.comp.ratio.value = 3.5;
    this.comp.attack.value = 0.004;
    this.comp.release.value = 0.22;
    this.master = ctx.createGain();
    this.master.gain.value = 0.92;
    this.muffle = ctx.createBiquadFilter();
    this.muffle.type = 'lowpass';
    this.muffle.frequency.value = Math.min(20000, ctx.sampleRate * 0.45);
    this.muffle.Q.value = 0.5;
    this.sfxBus = ctx.createGain();
    this.uiBus = ctx.createGain();
    this.musicBus = ctx.createGain();
    this.duck = ctx.createGain();
    this.sfxBus.connect(this.muffle);
    this.musicBus.connect(this.duck).connect(this.muffle);
    this.muffle.connect(this.comp);
    this.uiBus.connect(this.comp);
    this.comp.connect(this.limiter).connect(this.master).connect(ctx.destination);

    // Noise is needed by the very first sound: finish it now if the bake hasn't yet (~10 ms).
    const nd = this.baker?.takeNow<NoiseData>('noise');
    this.bank = nd ? noiseBankFrom(ctx, nd, BAKE_RATE) : makeNoiseBank(ctx);
    this.noise = this.bank.white;

    // Shared reverb (sfx sends + music sends), scaled by the respective volumes.
    // A convolver needs its impulse at the context's own rate; until that is
    // baked the reverb is simply silent.
    const verb = ctx.createConvolver();
    this.verb = verb;
    if (this.baker) {
      const key = 'impulse@' + ctx.sampleRate;
      if (key !== 'impulse@' + BAKE_RATE) this.baker.drop('impulse@' + BAKE_RATE);
      this.baker.add(key, impulseData(ctx.sampleRate, 1.7, 2.8), true);
      this.impulseKey = key;
      this.idleBake();
    } else verb.buffer = makeImpulse(ctx, 1.7, 2.8);
    this.verbIn = ctx.createGain();
    this.musicVerb = ctx.createGain();
    const verbOut = ctx.createGain();
    verbOut.gain.value = 0.55;
    this.verbIn.connect(verb);
    this.musicVerb.connect(verb);
    verb.connect(verbOut).connect(this.muffle);

    for (let i = 0; i < WORLD_CHANNELS; i++) this.world.push(this.channel(this.sfxBus));
    for (let i = 0; i < UI_CHANNELS; i++) this.ui.push(this.channel(this.uiBus));

    this.applyVolumes();
    ctx.onstatechange = () => {
      // Resumed after an interruption: fade in to avoid a pop.
      if (ctx.state === 'running') this.fadeInMaster();
    };
    this.music = new MusicPlayer(ctx, this.musicBus, this.bank, this.musicVerb, {
      // Without a baker (never in practice) fall back to building synchronously.
      kit: () => this.kit ?? (this.baker ? null : (this.kit = kitFrom(ctx, runSync(drumData(ctx.sampleRate)), ctx.sampleRate))),
      bed: (n) => this.beds[n] ?? (this.baker ? null : (this.beds[n] = bedLoop(ctx, n))),
    });
    this.music.setIntensity(this.pendingIntensity, true);
    if (this.pendingMusic) this.music.play(this.pendingMusic);

    // Warm-up: a silent buffer started inside the gesture fully unlocks iOS.
    try {
      const b = ctx.createBuffer(1, 1, ctx.sampleRate);
      const s = ctx.createBufferSource();
      s.buffer = b;
      s.connect(ctx.destination);
      s.start(0);
    } catch {
      /* ignore */
    }

    this.canRender = !!offlineCtor();
    this.renderAfter = perfNow() + RENDER_DELAY_MS;
    for (const n of PREWARM) this.requestRender(n);
  }

  /**
   * Wrap one finished bake result into buffers for the live context per call
   * (copies are cheap but not free, so they are spread over frames): drums
   * first (the music is missing them), then the reverb, then the ambience beds.
   */
  private adoptBaked(): boolean {
    const ctx = this.ctx;
    const b = this.baker;
    if (!ctx || !b) return false;
    if (!this.kit) {
      const d = b.take<DrumData>('drums');
      if (d) {
        this.kit = kitFrom(ctx, d, BAKE_RATE);
        return true;
      }
    }
    if (this.verb && this.impulseKey) {
      const d = b.take<Float32Array[]>(this.impulseKey);
      if (d) {
        this.impulseKey = null;
        try {
          this.verb.buffer = impulseFrom(ctx, d, ctx.sampleRate);
        } catch (err) {
          console.warn('[audio] reverb unavailable', err);
        }
        return true;
      }
    }
    for (const n of BED_NAMES) {
      if (this.beds[n]) continue;
      const d = b.take<Float32Array>(n);
      if (d) {
        this.beds[n] = toBuffer(ctx, d, BED_RATE[n]);
        return true;
      }
    }
    // Everything adopted: the baker has done its job.
    if (this.kit && !this.impulseKey && this.beds.wind && this.beds.insects) this.baker = null;
    return false;
  }

  private channel(bus: GainNode): Channel {
    const ctx = this.ctx!;
    let input: AudioNode;
    let pan: StereoPannerNode | null = null;
    if (typeof ctx.createStereoPanner === 'function') {
      pan = ctx.createStereoPanner();
      input = pan;
    } else input = ctx.createGain();
    input.connect(bus);
    const send = ctx.createGain();
    send.gain.value = 0;
    input.connect(send).connect(this.verbIn);
    return { input, pan, send, name: null, start: 0, end: 0, prio: 0, voice: null, src: null };
  }

  /** Extra unlock/resume hooks: iOS needs touchend/click; also recovers from interruptions. */
  private bindGestures() {
    if (this.gestureBound || typeof window === 'undefined' || typeof window.addEventListener !== 'function') return;
    this.gestureBound = true;
    const h = () => this.unlock();
    for (const ev of ['touchend', 'click', 'pointerup']) window.addEventListener(ev, h, { capture: true, passive: true });
  }

  setVolumes(sfx: number, music: number) {
    this.sfxVol = sfx;
    this.musicVol = music;
    this.applyVolumes();
  }

  private applyVolumes() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const sfx = this.muted ? 0 : this.sfxVol;
    const mus = this.muted ? 0 : this.musicVol * 0.8 * (this.paused ? 0.45 : 1);
    this.sfxBus.gain.setTargetAtTime(sfx, t, 0.02);
    this.uiBus.gain.setTargetAtTime(sfx, t, 0.02);
    this.verbIn.gain.setTargetAtTime(sfx, t, 0.02);
    this.musicBus.gain.setTargetAtTime(mus, t, 0.05);
    this.musicVerb.gain.setTargetAtTime(mus, t, 0.05);
  }

  setMuted(m: boolean) {
    this.muted = m;
    this.applyVolumes();
  }

  /**
   * Pause-menu treatment (optional hook for the game): the world is muffled and
   * the music dips while a menu covers gameplay; UI sounds stay crisp.
   */
  setPaused(p: boolean) {
    if (this.paused === p) return;
    this.paused = p;
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    const f = this.muffle.frequency;
    f.cancelScheduledValues(t);
    // Hold the current cutoff (e.g. mid hurt-muffle recovery) so the glide starts from where it is.
    f.setValueAtTime(f.value, t);
    f.setTargetAtTime(p ? 800 : Math.min(20000, ctx.sampleRate * 0.45), t, p ? 0.06 : 0.12);
    this.applyVolumes();
  }

  /** Quickly fade out every playing sound effect (stage quit/restart). Music is untouched. */
  stopSfx() {
    this.stopPool(this.world);
    this.stopPool(this.ui);
  }

  private stopPool(pool: Channel[]) {
    const ctx = this.ctx;
    if (!ctx) return;
    const now = ctx.currentTime;
    for (const ch of pool) {
      this.release(ch, now);
      ch.end = 0;
    }
  }

  /** Pause everything (app backgrounded). */
  suspend() {
    this.hiddenSuspend = true;
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    // Drop the output instantly so the suspend can't leave a buzzing buffer behind.
    const g = this.master.gain;
    g.cancelScheduledValues(ctx.currentTime);
    g.setValueAtTime(0, ctx.currentTime);
    const p = ctx.suspend();
    if (p && typeof p.catch === 'function') p.catch(() => {});
  }

  resume() {
    this.hiddenSuspend = false;
    const ctx = this.ctx;
    if (!ctx) return;
    if (ctx.state !== 'running') {
      const p = ctx.resume();
      if (p && typeof p.catch === 'function') p.catch(() => {});
    } else this.fadeInMaster();
  }

  private fadeInMaster() {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    const g = this.master.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(0.0001, t);
    g.linearRampToValueAtTime(0.92, t + 0.08);
  }

  play(name: SfxName, opts: PlayOptions = {}) {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running' || this.muted || !this.bank) return;
    name = this.weaponFlavour(name);
    const meta = SFX_META[name];
    const recipe = SFX[name];
    if (!meta || !recipe) return;
    const now = ctx.currentTime;
    const last = this.lastPlayed.get(name) ?? -1;
    if (now - last < meta.gap) return;

    const pool = meta.ui ? this.ui : this.world;
    let count = 0;
    let oldest: Channel | null = null;
    for (const ch of pool) {
      if (ch.name === name && ch.end > now) {
        count++;
        if (!oldest || ch.start < oldest.start) oldest = ch;
      }
    }
    let ch: Channel | null;
    if (count >= meta.max) {
      if (!meta.steal || !oldest) return;
      ch = oldest;
    } else ch = this.pickChannel(pool, meta.prio, now);
    if (!ch) return;
    this.lastPlayed.set(name, now);

    const vary = opts.vary ?? 0;
    const base = opts.pitch ?? (name === 'combo' ? this.comboPitch(now) : 1);
    const pitch = Math.max(0.25, Math.min(4, base * (1 + (Math.random() * 2 - 1) * vary) * this.sequencePitch(name, now)));
    if (name === 'player_hurt' || name === 'civilian_shot') this.comboStep = -1;
    this.release(ch, now);
    const voice = ctx.createGain();
    voice.connect(ch.input);
    if (ch.pan) ch.pan.pan.setValueAtTime(Math.max(-1, Math.min(1, opts.pan ?? 0)), now);
    ch.send.gain.setValueAtTime(meta.verb, now);

    let dur: number;
    const bufs = this.buffers.get(name);
    if (bufs && bufs.length) {
      voice.gain.value = opts.volume ?? 1;
      const buf = bufs[this.pickVariant(name, bufs.length)];
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.playbackRate.value = pitch;
      src.connect(voice);
      src.start(now);
      dur = buf.duration / pitch;
      ch.src = src;
    } else {
      if (meta.cache > 0) this.requestRender(name);
      voice.gain.value = (opts.volume ?? 1) * meta.trim;
      const s: SfxContext = { ctx, out: voice, t: now, pitch, noise: this.noise!, bank: this.bank };
      try {
        dur = recipe(s) ?? meta.len;
      } catch (err) {
        console.warn('[audio] recipe failed', name, err);
        dur = 0.1;
      }
      ch.src = null;
    }
    ch.name = name;
    ch.start = now;
    ch.end = now + dur + 0.03;
    ch.prio = meta.prio;
    ch.voice = voice;
    if (meta.duck > 0) this.duckMusic(meta.duck * (opts.volume ?? 1), meta.duckHold);
    if (name === 'player_hurt') this.muffleHit();
  }

  /**
   * Generic reload sounds get the flavour of the gun that was fired last
   * (shells into a shotgun, a revolver's cylinder), so reloads match the weapon
   * without the gameplay code having to know.
   */
  private weaponFlavour(name: SfxName): SfxName {
    switch (name) {
      case 'pistol':
      case 'smg':
      case 'shotgun':
      case 'magnum':
        this.lastGun = name;
        return name;
      case 'reload':
        return this.lastGun === 'shotgun' ? 'reload_shotgun' : this.lastGun === 'magnum' ? 'reload_magnum' : name;
      case 'reload_done':
        return this.lastGun === 'shotgun' ? 'reload_done_shotgun' : this.lastGun === 'magnum' ? 'reload_done_magnum' : name;
      default:
        return name;
    }
  }

  /** Free channel, else steal the lowest-priority (then oldest) voice not above `prio`. */
  private pickChannel(pool: Channel[], prio: number, now: number): Channel | null {
    let best: Channel | null = null;
    for (const ch of pool) {
      if (ch.end <= now) return ch;
      if (ch.prio > prio) continue;
      if (!best || ch.prio < best.prio || (ch.prio === best.prio && ch.start < best.start)) best = ch;
    }
    return best;
  }

  /** Fade out whatever the channel is playing (quick, click-free) and detach it. */
  private release(ch: Channel, now: number) {
    const v = ch.voice;
    if (!v) return;
    if (ch.end > now) {
      const g = v.gain;
      g.cancelScheduledValues(now);
      g.setValueAtTime(g.value, now);
      g.linearRampToValueAtTime(0, now + 0.015);
      if (ch.src) {
        try {
          ch.src.stop(now + 0.03);
        } catch {
          /* already stopped */
        }
      }
      if (this.fading.length >= MAX_FADING) this.disconnect(this.fading.shift()!.node);
      this.fading.push({ node: v, at: now + 0.06 });
    } else this.disconnect(v);
    ch.voice = null;
    ch.src = null;
  }

  private disconnect(n: AudioNode) {
    try {
      n.disconnect();
    } catch {
      /* already gone */
    }
  }

  private pickVariant(name: SfxName, n: number): number {
    if (n <= 1) return 0;
    const last = this.lastVariant.get(name) ?? -1;
    let i = Math.floor(Math.random() * (n - 1));
    if (i >= last) i++;
    this.lastVariant.set(name, i);
    return i;
  }

  /** Rapid repeats of tick sounds climb in pitch (score count-up, continue countdown). */
  private sequencePitch(name: SfxName, now: number): number {
    if (name !== 'score_tick' && name !== 'continue_tick') return 1;
    const win = name === 'score_tick' ? 0.45 : 1.6;
    const st = this.seq.get(name) ?? { n: -1, t: -10 };
    st.n = now - st.t < win ? st.n + 1 : 0;
    st.t = now;
    this.seq.set(name, st);
    if (name === 'score_tick') return Math.pow(2, SCALE[st.n % SCALE.length] / 12);
    return Math.pow(2, Math.min(st.n, 12) / 12);
  }

  /**
   * Fallback when the caller passes no pitch for 'combo': consecutive combo
   * steps climb a whole tone each (a hit or civilian penalty, or a long pause,
   * starts again from the bottom). Callers that know the multiplier should pass
   * `pitch` instead.
   */
  private comboPitch(now: number): number {
    this.comboStep = now - this.comboAt < 6 ? Math.min(this.comboStep + 1, 6) : 0;
    this.comboAt = now;
    return Math.pow(2, (this.comboStep * 2) / 12);
  }

  private duckMusic(depth: number, hold: number) {
    const ctx = this.ctx!;
    const now = ctx.currentTime;
    if (now < this.duckUntil) {
      depth = Math.max(depth, this.duckDepth);
      hold = Math.max(hold, this.duckUntil - now);
    }
    this.duckDepth = depth;
    this.duckUntil = now + hold;
    const g = this.duck.gain;
    const floor = Math.max(0.05, 1 - depth);
    g.cancelScheduledValues(now);
    g.setValueAtTime(g.value, now);
    g.linearRampToValueAtTime(floor, now + 0.03);
    g.setValueAtTime(floor, now + 0.03 + hold);
    g.linearRampToValueAtTime(1, now + 0.03 + hold + 0.7);
  }

  /** Brief "ears ringing" low-pass on the world when the player is hit. */
  private muffleHit() {
    const ctx = this.ctx!;
    if (this.paused) return;
    const now = ctx.currentTime;
    const f = this.muffle.frequency;
    const open = Math.min(20000, ctx.sampleRate * 0.45);
    f.cancelScheduledValues(now);
    f.setValueAtTime(f.value, now);
    f.exponentialRampToValueAtTime(650, now + 0.03);
    f.setValueAtTime(650, now + 0.25);
    f.exponentialRampToValueAtTime(open, now + 1.1);
  }

  /**
   * Switch the music track (null = silence). Cross-fades. Switching to the menu
   * track also fades out lingering world sounds (alarms, roars, helicopters):
   * the stage is gone. UI sounds (the button click that got us here) keep playing.
   */
  playMusic(id: MusicId | null) {
    this.pendingMusic = id;
    if (id === 'menu' && this.music?.current !== 'menu') this.stopPool(this.world);
    if (!this.music) return;
    if (id) this.music.play(id);
    else this.music.stop();
  }

  /** Short-term music intensity hint 0..1 (boss fights, lots of enemies). */
  setIntensity(v: number) {
    this.pendingIntensity = v;
    this.music?.setIntensity(v);
  }

  update(dt: number) {
    // Music first, then at most one bake adoption or slice, so the costs spread over frames.
    if (this.ctx) this.music?.update(Math.min(0.25, Math.max(0, dt)));
    const b = this.baker;
    if (b && !this.adoptBaked() && !b.idle) {
      const p = !this.ctx ? BAKE_IDLE : this.music?.current && !this.kit ? BAKE_URGENT : BAKE_LIVE;
      const frameMs = dt > 0 && dt < 1 ? dt * 1000 : 16;
      b.step(Math.max(p.min, Math.min(p.max, frameMs * p.share)));
    }
    if (!this.ctx) return;
    if (this.fading.length) {
      const now = this.ctx.currentTime;
      while (this.fading.length && this.fading[0].at < now) this.disconnect(this.fading.shift()!.node);
    }
    if (this.queue.length && !this.rendering) this.pump();
  }

  // ─── Pre-render cache ───────────────────────────────────────────────────────

  private requestRender(name: SfxName) {
    if (!this.canRender || this.queued.has(name) || SFX_META[name].cache <= 0) return;
    this.queued.add(name);
    this.queue.push(name);
  }

  /** Start the next pre-render (one at a time; driven from update() and render completion). */
  private pump() {
    const ctx = this.ctx;
    if (this.rendering || !this.queue.length || !ctx || !this.canRender || perfNow() < this.renderAfter) return;
    const name = this.queue.shift()!;
    const meta = SFX_META[name];
    this.rendering = true;
    const sr = meta.lo && ctx.sampleRate >= 44100 ? Math.round(ctx.sampleRate / 2) : ctx.sampleRate;
    let p: Promise<AudioBuffer[]>;
    try {
      p = renderSfx(name, { variants: meta.cache, sampleRate: sr, bank: this.bank ?? undefined });
    } catch (err) {
      p = Promise.reject(err);
    }
    p.then(
      (bufs) => {
        this.buffers.set(name, bufs);
        for (const b of bufs) this.cacheBytes += b.length * 4;
      },
      (err) => {
        // Live synthesis keeps working; give up on caching after repeated failures.
        if (++this.renderFailures >= 3) this.canRender = false;
        console.warn('[audio] pre-render failed', name, err);
      },
    ).then(() => {
      this.rendering = false;
      this.pump();
    });
  }

  /** Debug/test info. */
  stats() {
    const now = this.ctx?.currentTime ?? 0;
    let active = 0;
    for (const ch of this.world) if (ch.end > now) active++;
    for (const ch of this.ui) if (ch.end > now) active++;
    return {
      state: this.ctx?.state ?? 'none',
      active,
      cached: this.buffers.size,
      queued: this.queue.length,
      cacheKB: Math.round(this.cacheBytes / 1024),
      music: this.music?.current ?? null,
      /** The music's drum kit is ready (it is baked in the background after boot). */
      drums: !!this.kit,
      /** Background sample jobs not yet adopted (0 once everything is baked). */
      baking: this.baker?.pending ?? 0,
    };
  }
}
