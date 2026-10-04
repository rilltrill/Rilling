import * as THREE from 'three';
import { Engine } from '../core/Engine';
import { Input } from '../core/Input';
import { Save } from '../core/Save';
import type { ArtStyle, CampaignId, QualityLevel, RetroMode, Settings, StageResult } from '../core/types';
import { AudioSystem } from '../audio/Audio';
import type { MusicId } from '../audio/names';
import { Hud } from '../ui/Hud';
import { Menus, RETRO_SETTING_ENABLED, type MenuActions } from '../ui/Menus';
import { MenuBackdrop, type BackdropTheme } from '../ui/MenuBackdrop';
import { World } from './World';
import { StageRunner } from './StageRunner';
import { Shooter } from './Shooting';
import type { CampaignDef, StageDef } from './StageTypes';
import { Kit } from '../content/kit/ModelKit';
import { AutoPlayer } from '../debug/AutoPlayer';
import type { WeaponId } from '../core/types';
import { zooStage } from '../content/stages/zoo';
import { Enemy } from './Enemy';
import type { Entity } from './Entity';
import { Projectile } from './Projectile';
import { prewarmFxAtlases } from '../fx/Fx';
import { buildWarmupSet } from './Warmup';
import { SpriteArt, parseLook } from './SpriteArt';

export interface DebugFlags {
  stage?: string;
  beat?: number;
  autoplay?: boolean;
  god?: boolean;
  speed?: number;
  seed?: number;
  debug?: boolean;
  mute?: boolean;
  /**
   * Forced arcade-monitor mode (`&retro=crt|pixel|off`). main.ts sets 'off' for
   * debug deep links (?stage / ?autoplay) unless `retro` is given explicitly, so
   * tooling gets clean screenshots. Undefined = the player's DISPLAY setting.
   */
  retro?: RetroMode;
  /** Forced character art (`&art=sprites|3d`); undefined = the player's ART setting. */
  art?: ArtStyle;
}

/** Attract-mode demo length (wall-clock seconds of live action; cuts don't count). */
const DEMO_SECONDS = 25;
/** Sound effects play quieter under the demo (music stays). */
const DEMO_SFX = 0.45;
/** The demo cuts away from a lull (nothing hostile on screen) this long, or sooner while just travelling… */
const DEMO_LULL = 3;
const DEMO_LULL_TRAVEL = 1.5;
/** …unless it cut less than this long ago, or has less than this left (seconds). */
const DEMO_CUT_GAP = 4;
const DEMO_CUT_TAIL = 5;
/** A cut stays black at least this long (ms), so it reads as a scene cut rather than a flicker. */
const DEMO_CUT_MIN_MS = 320;
/** Fast-forward under a cut: fixed sim step, CPU budget per frame (ms), max skipped game time (s). */
const DEMO_FF_STEP = 1 / 30;
const DEMO_FF_BUDGET_MS = 20;
const DEMO_FF_MAX = 45;

const _hurtV = new THREE.Vector3();
const _hurtBest = new THREE.Vector3();

type State = 'menu' | 'loading' | 'intro' | 'playing' | 'paused' | 'continue' | 'results' | 'gameover' | 'demo';

/** States that show a frozen world frame (redrawn only when the canvas is resized/cleared). */
const FROZEN: ReadonlySet<State> = new Set<State>(['loading', 'intro', 'results', 'continue', 'paused', 'gameover']);
/** Frames the loading card / pressed button gets to paint before the (blocking) stage build. */
const LOAD_PAINT_FRAMES = 2;
/** Pause-screen note while the GPU has dropped the WebGL context. */
const GFX_NOTE = 'GRAPHICS RESET - PLEASE WAIT';
/** CONTINUE? countdown length (s), and the least it reopens with after the app was backgrounded. */
const CONTINUE_SECS = 9;
const CONTINUE_MIN_RESUME = 3;

/** A stage being prepared behind the intro card (or the screen that started it). */
interface Loading {
  stage: StageDef;
  showIntro: boolean;
  /** Frames since the load was requested. */
  frames: number;
  /** The world is built (next: shader warm-up + first render). */
  built: boolean;
  /** The intro card already finished (play as soon as the load completes). */
  introDone: boolean;
}

interface Run {
  mode: 'arcade' | 'single';
  campaign: CampaignDef;
  stageIndex: number;
  /** Arcade: banked score of the stages cleared so far. */
  total: number;
  bombs: number;
  /** Bombs carried into the current stage (RETRY / RESTART STAGE start it again with these). */
  stageBombs: number;
  /** The current stage's result already added to `total` (results screen); 0 while playing. */
  banked: number;
  /** Arcade: continues used (incl. RETRY after GAME OVER), shown on the hi-score table. */
  continues: number;
  /** Arcade: the credit has been scored (game over / campaign clear): leaving adds nothing. */
  ended: boolean;
}

function newRun(mode: Run['mode'], campaign: CampaignDef, stageIndex: number): Run {
  return { mode, campaign, stageIndex, total: 0, bombs: 1, stageBombs: 1, banked: 0, continues: 0, ended: false };
}

/** Attract demo progress. */
interface Demo {
  /** Live (on-screen) action so far, wall-clock seconds. */
  t: number;
  /** performance.now() of the previous demo frame (0 = none yet). */
  last: number;
  /** Seconds without anything hostile on screen. */
  lull: number;
  /** ≥ 0: cut to black, fast-forwarding (game seconds skipped so far); -1: live. */
  ff: number;
  /** performance.now() when the current cut began. */
  cutAt: number;
  /** Live seconds since the last cut. */
  sinceCut: number;
}

/** Top-level game: menus ↔ stages, input routing, the frame loop. */
export class Game implements MenuActions {
  readonly engine: Engine;
  readonly input: Input;
  readonly audio = new AudioSystem();
  readonly save = new Save();
  readonly hud: Hud;
  readonly menus: Menus;
  state: State = 'menu';
  world: World | null = null;
  runner: StageRunner | null = null;
  shooter: Shooter | null = null;
  autoplay: AutoPlayer | null = null;
  /** ART: SPRITES renderer for the current world (null in ART: 3D). */
  sprites: SpriteArt | null = null;
  /** ART setting last applied (a change clears the URL override). */
  private appliedArt: ArtStyle | undefined;
  private run: Run | null = null;
  /** Stage being built across the next frames (see startStage). */
  private loading: Loading | null = null;
  /** CONTINUE? countdown: when it (re)opened, with how many seconds, and when the app was hidden. */
  private continueAt = 0;
  private continueSecs = CONTINUE_SECS;
  private continueHiddenAt = 0;
  private clearTimer = -1;
  private holdStart = new Map<number, number>();
  /** Animated attract scene behind the menus (built lazily, kept across stages — it doesn't use the Kit cache). */
  private backdrop: MenuBackdrop | null = null;
  /** Backdrop theme lock (campaign-clear shows that campaign's scene); null = alternate. */
  private backdropTheme: BackdropTheme | null = null;
  /** The first-run tutorial is open (the stage is paused underneath). */
  private tutorialOpen = false;
  /** Renderer settings last applied (re-applying resizes the canvas, which clears it). */
  private appliedQuality: QualityLevel;
  private appliedRetro: RetroMode | null = null;
  /** Canvas size / pixel ratio of the last world render (a frozen frame is redrawn when they change). */
  private renderedW = 0;
  private renderedH = 0;
  private renderedDpr = 0;
  /** Keep redrawing a frozen frame until this time (ms): resizes clear the canvas, some arrive late. */
  private redrawUntil = 0;
  /** Attract-mode demo in progress (state 'demo'). */
  private demo: Demo | null = null;
  /** Rotates through the stages for successive demos. */
  private demoIndex = Date.now() % 997;
  /** Overlay pixel grid last pushed to the HUD (re-derived when these change). */
  private gridW = -1;
  private gridH = -1;
  private gridScale = -1;
  private gridOn = false;
  lastResult: StageResult | null = null;
  /** Exposed for tests / debugging. */
  stats = { frames: 0, stagesCleared: 0, errors: 0 };

  constructor(
    readonly root: HTMLElement,
    readonly campaigns: CampaignDef[],
    readonly flags: DebugFlags = {},
  ) {
    const s = this.save.settings;
    const bootRetro: RetroMode = RETRO_SETTING_ENABLED ? (flags.retro ?? s.retro) : 'off';
    this.engine = new Engine(root.querySelector('#stage') as HTMLElement, s.quality, bootRetro);
    this.engine.onContextLost = () => this.onGraphicsLost();
    this.engine.onContextRestored = () => this.onGraphicsRestored();
    this.appliedQuality = s.quality;
    const surface = root.querySelector('#play-surface') as HTMLElement;
    this.input = new Input(surface);
    this.hud = new Hud(root.querySelector('#hud-layer') as HTMLElement, {
      pause: () => this.pause(),
      reload: () => this.shooter?.reload(),
      bomb: () => this.state === 'playing' && this.world?.useBomb(),
      cycleWeapon: () => this.state === 'playing' && this.world?.weapons.cycle(),
    });
    this.menus = new Menus(root.querySelector('#menu-layer') as HTMLElement, this.save, this.audio, campaigns, this);
    this.menus.onScreen = (name) => {
      if (name !== 'campaign-clear') this.backdropTheme = null;
    };
    this.applySettings(s);
    if (flags.mute) this.audio.setMuted(true);

    this.input.handlers = {
      press: (x, y, id) => this.onPress(x, y, id),
      release: (id) => this.holdStart.delete(id),
      swipeDown: () => this.state === 'playing' && this.shooter?.reload(),
      reload: () => this.state === 'playing' && this.shooter?.reload(),
      key: (code) => this.onKey(code),
    };

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        if (this.state === 'playing') this.pause();
        // Hidden-page timers keep running on Android/desktop: don't let CONTINUE? run out unseen.
        if (this.state === 'continue') this.continueHiddenAt = performance.now();
        this.audio.suspend();
      } else {
        this.audio.resume();
        if (this.state === 'continue' && this.continueHiddenAt > 0) this.reopenContinue();
        this.continueHiddenAt = 0;
        this.redrawUntil = performance.now() + 300;
      }
    });
    // Unlock audio on the very first interaction anywhere.
    const unlock = () => this.audio.unlock();
    window.addEventListener('pointerdown', unlock, { capture: true });
    window.addEventListener('keydown', unlock, { capture: true });

    // Any resize clears the WebGL canvas (even to the same size). Engine applies
    // some of them late (orientationchange), so redraw frozen frames for a moment.
    const redraw = () => (this.redrawUntil = performance.now() + 500);
    window.addEventListener('resize', redraw);
    window.addEventListener('orientationchange', redraw);
    window.visualViewport?.addEventListener('resize', redraw);

    this.engine.onFrame = (dt) => this.frame(dt);
  }

  boot() {
    this.engine.start();
    // Paint the FX sprite/decal atlases behind the title screen so stages never stall on it.
    setTimeout(() => prewarmFxAtlases(), 300);
    if (this.flags.stage) {
      const st = this.findStage(this.flags.stage);
      if (st) {
        this.run = newRun('single', st.campaign, st.stage.index);
        this.startStage(st.stage, true);
        return;
      }
      console.warn(`Unknown stage "${this.flags.stage}"`);
    }
    this.music('menu');
    // Power-on self test once per browser session (a reload skips straight to the title).
    if (!this.flags.autoplay && !sessionFlag('overrun.booted')) this.menus.showBoot(() => this.showTitle());
    else this.showTitle();
  }

  /** Title screen → PRESS START → main menu (idle: hi-score table → demo → title…). */
  private showTitle() {
    this.menus.showTitle(() => this.menus.showMain());
  }

  private findStage(id: string): { stage: StageDef; campaign: CampaignDef } | null {
    for (const c of this.campaigns) for (const s of c.stages) if (s.id === id) return { stage: s, campaign: c };
    if (id === 'zoo') {
      this.zoo ??= zooStage(new URLSearchParams(location.search));
      return { stage: this.zoo, campaign: this.campaigns[0] };
    }
    return null;
  }
  private zoo: StageDef | null = null;

  private applySettings(s: Settings) {
    this.applyVolumes(s);
    this.hud.setLeftHanded(s.leftHanded);
    this.hud.showFps(s.showFps);
    // Only touch the renderer when these actually change: every call resizes the
    // canvas (clearing a paused frame) and undoes dynamic-resolution scaling.
    if (s.quality !== this.appliedQuality) {
      this.appliedQuality = s.quality;
      this.engine.setQuality(s.quality);
      this.redrawUntil = performance.now() + 100;
    }
    const retro: RetroMode = RETRO_SETTING_ENABLED ? (this.flags.retro ?? s.retro) : 'off';
    if (retro !== this.appliedRetro) {
      this.appliedRetro = retro;
      this.engine.setRetro(retro);
      this.root.dataset.retro = retro;
      this.redrawUntil = performance.now() + 100;
    }
    this.gridW = -1; // re-derive the overlay's pixel grid (quality changes its line count)
    // A player's own ART change wins over a `&art=` link override.
    if (this.appliedArt !== undefined && s.art !== this.appliedArt) this.flags.art = undefined;
    this.appliedArt = s.art;
    if (this.world) this.syncSprites(this.world);
  }

  /** Character art in effect (URL flag over the ART setting). */
  get artStyle(): ArtStyle {
    return this.flags.art ?? this.save.settings.art ?? '3d';
  }

  /** ART chip on the pause screen: switch live (and drop a `&art=` URL override). */
  setArt(art: ArtStyle) {
    this.flags.art = undefined;
    this.save.updateSettings({ art });
    this.settingsChanged(this.save.settings);
  }

  /** Create / drop the sprite renderer for `w` to match the ART setting (also mid-stage). */
  private syncSprites(w: World) {
    const want = this.artStyle === 'sprites';
    if (want && !this.sprites) {
      const r = this.engine.renderer;
      const css = new THREE.Vector2();
      const buf = new THREE.Vector2();
      this.sprites = new SpriteArt(r, w, () => {
        // Sprite texels are whole retro pixels; with the retro pass off the scene
        // draws straight to the canvas, so snap to the retro grid scaled onto it.
        r.getSize(css);
        const grid = this.engine.retro.targetSize(css.x, css.y);
        if (this.engine.retro.enabled) return { grid, target: grid };
        r.getDrawingBufferSize(buf);
        return { grid, target: { width: buf.x, height: buf.y } };
      });
      // Debug: `&spriteLook=bands:6,k:1` tunes the pixel-art pass.
      if (typeof location !== 'undefined') this.sprites.look = parseLook(new URLSearchParams(location.search).get('spriteLook'));
      this.redrawUntil = performance.now() + 100;
    } else if (!want && this.sprites) {
      this.sprites.dispose();
      this.sprites = null;
      this.redrawUntil = performance.now() + 100;
    }
  }

  /** SFX / music volumes (SFX ducked under the attract demo, silent while it fast-forwards). */
  private applyVolumes(s: Settings = this.save.settings) {
    const duck = this.demo ? (this.demo.ff >= 0 ? 0 : DEMO_SFX) : 1;
    this.audio.setVolumes(s.sfxVolume * duck, s.musicVolume);
  }

  /** Keep the 2D overlay on the retro pass's pixel grid (or full-res when it's off). */
  private syncOverlayGrid() {
    const r = this.engine.retro;
    const { width, height } = this.engine.size;
    if (width === this.gridW && height === this.gridH && r.scale === this.gridScale && r.enabled === this.gridOn) return;
    this.gridW = width;
    this.gridH = height;
    this.gridScale = r.scale;
    this.gridOn = r.enabled;
    if (r.enabled) {
      const t = r.targetSize(width, height);
      this.hud.overlay.setPixelGrid(t.width, t.height);
    } else this.hud.overlay.setPixelGrid(0, 0);
  }

  private music(id: MusicId | null) {
    this.audio.playMusic(id);
  }

  // ─── Stage lifecycle ──────────────────────────────────────────────────────

  /**
   * Start a stage. Building one blocks the main thread for 0.4–1 s (procedural
   * scenery, shader compiles, buffer uploads), so the UI goes first: the intro
   * card (or the pressed RETRY button) paints, then the world is built on a
   * following frame, shaders are compiled behind the card, and play begins when
   * both the card and the build are done. The attract demo builds right away.
   */
  private startStage(stage: StageDef, skipIntro = false) {
    const demo = !!this.demo;
    const showIntro = !(skipIntro || this.flags.autoplay || demo);
    this.loading = { stage, showIntro, frames: 0, built: false, introDone: !showIntro };
    this.input.reset();
    this.holdStart.clear();
    if (demo) {
      // Attract mode: nobody is waiting on a tap — build now.
      this.buildWorld(stage, false);
      this.finishLoading();
      return;
    }
    // The current music fades out instead of starving while the build blocks.
    this.music(null);
    this.state = showIntro ? 'intro' : 'loading';
    if (showIntro) this.menus.showStageIntro(stage, this.campaignOf(stage), () => this.introFinished());
  }

  private campaignOf(stage: StageDef): CampaignDef {
    return this.run?.campaign ?? this.findStage(stage.id)?.campaign ?? this.campaigns[0];
  }

  /** The intro card is done (timer or tap): play now, or as soon as the stage is ready. */
  private introFinished() {
    if (this.loading) this.loading.introDone = true;
    else if (this.state === 'intro') this.beginPlay();
  }

  /** Advance a pending stage load by one frame. */
  private loadingTick() {
    const l = this.loading;
    if (!l) return;
    l.frames++;
    if (!l.built) {
      if (l.frames > LOAD_PAINT_FRAMES) {
        this.buildWorld(l.stage, l.showIntro);
        l.built = true;
      }
      return;
    }
    this.finishLoading();
  }

  /** Stop a pending load (the player left before it finished). */
  private cancelLoading() {
    this.loading = null;
  }

  /** Tear down the old stage and build the new one (environment, runner, HUD wiring). */
  private buildWorld(stage: StageDef, showIntro: boolean) {
    this.teardownWorld();
    const demo = !!this.demo;
    // The demo plays itself: no vibration on the player's phone while it idles.
    const settings = demo ? { ...this.save.settings, haptics: false } : this.save.settings;
    const w = new World(this.engine.camera, this.audio, this.hud, settings, this.flags.seed ?? (Date.now() & 0xffff));
    w.viewport = { ...this.engine.size };
    w.fx.setViewportHeight(this.engine.size.height, this.engine.pixelRatio);
    if (this.flags.god || demo) w.player.god = true;
    if (this.flags.speed) w.timeScale = this.flags.speed;
    if (this.run) {
      w.player.bombs = this.run.bombs;
      this.run.stageBombs = this.run.bombs;
      this.run.banked = 0;
    }
    this.world = w;
    this.syncSprites(w);
    this.shooter = new Shooter(w);
    this.runner = new StageRunner(w, stage);
    // HUD wiring first: the opening beat (usually a banner, or a boss when
    // debugging with ?beat=) talks to the HUD from inside runner.start().
    this.hud.reset();
    w.events.on('boss-start', ({ boss }) => this.hud.bossIntro(boss.title));
    w.events.on('player-hurt', ({ from }) => this.showHurtDirection(from));
    // The intro card already names the stage: don't repeat it as the opening banner.
    // (The demo cuts straight to the action: no title card either.)
    this.hud.suppressBanner(showIntro || demo ? stage.name : null);
    try {
      this.runner.start(this.flags.beat ?? 0);
    } catch (err) {
      console.error('[game] stage failed to start', err);
      this.stats.errors++;
    }
    this.hud.suppressBanner(null);
    this.autoplay = this.flags.autoplay || demo ? new AutoPlayer(w, this.shooter) : null;
    this.clearTimer = -1;
    w.weapons.onChange = () => this.audio.play('ui_click', { volume: 0.4 });
    w.weapons.onReloadDone = () => {
      const id = w.weapons.def.id;
      this.audio.play(id === 'shotgun' ? 'reload_done_shotgun' : id === 'magnum' ? 'reload_done_magnum' : 'reload_done', { volume: 0.7 });
    };
    w.score.onMultiplier = (m) => {
      this.hud.popup(`x${m} COMBO`, this.engine.size.width / 2, this.engine.size.height * 0.28, 'combo');
      // The ding climbs a whole tone per multiplier step (x1.5 → 1.0 … x4 → 1.78).
      this.audio.play('combo', { pitch: Math.pow(2, (((m - 1.5) / 0.5) * 2) / 12) });
    };
    w.events.on('player-dead', () => this.onPlayerDead());
    w.events.on('stage-clear', () => (this.clearTimer = 1.8));
    w.events.on('boss-dead', () => this.music(null));
  }

  /** Shader warm-up + first render of the freshly built stage, then play (or wait for the intro card). */
  private finishLoading() {
    const l = this.loading;
    this.loading = null;
    const w = this.world;
    if (!l || !w || !this.runner) return;
    const stage = l.stage;
    this.warmUp(w, stage);
    this.music(stage.music ?? (this.campaignOf(stage).id === 'zombie' ? 'zombie' : 'dino'));
    if (this.demo) {
      // Starts on a black cut that fast-forwards to the first enemies (see demoTick).
      this.state = 'demo';
      this.menus.hide();
      this.hud.setDemo(true);
      this.hud.demoCut(true);
      this.hud.show(true);
      this.input.enabled = true;
      return;
    }
    // Render one frame so the intro card has the scene behind it (also uploads the buffers).
    this.renderWorld(w);
    if (l.introDone) this.beginPlay();
    else this.state = 'intro';
  }

  /**
   * Compile every shader program the stage will need — its scenery and FX plus
   * throwaway copies of each enemy type, pickup and civilian it spawns — while
   * the intro card is up, so first contact and the boss entrance don't hitch.
   */
  private warmUp(w: World, stage: StageDef) {
    if (this.engine.contextLost) return;
    try {
      const before = this.engine.renderer.info.programs?.length ?? 0;
      const set = buildWarmupSet(w, stage);
      w.scene.add(set.group);
      w.scene.updateMatrixWorld();
      this.engine.precompile(w.scene, w.scene);
      // ART: SPRITES draws characters into an offscreen target: compile those variants too.
      this.sprites?.precompile(set.group);
      set.dispose();
      if (this.flags.debug) console.info(`[game] warm-up: ${set.count} prototypes, programs ${before} → ${this.engine.renderer.info.programs?.length ?? 0}`);
    } catch (err) {
      console.warn('[game] shader warm-up failed', err);
    }
  }

  private beginPlay() {
    this.state = 'playing';
    this.menus.hide();
    this.hud.show(true);
    this.input.enabled = true;
    if (!this.save.data.seenTutorial && !this.flags.autoplay && !this.flags.stage && !this.demo) this.openTutorial();
    // The intro ran out while the app was in the background: don't start blind.
    else if (typeof document !== 'undefined' && document.hidden) this.pause();
    else if (this.engine.contextLost) this.pause(GFX_NOTE);
  }

  /** First stage ever: show the illustrated briefing; the stage waits underneath. */
  private openTutorial() {
    const w = this.world;
    if (!w || !this.runner) return;
    this.state = 'paused';
    this.tutorialOpen = true;
    this.input.reset();
    // Populate the HUD once so the briefing sits over the real layout.
    this.hud.sync(w, 0, this.runner.progress, this.engine.fps);
    this.menus.showTutorial(() => this.closeTutorial());
  }

  private closeTutorial() {
    if (!this.tutorialOpen) return;
    this.tutorialOpen = false;
    this.save.data.seenTutorial = true;
    this.save.persist();
    this.menus.hide();
    if (this.state === 'paused') this.state = 'playing';
  }

  /** Red wedge on the screen edge facing the nearest hostile when the player is hit. */
  private showHurtDirection(from?: Entity) {
    const w = this.world;
    if (!w) return;
    const cam = w.camera;
    let best = Infinity;
    if (from && !from.removed) {
      from.root.getWorldPosition(_hurtBest);
      best = _hurtBest.distanceToSquared(cam.position);
    } else for (const e of w.entities) {
      if (!e.hostile || e.removed) continue;
      e.root.getWorldPosition(_hurtV);
      const d = _hurtV.distanceToSquared(cam.position);
      if (d < best) {
        best = d;
        _hurtBest.copy(_hurtV);
      }
    }
    if (best > 40 * 40) return;
    _hurtBest.applyMatrix4(cam.matrixWorldInverse); // camera space: +x right, +y up, -z ahead
    const ahead = -_hurtBest.z;
    const off = Math.hypot(_hurtBest.x, _hurtBest.y) / Math.max(0.5, Math.abs(ahead));
    if (ahead > 0 && off < 0.35) return; // right in front of you — the full-screen flash says enough
    const ang = Math.atan2(-_hurtBest.y * (ahead > 0 ? 1 : 0.3), _hurtBest.x);
    this.hud.damageFrom(ang);
  }

  private teardownWorld() {
    // Don't let a stage's roars/alarms carry into menus or restarts.
    this.audio.stopSfx();
    this.audio.setPaused(false);
    if (this.sprites) {
      this.sprites.dispose();
      this.sprites = null;
    }
    if (this.world) {
      this.world.dispose();
      this.world = null;
    }
    this.runner = null;
    this.shooter = null;
    this.autoplay = null;
    this.tutorialOpen = false;
    this.holdStart.clear();
    this.hud.setDemo(false);
    Kit.disposeAll();
  }

  // ─── Attract demo ─────────────────────────────────────────────────────────

  /** Attract cycle: a random stage plays itself (god + aimbot) behind DEMO PLAY. */
  startDemo() {
    if (this.state !== 'menu' || this.world || this.flags.stage) return;
    const stages = this.campaigns.flatMap((c) => c.stages);
    if (stages.length === 0) return;
    const stage = stages[this.demoIndex++ % stages.length];
    this.run = null;
    this.demo = { t: 0, last: 0, lull: 0, ff: 0, cutAt: performance.now(), sinceCut: 0 };
    this.applyVolumes();
    this.startStage(stage, true);
  }

  /**
   * Per-frame demo bookkeeping. An attract demo should show off the action, so
   * the walk-in and the walks between encounters are skipped: the screen cuts
   * to black (DEMO PLAY stays up) while the stage fast-forwards headlessly to
   * the next enemy. Returns true when this frame has no live action to show.
   */
  private demoTick(demo: Demo, w: World, runner: StageRunner): boolean {
    const now = performance.now();
    const real = demo.last ? Math.min(0.25, (now - demo.last) / 1000) : 0;
    demo.last = now;
    // Stage over, or the player died (can't happen in god mode): back to the title.
    if (this.clearTimer > 0 || runner.done || w.player.hp <= 0) {
      this.endDemo(false);
      return true;
    }
    if (demo.ff >= 0) {
      do {
        if (w.hostileCount() > 0) {
          // Found the next fight. Hold the black a moment if the skip was short.
          if (now - demo.cutAt < DEMO_CUT_MIN_MS) return true;
          this.demoCut(false);
          return false;
        }
        if (demo.ff > DEMO_FF_MAX || this.clearTimer > 0 || runner.done) {
          this.endDemo(false);
          return true;
        }
        try {
          runner.update(w.update(DEMO_FF_STEP));
          w.scene.updateMatrixWorld();
        } catch (err) {
          this.stats.errors++;
          console.error('[game] demo fast-forward error', err);
          this.endDemo(false);
          return true;
        }
        demo.ff += DEMO_FF_STEP;
      } while (performance.now() - now < DEMO_FF_BUDGET_MS);
      return true;
    }
    demo.t += real;
    demo.sinceCut += real;
    demo.lull = w.hostileCount() > 0 ? 0 : demo.lull + real;
    if (demo.t >= DEMO_SECONDS) {
      this.endDemo(false);
      return true;
    }
    const b = runner.beat;
    const travelling = !!b && (b.kind === 'move' ? !b.waves?.length : b.kind !== 'hold' && b.kind !== 'boss');
    const lull = travelling ? DEMO_LULL_TRAVEL : DEMO_LULL;
    if (demo.lull >= lull && demo.sinceCut >= DEMO_CUT_GAP && DEMO_SECONDS - demo.t >= DEMO_CUT_TAIL) {
      this.demoCut(true);
      return true;
    }
    return false;
  }

  /** Start / end a demo cut (black screen while the stage fast-forwards, SFX silent). */
  private demoCut(on: boolean) {
    const demo = this.demo;
    if (!demo) return;
    if (on) {
      demo.ff = 0;
      demo.lull = 0;
      demo.cutAt = performance.now();
    } else {
      demo.ff = -1;
      demo.sinceCut = 0;
      demo.last = performance.now();
      // Drop whatever the skipped stretch triggered (muted) before turning the sound back up.
      this.audio.stopSfx();
    }
    this.applyVolumes();
    this.hud.demoCut(on);
  }

  /** Leave the demo: back to the title (timeout) or straight to the main menu (PRESS START). */
  private endDemo(toMain: boolean) {
    if (!this.demo) return;
    this.demo = null;
    this.cancelLoading();
    this.teardownWorld();
    this.applyVolumes();
    this.run = null;
    this.state = 'menu';
    this.input.reset();
    this.hud.show(false);
    this.music('menu');
    if (toMain) {
      this.audio.play('ui_start');
      this.menus.showMain();
    } else this.showTitle();
  }

  // ─── Hi-score name entry ──────────────────────────────────────────────────

  /** Score that ends an arcade credit: the 1P counter, plus the initials screen when it makes the table. */
  private finishCredit(run: Run, score: number, stage: string): (() => void) | undefined {
    run.ended = true;
    this.menus.lastScore = score;
    const rank = this.save.hiScoreRank(run.campaign.id, score);
    if (rank < 0) return undefined;
    const { campaign, continues } = run;
    return () => this.enterInitials(campaign, score, stage, continues);
  }

  /**
   * Leaving an arcade run early (pause → QUIT, MENU on a results screen) still
   * ends the credit: the banked score (+ the stage in progress) goes to the
   * initials screen when it makes the table.
   */
  private abandonCredit(): (() => void) | undefined {
    const run = this.run;
    if (!run || run.mode !== 'arcade' || run.ended) return undefined;
    const live = this.state === 'paused' ? (this.world?.score.score ?? 0) : 0;
    const score = run.total + live;
    if (score <= 0) return undefined;
    return this.finishCredit(run, score, this.runner?.stage.id ?? '');
  }

  private enterInitials(campaign: CampaignDef, score: number, stage: string, continues: number) {
    this.cancelLoading();
    this.teardownWorld();
    this.run = null;
    this.state = 'menu';
    this.input.reset();
    this.hud.show(false);
    this.music('results');
    const rank = this.save.hiScoreRank(campaign.id, score);
    this.menus.showNameEntry({ campaign, score, rank, initials: this.save.data.lastInitials }, (initials) => {
      const at = this.save.addHiScore(campaign.id, { initials, score, stage, continues });
      this.music('menu');
      this.menus.showHiScores({
        highlight: at >= 0 ? { campaign: campaign.id, rank: at } : undefined,
        done: () => this.menus.showMain(),
      });
    });
    // The name entry plays over that campaign's scene (screens reset the lock when they open).
    this.backdropTheme = campaign.id === 'zombie' ? 'city' : 'jungle';
  }

  private onPlayerDead() {
    // (Demo: god mode — but if it ever happens the frame loop ends the demo, never mid-update.)
    if (this.state === 'demo') return;
    if (this.state !== 'playing') return;
    this.state = 'continue';
    this.input.reset();
    this.hud.show(false);
    this.audio.play('game_over');
    this.music('gameover');
    // Classic 9 → 0 countdown (10 s to decide).
    this.continueAt = performance.now();
    this.continueSecs = CONTINUE_SECS;
    this.menus.showContinue(CONTINUE_SECS);
  }

  /** Back from the background on CONTINUE?: reopen the countdown where it was (at least a few seconds). */
  private reopenContinue() {
    const seen = Math.max(0, (this.continueHiddenAt - this.continueAt) / 1000);
    const left = Math.max(CONTINUE_MIN_RESUME, Math.min(CONTINUE_SECS, Math.round(this.continueSecs - seen)));
    this.continueAt = performance.now();
    this.continueSecs = left;
    this.menus.showContinue(left);
  }

  private stageCleared() {
    const w = this.world!;
    const stage = this.runner!.stage;
    const result = w.score.results(stage.id, w.player.damageTaken);
    this.lastResult = result;
    const isBest = this.save.recordStage(stage.id, result.total, result.grade);
    const campaign = this.findStage(stage.id)!.campaign;
    const next = campaign.stages[stage.index + 1];
    if (next) this.save.unlock(next.id);
    this.stats.stagesCleared++;
    if (this.run) {
      this.run.total += result.total;
      this.run.banked = result.total;
      // Arcade runs carry bombs into the next stage; Stage Select always starts fresh.
      if (this.run.mode === 'arcade') this.run.bombs = w.player.bombs;
    }
    this.state = 'results';
    this.input.reset();
    this.hud.show(false);
    this.audio.play('stage_clear');
    this.music('results');
    if (this.run?.mode !== 'arcade') this.menus.lastScore = result.total;
    const label = this.run?.mode === 'arcade' ? (next ? 'NEXT STAGE' : 'FINISH') : 'CONTINUE';
    this.menus.showResults(result, isBest, label);
  }

  // ─── MenuActions ──────────────────────────────────────────────────────────

  playCampaign(id: CampaignId) {
    const c = this.campaigns.find((x) => x.id === id)!;
    this.run = newRun('arcade', c, 0);
    this.startStage(c.stages[0]);
  }

  playStage(stage: StageDef) {
    const c = this.findStage(stage.id)!.campaign;
    this.run = newRun('single', c, stage.index);
    this.startStage(stage);
  }

  settingsChanged(s: Settings) {
    this.applySettings(s);
    if (this.world) Object.assign(this.world.settings, s);
  }

  /** `note` replaces the stage name on the pause screen (e.g. the graphics-reset notice). */
  pause(note?: string) {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    this.input.reset();
    this.holdStart.clear();
    this.audio.play('ui_click');
    this.audio.setPaused(true);
    this.menus.showPause(this.pauseInfo(note));
  }

  private pauseInfo(note?: string) {
    return {
      stage: note ?? this.runner?.stage.name ?? '',
      campaign: this.run?.campaign.name,
      score: this.world?.score.score ?? 0,
      art: this.artStyle,
    };
  }

  /** The GPU dropped the WebGL context: stop the action (nothing can be drawn). */
  private onGraphicsLost() {
    console.warn('[game] WebGL context lost');
    if (this.state === 'playing') this.pause(GFX_NOTE);
    else if (this.state === 'paused' && !this.tutorialOpen) this.menus.showPause(this.pauseInfo(GFX_NOTE));
  }

  /** Context back: redraw the frozen frame; the pause menu stays so the player resumes deliberately. */
  private onGraphicsRestored() {
    console.info('[game] WebGL context restored');
    this.gridW = -1;
    this.redrawUntil = performance.now() + 1000;
    if (this.state === 'paused' && !this.tutorialOpen) this.menus.showPause(this.pauseInfo());
  }

  resume() {
    if (this.engine.contextLost) return; // keep the pause screen until the GPU is back
    if (this.tutorialOpen) return this.closeTutorial();
    if (this.state !== 'paused') return;
    this.menus.hide();
    this.audio.setPaused(false);
    this.state = 'playing';
  }

  restart(): void {
    if (!this.runner) return this.quit();
    const stage = this.runner.stage;
    const run = this.run;
    if (run?.mode === 'arcade') {
      // Replaying a stage replaces its score: take back what its results screen
      // banked (else clear → RETRY → clear farms the hi-score table), and start
      // it again with the bombs carried into it.
      run.total -= run.banked;
      run.banked = 0;
      // RETRY after GAME OVER keeps the credit going: that's a continue.
      if (this.state === 'gameover') {
        run.continues++;
        run.ended = false;
      }
    }
    // Start again with the bombs carried into the stage (Stage Select: always the default 1).
    if (run) run.bombs = run.stageBombs;
    this.startStage(stage, true);
  }

  quit(): void {
    const run = this.run;
    // MENU on the final stage's results: the campaign is cleared, so take the ending.
    if (this.state === 'results' && run?.mode === 'arcade' && !run.ended && this.runner) {
      if (!run.campaign.stages[this.runner.stage.index + 1]) return this.nextStage();
    }
    const nameEntry = this.abandonCredit();
    this.cancelLoading();
    this.teardownWorld();
    this.run = null;
    this.state = 'menu';
    this.hud.show(false);
    if (nameEntry) return nameEntry();
    this.music('menu');
    this.menus.showMain();
  }

  nextStage(): void {
    const run = this.run;
    const stage = this.runner?.stage;
    if (!run || !stage) return this.quit();
    if (run.mode === 'arcade') {
      const next = run.campaign.stages[stage.index + 1];
      if (next) {
        run.stageIndex = next.index;
        this.startStage(next);
      } else {
        const isBest = this.save.recordCampaign(run.campaign.id, run.total);
        const nameEntry = this.finishCredit(run, run.total, 'ALL');
        this.cancelLoading();
        this.teardownWorld();
        this.state = 'menu';
        this.music('results');
        this.menus.showCampaignClear(run.campaign, run.total, isBest, nameEntry);
        this.backdropTheme = run.campaign.id === 'zombie' ? 'city' : 'jungle';
      }
    } else {
      this.cancelLoading();
      this.teardownWorld();
      this.state = 'menu';
      this.music('menu');
      this.menus.showStageSelect(() => this.menus.showMain());
    }
  }

  continueYes() {
    if (this.state !== 'continue' || !this.world) return;
    const w = this.world;
    w.player.revive();
    w.score.continues++;
    if (this.run) this.run.continues++;
    w.score.breakCombo();
    // Clear the immediate threats so the player isn't killed instantly: regular
    // attackers are knocked out of their wind-up, incoming projectiles vanish,
    // and boss attacks restart their telegraph (revive also grants i-frames).
    for (const e of w.entities) {
      if (e instanceof Projectile) {
        e.removed = true;
      } else if (e instanceof Enemy && e.state !== 'dying') {
        if (e.isBoss) e.stateTime = 0;
        else if (e.state === 'windup' || e.state === 'recover') e.stagger();
      }
    }
    this.menus.hide();
    this.hud.show(true);
    const st = this.runner!.stage;
    this.music(w.boss ? 'boss' : st.music ?? (st.campaign === 'zombie' ? 'zombie' : 'dino'));
    this.state = 'playing';
  }

  continueNo() {
    if (this.state !== 'continue') return;
    // The countdown timer can run out while the app is in the background: that's no answer.
    if (typeof document !== 'undefined' && document.hidden) return;
    this.state = 'gameover';
    const score = (this.run?.total ?? 0) + (this.world?.score.score ?? 0);
    const run = this.run;
    const nameEntry =
      run?.mode === 'arcade' ? this.finishCredit(run, score, this.runner?.stage.id ?? '') : ((this.menus.lastScore = score), undefined);
    this.menus.showGameOver(score, nameEntry);
  }

  // ─── Input ────────────────────────────────────────────────────────────────

  private onPress(x: number, y: number, id: number) {
    if (this.state === 'demo') return this.endDemo(true);
    if (this.state !== 'playing' || !this.shooter) return;
    this.holdStart.set(id, performance.now());
    this.shooter.fire(x, y, false);
  }

  private onKey(code: string) {
    if (this.state === 'demo') {
      if (code === 'Enter' || code === 'Space') this.endDemo(true);
      else if (code === 'Escape') this.endDemo(false);
      return;
    }
    if (code === 'Escape' || code === 'KeyP') {
      if (this.state === 'playing') this.pause();
      else if (this.state === 'paused') this.resume();
      return;
    }
    if (this.state !== 'playing' || !this.world) return;
    const map: Record<string, WeaponId> = { Digit1: 'pistol', Digit2: 'shotgun', Digit3: 'smg', Digit4: 'magnum' };
    if (map[code]) this.world.weapons.select(map[code]);
    if (code === 'KeyQ' || code === 'Tab') this.world.weapons.cycle();
    if (code === 'KeyB') this.world.useBomb();
  }

  /** Held-finger repeat fire. Semi-autos wait a moment so single taps stay single. */
  private heldFire() {
    if (!this.shooter || !this.world || this.holdStart.size === 0) return;
    const def = this.world.weapons.def;
    const now = performance.now();
    let oldest = Infinity;
    for (const t of this.holdStart.values()) oldest = Math.min(oldest, t);
    const heldFor = (now - oldest) / 1000;
    if (!def.auto && heldFor < 0.28) return;
    this.hud.overlay.holdAim(this.input.aimX, this.input.aimY);
    this.shooter.fire(this.input.aimX, this.input.aimY, true);
  }

  // ─── Frame ────────────────────────────────────────────────────────────────

  private frame(dt: number) {
    this.stats.frames++;
    this.audio.update(dt);
    if (this.loading && !this.demo) this.loadingTick();
    const w = this.world;
    if (w) {
      w.viewport.width = this.engine.size.width;
      w.viewport.height = this.engine.size.height;
    }
    this.syncOverlayGrid();
    // Nothing can be drawn without the context: never let the action run on blind.
    if (this.engine.contextLost && this.state === 'playing') this.pause(GFX_NOTE);
    if ((this.state === 'playing' || this.state === 'demo') && w && this.runner) {
      const demo = this.demo;
      if (demo && this.demoTick(demo, w, this.runner)) return;
      try {
        if (!demo) this.heldFire();
        this.autoplay?.update(dt * w.timeScale);
        const sdt = w.update(dt);
        this.runner.update(sdt);
        if (this.clearTimer > 0 && !demo) {
          this.clearTimer -= dt;
          if (this.clearTimer <= 0) this.stageCleared();
        }
        this.audio.setIntensity(w.boss ? 1 : Math.min(1, w.hostileCount() / 6));
      } catch (err) {
        this.stats.errors++;
        console.error('[game] frame error', err);
      }
      this.hud.sync(w, dt, this.runner.progress, this.engine.fps);
      if (this.flags.debug) this.hud.setDebug(`${this.runner.label}  d=${w.rig.d.toFixed(1)}/${w.rig.length.toFixed(0)}  hostiles=${w.hostileCount()}  ents=${w.entities.length}`);
      this.renderWorld(w);
      this.hud.drawOverlay(w, dt);
    } else if (w && FROZEN.has(this.state)) {
      // Menus over a frozen world (intro, loading, pause, results, continue, game
      // over): the canvas keeps the last frame, so only redraw when a resize
      // (dynamic resolution, rotation, a settings change) or a lost context cleared it.
      const { width, height } = this.engine.size;
      if (
        width !== this.renderedW ||
        height !== this.renderedH ||
        this.engine.pixelRatio !== this.renderedDpr ||
        performance.now() < this.redrawUntil
      ) {
        this.renderWorld(w);
        if (this.state === 'paused') this.hud.drawOverlay(w, 0);
      }
      if (this.state !== 'paused' && this.state !== 'gameover') this.hud.drawOverlay(null, dt);
    } else if (!w) {
      this.renderBackdrop(dt);
    }
  }

  private renderWorld(w: World) {
    const { width, height } = this.engine.size;
    this.renderedW = width;
    this.renderedH = height;
    this.renderedDpr = this.engine.pixelRatio;
    const sp = this.sprites;
    if (!sp || this.engine.contextLost) {
      this.engine.render(w.scene);
      return;
    }
    try {
      sp.beginFrame();
      this.engine.render(w.scene);
    } finally {
      sp.endFrame();
    }
  }

  private renderBackdrop(dt: number) {
    if (!this.backdrop) {
      this.backdrop = new MenuBackdrop();
      this.backdrop.onThunder = (v) => this.audio.play('thunder', { volume: v });
    }
    this.backdrop.setTheme(this.backdropTheme);
    const { width, height } = this.engine.size;
    const bd = this.backdrop;
    const retro = this.engine.retro;
    const px = retro.enabled ? retro.targetSize(width, height).height : height * this.engine.pixelRatio;
    bd.update(dt, width, height, px);
    // Same arcade-monitor post effect as gameplay when it's switched on.
    if (this.engine.retro.enabled) this.engine.render(bd.scene, bd.camera);
    else bd.render(this.engine.renderer);
  }
}

/** True if `key` was already set this browser session (and sets it). Storage may be unavailable. */
function sessionFlag(key: string): boolean {
  try {
    const ss = globalThis.sessionStorage;
    if (ss.getItem(key)) return true;
    ss.setItem(key, '1');
    return false;
  } catch {
    return false;
  }
}
