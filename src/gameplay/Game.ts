import * as THREE from 'three';
import { Engine } from '../core/Engine';
import { Input } from '../core/Input';
import { Save } from '../core/Save';
import type { CampaignId, Settings, StageResult } from '../core/types';
import { AudioSystem } from '../audio/Audio';
import type { MusicId } from '../audio/names';
import { Hud } from '../ui/Hud';
import { Menus, type MenuActions } from '../ui/Menus';
import { World } from './World';
import { StageRunner } from './StageRunner';
import { Shooter } from './Shooting';
import type { CampaignDef, StageDef } from './StageTypes';
import { Kit } from '../content/kit/ModelKit';
import { AutoPlayer } from '../debug/AutoPlayer';
import type { WeaponId } from '../core/types';
import { zooStage } from '../content/stages/zoo';

export interface DebugFlags {
  stage?: string;
  beat?: number;
  autoplay?: boolean;
  god?: boolean;
  speed?: number;
  seed?: number;
  debug?: boolean;
  mute?: boolean;
}

type State = 'menu' | 'intro' | 'playing' | 'paused' | 'continue' | 'results' | 'gameover';

interface Run {
  mode: 'arcade' | 'single';
  campaign: CampaignDef;
  stageIndex: number;
  total: number;
  bombs: number;
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
  private run: Run | null = null;
  private clearTimer = -1;
  private holdStart = new Map<number, number>();
  private menuScene = new THREE.Scene();
  lastResult: StageResult | null = null;
  /** Exposed for tests / debugging. */
  stats = { frames: 0, stagesCleared: 0, errors: 0 };

  constructor(
    readonly root: HTMLElement,
    readonly campaigns: CampaignDef[],
    readonly flags: DebugFlags = {},
  ) {
    const s = this.save.settings;
    this.engine = new Engine(root.querySelector('#stage') as HTMLElement, s.quality);
    const surface = root.querySelector('#play-surface') as HTMLElement;
    this.input = new Input(surface);
    this.hud = new Hud(root.querySelector('#hud-layer') as HTMLElement, {
      pause: () => this.pause(),
      reload: () => this.shooter?.reload(),
      bomb: () => this.state === 'playing' && this.world?.useBomb(),
      cycleWeapon: () => this.state === 'playing' && this.world?.weapons.cycle(),
    });
    this.menus = new Menus(root.querySelector('#menu-layer') as HTMLElement, this.save, this.audio, campaigns, this);
    this.applySettings(s);
    if (flags.mute) this.audio.setMuted(true);
    this.menuScene.background = new THREE.Color(0x07080c);

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
        this.audio.suspend();
      } else {
        this.audio.resume();
      }
    });
    // Unlock audio on the very first interaction anywhere.
    const unlock = () => this.audio.unlock();
    window.addEventListener('pointerdown', unlock, { capture: true });
    window.addEventListener('keydown', unlock, { capture: true });

    this.engine.onFrame = (dt) => this.frame(dt);
  }

  boot() {
    this.engine.start();
    if (this.flags.stage) {
      const st = this.findStage(this.flags.stage);
      if (st) {
        this.run = { mode: 'single', campaign: st.campaign, stageIndex: st.stage.index, total: 0, bombs: 1 };
        this.startStage(st.stage, true);
        return;
      }
      console.warn(`Unknown stage "${this.flags.stage}"`);
    }
    this.music('menu');
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
    this.audio.setVolumes(s.sfxVolume, s.musicVolume);
    this.hud.setLeftHanded(s.leftHanded);
    this.hud.showFps(s.showFps);
    this.engine.setQuality(s.quality);
  }

  private music(id: MusicId | null) {
    this.audio.playMusic(id);
  }

  // ─── Stage lifecycle ──────────────────────────────────────────────────────

  private startStage(stage: StageDef, skipIntro = false) {
    this.teardownWorld();
    const w = new World(this.engine.camera, this.audio, this.hud, this.save.settings, this.flags.seed ?? (Date.now() & 0xffff));
    w.viewport = { ...this.engine.size };
    w.fx.setViewportHeight(this.engine.size.height, this.engine.pixelRatio);
    if (this.flags.god) w.player.god = true;
    if (this.flags.speed) w.timeScale = this.flags.speed;
    if (this.run) w.player.bombs = this.run.bombs;
    this.world = w;
    this.shooter = new Shooter(w);
    this.runner = new StageRunner(w, stage);
    try {
      this.runner.start(this.flags.beat ?? 0);
    } catch (err) {
      console.error('[game] stage failed to start', err);
      this.stats.errors++;
    }
    this.autoplay = this.flags.autoplay ? new AutoPlayer(w, this.shooter) : null;
    this.clearTimer = -1;
    this.hud.reset();
    w.weapons.onChange = () => this.audio.play('ui_click', { volume: 0.4 });
    w.weapons.onReloadDone = () => this.audio.play('reload_done', { volume: 0.7 });
    w.score.onMultiplier = (m) => {
      this.hud.popup(`x${m} COMBO`, this.engine.size.width / 2, this.engine.size.height * 0.28, 'combo');
      this.audio.play('combo');
    };
    w.events.on('player-dead', () => this.onPlayerDead());
    w.events.on('stage-clear', () => (this.clearTimer = 1.8));
    w.events.on('boss-dead', () => this.music(null));
    const campaign = this.run?.campaign ?? this.findStage(stage.id)!.campaign;
    this.music(stage.music ?? (campaign.id === 'zombie' ? 'zombie' : 'dino'));
    // Render one frame so the intro card has the scene behind it.
    this.engine.render(w.scene);
    if (skipIntro || this.flags.autoplay) {
      this.beginPlay();
    } else {
      this.state = 'intro';
      this.menus.showStageIntro(stage, campaign, () => this.beginPlay());
    }
  }

  private beginPlay() {
    this.state = 'playing';
    this.menus.hide();
    this.hud.show(true);
    this.input.enabled = true;
  }

  private teardownWorld() {
    if (this.world) {
      this.world.dispose();
      this.world = null;
    }
    this.runner = null;
    this.shooter = null;
    this.autoplay = null;
    this.holdStart.clear();
    Kit.disposeAll();
  }

  private onPlayerDead() {
    if (this.state !== 'playing') return;
    this.state = 'continue';
    this.input.reset();
    this.hud.show(false);
    this.audio.play('game_over');
    this.music('gameover');
    this.menus.showContinue(10);
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
      this.run.bombs = w.player.bombs;
    }
    this.state = 'results';
    this.input.reset();
    this.hud.show(false);
    this.audio.play('stage_clear');
    this.music('results');
    const label = this.run?.mode === 'arcade' ? (next ? 'NEXT STAGE' : 'FINISH') : 'CONTINUE';
    this.menus.showResults(result, isBest, label);
  }

  // ─── MenuActions ──────────────────────────────────────────────────────────

  playCampaign(id: CampaignId) {
    const c = this.campaigns.find((x) => x.id === id)!;
    this.run = { mode: 'arcade', campaign: c, stageIndex: 0, total: 0, bombs: 1 };
    this.startStage(c.stages[0]);
  }

  playStage(stage: StageDef) {
    const c = this.findStage(stage.id)!.campaign;
    this.run = { mode: 'single', campaign: c, stageIndex: stage.index, total: 0, bombs: 1 };
    this.startStage(stage);
  }

  settingsChanged(s: Settings) {
    this.applySettings(s);
    if (this.world) Object.assign(this.world.settings, s);
  }

  pause() {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    this.input.reset();
    this.audio.play('ui_click');
    this.menus.showPause();
  }

  resume() {
    if (this.state !== 'paused') return;
    this.menus.hide();
    this.state = 'playing';
  }

  restart() {
    if (!this.runner) return this.quit();
    const stage = this.runner.stage;
    if (this.run?.mode === 'arcade') this.run.bombs = 1;
    this.startStage(stage, true);
  }

  quit() {
    this.teardownWorld();
    this.run = null;
    this.state = 'menu';
    this.hud.show(false);
    this.music('menu');
    this.menus.showMain();
  }

  nextStage() {
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
        this.teardownWorld();
        this.state = 'menu';
        this.music('results');
        this.menus.showCampaignClear(run.campaign, run.total, isBest);
      }
    } else {
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
    w.score.breakCombo();
    // Clear the immediate threats so the player isn't killed instantly.
    for (const e of w.entities) if (e.telegraph) e.telegraph.progress = 0;
    this.menus.hide();
    this.hud.show(true);
    const st = this.runner!.stage;
    this.music(w.boss ? 'boss' : st.music ?? (st.campaign === 'zombie' ? 'zombie' : 'dino'));
    this.state = 'playing';
  }

  continueNo() {
    if (this.state !== 'continue') return;
    this.state = 'gameover';
    const score = (this.run?.total ?? 0) + (this.world?.score.score ?? 0);
    this.menus.showGameOver(score);
  }

  // ─── Input ────────────────────────────────────────────────────────────────

  private onPress(x: number, y: number, id: number) {
    if (this.state !== 'playing' || !this.shooter) return;
    this.holdStart.set(id, performance.now());
    this.shooter.fire(x, y, false);
  }

  private onKey(code: string) {
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
    const w = this.world;
    if (w) {
      w.viewport.width = this.engine.size.width;
      w.viewport.height = this.engine.size.height;
    }
    if (this.state === 'playing' && w && this.runner) {
      try {
        this.heldFire();
        this.autoplay?.update(dt * w.timeScale);
        const sdt = w.update(dt);
        this.runner.update(sdt);
        if (this.clearTimer > 0) {
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
      this.engine.render(w.scene);
      this.hud.drawOverlay(w, dt);
    } else if (w && (this.state === 'intro' || this.state === 'results' || this.state === 'continue')) {
      // Keep the world visible (but frozen) behind menus.
      this.engine.render(w.scene);
      this.hud.drawOverlay(null, dt);
    } else if (!w) {
      this.engine.render(this.menuScene);
    }
  }
}
