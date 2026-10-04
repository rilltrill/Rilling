import { SFX, type SfxContext } from './Sfx';
import { MusicPlayer } from './Music';
import type { MusicId, PlayOptions, SfxName } from './names';

/**
 * Procedural audio engine (WebAudio). No audio files: every sound is synthesised
 * from oscillators + noise, so the game ships tiny and works offline.
 *
 * Browsers only allow audio after a user gesture — call `unlock()` from a
 * pointerdown/click handler (the menus do this).
 */
export class AudioSystem {
  ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfxBus!: GainNode;
  private musicBus!: GainNode;
  private comp!: DynamicsCompressorNode;
  private noise: AudioBuffer | null = null;
  private music: MusicPlayer | null = null;
  private sfxVol = 0.8;
  private musicVol = 0.55;
  private pendingMusic: MusicId | null = null;
  /** Rate-limit identical sounds (machine guns, many enemies groaning at once). */
  private lastPlayed = new Map<string, number>();
  private voices = 0;
  muted = false;

  get ready() {
    return !!this.ctx && this.ctx.state === 'running';
  }

  /** Create/resume the AudioContext. Safe to call repeatedly. */
  unlock() {
    try {
      if (!this.ctx) {
        const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (!AC) return;
        this.ctx = new AC({ latencyHint: 'interactive' });
        this.comp = this.ctx.createDynamicsCompressor();
        this.comp.threshold.value = -14;
        this.comp.knee.value = 10;
        this.comp.ratio.value = 4;
        this.comp.attack.value = 0.003;
        this.comp.release.value = 0.2;
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.9;
        this.sfxBus = this.ctx.createGain();
        this.musicBus = this.ctx.createGain();
        this.sfxBus.connect(this.comp);
        this.musicBus.connect(this.comp);
        this.comp.connect(this.master);
        this.master.connect(this.ctx.destination);
        this.noise = this.makeNoise(2);
        this.applyVolumes();
        this.music = new MusicPlayer(this.ctx, this.musicBus, this.noise);
        if (this.pendingMusic) this.music.play(this.pendingMusic);
      }
      if (this.ctx.state === 'suspended') void this.ctx.resume();
    } catch (err) {
      console.warn('[audio] unavailable', err);
    }
  }

  setVolumes(sfx: number, music: number) {
    this.sfxVol = sfx;
    this.musicVol = music;
    this.applyVolumes();
  }

  private applyVolumes() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.sfxBus.gain.setTargetAtTime(this.muted ? 0 : this.sfxVol, t, 0.02);
    this.musicBus.gain.setTargetAtTime(this.muted ? 0 : this.musicVol * 0.6, t, 0.05);
  }

  setMuted(m: boolean) {
    this.muted = m;
    this.applyVolumes();
  }

  /** Pause everything (app backgrounded / game paused). */
  suspend() {
    if (this.ctx && this.ctx.state === 'running') void this.ctx.suspend();
  }

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') void this.ctx.resume();
  }

  play(name: SfxName, opts: PlayOptions = {}) {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running' || this.muted || !this.noise) return;
    const now = ctx.currentTime;
    const last = this.lastPlayed.get(name) ?? -1;
    if (now - last < 0.025) return;
    if (this.voices > 40) return;
    this.lastPlayed.set(name, now);
    const recipe = SFX[name];
    if (!recipe) return;
    const vary = opts.vary ?? 0;
    const pitch = (opts.pitch ?? 1) * (1 + (Math.random() * 2 - 1) * vary);
    const out = ctx.createGain();
    out.gain.value = opts.volume ?? 1;
    let node: AudioNode = out;
    if (opts.pan && ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, opts.pan));
      out.connect(p);
      node = p;
    }
    node.connect(this.sfxBus);
    const sc: SfxContext = { ctx, out, t: now, pitch, noise: this.noise };
    this.voices++;
    let dur = 1;
    try {
      dur = recipe(sc) ?? 1;
    } catch (err) {
      console.warn('[audio] recipe failed', name, err);
    }
    setTimeout(() => {
      this.voices--;
      try {
        node.disconnect();
        out.disconnect();
      } catch {
        /* already gone */
      }
    }, (dur + 0.3) * 1000);
  }

  /** Switch the music track (null = silence). Cross-fades. */
  playMusic(id: MusicId | null) {
    this.pendingMusic = id;
    if (!this.music) return;
    if (id) this.music.play(id);
    else this.music.stop();
  }

  /** Short-term music intensity hint 0..1 (boss fights, low health). */
  setIntensity(v: number) {
    this.music?.setIntensity(v);
  }

  update(dt: number) {
    this.music?.update(dt);
  }

  private makeNoise(seconds: number): AudioBuffer {
    const ctx = this.ctx!;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }
}
