import type { CampaignDef, StageDef } from '../gameplay/StageTypes';
import type { Save } from '../core/Save';
import type { AudioSystem } from '../audio/Audio';
import type { CampaignId, QualityLevel, Settings, StageResult } from '../core/types';
import { el, escapeHtml, onTap } from './dom';

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

type Back = () => void;

/** All full-screen menus (title, campaign/stage select, settings, pause, results…). */
export class Menus {
  readonly root: HTMLDivElement;
  private timers: number[] = [];

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
    return this.root.childElementCount > 0;
  }

  hide() {
    this.clearTimers();
    this.root.innerHTML = '';
    this.root.className = 'menus';
  }

  private clearTimers() {
    for (const t of this.timers) clearInterval(t), clearTimeout(t);
    this.timers = [];
  }

  private screen(cls: string): HTMLDivElement {
    this.hide();
    this.root.className = `menus open ${cls}`;
    return el('div', `screen ${cls}`, this.root);
  }

  private button(parent: HTMLElement, label: string, fn: () => void, cls = '') {
    const b = el('button', `btn ${cls}`, parent, label);
    onTap(b, () => {
      this.audio.unlock();
      this.audio.play(cls.includes('back') ? 'ui_back' : 'ui_click');
      fn();
    });
    return b;
  }

  // ─── Title / main ─────────────────────────────────────────────────────────

  showTitle(onStart: () => void) {
    const s = this.screen('title');
    el('div', 'title-bg', s);
    const logo = el('div', 'logo', s);
    el('div', 'logo-main', logo, 'OVERRUN');
    el('div', 'logo-sub', logo, 'ARCADE RAIL SHOOTER');
    el('div', 'tap-start blink', s, 'TAP TO START');
    el('div', 'title-foot', s, 'ZOMBIES &bull; DINOSAURS &bull; NO QUARTERS REQUIRED');
    const go = (e: Event) => {
      e.preventDefault();
      this.audio.unlock();
      this.audio.play('ui_start');
      onStart();
    };
    s.addEventListener('pointerdown', go, { once: true });
  }

  showMain() {
    const s = this.screen('main');
    const logo = el('div', 'logo small', s);
    el('div', 'logo-main', logo, 'OVERRUN');
    const col = el('div', 'menu-col', s);
    this.button(col, 'ARCADE', () => this.showCampaigns(), 'primary');
    this.button(col, 'STAGE SELECT', () => this.showStageSelect(() => this.showMain()));
    this.button(col, 'HOW TO PLAY', () => this.showHowTo(() => this.showMain()));
    this.button(col, 'SETTINGS', () => this.showSettings(() => this.showMain()));
  }

  showCampaigns() {
    const s = this.screen('campaigns');
    el('h2', 'screen-title', s, 'CHOOSE YOUR NIGHTMARE');
    const row = el('div', 'campaign-row', s);
    for (const c of this.campaigns) {
      const card = el('button', `campaign-card camp-${c.id}`, row);
      card.style.setProperty('--accent', c.accent);
      el('div', 'camp-art', card);
      el('div', 'camp-name', card, escapeHtml(c.name));
      el('div', 'camp-tag', card, escapeHtml(c.tagline));
      const best = this.save.data.campaignBest[c.id];
      el('div', 'camp-best', card, best ? `BEST ${best.toLocaleString('en-US')}` : `${c.stages.length} STAGES`);
      onTap(card, () => {
        this.audio.unlock();
        this.audio.play('ui_start');
        this.actions.playCampaign(c.id);
      });
    }
    this.button(s, '◀ BACK', () => this.showMain(), 'back');
  }

  showStageSelect(back: Back) {
    const s = this.screen('stages');
    el('h2', 'screen-title', s, 'STAGE SELECT');
    const wrap = el('div', 'stage-wrap', s);
    for (const c of this.campaigns) {
      const col = el('div', 'stage-col', wrap);
      col.style.setProperty('--accent', c.accent);
      el('div', 'stage-col-title', col, escapeHtml(c.name));
      c.stages.forEach((st, i) => {
        const unlocked = i === 0 || this.save.isUnlocked(st.id);
        const best = this.save.data.best[st.id];
        const b = el('button', `stage-btn ${unlocked ? '' : 'locked'}`, col);
        el('span', 'stage-num', b, `${i + 1}`);
        el('span', 'stage-name', b, unlocked ? escapeHtml(st.name) : '???');
        el('span', 'stage-best', b, best ? `${best.grade} · ${best.score.toLocaleString('en-US')}` : unlocked ? 'NEW' : 'LOCKED');
        onTap(b, () => {
          if (!unlocked) {
            this.audio.play('empty');
            b.classList.remove('nope');
            void b.offsetWidth;
            b.classList.add('nope');
            return;
          }
          this.audio.unlock();
          this.audio.play('ui_start');
          this.actions.playStage(st);
        });
      });
    }
    this.button(s, '◀ BACK', back, 'back');
  }

  showHowTo(back: Back) {
    const s = this.screen('howto');
    el('h2', 'screen-title', s, 'HOW TO PLAY');
    const grid = el('div', 'howto-grid', s);
    const tips: [string, string, string][] = [
      ['tap', 'TAP TO SHOOT', 'Tap anywhere on screen to fire. Hold to keep firing.'],
      ['reload', 'RELOAD', 'Tap RELOAD or swipe down. Auto-reload is on by default.'],
      ['ring', 'RED RINGS = DANGER', 'A shrinking ring means an attack is coming. Shoot that enemy first!'],
      ['head', 'HEADSHOTS', 'Aim for the head for bonus damage and points.'],
      ['crate', 'SHOOT CRATES', 'Shoot first-aid kits, weapon crates and grenades to collect them.'],
      ['civ', "DON'T SHOOT CIVILIANS", 'Survivors waving their arms cost you a life if shot. Save them for a bonus!'],
      ['bomb', 'BOMB', 'Panic button: clears the screen. You start with one.'],
      ['combo', 'COMBOS', 'Keep hitting without missing to raise your score multiplier up to x4.'],
    ];
    for (const [icon, title, text] of tips) {
      const t = el('div', 'tip', grid);
      el('div', `tip-icon icon-${icon}`, t);
      const tt = el('div', 'tip-text', t);
      el('div', 'tip-title', tt, title);
      el('div', 'tip-body', tt, text);
    }
    this.button(s, '◀ BACK', back, 'back');
  }

  showSettings(back: Back) {
    const s = this.screen('settings');
    el('h2', 'screen-title', s, 'SETTINGS');
    const form = el('div', 'settings-form', s);
    const st = { ...this.save.settings };
    const commit = () => {
      this.save.updateSettings(st);
      this.actions.settingsChanged(this.save.settings);
    };
    const slider = (label: string, key: 'sfxVolume' | 'musicVolume') => {
      const row = el('label', 'set-row', form);
      el('span', 'set-label', row, label);
      const input = el('input', 'set-slider', row) as HTMLInputElement;
      input.type = 'range';
      input.min = '0';
      input.max = '100';
      input.value = String(Math.round(st[key] * 100));
      input.addEventListener('input', () => {
        st[key] = Number(input.value) / 100;
        commit();
      });
      input.addEventListener('change', () => this.audio.play('pistol', { volume: 0.6 }));
    };
    const toggleRow = (label: string, key: 'haptics' | 'aimAssist' | 'autoReload' | 'leftHanded' | 'showFps') => {
      const row = el('div', 'set-row', form);
      el('span', 'set-label', row, label);
      const b = el('button', `set-toggle ${st[key] ? 'on' : ''}`, row, st[key] ? 'ON' : 'OFF');
      onTap(b, () => {
        st[key] = !st[key];
        b.classList.toggle('on', st[key]);
        b.textContent = st[key] ? 'ON' : 'OFF';
        this.audio.play('ui_click');
        commit();
      });
    };
    slider('SOUND FX', 'sfxVolume');
    slider('MUSIC', 'musicVolume');
    toggleRow('AIM ASSIST', 'aimAssist');
    toggleRow('AUTO RELOAD', 'autoReload');
    toggleRow('VIBRATION', 'haptics');
    toggleRow('LEFT-HANDED HUD', 'leftHanded');
    toggleRow('SHOW FPS', 'showFps');
    const qrow = el('div', 'set-row', form);
    el('span', 'set-label', qrow, 'GRAPHICS');
    const qwrap = el('div', 'set-seg', qrow);
    for (const q of ['low', 'medium', 'high'] as QualityLevel[]) {
      const b = el('button', `seg ${st.quality === q ? 'on' : ''}`, qwrap, q.toUpperCase());
      onTap(b, () => {
        st.quality = q;
        qwrap.querySelectorAll('.seg').forEach((x) => x.classList.remove('on'));
        b.classList.add('on');
        this.audio.play('ui_click');
        commit();
      });
    }
    const rrow = el('div', 'set-row', form);
    el('span', 'set-label', rrow, 'PROGRESS');
    const reset = el('button', 'set-toggle danger', rrow, 'RESET');
    let armed = false;
    onTap(reset, () => {
      if (!armed) {
        armed = true;
        reset.textContent = 'SURE?';
        return;
      }
      this.save.reset();
      reset.textContent = 'DONE';
      this.audio.play('ui_back');
    });
    this.button(s, '◀ BACK', back, 'back');
  }

  // ─── In-game ──────────────────────────────────────────────────────────────

  showPause() {
    const s = this.screen('pause');
    el('h2', 'screen-title', s, 'PAUSED');
    const col = el('div', 'menu-col', s);
    this.button(col, 'RESUME', () => this.actions.resume(), 'primary');
    this.button(col, 'RESTART STAGE', () => this.actions.restart());
    this.button(col, 'HOW TO PLAY', () => this.showHowTo(() => this.showPause()));
    this.button(col, 'SETTINGS', () => this.showSettings(() => this.showPause()));
    this.button(col, 'QUIT', () => this.actions.quit(), 'back');
  }

  showStageIntro(stage: StageDef, campaign: CampaignDef, onDone: () => void) {
    const s = this.screen('intro');
    s.style.setProperty('--accent', campaign.accent);
    el('div', 'intro-camp', s, escapeHtml(campaign.name));
    el('div', 'intro-stage', s, `STAGE ${stage.index + 1}`);
    el('div', 'intro-name', s, escapeHtml(stage.name));
    if (stage.tagline) el('div', 'intro-tag', s, escapeHtml(stage.tagline));
    el('div', 'intro-hint blink', s, 'GET READY');
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      this.hide();
      onDone();
    };
    this.timers.push(window.setTimeout(finish, 2600));
    s.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      finish();
    });
  }

  showResults(r: StageResult, isBest: boolean, nextLabel: string) {
    const s = this.screen('results');
    el('h2', 'screen-title', s, 'STAGE CLEAR');
    const panel = el('div', 'results-panel', s);
    const rows: [string, string][] = [
      ['SCORE', r.score.toLocaleString('en-US')],
      ['KILLS', String(r.kills)],
      ['ACCURACY', `${Math.round(r.accuracy * 100)}%`],
      ['HEADSHOTS', String(r.headshots)],
      ['MAX COMBO', String(r.maxCombo)],
      ['RESCUED', String(r.rescues)],
    ];
    const list = el('div', 'results-list', panel);
    const all: HTMLElement[] = [];
    for (const [k, v] of rows) {
      const row = el('div', 'res-row', list);
      el('span', 'res-k', row, k);
      el('span', 'res-v', row, v);
      all.push(row);
    }
    for (const b of r.bonuses) {
      const row = el('div', 'res-row bonus', list);
      el('span', 'res-k', row, `${escapeHtml(b.label)} BONUS`);
      el('span', 'res-v', row, `+${b.points.toLocaleString('en-US')}`);
      all.push(row);
    }
    const tot = el('div', 'res-row total', list);
    el('span', 'res-k', tot, 'TOTAL');
    el('span', 'res-v', tot, r.total.toLocaleString('en-US'));
    all.push(tot);
    const grade = el('div', `grade grade-${r.grade}`, panel, r.grade);
    if (isBest) el('div', 'new-best', panel, 'NEW BEST!');
    const actions = el('div', 'menu-row', s);
    all.forEach((row, i) => {
      row.style.animationDelay = `${0.15 + i * 0.12}s`;
      this.timers.push(window.setTimeout(() => this.audio.play('score_tick'), 150 + i * 120));
    });
    grade.style.animationDelay = `${0.3 + all.length * 0.12}s`;
    this.button(actions, nextLabel, () => this.actions.nextStage(), 'primary');
    this.button(actions, 'RETRY', () => this.actions.restart());
    this.button(actions, 'MENU', () => this.actions.quit(), 'back');
  }

  showContinue(seconds = 10) {
    const s = this.screen('continue');
    el('h2', 'screen-title danger', s, 'CONTINUE?');
    const count = el('div', 'continue-count', s, String(seconds));
    el('div', 'continue-hint', s, 'Continuing resets your combo and lowers your grade.');
    const row = el('div', 'menu-row', s);
    this.button(row, 'CONTINUE', () => this.actions.continueYes(), 'primary');
    this.button(row, 'GIVE UP', () => this.actions.continueNo(), 'back');
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
        count.classList.remove('tick');
        void count.offsetWidth;
        count.classList.add('tick');
        this.audio.play('continue_tick');
      }, 1000),
    );
  }

  showGameOver(score: number) {
    const s = this.screen('gameover');
    el('h2', 'screen-title danger big', s, 'GAME OVER');
    el('div', 'gameover-score', s, `SCORE ${score.toLocaleString('en-US')}`);
    const row = el('div', 'menu-row', s);
    this.button(row, 'RETRY', () => this.actions.restart(), 'primary');
    this.button(row, 'MENU', () => this.actions.quit(), 'back');
  }

  showCampaignClear(campaign: CampaignDef, total: number, isBest: boolean) {
    const s = this.screen('campaign-clear');
    s.style.setProperty('--accent', campaign.accent);
    el('h2', 'screen-title big', s, 'YOU SURVIVED');
    el('div', 'intro-camp', s, `${escapeHtml(campaign.name)} COMPLETE`);
    el('div', 'gameover-score', s, `FINAL SCORE ${total.toLocaleString('en-US')}`);
    if (isBest) el('div', 'new-best', s, 'NEW HIGH SCORE!');
    const row = el('div', 'menu-row', s);
    this.button(row, 'MENU', () => this.actions.quit(), 'primary');
  }
}
