import type { CampaignDef, StageDef } from '../gameplay/StageTypes';
import { INITIAL_CHARS, cleanInitials, type Save } from '../core/Save';
import type { AudioSystem } from '../audio/Audio';
import type { SfxName } from '../audio/names';
import type { ArtStyle, CampaignId, Grade, QualityLevel, RetroMode, Settings, StageResult } from '../core/types';
import { ART_NAMES, ART_STYLES, envPending, nextArt } from '../core/art';
import { haptic } from '../core/Haptics';
import { applyComfort, el, escapeHtml, onTap } from './dom';
import { cityCardArt, jungleCardArt, LOCK_ICON, SKULL_ICON, TUTORIAL_ART } from './art';
import { arrowSvg, bombSvg, installPixelSprites, swapSvg } from './pixel';
import { pixelateInto } from './pixelate';

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
  /** Attract mode: start a self-playing demo stage behind a DEMO PLAY banner. */
  startDemo(): void;
  /** Switch the character art live (pause-screen chip). */
  setArt(art: ArtStyle): void;
}

/** Context shown on the pause screen. */
export interface PauseInfo {
  stage: string;
  campaign?: string;
  score: number;
  /** ART in effect (the ART chip shows it). */
  art?: ArtStyle;
  /** ART the stage was loaded with (its environments keep that style until the next load). */
  loadedArt?: ArtStyle;
}

/** Arcade name entry after a qualifying run. */
export interface NameEntryInfo {
  campaign: CampaignDef;
  score: number;
  /** Table position the score earns (0 = top). */
  rank: number;
  /** Pre-filled initials (last ones used). */
  initials: string;
}

export interface HiScoreOptions {
  /** BACK button target (omit in attract mode). */
  back?: Back;
  /** Attract-mode cycle: any tap = PRESS START (this callback); times out into the demo. */
  attract?: Back;
  /** Flash this freshly entered row. */
  highlight?: { campaign: CampaignId; rank: number };
  /** After a name entry: OK button target. */
  done?: Back;
}

type Back = () => void;

interface TallyStep {
  row: HTMLElement;
  val: HTMLElement;
  to: number;
  fmt: (n: number) => string;
  dur: number;
}

/** Plain arcade digits (no thousands separators). */
const num = (n: number) => String(Math.max(0, Math.round(n)));
/** Zero-padded 7-digit score, like the HUD. */
const pad7 = (n: number) => String(Math.max(0, Math.floor(n))).padStart(7, '0');
const ORD = ['1ST', '2ND', '3RD', '4TH', '5TH', '6TH', '7TH', '8TH', '9TH', '10TH'];
const GRADE_ORDER: Grade[] = ['D', 'C', 'B', 'A', 'S'];
/** Tap-arming delay for buttons on screens that can appear mid-action. */
const ARM_MS = 600;
const CONTINUE_ARM_MS = 700;
/** Attract cycle (ms): title idle → hi-score table → demo. */
const ATTRACT_TITLE_MS = 15000;
const ATTRACT_TABLE_MS = 6000;
const NAME_ENTRY_SECS = 30;
/** localStorage key: the first-launch photosensitivity notice has been acknowledged. */
export const NOTICE_KEY = 'overrun.notice.v1';
/** The notice ignores taps this long (the tap that skipped the boot screen must not dismiss it). */
const NOTICE_ARM_MS = 500;
const RIGHT = arrowSvg('right', 'btn-cursor');
/** SCREEN SHAKE choices (Settings.screenShake). */
const SHAKE_OPTS: [number, string][] = [
  [0, 'OFF'],
  [0.5, 'LOW'],
  [1, 'FULL'],
];
type ToggleKey = 'haptics' | 'aimAssist' | 'autoReload' | 'leftHanded' | 'showFps' | 'reduceFlashes';
type SegKey = 'quality' | 'retro' | 'screenShake' | 'art';

/**
 * Show the DISPLAY (CRT / PIXEL / OFF) setting and apply Settings.retro to the
 * renderer (Game.applySettings reads it too).
 */
export const RETRO_SETTING_ENABLED = true;

/**
 * All full-screen menus (boot, title, attract hi-scores, campaign/stage select,
 * settings, pause, results, name entry, tutorial…) in late-90s arcade style.
 * Pure DOM; the animated 3D backdrop (MenuBackdrop) shows through the
 * semi-transparent screens. Buttons act on pointer-down with a click sound and
 * a haptic tick.
 */
export class Menus {
  readonly root: HTMLDivElement;
  /** Notified whenever a screen opens (Game themes the 3D backdrop with it). */
  onScreen: ((name: string) => void) | null = null;
  /** Score of the last finished credit (the cabinet's "1P" counter). */
  lastScore = 0;
  private timers: number[] = [];
  private raf = 0;
  private keyHandler: ((e: KeyboardEvent) => void) | null = null;
  /** Grades of the current arcade run, by stage id (the campaign-clear screen shows these). */
  private runGrades = new Map<string, Grade>();
  /** The photosensitivity notice was acknowledged during this page load. */
  private noticeDone = false;

  constructor(
    parent: HTMLElement,
    private save: Save,
    private audio: AudioSystem,
    private campaigns: CampaignDef[],
    private actions: MenuActions,
  ) {
    installPixelSprites();
    this.root = el('div', 'menus', parent);
    this.root.id = 'menus';
    window.addEventListener('keydown', (e) => this.keyHandler?.(e));
    applyComfort(save.settings);
  }

  get visible() {
    return this.root.querySelector('.screen:not(.leaving)') !== null;
  }

  /** Name of the screen on top ('' when none). */
  get current(): string {
    const s = this.root.querySelector('.screen:not(.leaving)');
    return s ? s.classList[1] ?? '' : '';
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
    this.keyHandler = null;
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

  /** Keyboard handler for the current screen (cleared with the screen's timers). */
  private onKeys(fn: (e: KeyboardEvent) => void) {
    this.keyHandler = fn;
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
      `${cls.includes('primary') ? RIGHT : ''}<span class="btn-label">${label}</span>${sub ? `<span class="btn-sub">${sub}</span>` : ''}`,
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

  private backButton(parent: HTMLElement, back: Back, label = 'BACK') {
    const b = this.button(parent, label, back, 'back');
    b.insertAdjacentHTML('afterbegin', arrowSvg('left', 'back-arrow'));
    return b;
  }

  /** The cabinet's HI: best score in any campaign table. */
  private hiScore(): number {
    return this.save.topHiScore(this.campaigns.map((c) => c.id));
  }

  private logo(parent: HTMLElement, small = false) {
    const logo = el('div', `logo ${small ? 'small' : ''}`, parent);
    const main = el('div', 'logo-main', logo);
    main.setAttribute('aria-label', 'OVERRUN');
    'OVERRUN'.split('').forEach((ch, i) => {
      // The letter itself is the black keyline/shadow layer; ::before paints the fire gradient on top.
      const sp = el('span', 'logo-ch', main, ch);
      sp.dataset.ch = ch;
      sp.style.setProperty('--i', String(i));
    });
    return logo;
  }

  /** Keep a screen's attract cycle going: when idle long enough, run `fn`. */
  private attract(ms: number, fn: () => void) {
    this.later(ms, fn);
  }

  // ─── Boot / title / attract ───────────────────────────────────────────────

  /** Power-on self test, ≤ 1.5 s, skippable by tap. */
  showBoot(onDone: () => void) {
    const s = this.screen('boot');
    const term = el('div', 'boot-term', s);
    const lines: [number, string, string][] = [
      [60, 'OVERRUN ARCADE BOARD', 'REV.B'],
      [260, 'PROGRAM ROM .......', 'OK'],
      [420, 'WORK RAM ..........', 'OK'],
      [580, 'VIDEO RAM .........', 'OK'],
      [740, 'SOUND .............', 'OK'],
      [900, 'GUN I/O ...........', 'OK'],
    ];
    for (const [t, k, v] of lines) {
      this.later(t, () => {
        const row = el('div', 'boot-line', term);
        el('span', 'boot-k', row, k);
        el('span', `boot-v ${v === 'OK' ? 'ok' : ''}`, row, v);
        if (v === 'OK') this.audio.play('ui_click', { volume: 0.25, pitch: 1.6 });
      });
    }
    this.later(1080, () => el('div', 'boot-line boot-free', term, 'FREE PLAY'));
    el('div', 'boot-cursor', s);
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      onDone();
    };
    this.later(1450, finish);
    s.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      finish();
    });
    this.onKeys(() => finish());
  }

  /** Cabinet top row: 1P score · HI score · 2P. */
  private cabinetTop(parent: HTMLElement) {
    const top = el('div', 'cab-top', parent);
    el('div', 'cab-1p', top, `<i>1P</i><b>${pad7(this.lastScore)}</b>`);
    el('div', 'title-hi', top, `<i>HI</i><b>${pad7(this.hiScore())}</b>`);
    el('div', 'cab-2p', top, '<i>2P</i><b>-------</b>');
    return top;
  }

  showTitle(onStart: () => void) {
    if (this.needsNotice()) {
      this.showNotice(() => this.showTitle(onStart));
      return;
    }
    const s = this.screen('title');
    el('div', 'scanlines', s);
    this.cabinetTop(s);
    const logo = this.logo(s);
    el('div', 'logo-slash', logo);
    el('div', 'logo-sub', logo, 'ARCADE RAIL SHOOTER');
    el('div', 'tap-start', s, 'PRESS START');
    el('div', 'title-foot', s, '<span>ZOMBIES</span><span class="tf-sep"> VS </span><span>DINOSAURS</span>');
    el('div', 'free-play', s, 'FREE PLAY');
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
    this.onKeys((e) => {
      if (e.code === 'Enter' || e.code === 'Space') go(e);
    });
    this.attract(ATTRACT_TITLE_MS, () => this.showHiScores({ attract: onStart }));
  }

  showMain() {
    const s = this.screen('main');
    const left = el('div', 'main-left', s);
    this.logo(left, true);
    el('div', 'main-tag', left, 'ZOMBIES VS DINOSAURS');
    el('div', 'main-hi', left, `HI <b>${pad7(this.hiScore())}</b>`);
    const col = el('div', 'menu-col', s);
    this.button(col, 'ARCADE', () => this.showCampaigns(), 'primary big', 'CAMPAIGN RUN');
    this.button(col, 'STAGE SELECT', () => this.showStageSelect(() => this.showMain()));
    this.button(col, 'HI-SCORES', () => this.showHiScores({ back: () => this.showMain() }), 'hiscore-btn');
    const row = el('div', 'menu-pair', col);
    this.button(row, 'HOW TO PLAY', () => this.showHowTo(() => this.showMain()), 'small');
    this.button(row, 'SETTINGS', () => this.showSettings(() => this.showMain()), 'small');
  }

  // ─── Photosensitivity notice ──────────────────────────────────────────────

  /**
   * First launch only (remembered in localStorage). Never in test / debug
   * sessions (?stage, ?autoplay) or automated captures (navigator.webdriver),
   * unless forced with ?notice=1.
   */
  private needsNotice(): boolean {
    if (this.noticeDone) return false;
    let q: URLSearchParams;
    try {
      q = new URLSearchParams(location.search);
    } catch {
      q = new URLSearchParams();
    }
    if (q.get('notice') === '1') return true;
    if (q.get('notice') === '0' || q.has('stage') || (q.has('autoplay') && q.get('autoplay') !== '0')) return false;
    if (typeof navigator !== 'undefined' && navigator.webdriver) return false;
    try {
      return localStorage.getItem(NOTICE_KEY) !== '1';
    } catch {
      return true; // no storage: once per page load
    }
  }

  /** Arcade-style WARNING card with the comfort options; any tap outside them continues. */
  showNotice(onDone: () => void) {
    const s = this.screen('notice');
    const st: Settings = { ...this.save.settings };
    const commit = () => {
      this.save.updateSettings(st);
      this.actions.settingsChanged(this.save.settings);
      applyComfort(this.save.settings);
    };
    // The device asks for reduced motion: start with flashing reduced and shake low.
    let prefers = false;
    try {
      prefers = !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    } catch {
      /* fine */
    }
    if (prefers && !st.reduceFlashes) {
      st.reduceFlashes = true;
      st.screenShake = Math.min(st.screenShake, 0.5);
      commit();
    }
    const box = el('div', 'nt-box', s);
    el('div', 'nt-stripes', box);
    el('div', 'nt-head', box, 'WARNING');
    el('div', 'nt-title', box, 'PHOTOSENSITIVITY');
    el(
      'p',
      'nt-text',
      box,
      'This game has flashing lights, explosions and screen shake. A small number of people may have seizures triggered by flashing images. If you feel dizzy or unwell, stop playing at once.',
    );
    const opts = el('div', 'nt-opts', box);
    // Taps on the options (labels included) change settings; they never dismiss the card.
    opts.addEventListener('pointerdown', (e) => e.stopPropagation());
    this.toggleRow(opts, 'REDUCE FLASHING', 'reduceFlashes', st, commit);
    this.segRow(opts, 'SCREEN SHAKE', 'screenShake', SHAKE_OPTS, st, commit, 'SHAKE');
    if (prefers) el('div', 'nt-note', box, 'REDUCED MOTION IS ON FOR THIS DEVICE');
    el('div', 'nt-stripes', box);
    el('div', 'nt-foot', s, 'TAP TO CONTINUE');
    const shownAt = performance.now();
    let done = false;
    const finish = () => {
      if (done || performance.now() - shownAt < NOTICE_ARM_MS) return;
      done = true;
      this.noticeDone = true;
      try {
        localStorage.setItem(NOTICE_KEY, '1');
      } catch {
        /* storage unavailable: shown once per page load */
      }
      this.feedback('ui_click');
      onDone();
    };
    // Option rows stop their own taps (dom.onTap); anything else continues.
    s.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      finish();
    });
    this.onKeys((e) => {
      if (e.code === 'Enter' || e.code === 'Space' || e.code === 'Escape') finish();
    });
  }

  // ─── Hi-scores / name entry ───────────────────────────────────────────────

  private stageTag(c: CampaignDef, stage: string): string {
    if (stage === 'ALL') return 'ALL';
    const st = c.stages.find((x) => x.id === stage);
    return st ? `ST${st.index + 1}` : escapeHtml(stage.slice(0, 3).toUpperCase());
  }

  private hiTable(parent: HTMLElement, c: CampaignDef, highlight?: number) {
    const t = el('div', `hs-table camp-${c.id}${highlight !== undefined ? ' has-new' : ''}`, parent);
    t.style.setProperty('--accent', c.accent);
    el('div', 'hs-camp', t, escapeHtml(c.name));
    el('div', 'hs-head', t, '<span>RANK</span><span>NAME</span><span>SCORE</span><span>ST</span><span></span>');
    this.save.hiScores(c.id).forEach((e, i) => {
      const row = el('div', `hs-row r${i + 1}${i === highlight ? ' new' : ''}`, t);
      row.style.setProperty('--i', String(i));
      el('span', 'hs-rank', row, ORD[i] ?? `${i + 1}TH`);
      el('span', 'hs-name', row, escapeHtml(e.initials).replace(/ /g, '&nbsp;'));
      el('span', 'hs-score', row, pad7(e.score));
      el('span', 'hs-stage', row, this.stageTag(c, e.stage));
      // Continues used: C1…C9 (a one-credit run shows nothing).
      const cont = el('span', 'hs-cont', row, e.continues ? `C${Math.min(9, e.continues)}` : '');
      if (e.continues) cont.title = `${e.continues} continue${e.continues > 1 ? 's' : ''}`;
    });
    return t;
  }

  /** Both campaign tables (main menu, attract cycle, after a name entry). */
  showHiScores(opts: HiScoreOptions = {}) {
    const s = this.screen('hiscores');
    if (opts.attract) s.classList.add('attract');
    el('h2', 'screen-title', s, opts.highlight ? 'WELL DONE!' : 'HI-SCORES');
    const wrap = el('div', 'hs-wrap', s);
    // Campaign order stays fixed; portrait CSS lifts the table with the fresh entry (.has-new) to the top.
    for (const c of this.campaigns) {
      const hl = opts.highlight?.campaign === c.id ? opts.highlight.rank : undefined;
      this.hiTable(wrap, c, hl);
    }
    if (opts.attract) {
      const start = opts.attract;
      el('div', 'tap-start hs-press', s, 'PRESS START');
      let started = false;
      const go = (e: Event) => {
        e.preventDefault();
        if (started) return;
        started = true;
        this.feedback('ui_start');
        start();
      };
      s.addEventListener('pointerdown', go);
      this.onKeys((e) => {
        if (e.code === 'Enter' || e.code === 'Space') go(e);
      });
      this.attract(ATTRACT_TABLE_MS, () => this.actions.startDemo());
      return;
    }
    const row = el('div', 'menu-row', s);
    if (opts.done) this.button(row, 'OK', opts.done, 'primary', undefined, ARM_MS);
    if (opts.back) this.backButton(row, opts.back);
  }

  /** Arcade initials entry: ▲/▼ per letter or the A–Z grid, END to confirm, 30 s timer. */
  showNameEntry(info: NameEntryInfo, onDone: (initials: string) => void) {
    const s = this.screen('name-entry');
    s.style.setProperty('--accent', info.campaign.accent);
    const head = el('div', 'ne-head', s);
    el('h2', 'screen-title ne-title', head, 'NEW HI-SCORE!');
    const meta = el('div', 'ne-meta', head);
    el('span', 'ne-rank', meta, `${ORD[info.rank] ?? ''} PLACE`);
    el('span', 'ne-score', meta, pad7(info.score));
    const two = (n: number) => String(Math.max(0, n)).padStart(2, '0');
    const timer = el('span', 'ne-timer', meta, `TIME <b>${two(NAME_ENTRY_SECS)}</b>`);
    const timerVal = timer.querySelector('b')!;
    el('div', 'ne-prompt', s, 'ENTER YOUR INITIALS');

    const body = el('div', 'ne-body', s);
    const slotsEl = el('div', 'ne-slots', body);
    const chars = cleanInitials(info.initials || 'AAA').split('');
    if (chars.join('').trim() === '') chars.splice(0, 3, 'A', 'A', 'A');
    let cursor = 0;
    let finished = false;
    const letters: HTMLElement[] = [];
    const slots: HTMLElement[] = [];
    const grid = el('div', 'ne-grid', body);
    let endKey: HTMLElement;

    const paint = () => {
      for (let i = 0; i < 3; i++) {
        letters[i].textContent = chars[i] === ' ' ? '_' : chars[i];
        letters[i].classList.toggle('blank', chars[i] === ' ');
        slots[i].classList.toggle('active', cursor === i);
      }
      endKey.classList.toggle('active', cursor >= 3);
    };
    const confirm = () => {
      if (finished) return;
      finished = true;
      let ini = chars.join('');
      if (ini.trim() === '') ini = 'AAA';
      this.feedback('ui_start');
      s.classList.add('done');
      for (const l of letters) l.classList.add('locked');
      this.later(450, () => onDone(ini));
    };
    const cycle = (i: number, d: number) => {
      if (finished) return;
      const k = INITIAL_CHARS.indexOf(chars[i]);
      chars[i] = INITIAL_CHARS[(k + d + INITIAL_CHARS.length) % INITIAL_CHARS.length];
      cursor = i;
      this.feedback('ui_click', 0.6);
      paint();
    };
    const type = (ch: string) => {
      if (finished) return;
      if (cursor >= 3) cursor = 2;
      chars[cursor] = ch;
      cursor = Math.min(3, cursor + 1);
      this.feedback('ui_click', 0.7);
      paint();
    };
    const del = () => {
      if (finished) return;
      cursor = Math.max(0, cursor - 1);
      chars[cursor] = ' ';
      this.feedback('ui_back', 0.7);
      paint();
    };

    for (let i = 0; i < 3; i++) {
      const slot = el('div', 'ne-slot', slotsEl);
      const up = el('button', 'ne-arrow ne-up', slot, arrowSvg('up'));
      up.setAttribute('aria-label', `Letter ${i + 1} up`);
      const letter = el('div', 'ne-letter', slot);
      const down = el('button', 'ne-arrow ne-down', slot, arrowSvg('down'));
      down.setAttribute('aria-label', `Letter ${i + 1} down`);
      // Cabinet convention: ▲ steps forward through the alphabet (A → B), ▼ back.
      onTap(up, () => cycle(i, 1));
      onTap(down, () => cycle(i, -1));
      onTap(letter, () => {
        if (finished) return;
        cursor = i;
        this.feedback('ui_click', 0.5);
        paint();
      });
      letters.push(letter);
      slots.push(slot);
    }

    const key = (label: string, cls: string, fn: () => void) => {
      const b = el('button', `ne-key ${cls}`, grid, label);
      onTap(b, fn);
      return b;
    };
    for (const ch of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789') key(ch, '', () => type(ch));
    key('.', 'k-dot', () => type('.'));
    key('SPC', 'k-sp', () => type(' '));
    key('DEL', 'k-del', del);
    endKey = key('END', 'k-end', confirm);
    paint();

    let left = NAME_ENTRY_SECS;
    this.timers.push(
      window.setInterval(() => {
        if (finished) return;
        left--;
        timerVal.textContent = two(left);
        timer.classList.toggle('urgent', left <= 5);
        if (left <= 5 && left > 0) this.audio.play('continue_tick', { volume: 0.6 });
        if (left <= 0) confirm();
      }, 1000),
    );
    this.onKeys((e) => {
      if (finished) return;
      const c = e.key.length === 1 ? e.key.toUpperCase() : '';
      if (c && /[A-Z0-9.]/.test(c)) type(c);
      else if (e.code === 'Space') type(' ');
      else if (e.code === 'Backspace') del();
      else if (e.code === 'Enter') confirm();
      else if (e.code === 'ArrowUp') cycle(Math.min(2, cursor), 1);
      else if (e.code === 'ArrowDown') cycle(Math.min(2, cursor), -1);
      else if (e.code === 'ArrowLeft') (cursor = Math.max(0, cursor - 1)), paint();
      else if (e.code === 'ArrowRight') (cursor = Math.min(3, cursor + 1)), paint();
      else return;
      e.preventDefault();
    });
  }

  // ─── Campaign / stage select ──────────────────────────────────────────────

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
    el('h2', 'screen-title', s, 'SELECT CAMPAIGN');
    const row = el('div', 'campaign-row', s);
    for (const c of this.campaigns) {
      const card = el('button', `campaign-card camp-${c.id}`, row);
      card.style.setProperty('--accent', c.accent);
      const svg = c.id === 'zombie' ? cityCardArt() : jungleCardArt();
      const art = el('div', 'camp-art', card, svg);
      pixelateInto(art, `card-${c.id}`, svg, 160, 96);
      el('div', 'camp-shade', card);
      const marquee = el('div', 'camp-marquee', card);
      el('div', 'camp-name', marquee, escapeHtml(c.name));
      const info = el('div', 'camp-info', card);
      el('div', 'camp-tag', info, escapeHtml(c.tagline));
      const meta = el('div', 'camp-meta', info);
      this.stagePips(meta, c);
      const top = this.save.hiScores(c.id)[0];
      el('div', 'camp-best', meta, top ? `HI <b>${pad7(top.score)}</b>` : `${c.stages.length} STAGES`);
      el('div', 'camp-play', card, `PLAY${arrowSvg('right')}`);
      onTap(card, () => {
        this.feedback('ui_start');
        card.classList.add('chosen');
        this.clearRunGrades(c);
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
          best ? `BEST ${pad7(best.score)}` : unlocked ? (boss ? `${SKULL_ICON} FINAL STAGE` : 'NOT CLEARED') : `CLEAR STAGE ${i} FIRST`,
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
      [TUTORIAL_ART.tap, 'TAP TO SHOOT', 'Tap to fire. Hold for auto-fire.'],
      [TUTORIAL_ART.ring, 'RING + ! = ATTACK', 'It shrinks, then strikes. Shoot before it closes!'],
      [TUTORIAL_ART.reload, 'RELOAD', 'Tap RELOAD or swipe down.'],
      [TUTORIAL_ART.crate, 'SHOOT CRATES', 'Guns, bombs and health inside.'],
      [`<div class="tip-glyph glyph-swap">${swapSvg()}</div>`, 'SWITCH GUNS', 'Tap your gun panel to swap. Vehicles use their mounted gun.'],
      [TUTORIAL_ART.civ, "DON'T SHOOT CIVILIANS", 'Hitting a survivor costs a life.'],
      ['<div class="tip-glyph glyph-head">+</div>', 'HEADSHOTS + COMBOS', "Heads take double damage. Don't miss: up to x4 score."],
      [`<div class="tip-glyph glyph-bomb">${bombSvg()}</div>`, 'BOMB', 'Clears the screen. You get one.'],
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

  /** `loadedArt`: the ART the running stage was loaded with (from the pause screen), for the scenery note. */
  showSettings(back: Back, loadedArt?: ArtStyle) {
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
      applyComfort(this.save.settings);
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

    slider(colA, 'SOUND FX', 'sfxVolume');
    slider(colA, 'MUSIC', 'musicVolume');
    this.segRow(colA, 'GRAPHICS', 'quality', [
      ['low', 'LOW'],
      ['medium', 'MED'],
      ['high', 'HIGH'],
    ] as [QualityLevel, string][], st, commit);
    if (RETRO_SETTING_ENABLED) {
      this.segRow(colA, 'DISPLAY', 'retro', [
        ['crt', 'CRT'],
        ['pixel', 'PIXEL'],
        ['off', 'OFF'],
      ] as [RetroMode, string][], st, commit);
    }
    {
      let sync = () => {};
      const row = this.segRow(colA, 'ART', 'art', ART_STYLES.map((a) => [a, ART_NAMES[a]]) as [ArtStyle, string][], st, () => {
        commit();
        sync();
      });
      row.classList.add('art-row');
      // PIXEL WORLD scenery is built with the stage: say when a change shows there.
      const note = el('div', 'set-note art-note', colA, '');
      sync = () => {
        note.textContent = loadedArt && envPending(loadedArt, st.art) ? 'SCENERY CHANGES ON THE NEXT STAGE LOAD' : '';
      };
      sync();
    }
    this.segRow(colA, 'SCREEN SHAKE', 'screenShake', SHAKE_OPTS, st, commit, 'SHAKE');
    this.toggleRow(colA, 'SHOW FPS', 'showFps', st, commit);
    this.toggleRow(colB, 'AIM ASSIST', 'aimAssist', st, commit);
    this.toggleRow(colB, 'AUTO RELOAD', 'autoReload', st, commit);
    this.toggleRow(colB, 'VIBRATION', 'haptics', st, commit);
    this.toggleRow(colB, 'LEFT-HANDED HUD', 'leftHanded', st, commit);
    this.toggleRow(colB, 'REDUCE FLASHING', 'reduceFlashes', st, commit);
    const rrow = el('div', 'set-row', colB);
    el('span', 'set-label', rrow, 'PROGRESS');
    const reset = el('button', 'set-btn danger', rrow, 'RESET');
    onTap(reset, () => {
      if (reset.classList.contains('done') || s.querySelector('.confirm-veil:not(.leaving)')) return;
      this.feedback('empty', 0.8);
      // A real confirmation (not a second tap on the same spot): KEEP / ERASE sit
      // elsewhere and ERASE ignores taps for a moment, so a double tap can't wipe the save.
      this.confirm(
        s,
        'ERASE ALL PROGRESS?',
        'Unlocked stages, best scores and both HI-SCORE tables will be wiped. This cannot be undone.',
        'ERASE',
        () => {
          // (This credit's grades stay: they describe the run in progress, not the save.)
          this.save.reset();
          reset.textContent = 'DONE';
          reset.classList.add('done');
          this.feedback('ui_back');
        },
      );
    });
    this.backButton(s, back);
  }

  /** Modal choice over `screen`: KEEP (default, left) / `yes` (right, armed after ARM_MS). */
  private confirm(screen: HTMLElement, title: string, text: string, yes: string, onYes: () => void) {
    // The veil is position:fixed (covers the viewport even when `screen` is scrolled);
    // the screen behind it stops scrolling while the dialog is up.
    const veil = el('div', 'confirm-veil', screen);
    screen.classList.add('modal-open');
    const box = el('div', 'confirm-box', veil);
    box.setAttribute('role', 'alertdialog');
    box.setAttribute('aria-label', title);
    el('div', 'confirm-title', box, title);
    el('div', 'confirm-text', box, text);
    const row = el('div', 'confirm-row', box);
    const prevKeys = this.keyHandler;
    const openedAt = performance.now();
    let closed = false;
    const close = () => {
      if (closed) return;
      closed = true;
      this.keyHandler = prevKeys;
      screen.classList.remove('modal-open');
      veil.classList.add('leaving');
      window.setTimeout(() => veil.remove(), 160);
    };
    this.button(row, 'KEEP', close, 'primary');
    this.button(
      row,
      yes,
      () => {
        if (closed) return;
        close();
        onYes();
      },
      'erase',
      undefined,
      ARM_MS,
    );
    // Tapping outside the box cancels.
    veil.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      // (The second tap of a double tap on RESET lands here: it neither cancels nor confirms.)
      if (e.target === veil && !closed && performance.now() - openedAt > ARM_MS) {
        this.feedback('ui_back');
        close();
      }
    });
    this.keyHandler = (e) => {
      if (e.code === 'Escape') {
        e.preventDefault();
        close();
      }
    };
  }

  // The whole row is the touch target (label included), not just the small switch.
  private toggleRow(parent: HTMLElement, label: string, key: ToggleKey, st: Settings, commit: () => void) {
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
    return row;
  }

  /** `short`: label used where the row is narrow (phone landscape columns), see styles.css .lbl-short. */
  private segRow<K extends SegKey>(
    parent: HTMLElement,
    label: string,
    key: K,
    opts: [Settings[K], string][],
    st: Settings,
    commit: () => void,
    short?: string,
  ) {
    const row = el('div', 'set-row seg-row', parent);
    el('span', 'set-label', row, short ? `<span class="lbl-long">${label}</span><span class="lbl-short">${short}</span>` : label);
    const wrap = el('div', 'set-seg', row);
    // Numeric settings light the nearest choice (a stored 0.8 shows as FULL).
    const cur = st[key];
    let pick = opts.findIndex(([v]) => v === cur);
    if (pick < 0 && typeof cur === 'number') {
      let best = Infinity;
      opts.forEach(([v], i) => {
        const d = Math.abs((v as number) - cur);
        if (d < best) {
          best = d;
          pick = i;
        }
      });
    }
    opts.forEach(([value, text], i) => {
      const b = el('button', `seg ${i === pick ? 'on' : ''}`, wrap, text);
      b.setAttribute('aria-label', `${label} ${text}`);
      onTap(b, () => {
        st[key] = value;
        wrap.querySelectorAll('.seg').forEach((x) => x.classList.remove('on'));
        b.classList.add('on');
        this.feedback('ui_click');
        commit();
      });
    });
    return row;
  }

  // ─── In-game ──────────────────────────────────────────────────────────────

  showPause(info?: PauseInfo) {
    const s = this.screen('pause');
    el('h2', 'screen-title', s, 'PAUSED');
    if (info) {
      const meta = el('div', 'pause-meta', s);
      el('span', 'pause-stage', meta, escapeHtml(info.stage));
      el('span', 'pause-score', meta, `SCORE <b>${pad7(info.score)}</b>`);
    }
    const col = el('div', 'menu-col pause-col', s);
    this.button(col, 'RESUME', () => this.actions.resume(), 'primary big');
    if (info?.art) {
      // ART chip: one tap cycles CLASSIC → PIXEL CAST → PIXEL WORLD (characters switch live,
      // behind the pause veil; the scenery style shows from the next stage load).
      const row = el('div', 'set-row seg-row pause-art', col);
      el('span', 'set-label', row, 'ART');
      const wrap = el('div', 'set-seg', row);
      const b = el('button', 'seg on art-chip', wrap, ART_NAMES[info.art]);
      b.setAttribute('aria-label', `ART ${ART_NAMES[info.art]}`);
      const note = el('div', 'set-note art-note pause-art-note', col, '');
      const sync = () => {
        const a = info.art!;
        b.innerHTML = ART_NAMES[a];
        b.setAttribute('aria-label', `ART ${ART_NAMES[a]}`);
        note.textContent = info.loadedArt && envPending(info.loadedArt, a) ? 'SCENERY CHANGES ON THE NEXT STAGE LOAD' : '';
      };
      sync();
      onTap(b, () => {
        info.art = nextArt(info.art!);
        sync();
        this.feedback('ui_click');
        this.actions.setArt(info.art);
      });
    }
    const grid = el('div', 'menu-grid', col);
    this.button(grid, 'RESTART STAGE', () => this.actions.restart(), 'small');
    this.button(grid, 'SETTINGS', () => this.showSettings(() => this.showPause(info), info?.loadedArt), 'small');
    this.button(grid, 'HOW TO PLAY', () => this.showHowTo(() => this.showPause(info)), 'small');
    this.button(grid, 'QUIT', () => this.actions.quit(), 'small quit');
  }

  /** `onDone` (timer or tap) returns false while the stage is still loading: the card stays up until Game hides it. */
  showStageIntro(stage: StageDef, campaign: CampaignDef, onDone: () => boolean | void) {
    const s = this.screen('intro');
    s.style.setProperty('--accent', campaign.accent);
    el('div', 'letterbox top', s);
    el('div', 'letterbox bottom', s);
    const card = el('div', 'intro-card', s);
    el('div', 'intro-camp', card, escapeHtml(campaign.name));
    const final = stage.index === campaign.stages.length - 1;
    el('div', 'intro-stage', card, `STAGE ${stage.index + 1}${final ? '<em>FINAL</em>' : ''}`);
    el('div', 'intro-name', card, escapeHtml(stage.name));
    if (stage.tagline) el('div', 'intro-tag', card, escapeHtml(stage.tagline));
    const hint = el('div', 'intro-hint', card, 'GET READY!');
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      // Still loading (a first PIXEL WORLD load paints its scenery): the card stays up,
      // saying so, until play begins (Game hides it then).
      if (onDone() === false) {
        hint.textContent = 'LOADING...';
        hint.classList.add('loading');
        return;
      }
      this.hide();
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
      [TUTORIAL_ART.tap, 'TAP TO SHOOT', 'Tap to fire. Hold for auto.'],
      [TUTORIAL_ART.ring, 'ATTACK RING!', 'Hits you when it closes. Shoot first!'],
      [TUTORIAL_ART.reload, 'RELOAD', 'Tap RELOAD or swipe down.'],
      [TUTORIAL_ART.crate, 'SHOOT CRATES', 'Guns, bombs and health inside.'],
      [TUTORIAL_ART.civ, 'SPARE CIVILIANS', 'Hitting one costs a life.'],
    ];
    cards.forEach(([art, title, text], i) => {
      const c = el('div', 'tut-card', grid);
      c.style.setProperty('--i', String(i));
      el('div', 'tut-art', c, art);
      el('div', 'tut-title', c, title);
      el('div', 'tut-text', c, text);
    });
    this.button(s, "GOT IT! LET'S GO!", () => onDone(), 'primary big tut-go', undefined, 900);
  }

  showResults(r: StageResult, isBest: boolean, nextLabel: string) {
    const s = this.screen('results');
    const stage = this.campaigns.flatMap((c) => c.stages).find((x) => x.id === r.stageId);
    // This run's grades for the campaign-clear screen. A run always starts at stage 1,
    // so clearing it starts a fresh record; RETRY simply overwrites the stage's grade.
    if (stage) {
      const camp = this.campaigns.find((c) => c.stages.includes(stage));
      if (camp && stage.index === 0) this.clearRunGrades(camp);
      this.runGrades.set(r.stageId, r.grade);
    }
    const head = el('div', 'results-head', s);
    el('h2', 'screen-title', head, 'STAGE CLEAR!');
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
    row(left, 'SCORE', r.score, num, '', 0.5);
    row(left, 'KILLS', r.kills, num);
    row(left, 'ACCURACY', r.accuracy * 100, (n) => `${Math.round(n)}%`);
    row(left, 'HEADSHOTS', r.headshots, num);
    row(left, 'MAX COMBO', r.maxCombo, num);
    row(left, 'RESCUED', r.rescues, num);
    el('div', 'bonus-title', right, 'BONUS');
    if (r.bonuses.length === 0) el('div', 'res-row in none', right, '<span class="res-k">NONE</span>');
    for (const b of r.bonuses) row(right, escapeHtml(b.label), b.points, (n) => `+${num(n)}`, 'bonus', 0.28);
    row(right, 'TOTAL', r.total, num, 'total', 0.9);
    const gradeBox = el('div', 'grade-box', panel);
    el('div', 'grade-label', gradeBox, 'RANK');
    const grade = el('div', `grade grade-${r.grade}`, gradeBox, r.grade);
    const prev = this.save.data.best[r.stageId];
    const bestLine = el('div', `best-line ${isBest ? 'is-new' : ''}`, gradeBox, isBest ? 'NEW BEST!' : prev ? `BEST ${num(prev.score)}` : '');
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

  /** CONTINUE? with classic huge digits counting down `seconds` … 0. */
  showContinue(seconds = 9) {
    const s = this.screen('continue');
    el('h2', 'screen-title danger', s, 'CONTINUE?');
    const dial = el('div', 'continue-dial', s);
    const count = el('div', 'continue-count', dial, String(seconds));
    const bar = el('div', 'continue-bar', dial);
    const blocks: HTMLElement[] = [];
    for (let i = 0; i <= seconds; i++) blocks.push(el('i', 'on', bar));
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
        blocks[n + 1]?.classList.remove('on');
        dial.classList.toggle('urgent', n <= 3);
        count.classList.remove('tick');
        void count.offsetWidth;
        count.classList.add('tick');
        this.audio.play('continue_tick', { volume: n <= 3 ? 1 : 0.8 });
        if (n <= 3 && this.save.settings.haptics) haptic(25);
      }, 1000),
    );
  }

  /**
   * GAME OVER with the final score counting up. With `nameEntry` (an arcade run
   * that made the hi-score table) it leads into the initials screen instead of
   * RETRY / MENU.
   */
  showGameOver(score: number, nameEntry?: () => void) {
    this.lastScore = score;
    const s = this.screen('gameover');
    const title = el('h2', 'screen-title danger big gameover-title', s);
    'GAME OVER'.split('').forEach((ch, i) => {
      const sp = el('span', ch === ' ' ? 'go-ch gap' : 'go-ch', title, ch === ' ' ? '&nbsp;' : ch);
      sp.style.setProperty('--i', String(i));
    });
    const sc = el('div', 'gameover-score', s, '<span>SCORE</span> ');
    // Zero-padded like the HUD: the centred row never changes width while it counts.
    const v = el('b', '', sc, pad7(0));
    const row = el('div', 'menu-row', s);
    if (nameEntry) {
      const nb = el('div', 'new-best', s, 'NEW HI-SCORE!');
      s.insertBefore(nb, row);
      let gone = false;
      const go = () => {
        if (gone) return;
        gone = true;
        nameEntry();
      };
      this.button(row, 'ENTER INITIALS', go, 'primary pulse', undefined, ARM_MS);
      const skip = this.runTally([{ row: sc, val: v, to: score, fmt: pad7, dur: 1.1 }], () => {
        nb.classList.add('pop');
        this.later(3200, go);
      }, 900);
      s.addEventListener('pointerdown', () => skip());
      return;
    }
    this.button(row, 'RETRY', () => this.actions.restart(), 'primary', undefined, ARM_MS);
    this.button(row, 'MENU', () => this.actions.quit(), 'back', undefined, ARM_MS);
    const skip = this.runTally([{ row: sc, val: v, to: score, fmt: pad7, dur: 1.1 }], () => {}, 900);
    s.addEventListener('pointerdown', () => skip());
  }

  private clearRunGrades(c: CampaignDef) {
    for (const st of c.stages) this.runGrades.delete(st.id);
  }

  /**
   * `grades` (by stage id) = this run's results; when omitted, the grades of the
   * results screens shown since stage 1 of this campaign are used. The lifetime
   * best is shown as a small BEST tag when it is higher.
   */
  showCampaignClear(campaign: CampaignDef, total: number, isBest: boolean, nameEntry?: () => void, grades?: Partial<Record<string, Grade>>) {
    this.lastScore = total;
    const s = this.screen('campaign-clear');
    s.style.setProperty('--accent', campaign.accent);
    const burst = el('div', 'confetti', s);
    const colors = [campaign.accent, '#ffe000', '#ffffff', '#5aff3a', '#2ee6ff'];
    for (let i = 0; i < 46; i++) {
      const p = el('i', '', burst);
      p.style.setProperty('--x', `${(Math.random() * 2 - 1) * 48}vw`);
      p.style.setProperty('--y', `${-20 - Math.random() * 45}vh`);
      p.style.setProperty('--r', `${Math.round(Math.random() * 8 - 4) * 90}deg`);
      p.style.setProperty('--d', `${Math.random() * 0.6}s`);
      p.style.background = colors[i % colors.length];
    }
    el('div', 'clear-kicker', s, `${escapeHtml(campaign.name)} COMPLETE`);
    el('h2', 'screen-title big clear-title', s, 'YOU SURVIVED!');
    const gradesEl = el('div', 'clear-grades', s);
    campaign.stages.forEach((st, i) => {
      const run = grades?.[st.id] ?? this.runGrades.get(st.id);
      const best = this.save.data.best[st.id]?.grade;
      const g = el('div', 'clear-stage', gradesEl);
      g.style.setProperty('--i', String(i));
      el('span', `grade-badge grade-${run ?? 'D'}`, g, run ?? '-');
      const txt = el('span', 'clear-stage-text', g);
      el('span', 'clear-stage-name', txt, escapeHtml(st.name));
      if (best && (!run || GRADE_ORDER.indexOf(best) > GRADE_ORDER.indexOf(run))) el('span', `clear-stage-best grade-${best}`, txt, `BEST ${best}`);
    });
    const sc = el('div', 'gameover-score final', s, '<span>FINAL SCORE</span> ');
    const v = el('b', '', sc, pad7(0));
    const nb = isBest || nameEntry ? el('div', 'new-best', s, nameEntry ? 'NEW HI-SCORE!' : 'NEW PERSONAL BEST!') : null;
    const row = el('div', 'menu-row', s);
    if (nameEntry) {
      this.button(row, 'ENTER INITIALS', nameEntry, 'primary pulse', undefined, ARM_MS);
      // Like a cabinet: the initials screen comes up on its own if nobody presses anything.
      this.later(14000, nameEntry);
    } else this.button(row, 'MENU', () => this.actions.quit(), 'primary', undefined, ARM_MS);
    const skip = this.runTally([{ row: sc, val: v, to: total, fmt: pad7, dur: 1.6 }], () => nb?.classList.add('pop'), 1100);
    s.addEventListener('pointerdown', () => skip());
  }
}
