import type { CampaignDef, StageDef } from '../gameplay/StageTypes';
import type { Save } from '../core/Save';
import type { AudioSystem } from '../audio/Audio';
import type { SfxName } from '../audio/names';
import type { CampaignId, Grade, QualityLevel, RetroMode, Settings, StageResult } from '../core/types';
import { haptic } from '../core/Haptics';
import { el, escapeHtml, onTap } from './dom';
import { cityCardArt, jungleCardArt, LOCK_ICON, SKULL_ICON, TUTORIAL_ART } from './art';

export interface MenuActions {
  /** Start a full campaign run (arcade mode). */
  playCampaign(id: CampaignId): void;
  /** Play a single stage. */
  playStage(stage: StageDef): void;
  settingsChanged(s: Settings): void;
  resume(): void;
  restart(): void;
  quit(): void;
  /** After results: go on. */
  nextStage(): void;
  continueYes(): void;
  continueNo(): void;
}

/** Context shown on the pause screen. */
export interface PauseInfo {
  stage: string;
  campaign?: string;
  score: number;
}

type Back = () => void;

interface TallyStep {
  row: HTMLElement;
  val: HTMLElement;
  to: number;
  fmt: (n: number) => string;
  dur: number;
}

const fmtInt = (n: number) => Math.round(n).toLocaleString('en-US');
const GRADE_ORDER: Grade[] = ['D', 'C', 'B', 'A', 'S'];
/** Tap-arming delay for buttons on screens that can appear mid-action. */
const ARM_MS = 600;
const CONTINUE_ARM_MS = 700;

/**
 * Show the DISPLAY (CRT / PIXEL / OFF) setting and apply Settings.retro to the
 * renderer. Off until the arcade-monitor look (core/RetroPass) ships: turning it
 * on changes every screen's look (and what renderer.info reports), so the lead
 * flips this once the retro pass is signed off. Game.applySettings reads it too.
 */
export const RETRO_SETTING_ENABLED = false;

/**
 * All full-screen menus (title, campaign/stage select, settings, pause, results,
 * tutorial…). Pure DOM; the animated 3D backdrop (MenuBackdrop) shows through the
 * semi-transparent screens. Buttons act on pointer-down with a click sound and a
 * haptic tick.
 */
export class Menus {
  readonly root: HTMLDivElement;
  /** Notified whenever a screen opens (Game themes the 3D backdrop with it). */
  onScreen: ((name: string) => void) | null = null;
  private timers: number[] = [];
  private raf = 0;

  constructor(
    parent: HTMLElement,
    private save: Save,
    private audio: AudioSystem,
    private campaigns: CampaignDef[],
    private actions: MenuActions,
  ) {
    this.root = el('div', 'menus', parent);
    this.root.id = 'menus';
  }

  get visible() {
    return this.root.querySelector('.screen:not(.leaving)') !== null;
  }

  /** Close the current screen (fades out; taps go straight to the game). */
  hide() {
    this.clearTimers();
    this.retire();
    this.root.className = 'menus';
  }

  private clearTimers() {
    for (const t of this.timers) clearInterval(t), clearTimeout(t);
    this.timers = [];
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  /** Fade out whatever is on screen, then remove it. */
  private retire() {
    for (const c of Array.from(this.root.children) as HTMLElement[]) {
      if (c.classList.contains('leaving')) continue;
      c.classList.add('leaving');
      window.setTimeout(() => c.remove(), 230);
    }
  }

  private screen(cls: string): HTMLDivElement {
    this.clearTimers();
    this.retire();
    this.root.className = `menus open on-${cls}`;
    const s = el('div', `screen ${cls}`, this.root);
    this.onScreen?.(cls);
    return s;
  }

  private later(ms: number, fn: () => void) {
    this.timers.push(window.setTimeout(fn, ms));
  }

  /** Click sound + haptic tick. */
  private feedback(sfx: SfxName = 'ui_click', volume = 1) {
    this.audio.unlock();
    this.audio.play(sfx, { volume });
    if (this.save.settings.haptics) haptic(10);
  }

  /**
   * `armMs` > 0: the button ignores taps for that long after the screen opens.
   * Used on screens that pop up mid-action (continue, results, game over…) so a
   * shot already in flight can't press GIVE UP / MENU by accident.
   */
  private button(parent: HTMLElement, label: string, fn: () => void, cls = '', sub?: string, armMs = 0) {
    const b = el(
      'button',
      `btn ${cls}${armMs > 0 ? ' disabled arming' : ''}`,
      parent,
      `<span class="btn-label">${label}</span>${sub ? `<span class="btn-sub">${sub}</span>` : ''}`,
    );
    if (armMs > 0) this.later(armMs, () => b.classList.remove('disabled', 'arming'));
    onTap(b, () => {
      if (b.classList.contains('disabled')) return;
      this.feedback(cls.includes('back') ? 'ui_back' : 'ui_click');
      b.classList.remove('pressed');
      void b.offsetWidth;
      b.classList.add('pressed');
      fn();
    });
    return b;
  }

  private backButton(parent: HTMLElement, back: Back) {
    return this.button(parent, '◀ BACK', back, 'back');
  }

  private bestCampaignScore(): number {
    let best = 0;
    for (const v of Object.values(this.save.data.campaignBest)) best = Math.max(best, v);
    return best;
  }

  private logo(parent: HTMLElement, small = false) {
    const logo = el('div', `logo ${small ? 'small' : ''}`, parent);
    const main = el('div', 'logo-main', logo);
    main.setAttribute('aria-label', 'OVERRUN');
    'OVERRUN'.split('').forEach((ch, i) => {
      const sp = el('span', 'logo-ch', main, ch);
      sp.style.setProperty('--i', String(i));
    });
    return logo;
  }

  // ─── Title / main ─────────────────────────────────────────────────────────

  showTitle(onStart: () => void) {
    const s = this.screen('title');
    el('div', 'scanlines', s);
    const hi = this.bestCampaignScore();
    if (hi > 0) el('div', 'title-hi', s, `HI-SCORE <b>${fmtInt(hi)}</b>`);
    const logo = this.logo(s);
    el('div', 'logo-slash', logo);
    el('div', 'logo-sub', logo, 'ARCADE RAIL SHOOTER');
    el('div', 'tap-start', s, 'TAP TO START');
    // Two halves so narrow (portrait) screens break it cleanly onto two lines.
    el('div', 'title-foot', s, '<span>ZOMBIES &bull; DINOSAURS</span><span class="tf-sep"> &bull; </span><span>NO QUARTERS REQUIRED</span>');
    let started = false;
    const go = (e: Event) => {
      e.preventDefault();
      if (started) return;
      started = true;
      this.feedback('ui_start');
      s.classList.add('starting');
      onStart();
    };
    s.addEventListener('pointerdown', go);
    const key = (e: KeyboardEvent) => {
      if (!s.isConnected || s.classList.contains('leaving')) return window.removeEventListener('keydown', key);
      if (e.code === 'Enter' || e.code === 'Space') go(e);
    };
    window.addEventListener('keydown', key);
  }

  showMain() {
    const s = this.screen('main');
    const left = el('div', 'main-left', s);
    this.logo(left, true);
    el('div', 'main-tag', left, 'ZOMBIES &bull; DINOSAURS');
    const hi = this.bestCampaignScore();
    if (hi > 0) el('div', 'main-hi', left, `HI-SCORE <b>${fmtInt(hi)}</b>`);
    const col = el('div', 'menu-col', s);
    this.button(col, 'ARCADE', () => this.showCampaigns(), 'primary big', 'CAMPAIGN RUN');
    this.button(col, 'STAGE SELECT', () => this.showStageSelect(() => this.showMain()));
    const row = el('div', 'menu-pair', col);
    this.button(row, 'HOW TO PLAY', () => this.showHowTo(() => this.showMain()), 'small');
    this.button(row, 'SETTINGS', () => this.showSettings(() => this.showMain()), 'small');
  }

  private stagePips(parent: HTMLElement, c: CampaignDef) {
    const pips = el('div', 'camp-pips', parent);
    c.stages.forEach((st, i) => {
      const best = this.save.data.best[st.id];
      const unlocked = i === 0 || this.save.isUnlocked(st.id);
      const p = el('span', `camp-pip ${best ? `grade-${best.grade} done` : unlocked ? 'open' : 'locked'}`, pips, best ? best.grade : String(i + 1));
      if (i === c.stages.length - 1) p.title = 'Boss stage';
    });
    return pips;
  }

  showCampaigns() {
    const s = this.screen('campaigns');
    el('h2', 'screen-title', s, 'CHOOSE YOUR NIGHTMARE');
    const row = el('div', 'campaign-row', s);
    for (const c of this.campaigns) {
      const card = el('button', `campaign-card camp-${c.id}`, row);
      card.style.setProperty('--accent', c.accent);
      el('div', 'camp-art', card, c.id === 'zombie' ? cityCardArt() : jungleCardArt());
      el('div', 'camp-shade', card);
      const info = el('div', 'camp-info', card);
      el('div', 'camp-name', info, escapeHtml(c.name));
      el('div', 'camp-tag', info, escapeHtml(c.tagline));
      const meta = el('div', 'camp-meta', info);
      this.stagePips(meta, c);
      const best = this.save.data.campaignBest[c.id];
      el('div', 'camp-best', meta, best ? `BEST <b>${fmtInt(best)}</b>` : `${c.stages.length} STAGES`);
      el('div', 'camp-play', card, 'PLAY ▶');
      onTap(card, () => {
        this.feedback('ui_start');
        card.classList.add('chosen');
        this.actions.playCampaign(c.id);
      });
    }
    this.backButton(s, () => this.showMain());
  }

  showStageSelect(back: Back) {
    const s = this.screen('stages');
    el('h2', 'screen-title', s, 'STAGE SELECT');
    const wrap = el('div', 'stage-wrap', s);
    for (const c of this.campaigns) {
      const col = el('div', `stage-col camp-${c.id}`, wrap);
      col.style.setProperty('--accent', c.accent);
      el('div', 'stage-col-title', col, escapeHtml(c.name));
      c.stages.forEach((st, i) => {
        const unlocked = i === 0 || this.save.isUnlocked(st.id);
        const best = this.save.data.best[st.id];
        const boss = i === c.stages.length - 1;
        const b = el('button', `stage-btn ${unlocked ? '' : 'locked'}`, col);
        el('span', 'stage-num', b, `${i + 1}`);
        const txt = el('span', 'stage-text', b);
        el('span', 'stage-name', txt, unlocked ? escapeHtml(st.name) : 'LOCKED');
        el(
          'span',
          'stage-best',
          txt,
          best ? `BEST ${fmtInt(best.score)}` : unlocked ? (boss ? `${SKULL_ICON} FINAL STAGE` : 'NOT CLEARED') : `CLEAR STAGE ${i} TO UNLOCK`,
        );
        if (best) el('span', `grade-badge grade-${best.grade}`, b, best.grade);
        else if (!unlocked) el('span', 'stage-lock', b, LOCK_ICON);
        else el('span', 'stage-new', b, 'NEW');
        onTap(b, () => {
          if (!unlocked) {
            this.feedback('empty', 0.7);
            b.classList.remove('nope');
            void b.offsetWidth;
            b.classList.add('nope');
            return;
          }
          this.feedback('ui_start');
          this.actions.playStage(st);
        });
      });
    }
    this.backButton(s, back);
  }

  showHowTo(back: Back) {
    const s = this.screen('howto');
    el('h2', 'screen-title', s, 'HOW TO PLAY');
    const grid = el('div', 'howto-grid', s);
    const tips: [string, string, string][] = [
      [TUTORIAL_ART.tap, 'TAP TO SHOOT', 'Tap anywhere to fire. Hold to keep firing.'],
      [TUTORIAL_ART.ring, 'RED RING = ATTACK', 'A shrinking red ring means that enemy is about to strike. Shoot it first!'],
      [TUTORIAL_ART.reload, 'RELOAD', 'Tap RELOAD or swipe down. Auto-reload is on by default.'],
      [TUTORIAL_ART.crate, 'SHOOT CRATES', 'Shoot crates, first-aid kits and grenades to collect them.'],
      [TUTORIAL_ART.civ, "DON'T SHOOT CIVILIANS", 'Hitting a survivor costs a life. Protect them for a bonus.'],
      ['<div class="tip-glyph glyph-head">✛</div>', 'HEADSHOTS', 'Aim for the head: double damage and bonus points.'],
      ['<div class="tip-glyph glyph-bomb"></div>', 'BOMB', 'Panic button — clears the screen. You start with one.'],
      ['<div class="tip-glyph glyph-combo">x4</div>', 'COMBOS', 'Hit without missing to raise your multiplier up to x4.'],
    ];
    for (const [art, title, text] of tips) {
      const t = el('div', 'tip', grid);
      el('div', 'tip-icon', t, art);
      const tt = el('div', 'tip-text', t);
      el('div', 'tip-title', tt, title);
      el('div', 'tip-body', tt, text);
    }
    this.backButton(s, back);
  }

  showSettings(back: Back) {
    const s = this.screen('settings');
    el('h2', 'screen-title', s, 'SETTINGS');
    const form = el('div', 'settings-form', s);
    const colA = el('div', 'set-col', form);
    const colB = el('div', 'set-col', form);
    const st: Settings = { ...this.save.settings };
    const live = () => this.actions.settingsChanged({ ...st });
    const commit = () => {
      this.save.updateSettings(st);
      this.actions.settingsChanged(this.save.settings);
    };

    const slider = (parent: HTMLElement, label: string, key: 'sfxVolume' | 'musicVolume') => {
      const row = el('div', 'set-row slider-row', parent);
      el('span', 'set-label', row, label);
      const sl = el('div', 'slider', row);
      sl.tabIndex = 0;
      sl.setAttribute('role', 'slider');
      sl.setAttribute('aria-label', label);
      sl.setAttribute('aria-valuemin', '0');
      sl.setAttribute('aria-valuemax', '100');
      const track = el('div', 'slider-track', sl);
      const fill = el('div', 'slider-fill', track);
      const knob = el('div', 'slider-knob', track);
      const val = el('span', 'slider-val', row);
      const set = (v: number) => {
        v = Math.max(0, Math.min(1, Math.round(v * 20) / 20));
        st[key] = v;
        const pct = `${v * 100}%`;
        fill.style.width = pct;
        knob.style.left = pct;
        val.textContent = String(Math.round(v * 100));
        sl.setAttribute('aria-valuenow', String(Math.round(v * 100)));
      };
      const fromX = (x: number) => {
        const r = track.getBoundingClientRect();
        return (x - r.left) / Math.max(1, r.width);
      };
      let drag = -1;
      let lastSent = st[key];
      sl.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        drag = e.pointerId;
        try {
          sl.setPointerCapture(e.pointerId);
        } catch {
          /* fine */
        }
        sl.classList.add('active');
        set(fromX(e.clientX));
        live();
      });
      sl.addEventListener('pointermove', (e) => {
        if (e.pointerId !== drag) return;
        e.preventDefault();
        set(fromX(e.clientX));
        if (st[key] !== lastSent) {
          lastSent = st[key];
          live();
          if (this.save.settings.haptics) haptic(4);
        }
      });
      const end = (e: PointerEvent) => {
        if (e.pointerId !== drag) return;
        drag = -1;
        sl.classList.remove('active');
        commit();
        this.audio.play(key === 'sfxVolume' ? 'pistol' : 'ui_click', { volume: 0.7 });
      };
      sl.addEventListener('pointerup', end);
      sl.addEventListener('pointercancel', end);
      sl.addEventListener('keydown', (e) => {
        const d = e.code === 'ArrowRight' || e.code === 'ArrowUp' ? 0.05 : e.code === 'ArrowLeft' || e.code === 'ArrowDown' ? -0.05 : 0;
        if (!d) return;
        e.preventDefault();
        set(st[key] + d);
        commit();
      });
      set(st[key]);
    };

    // The whole row is the touch target (label included), not just the small switch.
    const toggleRow = (parent: HTMLElement, label: string, key: 'haptics' | 'aimAssist' | 'autoReload' | 'leftHanded' | 'showFps') => {
      const row = el('div', 'set-row toggle-row', parent);
      el('span', 'set-label', row, label);
      const b = el('button', 'set-toggle', row, '<span class="sw-knob"></span><span class="sw-txt"></span>');
      b.setAttribute('role', 'switch');
      b.setAttribute('aria-label', label);
      const paint = () => {
        b.classList.toggle('on', st[key]);
        b.setAttribute('aria-checked', String(st[key]));
        (b.lastElementChild as HTMLElement).textContent = st[key] ? 'ON' : 'OFF';
      };
      paint();
      onTap(row, () => {
        st[key] = !st[key];
        paint();
        commit();
        this.feedback('ui_click');
      });
    };

    const segRow = <K extends 'quality' | 'retro'>(parent: HTMLElement, label: string, key: K, opts: [Settings[K], string][]) => {
      const row = el('div', 'set-row', parent);
      el('span', 'set-label', row, label);
      const wrap = el('div', 'set-seg', row);
      for (const [value, text] of opts) {
        const b = el('button', `seg ${st[key] === value ? 'on' : ''}`, wrap, text);
        onTap(b, () => {
          st[key] = value;
          wrap.querySelectorAll('.seg').forEach((x) => x.classList.remove('on'));
          b.classList.add('on');
          this.feedback('ui_click');
          commit();
        });
      }
    };

    slider(colA, 'SOUND FX', 'sfxVolume');
    slider(colA, 'MUSIC', 'musicVolume');
    segRow(colA, 'GRAPHICS', 'quality', [
      ['low', 'LOW'],
      ['medium', 'MED'],
      ['high', 'HIGH'],
    ] as [QualityLevel, string][]);
    if (RETRO_SETTING_ENABLED) {
      segRow(colA, 'DISPLAY', 'retro', [
        ['crt', 'CRT'],
        ['pixel', 'PIXEL'],
        ['off', 'OFF'],
      ] as [RetroMode, string][]);
    }
    toggleRow(colA, 'SHOW FPS', 'showFps');
    toggleRow(colB, 'AIM ASSIST', 'aimAssist');
    toggleRow(colB, 'AUTO RELOAD', 'autoReload');
    toggleRow(colB, 'VIBRATION', 'haptics');
    toggleRow(colB, 'LEFT-HANDED HUD', 'leftHanded');
    const rrow = el('div', 'set-row', colB);
    el('span', 'set-label', rrow, 'PROGRESS');
    const reset = el('button', 'set-btn danger', rrow, 'RESET');
    let armed = false;
    onTap(reset, () => {
      if (reset.classList.contains('done')) return;
      if (!armed) {
        armed = true;
        reset.textContent = 'SURE?';
        reset.classList.add('armed');
        this.feedback('empty', 0.8);
        this.later(3000, () => {
          if (!reset.classList.contains('done')) {
            armed = false;
            reset.textContent = 'RESET';
            reset.classList.remove('armed');
          }
        });
        return;
      }
      this.save.reset();
      reset.textContent = 'DONE';
      reset.classList.remove('armed');
      reset.classList.add('done');
      this.feedback('ui_back');
    });
    this.backButton(s, back);
  }

  // ─── In-game ──────────────────────────────────────────────────────────────

  showPause(info?: PauseInfo) {
    const s = this.screen('pause');
    el('h2', 'screen-title', s, 'PAUSED');
    if (info) {
      const meta = el('div', 'pause-meta', s);
      el('span', 'pause-stage', meta, escapeHtml(info.stage));
      el('span', 'pause-score', meta, `SCORE <b>${fmtInt(info.score)}</b>`);
    }
    const col = el('div', 'menu-col pause-col', s);
    this.button(col, 'RESUME', () => this.actions.resume(), 'primary big');
    const grid = el('div', 'menu-grid', col);
    this.button(grid, 'RESTART STAGE', () => this.actions.restart(), 'small');
    this.button(grid, 'SETTINGS', () => this.showSettings(() => this.showPause(info)), 'small');
    this.button(grid, 'HOW TO PLAY', () => this.showHowTo(() => this.showPause(info)), 'small');
    this.button(grid, 'QUIT', () => this.actions.quit(), 'small quit');
  }

  showStageIntro(stage: StageDef, campaign: CampaignDef, onDone: () => void) {
    const s = this.screen('intro');
    s.style.setProperty('--accent', campaign.accent);
    el('div', 'letterbox top', s);
    el('div', 'letterbox bottom', s);
    const card = el('div', 'intro-card', s);
    el('div', 'intro-camp', card, escapeHtml(campaign.name));
    el('div', 'intro-stage', card, `STAGE ${stage.index + 1}${stage.index === campaign.stages.length - 1 ? ' · FINAL' : ''}`);
    el('div', 'intro-name', card, escapeHtml(stage.name));
    if (stage.tagline) el('div', 'intro-tag', card, escapeHtml(stage.tagline));
    el('div', 'intro-hint', card, 'GET READY');
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      this.hide();
      onDone();
    };
    this.later(2800, finish);
    s.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      finish();
    });
  }

  /**
   * First-run briefing. Shown once (Game pauses the stage until dismissed).
   * The button ignores taps for a moment so the tap that started the stage
   * can't dismiss it by accident.
   */
  showTutorial(onDone: () => void) {
    const s = this.screen('tutorial');
    el('div', 'tut-kicker', s, 'FIELD MANUAL');
    el('h2', 'screen-title', s, 'SURVIVAL BRIEFING');
    const grid = el('div', 'tut-grid', s);
    const cards: [string, string, string][] = [
      [TUTORIAL_ART.tap, 'TAP TO SHOOT', 'Tap anywhere to fire. Hold to keep firing.'],
      [TUTORIAL_ART.ring, 'RED RING = ATTACK', 'That enemy is about to hit you — shoot it first!'],
      [TUTORIAL_ART.reload, 'RELOAD', 'Tap RELOAD or swipe down.'],
      [TUTORIAL_ART.crate, 'SHOOT CRATES', 'Weapons, bombs and health inside.'],
      [TUTORIAL_ART.civ, "DON'T SHOOT CIVILIANS", 'Hitting a survivor costs a life.'],
    ];
    cards.forEach(([art, title, text], i) => {
      const c = el('div', 'tut-card', grid);
      c.style.setProperty('--i', String(i));
      el('div', 'tut-art', c, art);
      el('div', 'tut-title', c, title);
      el('div', 'tut-text', c, text);
    });
    this.button(s, "GOT IT — LET'S GO!", () => onDone(), 'primary big tut-go', undefined, 900);
  }

  showResults(r: StageResult, isBest: boolean, nextLabel: string) {
    const s = this.screen('results');
    const stage = this.campaigns.flatMap((c) => c.stages).find((x) => x.id === r.stageId);
    const head = el('div', 'results-head', s);
    el('h2', 'screen-title', head, 'STAGE CLEAR');
    if (stage) el('div', 'results-stage', head, escapeHtml(stage.name));
    const panel = el('div', 'results-panel', s);
    const left = el('div', 'results-list', panel);
    const right = el('div', 'results-list bonus-list', panel);
    const steps: TallyStep[] = [];
    const row = (parent: HTMLElement, k: string, to: number, fmt: (n: number) => string, cls = '', dur = 0.32) => {
      const rw = el('div', `res-row ${cls}`, parent);
      el('span', 'res-k', rw, k);
      const v = el('span', 'res-v', rw, fmt(0));
      steps.push({ row: rw, val: v, to, fmt, dur });
    };
    row(left, 'SCORE', r.score, fmtInt, '', 0.5);
    row(left, 'KILLS', r.kills, fmtInt);
    row(left, 'ACCURACY', r.accuracy * 100, (n) => `${Math.round(n)}%`);
    row(left, 'HEADSHOTS', r.headshots, fmtInt);
    row(left, 'MAX COMBO', r.maxCombo, fmtInt);
    row(left, 'RESCUED', r.rescues, fmtInt);
    el('div', 'bonus-title', right, 'BONUSES');
    if (r.bonuses.length === 0) el('div', 'res-row in none', right, '<span class="res-k">—</span>');
    for (const b of r.bonuses) row(right, escapeHtml(b.label), b.points, (n) => `+${fmtInt(n)}`, 'bonus', 0.28);
    row(right, 'TOTAL', r.total, fmtInt, 'total', 0.9);
    const gradeBox = el('div', 'grade-box', panel);
    el('div', 'grade-label', gradeBox, 'RANK');
    const grade = el('div', `grade grade-${r.grade}`, gradeBox, r.grade);
    const prev = this.save.data.best[r.stageId];
    const bestLine = el(
      'div',
      `best-line ${isBest ? 'is-new' : ''}`,
      gradeBox,
      isBest ? 'NEW BEST!' : prev ? `BEST ${fmtInt(prev.score)}` : '',
    );
    const actions = el('div', 'menu-row results-actions', s);
    this.button(actions, nextLabel, () => this.actions.nextStage(), 'primary', undefined, ARM_MS);
    this.button(actions, 'RETRY', () => this.actions.restart(), '', undefined, ARM_MS);
    this.button(actions, 'MENU', () => this.actions.quit(), 'back', undefined, ARM_MS);
    const finish = () => {
      grade.classList.add('stamp');
      gradeBox.classList.add('shown');
      s.classList.add('tally-done');
      this.audio.play('magnum', { volume: 0.55 });
      if (GRADE_ORDER.indexOf(r.grade) >= 3) this.later(120, () => this.audio.play('combo', { volume: 0.8 }));
      if (this.save.settings.haptics) haptic(40);
      if (isBest) bestLine.classList.add('pop');
    };
    const skip = this.runTally(steps, finish, 450);
    s.addEventListener('pointerdown', () => skip());
  }

  /**
   * Reveal rows one by one, counting each number up with a ticking sound.
   * Returns a function that jumps straight to the end.
   */
  private runTally(steps: TallyStep[], onDone: () => void, delayMs = 0): () => void {
    // Fixed timeline (frame-rate independent): each row starts when the previous one ends.
    const GAP = 70;
    const starts: number[] = [];
    let t = performance.now() + delayMs;
    for (const st of steps) {
      starts.push(t);
      t += st.dur * 1000 + GAP;
    }
    let finished = false;
    let lastTick = 0;
    const done = () => {
      if (finished) return;
      finished = true;
      for (const st of steps) {
        st.row.classList.add('in');
        st.val.textContent = st.fmt(st.to);
      }
      if (this.raf) cancelAnimationFrame(this.raf);
      this.raf = 0;
      onDone();
    };
    const loop = (now: number) => {
      if (finished) return;
      let counting = false;
      for (let i = 0; i < steps.length; i++) {
        const st = steps[i];
        if (now < starts[i]) break;
        const k = Math.min(1, (now - starts[i]) / (st.dur * 1000));
        if (!st.row.classList.contains('in')) st.row.classList.add('in');
        st.val.textContent = st.fmt(st.to * (1 - Math.pow(1 - k, 3)));
        if (k < 1 && st.to > 0) counting = true;
      }
      if (counting && now - lastTick > 60) {
        lastTick = now;
        this.audio.play('score_tick', { volume: 0.45 });
      }
      if (now >= t) return done();
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
    return done;
  }

  showContinue(seconds = 10) {
    const s = this.screen('continue');
    el('h2', 'screen-title danger', s, 'CONTINUE?');
    const dial = el('div', 'continue-dial', s);
    dial.innerHTML = `<svg viewBox="0 0 100 100" aria-hidden="true"><circle class="dial-bg" cx="50" cy="50" r="44"/><circle class="dial-fg" cx="50" cy="50" r="44" transform="rotate(-90 50 50)"/></svg>`;
    dial.style.setProperty('--secs', `${seconds + 1}s`);
    const count = el('div', 'continue-count', dial, String(seconds));
    el('div', 'continue-hint', s, 'Continuing resets your combo and lowers your rank.');
    const row = el('div', 'menu-row', s);
    // The screen opens the instant the last heart goes — usually mid-tap.
    this.button(row, 'CONTINUE', () => this.actions.continueYes(), 'primary pulse', undefined, CONTINUE_ARM_MS);
    this.button(row, 'GIVE UP', () => this.actions.continueNo(), 'back', undefined, CONTINUE_ARM_MS);
    let n = seconds;
    this.audio.play('continue_tick');
    this.timers.push(
      window.setInterval(() => {
        n--;
        if (n < 0) {
          this.actions.continueNo();
          return;
        }
        count.textContent = String(n);
        dial.classList.toggle('urgent', n <= 3);
        count.classList.remove('tick');
        void count.offsetWidth;
        count.classList.add('tick');
        this.audio.play('continue_tick', { volume: n <= 3 ? 1 : 0.8 });
        if (n <= 3 && this.save.settings.haptics) haptic(25);
      }, 1000),
    );
  }

  showGameOver(score: number) {
    const s = this.screen('gameover');
    const title = el('h2', 'screen-title danger big gameover-title', s);
    'GAME OVER'.split('').forEach((ch, i) => {
      const sp = el('span', ch === ' ' ? 'go-ch gap' : 'go-ch', title, ch === ' ' ? '&nbsp;' : ch);
      sp.style.setProperty('--i', String(i));
    });
    const sc = el('div', 'gameover-score', s, 'SCORE ');
    const v = el('b', '', sc, '0');
    const row = el('div', 'menu-row', s);
    this.button(row, 'RETRY', () => this.actions.restart(), 'primary', undefined, ARM_MS);
    this.button(row, 'MENU', () => this.actions.quit(), 'back', undefined, ARM_MS);
    const skip = this.runTally([{ row: sc, val: v, to: score, fmt: fmtInt, dur: 1.1 }], () => {}, 900);
    s.addEventListener('pointerdown', () => skip());
  }

  showCampaignClear(campaign: CampaignDef, total: number, isBest: boolean) {
    const s = this.screen('campaign-clear');
    s.style.setProperty('--accent', campaign.accent);
    const burst = el('div', 'confetti', s);
    const colors = [campaign.accent, '#ffd84a', '#ffffff', '#8cff5a', '#5cc8ff'];
    for (let i = 0; i < 46; i++) {
      const p = el('i', '', burst);
      p.style.setProperty('--x', `${(Math.random() * 2 - 1) * 48}vw`);
      p.style.setProperty('--y', `${-20 - Math.random() * 45}vh`);
      p.style.setProperty('--r', `${Math.random() * 720 - 360}deg`);
      p.style.setProperty('--d', `${Math.random() * 0.6}s`);
      p.style.background = colors[i % colors.length];
    }
    el('div', 'clear-kicker', s, `${escapeHtml(campaign.name)} COMPLETE`);
    el('h2', 'screen-title big clear-title', s, 'YOU SURVIVED');
    const grades = el('div', 'clear-grades', s);
    campaign.stages.forEach((st, i) => {
      const best = this.save.data.best[st.id];
      const g = el('div', 'clear-stage', grades);
      g.style.setProperty('--i', String(i));
      el('span', `grade-badge grade-${best?.grade ?? 'D'}`, g, best?.grade ?? '–');
      el('span', 'clear-stage-name', g, escapeHtml(st.name));
    });
    const sc = el('div', 'gameover-score final', s, 'FINAL SCORE ');
    const v = el('b', '', sc, '0');
    const nb = isBest ? el('div', 'new-best', s, 'NEW HIGH SCORE!') : null;
    const row = el('div', 'menu-row', s);
    this.button(row, 'MENU', () => this.actions.quit(), 'primary', undefined, ARM_MS);
    const skip = this.runTally([{ row: sc, val: v, to: total, fmt: fmtInt, dur: 1.6 }], () => nb?.classList.add('pop'), 1100);
    s.addEventListener('pointerdown', () => skip());
  }
}
