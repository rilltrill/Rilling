import type { HitMarkerKind, HudApi, PopupStyle, World } from '../gameplay/World';
import { WEAPONS } from '../gameplay/Weapons';
import type { WeaponId } from '../core/types';
import { MAX_AVOID, Overlay2D } from './Overlay2D';
import { applyComfort, el, onTap, setStyle, setText, toggle } from './dom';
import { SKULL_ICON, weaponIcon } from './art';
import { bombSvg, heartSvg, infinitySvg, installPixelSprites, swapSvg } from './pixel';

export interface HudCallbacks {
  pause(): void;
  reload(): void;
  bomb(): void;
  cycleWeapon(): void;
}

const CYCLE: WeaponId[] = ['pistol', 'shotgun', 'smg', 'magnum'];
const BOSS_INTRO = 2.4;
const COMBO_CLASS = ['hud-combo', 'hud-combo live', 'hud-combo hot', 'hud-combo hot fire', 'hud-combo hot fire max'];
/** A double tap on BOMB must not spend two bombs. */
const BOMB_DEBOUNCE_MS = 750;
/** Re-measure the HUD panel rects for the overlay this often (s), plus on resize / layout changes. */
const LAYOUT_EVERY = 0.5;
/** A panel stays faded this long after the telegraph behind it is gone (s): no flicker. */
const VEIL_HOLD = 0.35;
const HEART_FULL = heartSvg(true);
const HEART_EMPTY = heartSvg(false);
const INF = infinitySvg();

/** Arcade score: zero-padded to 7 digits (monospace pixel font → no layout shift). */
export const arcadeScore = (n: number) => String(Math.max(0, Math.floor(n))).padStart(7, '0');

/**
 * In-game heads-up display (DOM) + the 2D overlay canvas.
 * Gameplay talks to it through the HudApi interface; `sync()` mirrors world
 * state into the DOM once per frame, touching only what changed.
 *
 * Layout: score/combo top-left · pause top-right · progress/boss bar top-centre ·
 * lives + bomb bottom-left · weapon + reload bottom-right (mirrored when
 * left-handed). The centre stays clear for the action.
 */
export class Hud implements HudApi {
  readonly root: HTMLDivElement;
  readonly overlay: Overlay2D;
  private score: HTMLDivElement;
  private combo: HTMLDivElement;
  private mult: HTMLDivElement;
  private comboBar: HTMLDivElement;
  private comboHits: HTMLDivElement;
  private hearts: HTMLDivElement;
  private bombBtn: HTMLButtonElement;
  private bombCount: HTMLSpanElement;
  private weaponBox: HTMLDivElement;
  private weaponIconEl: HTMLDivElement;
  private weaponName: HTMLDivElement;
  private ammoPips: HTMLDivElement;
  private reserve: HTMLDivElement;
  private slots: HTMLDivElement;
  private heat: HTMLDivElement;
  private heatFill: HTMLDivElement;
  private heatLabel: HTMLSpanElement;
  private reloadBtn: HTMLButtonElement;
  private reloadRing: HTMLDivElement;
  private bossWrap: HTMLDivElement;
  private bossName: HTMLDivElement;
  private bossFill: HTMLDivElement;
  private bossLag: HTMLDivElement;
  private bossTicks: HTMLDivElement;
  private bossIntroEl: HTMLDivElement;
  private bossIntroName: HTMLDivElement;
  private bannerEl: HTMLDivElement;
  private bannerText: HTMLDivElement;
  private bannerSub: HTMLDivElement;
  private promptEl: HTMLDivElement;
  private popups: HTMLDivElement;
  private vignette: HTMLDivElement;
  private dmgEdge: HTMLDivElement;
  private dmgDirs: HTMLDivElement[] = [];
  private dmgIdx = 0;
  private flashEl: HTMLDivElement;
  private splats: HTMLDivElement;
  private fpsEl: HTMLDivElement;
  private debugEl: HTMLDivElement;
  private demoEl: HTMLDivElement;
  private progress: HTMLDivElement;
  private progressFill: HTMLDivElement;
  private progressDot: HTMLDivElement;
  private bannerTimer = 0;
  private promptTimer = 0;
  private lastHp = -1;
  private lastMaxHp = -1;
  private lastAmmoKey = '';
  private lastOwned = 1;
  private comboLevel = 0;
  private lastBoss: unknown = null;
  private bossIntroT = 0;
  /** Real-time start of the intro (the CSS animation runs in real time, not game time). */
  private bossIntroAt = 0;
  private bossFillK = 1;
  private swapHintT = 0;
  private swapTip!: HTMLDivElement;
  /** Empty-mag "switch guns" hints shown this stage (coaching only). */
  private emptyHints = 0;
  private lastOverride: string | null = null;
  /**
   * Coach the gun panel (bigger callout, extra moments: empty mag, leaving a
   * vehicle) until the player has switched by hand a few times. Set by Game.
   */
  coachSwap = true;
  private bossLagFrac = 1;
  private shownScore = 0;
  private popupPool: HTMLDivElement[] = [];
  /** A banner with exactly this text is swallowed once (see suppressBanner). */
  private bannerSuppress: string | null = null;
  private lastBombs = -1;
  /** performance.now() of the last accepted BOMB tap. */
  private bombAt = -1e9;
  private safeProbe: HTMLDivElement;
  /** HUD panels the overlay keeps threat beacons away from (index = Overlay2D avoid slot). */
  private avoidEls: HTMLElement[] = [];
  private veilT = new Float32Array(MAX_AVOID);
  private layoutT = 0;
  private lastTopBar = '';
  /** Combo meter's bottom-left (CSS px) for the "xN COMBO" popup. */
  private comboAnchorX = 14;
  private comboAnchorY = 72;
  /** Photosensitivity / comfort (mirrors world.settings). */
  private reduceFlashes = false;
  private shakeK = 1;

  constructor(parent: HTMLElement, private cb: HudCallbacks) {
    installPixelSprites();
    this.overlay = new Overlay2D(parent);
    const r = (this.root = el('div', 'hud hidden', parent));
    r.id = 'hud';

    this.vignette = el('div', 'hud-vignette', r);
    this.dmgEdge = el('div', 'hud-dmg-edge', r);
    for (let i = 0; i < 3; i++) this.dmgDirs.push(el('div', 'hud-dmg-dir', r));
    this.flashEl = el('div', 'hud-flash', r);
    this.splats = el('div', 'hud-splats', r);
    // Invisible box inset by the safe-area insets (measured for the overlay's beacons).
    this.safeProbe = el('div', 'hud-safe', r);

    const tl = el('div', 'hud-tl', r);
    const sl = el('div', 'hud-score-line', tl);
    el('span', 'hud-1p', sl, '1P');
    this.score = el('div', 'hud-score', sl, arcadeScore(0));
    this.combo = el('div', 'hud-combo', tl);
    this.mult = el('div', 'hud-mult', this.combo, 'x1');
    const cbw = el('div', 'hud-combo-meter', this.combo);
    const bar = el('div', 'hud-combo-bar', cbw);
    this.comboBar = el('div', 'hud-combo-fill', bar);
    this.comboHits = el('div', 'hud-combo-hits', cbw, '');

    const tr = el('div', 'hud-tr', r);
    const pause = el('button', 'hud-btn hud-pause', tr, '<i class="hud-pause-ico"><span></span><span></span></i>');
    pause.setAttribute('aria-label', 'Pause');
    onTap(pause, () => this.cb.pause());

    this.progress = el('div', 'hud-progress', r);
    const track = el('div', 'hud-progress-track', this.progress);
    this.progressFill = el('div', 'hud-progress-fill', track);
    this.progressDot = el('div', 'hud-progress-dot', track);
    el('div', 'hud-progress-end', this.progress, SKULL_ICON);

    this.bossWrap = el('div', 'hud-boss hidden', r);
    const bossHead = el('div', 'hud-boss-head', this.bossWrap);
    el('span', 'hud-boss-skull', bossHead, SKULL_ICON);
    this.bossName = el('div', 'hud-boss-name', bossHead);
    const bb = el('div', 'hud-boss-bar', this.bossWrap);
    this.bossLag = el('div', 'hud-boss-lag', bb);
    this.bossFill = el('div', 'hud-boss-fill', bb);
    this.bossTicks = el('div', 'hud-boss-ticks', bb);

    this.bossIntroEl = el('div', 'hud-boss-intro', r);
    const band = el('div', 'bi-band', this.bossIntroEl);
    el('div', 'bi-stripes top', band);
    el('div', 'bi-warning', band, 'WARNING');
    this.bossIntroName = el('div', 'bi-name', band);
    el('div', 'bi-stripes bottom', band);

    const bl = el('div', 'hud-bl', r);
    this.hearts = el('div', 'hud-hearts', bl);
    this.bombBtn = el('button', 'hud-btn hud-bomb', bl, `<span class="hud-bomb-icon">${bombSvg()}</span>`);
    this.bombBtn.setAttribute('aria-label', 'Bomb');
    this.bombCount = el('span', 'hud-bomb-count', this.bombBtn, 'x1');
    onTap(this.bombBtn, () => {
      // Debounce: a panic double tap (or a two-finger touch) spends one bomb, not two.
      const now = performance.now();
      if (now - this.bombAt < BOMB_DEBOUNCE_MS) return;
      this.bombAt = now;
      toggle(this.bombBtn, 'cooling', true);
      this.cb.bomb();
    });

    const br = el('div', 'hud-br', r);
    this.weaponBox = el('div', 'hud-weapon', br);
    this.weaponBox.setAttribute('role', 'button');
    this.weaponBox.setAttribute('aria-label', 'Switch weapon');
    const wtop = el('div', 'hud-wtop', this.weaponBox);
    this.weaponIconEl = el('div', 'hud-wicon', wtop, weaponIcon('pistol'));
    this.weaponName = el('div', 'hud-weapon-name', wtop, 'PISTOL');
    el('div', 'hud-swap', wtop, swapSvg());
    this.swapTip = el('div', 'hud-swap-tip', this.weaponBox);
    this.ammoPips = el('div', 'hud-ammo', this.weaponBox);
    const wbot = el('div', 'hud-wbottom', this.weaponBox);
    this.slots = el('div', 'hud-slots', wbot);
    this.reserve = el('div', 'hud-reserve', wbot);
    this.heat = el('div', 'hud-heat hidden', this.weaponBox);
    this.heatLabel = el('span', 'hud-heat-label', this.heat, 'HEAT');
    const hb = el('div', 'hud-heat-bar', this.heat);
    this.heatFill = el('div', 'hud-heat-fill', hb);
    onTap(this.weaponBox, () => this.cb.cycleWeapon());
    this.reloadBtn = el('button', 'hud-btn hud-reload', br);
    this.reloadBtn.setAttribute('aria-label', 'Reload');
    this.reloadRing = el('div', 'hud-reload-ring', this.reloadBtn);
    el('span', 'hud-reload-label', this.reloadBtn, '<span>RE</span><span>LOAD</span>');
    onTap(this.reloadBtn, () => this.cb.reload());

    this.bannerEl = el('div', 'hud-banner', r);
    this.bannerText = el('div', 'hud-banner-text', this.bannerEl);
    this.bannerSub = el('div', 'hud-banner-sub', this.bannerEl);
    this.promptEl = el('div', 'hud-prompt', r);
    this.popups = el('div', 'hud-popups', r);
    this.fpsEl = el('div', 'hud-fps hidden', r);
    this.debugEl = el('div', 'hud-debug hidden', r);
    // Demo scene cut: black (with a rolling sync bar) over everything but the DEMO PLAY banner.
    el('div', 'hud-demo-cut', r, '<i></i>');
    this.demoEl = el('div', 'hud-demo hidden', r, '<div class="hud-demo-title">DEMO PLAY</div><div class="hud-demo-press">PRESS START</div>');

    // Overlay avoid slots: corner panels, then the top-centre bar (boss bar or progress rail).
    this.avoidEls = [tl, tr, bl, br, this.bossWrap];
    window.addEventListener('resize', () => (this.layoutT = 0));
  }

  /**
   * Measure the HUD panels (CSS px) for the overlay: threat beacons stay clear of
   * them and a panel with a telegraph behind it fades. Cheap: runs every
   * LAYOUT_EVERY seconds or when the layout changes, never per frame.
   */
  private measureLayout() {
    const o = this.overlay;
    const sr = this.safeProbe.getBoundingClientRect();
    if (sr.width > 0 && sr.height > 0) o.setSafeArea(sr.left, sr.top, sr.right, sr.bottom);
    else o.setSafeArea(0, 0, 0, 0);
    const bossShown = !this.bossWrap.classList.contains('hidden');
    this.avoidEls[4] = bossShown ? this.bossWrap : this.progress;
    for (let i = 0; i < MAX_AVOID; i++) {
      const e = this.avoidEls[i];
      const hidden = !e || e.classList.contains('hidden');
      const b = hidden ? null : e.getBoundingClientRect();
      if (!b || b.width <= 0 || b.height <= 0) o.setAvoid(i, 0, 0, 0, 0);
      else o.setAvoid(i, b.left, b.top, b.right, b.bottom);
      if (i === 0 && b && b.width > 0) {
        this.comboAnchorX = b.left;
        this.comboAnchorY = b.bottom + 6;
      }
    }
  }

  /** Attract-mode demo: no buttons, a blinking DEMO PLAY / PRESS START banner. */
  setDemo(on: boolean) {
    toggle(this.root, 'demo', on);
    toggle(this.demoEl, 'hidden', !on);
    if (!on) this.demoCut(false);
  }

  /** Demo cut to black while the stage fast-forwards to the next fight. */
  demoCut(on: boolean) {
    toggle(this.root, 'demo-cut', on);
    // The overlay draws above the HUD: keep rings / beacons off the black cut.
    this.overlay.canvas.style.visibility = on ? 'hidden' : '';
  }

  show(on: boolean) {
    toggle(this.root, 'hidden', !on);
    this.overlay.canvas.style.display = on ? 'block' : 'none';
    if (on) this.layoutT = 0;
  }

  setLeftHanded(on: boolean) {
    toggle(this.root, 'left-handed', on);
  }

  showFps(on: boolean) {
    toggle(this.fpsEl, 'hidden', !on);
  }

  setDebug(text: string | null) {
    toggle(this.debugEl, 'hidden', text === null);
    if (text !== null) setText(this.debugEl, text);
  }

  reset() {
    this.lastHp = -1;
    this.lastMaxHp = -1;
    this.lastAmmoKey = '';
    this.lastOwned = 1;
    this.comboLevel = 0;
    this.lastBoss = null;
    this.shownScore = 0;
    this.lastBombs = -1;
    this.bossLagFrac = 1;
    this.bossIntroT = 0;
    this.bossFillK = 1;
    this.swapHintT = 0;
    this.emptyHints = 0;
    this.lastOverride = null;
    toggle(this.weaponBox, 'swap-hint', false);
    this.bannerTimer = 0;
    this.promptTimer = 0;
    setText(this.score, arcadeScore(0));
    toggle(this.bannerEl, 'show', false);
    toggle(this.promptEl, 'show', false);
    toggle(this.bossWrap, 'hidden', true);
    toggle(this.bossIntroEl, 'show', false);
    toggle(this.progress, 'hidden', false);
    toggle(this.root, 'low-hp', false);
    this.combo.className = 'hud-combo';
    this.popups.innerHTML = '';
    this.splats.innerHTML = '';
    this.popupPool = [];
    this.overlay.clear();
    setStyle(this.vignette, 'opacity', '0');
    this.bombAt = -1e9;
    toggle(this.bombBtn, 'cooling', false);
    this.veilT.fill(0);
    for (const e of [...this.avoidEls, this.progress]) e?.classList.remove('hud-veil');
    this.layoutT = 0;
    this.lastTopBar = '';
  }

  // ─── HudApi ───────────────────────────────────────────────────────────────

  popup(text: string, x: number, y: number, style: PopupStyle) {
    const p = this.popupPool.pop() ?? el('div', '');
    p.textContent = text;
    if (style === 'combo') {
      // Multiplier steps come out of the combo meter (top-left), never over the
      // middle of the screen where boss weak points sit.
      p.className = 'hud-popup pop-combo anchored';
      p.style.left = `${Math.round(this.comboAnchorX)}px`;
      p.style.top = `${Math.round(this.comboAnchorY)}px`;
      this.popups.appendChild(p);
      this.retirePopup(p);
      return;
    }
    p.className = `hud-popup pop-${style}`;
    // Press Start 2P is monospace: half the text width keeps it on screen when centred.
    const margin = Math.min(window.innerWidth / 2, 10 + text.length * 6.5);
    p.style.left = `${Math.max(margin, Math.min(window.innerWidth - margin, x))}px`;
    p.style.top = `${Math.max(40, Math.min(window.innerHeight - 40, y))}px`;
    this.popups.appendChild(p);
    this.retirePopup(p);
  }

  private retirePopup(p: HTMLDivElement) {
    const done = () => {
      p.remove();
      if (this.popupPool.length < 30) this.popupPool.push(p);
    };
    p.addEventListener('animationend', done, { once: true });
    setTimeout(() => p.isConnected && done(), 2000);
  }

  /**
   * Swallow the next banner whose text equals `text` (null = stop). Game uses it
   * while a stage starts behind its intro card, so the stage's opening title
   * banner doesn't repeat the name the card just showed.
   */
  suppressBanner(text: string | null) {
    this.bannerSuppress = text;
  }

  banner(text: string, sub = '', duration = 2.5) {
    if (this.bannerSuppress !== null && text.trim().toUpperCase() === this.bannerSuppress.trim().toUpperCase()) {
      this.bannerSuppress = null;
      return;
    }
    setText(this.bannerText, text);
    setText(this.bannerSub, sub);
    this.bannerEl.classList.remove('show');
    void this.bannerEl.offsetWidth;
    this.bannerEl.classList.add('show');
    this.bannerTimer = duration;
  }

  damage() {
    // Reduced flashing: the red frame alone says "hit" (no full-screen red flash).
    if (!this.reduceFlashes) this.flash('rgba(255,0,0,0.22)', 0.3);
    this.dmgEdge.classList.remove('hit');
    void this.dmgEdge.offsetWidth;
    this.dmgEdge.classList.add('hit');
    this.root.classList.remove('shake', 'shake-low');
    if (this.shakeK <= 0) return;
    void this.root.offsetWidth;
    this.root.classList.add(this.shakeK < 0.75 ? 'shake-low' : 'shake');
  }

  /**
   * Directional damage indicator: a red wedge on the screen edge the attack came
   * from. `angle` in screen space (radians, 0 = right, π/2 = down).
   */
  damageFrom(angle: number) {
    const d = this.dmgDirs[this.dmgIdx++ % this.dmgDirs.length];
    // Where a ray from the screen centre at `angle` leaves the screen.
    const w = window.innerWidth / 2;
    const h = window.innerHeight / 2;
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    const t = Math.min(Math.abs(c) > 1e-3 ? w / Math.abs(c) : Infinity, Math.abs(s) > 1e-3 ? h / Math.abs(s) : Infinity);
    d.style.left = `${w + c * t}px`;
    d.style.top = `${h + s * t}px`;
    d.classList.remove('hit');
    void d.offsetWidth;
    d.classList.add('hit');
  }

  /** Boss entrance: hazard band + name slam, then the health bar fills up. */
  bossIntro(title: string) {
    setText(this.bossIntroName, title);
    setText(this.bossName, title);
    this.bossIntroEl.classList.remove('show');
    void this.bossIntroEl.offsetWidth;
    this.bossIntroEl.classList.add('show');
    this.bossIntroT = BOSS_INTRO;
    this.bossIntroAt = performance.now();
    this.bossFillK = 0;
    this.bossLagFrac = 0;
  }

  splat(color: number) {
    // Reduced flashing: at most one (dimmer) splat on screen at a time.
    if (this.reduceFlashes && this.splats.childElementCount > 0) return;
    const s = el('div', 'hud-splat', this.splats);
    const hex = `#${color.toString(16).padStart(6, '0')}`;
    s.style.setProperty('--c', hex);
    s.style.left = `${20 + Math.random() * 60}%`;
    s.style.top = `${20 + Math.random() * 50}%`;
    s.style.setProperty('--r', `${Math.random() * 360}deg`);
    setTimeout(() => s.remove(), 2600);
  }

  flash(color = 'rgba(255,255,255,0.8)', duration = 0.25) {
    // Reduced flashing: bright / saturated full-screen flashes become a soft, slow
    // tint (fades to black — scene cuts — are not flashes and stay as they are).
    const soft = this.reduceFlashes && !isDark(color);
    this.flashEl.style.background = color;
    this.flashEl.style.transition = 'none';
    this.flashEl.style.opacity = soft ? '0.22' : '1';
    void this.flashEl.offsetWidth;
    this.flashEl.style.transition = `opacity ${soft ? Math.max(0.6, duration * 2) : duration}s ease-out`;
    this.flashEl.style.opacity = '0';
  }

  hitMarker(x: number, y: number, kind: HitMarkerKind) {
    this.overlay.hitMarker(x, y, kind);
  }

  shotFired(x: number, y: number) {
    this.overlay.shot(x, y);
  }

  /** Point at the gun panel for `seconds` (shown only while there is something to switch to). */
  private hintSwap(text: string, seconds: number) {
    setText(this.swapTip, text);
    toggle(this.weaponBox, 'swap-coach', this.coachSwap);
    this.swapHintT = Math.max(this.swapHintT, seconds);
  }

  /** The player switched guns by hand: the callout has done its job. */
  swapAnswered() {
    this.swapHintT = Math.min(this.swapHintT, 0.4);
  }

  prompt(text: string | null) {
    if (text === null) {
      this.promptTimer = 0;
      toggle(this.promptEl, 'show', false);
      return;
    }
    setText(this.promptEl, text);
    // Wide pixel font: long call-outs drop a size so they stay on one or two lines.
    toggle(this.promptEl, 'long', text.length > 18);
    toggle(this.promptEl, 'show', true);
    this.promptTimer = 1.6;
  }

  // ─── Per-frame sync ───────────────────────────────────────────────────────

  sync(world: World, dt: number, progress: number, fps: number) {
    const w = world;
    // Comfort settings live on world.settings (Game keeps it in sync with SETTINGS).
    const cs = w.settings;
    const rf = !!cs.reduceFlashes;
    const shake = Number.isFinite(cs.screenShake) ? Math.max(0, Math.min(1, cs.screenShake)) : 1;
    if (rf !== this.reduceFlashes || shake !== this.shakeK) {
      this.reduceFlashes = rf;
      this.shakeK = shake;
      this.overlay.reduceFlashes = rf;
      applyComfort(cs);
    }
    // BOMB greys out right after a bomb: the tap debounce here, plus World's own cooldown when it has one.
    const worldCooldown = (w as { bombCooldown?: () => number }).bombCooldown?.() ?? 0;
    toggle(this.bombBtn, 'cooling', worldCooldown > 0 || performance.now() - this.bombAt < BOMB_DEBOUNCE_MS);
    // Score rolls up toward the real value.
    const target = w.score.score;
    if (this.shownScore !== target) {
      const diff = target - this.shownScore;
      this.shownScore += Math.sign(diff) * Math.max(1, Math.ceil(Math.abs(diff) * Math.min(1, dt * 12)));
      if (Math.abs(target - this.shownScore) < 1) this.shownScore = target;
      setText(this.score, arcadeScore(this.shownScore));
    }

    // Combo meter: x2 warms up, x3 catches fire, x4 is MAX.
    const sc = w.score;
    const mult = sc.multiplier;
    setText(this.mult, `x${mult % 1 === 0 ? mult.toFixed(0) : mult.toFixed(1)}`);
    const level = mult >= 4 ? 4 : mult >= 3 ? 3 : mult >= 2 ? 2 : sc.combo > 0 ? 1 : 0;
    if (level !== this.comboLevel) {
      this.combo.className = COMBO_CLASS[level];
      if (level > this.comboLevel && level >= 2) {
        void this.combo.offsetWidth;
        this.combo.classList.add('bump');
      }
      this.comboLevel = level;
    }
    setStyle(this.comboBar, 'width', `${mult >= 4 ? 100 : ((sc.combo % 5) / 5) * 100}%`);
    setText(this.comboHits, mult >= 4 ? 'MAX!' : sc.combo >= 3 ? `${sc.combo} HITS` : '');

    // Lives.
    const hp = w.player.hp;
    if (hp !== this.lastHp || w.player.maxHp !== this.lastMaxHp) {
      const prev = this.lastHp;
      this.lastHp = hp;
      this.lastMaxHp = w.player.maxHp;
      let html = '';
      for (let i = 0; i < w.player.maxHp; i++) {
        const lost = prev > hp && i >= hp && i < prev;
        const gain = prev >= 0 && prev < hp && i >= prev && i < hp;
        html += `<span class="heart ${i < hp ? 'full' : 'empty'}${lost ? ' lost' : ''}${gain ? ' gain' : ''}">${i < hp ? HEART_FULL : lost ? HEART_EMPTY + HEART_FULL : HEART_EMPTY}</span>`;
      }
      this.hearts.innerHTML = html;
      toggle(this.root, 'low-hp', hp === 1);
    }
    if (w.player.bombs !== this.lastBombs) {
      this.lastBombs = w.player.bombs;
      setText(this.bombCount, `x${w.player.bombs}`);
      toggle(this.bombBtn, 'disabled', w.player.bombs <= 0);
    }

    // Weapon panel.
    const ws = w.weapons;
    const def = ws.def;
    const st = ws.state;
    const owned = ws.owned;
    const canSwap = !ws.override && owned.length > 1;
    if (!ws.override && owned.length > this.lastOwned) {
      this.hintSwap(this.coachSwap ? 'NEW GUN! TAP HERE TO SWITCH' : 'TAP TO SWITCH', this.coachSwap ? 5 : 2.5);
    } else if (this.lastOverride && !ws.override && canSwap && this.coachSwap) {
      this.hintSwap('ON FOOT! TAP TO SWITCH GUNS', 3);
    }
    this.lastOwned = ws.override ? this.lastOwned : owned.length;
    this.lastOverride = ws.override ?? null;
    const ammoKey = `${def.id}|${st.inMag}|${st.reserve}|${ws.override ?? ''}|${owned.join(',')}`;
    if (ammoKey !== this.lastAmmoKey) {
      const weaponChanged = !this.lastAmmoKey.startsWith(`${def.id}|`);
      this.lastAmmoKey = ammoKey;
      setText(this.weaponName, def.name);
      this.weaponBox.style.setProperty('--wc', def.color);
      if (weaponChanged) {
        this.weaponIconEl.innerHTML = weaponIcon(def.id);
        this.weaponBox.dataset.w = def.id;
        this.weaponBox.classList.remove('swapped');
        void this.weaponBox.offsetWidth;
        this.weaponBox.classList.add('swapped');
      }
      const turret = def.mag === Infinity;
      toggle(this.weaponBox, 'turret', turret);
      if (turret) {
        this.ammoPips.innerHTML = '';
        setText(this.reserve, '');
      } else {
        let html = '';
        const pipClass = def.mag > 12 ? 'pip small' : 'pip';
        for (let i = 0; i < def.mag; i++) html += `<span class="${pipClass}${i < st.inMag ? ' on' : ''}"></span>`;
        this.ammoPips.innerHTML = html;
        toggle(this.ammoPips, 'many', def.mag > 12);
        if (st.reserve === Infinity) this.reserve.innerHTML = INF;
        else setText(this.reserve, `+${st.reserve}`);
      }
      let slots = '';
      if (canSwap) for (const id of CYCLE) if (owned.includes(id)) slots += weaponIcon(id, id === def.id ? 'on' : '');
      this.slots.innerHTML = slots;
      toggle(this.weaponBox, 'can-swap', canSwap);
      toggle(this.heat, 'hidden', def.heatPerShot === undefined);
      toggle(this.reloadBtn, 'hidden', turret);
      const low = !turret && st.inMag > 0 && st.inMag <= Math.max(1, Math.ceil(def.mag * 0.25));
      toggle(this.weaponBox, 'low', low);
      const empty = !turret && st.inMag === 0;
      // Out of rounds with another gun in hand: switching beats waiting on the reload.
      if (empty && !weaponChanged && canSwap && this.coachSwap && this.emptyHints < 2 && !this.weaponBox.classList.contains('empty')) {
        this.emptyHints++;
        this.hintSwap('EMPTY? TAP TO SWITCH GUNS', 2.5);
      }
      toggle(this.weaponBox, 'empty', empty);
    }
    if (this.swapHintT > 0) this.swapHintT -= dt;
    toggle(this.weaponBox, 'swap-hint', this.swapHintT > 0 && canSwap);
    if (def.heatPerShot !== undefined) {
      setStyle(this.heatFill, 'width', `${Math.round(ws.heat * 100)}%`);
      toggle(this.heat, 'over', ws.overheated);
      toggle(this.heat, 'warm', !ws.overheated && ws.heat > 0.7);
      setText(this.heatLabel, ws.overheated ? 'OVERHEAT' : 'HEAT');
    }
    const reloading = ws.reloading > 0;
    toggle(this.reloadBtn, 'reloading', reloading);
    toggle(this.reloadBtn, 'urge', !reloading && st.inMag === 0 && def.mag !== Infinity);
    toggle(this.reloadBtn, 'low', !reloading && st.inMag > 0 && st.inMag <= Math.max(1, Math.ceil(def.mag * 0.25)));
    setStyle(this.reloadRing, '--p', reloading ? `${((1 - ws.reloading / ws.reloadTotal) * 100).toFixed(1)}%` : '0%');

    // Boss bar (after the intro slam, it fills up).
    const boss = w.boss;
    if (this.bossIntroT > 0) {
      this.bossIntroT = BOSS_INTRO - (performance.now() - this.bossIntroAt) / 1000;
      if (this.bossIntroT <= 0) toggle(this.bossIntroEl, 'show', false);
    }
    if (boss && !boss.removed) {
      if (boss !== this.lastBoss) {
        this.lastBoss = boss;
        setText(this.bossName, boss.title);
        let ticks = '';
        for (const p of boss.phases) if (p > 0 && p < 1) ticks += `<i style="left:${(p * 100).toFixed(1)}%"></i>`;
        this.bossTicks.innerHTML = ticks;
      }
      const introPlaying = this.bossIntroT > BOSS_INTRO - 1.4;
      toggle(this.bossWrap, 'hidden', introPlaying);
      toggle(this.progress, 'hidden', true);
      if (!introPlaying) this.bossFillK = Math.min(1, this.bossFillK + dt * 1.1);
      const frac = Math.max(0, boss.hp / boss.maxHp) * this.bossFillK;
      this.bossLagFrac = this.bossFillK < 1 ? frac : Math.max(frac, this.bossLagFrac - dt * 0.25);
      setStyle(this.bossFill, 'width', `${(frac * 100).toFixed(2)}%`);
      setStyle(this.bossLag, 'width', `${(this.bossLagFrac * 100).toFixed(2)}%`);
      toggle(this.bossWrap, 'enraged', boss.hp / boss.maxHp < 0.25);
    } else {
      toggle(this.bossWrap, 'hidden', true);
      toggle(this.progress, 'hidden', false);
      this.bossLagFrac = 1;
    }

    // HUD layout for the overlay (beacons avoid the panels) + fade panels with a threat behind them.
    const topBar = this.bossWrap.classList.contains('hidden') ? (this.progress.classList.contains('hidden') ? '' : 'p') : 'b';
    if (topBar !== this.lastTopBar) {
      this.lastTopBar = topBar;
      this.layoutT = 0;
      // The bar being replaced must not stay faded.
      this.veilT[4] = 0;
      this.bossWrap.classList.remove('hud-veil');
      this.progress.classList.remove('hud-veil');
    }
    this.layoutT -= dt;
    if (this.layoutT <= 0) {
      this.layoutT = LAYOUT_EVERY;
      this.measureLayout();
    }
    const veiled = this.overlay.veiled;
    for (let i = 0; i < this.avoidEls.length; i++) {
      if (veiled[i]) this.veilT[i] = VEIL_HOLD;
      else if (this.veilT[i] > 0) this.veilT[i] -= dt;
      const e = this.avoidEls[i];
      if (e) toggle(e, 'hud-veil', this.veilT[i] > 0);
    }

    const pct = `${(Math.max(0, Math.min(1, progress)) * 100).toFixed(1)}%`;
    setStyle(this.progressFill, 'width', pct);
    setStyle(this.progressDot, 'left', pct);

    if (this.bannerTimer > 0) {
      this.bannerTimer -= dt;
      if (this.bannerTimer <= 0) toggle(this.bannerEl, 'show', false);
    }
    if (this.promptTimer > 0) {
      this.promptTimer -= dt;
      const stillEmpty = st.inMag === 0 && !reloading && def.mag !== Infinity;
      if (this.promptTimer <= 0 && !stillEmpty && !ws.overheated) toggle(this.promptEl, 'show', false);
    }
    setText(this.fpsEl, `${fps} FPS`);
  }

  /** Draw the overlay canvas (call after rendering the 3D frame). */
  drawOverlay(world: World | null, dt: number) {
    this.overlay.draw(world, dt);
  }

  weaponLabel(id: WeaponId) {
    return WEAPONS[id].name;
  }
}

/** True for near-black colours (a fade to black is a cut, not a flash). */
function isDark(color: string): boolean {
  const c = color.trim().toLowerCase();
  let r = 255;
  let g = 255;
  let b = 255;
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/.exec(c);
  if (hex) {
    const h = hex[1].length === 3 ? hex[1].replace(/./g, (x) => x + x) : hex[1];
    r = parseInt(h.slice(0, 2), 16);
    g = parseInt(h.slice(2, 4), 16);
    b = parseInt(h.slice(4, 6), 16);
  } else {
    const m = /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/.exec(c);
    if (m) {
      r = +m[1];
      g = +m[2];
      b = +m[3];
    } else if (c === 'black') return true;
  }
  return Math.max(r, g, b) < 48;
}
