import type { HitMarkerKind, HudApi, PopupStyle, World } from '../gameplay/World';
import { WEAPONS } from '../gameplay/Weapons';
import type { WeaponId } from '../core/types';
import { Overlay2D } from './Overlay2D';
import { el, onTap, setStyle, setText, toggle } from './dom';

export interface HudCallbacks {
  pause(): void;
  reload(): void;
  bomb(): void;
  cycleWeapon(): void;
}

/**
 * In-game heads-up display (DOM) + the 2D overlay canvas.
 * Gameplay talks to it through the HudApi interface; `sync()` mirrors world
 * state into the DOM once per frame, touching only what changed.
 */
export class Hud implements HudApi {
  readonly root: HTMLDivElement;
  readonly overlay: Overlay2D;
  private score: HTMLDivElement;
  private mult: HTMLDivElement;
  private comboBar: HTMLDivElement;
  private hearts: HTMLDivElement;
  private bombBtn: HTMLButtonElement;
  private bombCount: HTMLSpanElement;
  private weaponBox: HTMLDivElement;
  private weaponName: HTMLDivElement;
  private ammoPips: HTMLDivElement;
  private reserve: HTMLDivElement;
  private heat: HTMLDivElement;
  private heatFill: HTMLDivElement;
  private reloadBtn: HTMLButtonElement;
  private reloadRing: HTMLDivElement;
  private bossWrap: HTMLDivElement;
  private bossName: HTMLDivElement;
  private bossFill: HTMLDivElement;
  private bossLag: HTMLDivElement;
  private bannerEl: HTMLDivElement;
  private bannerText: HTMLDivElement;
  private bannerSub: HTMLDivElement;
  private promptEl: HTMLDivElement;
  private popups: HTMLDivElement;
  private vignette: HTMLDivElement;
  private flashEl: HTMLDivElement;
  private splats: HTMLDivElement;
  private fpsEl: HTMLDivElement;
  private debugEl: HTMLDivElement;
  private progress: HTMLDivElement;
  private bannerTimer = 0;
  private promptTimer = 0;
  private lastHp = -1;
  private lastMaxHp = -1;
  private lastAmmoKey = '';
  private bossLagFrac = 1;
  private shownScore = 0;
  private popupPool: HTMLDivElement[] = [];

  constructor(parent: HTMLElement, private cb: HudCallbacks) {
    this.overlay = new Overlay2D(parent);
    const r = (this.root = el('div', 'hud hidden', parent));
    r.id = 'hud';

    this.vignette = el('div', 'hud-vignette', r);
    this.flashEl = el('div', 'hud-flash', r);
    this.splats = el('div', 'hud-splats', r);

    const tl = el('div', 'hud-tl', r);
    this.score = el('div', 'hud-score', tl, '0');
    const combo = el('div', 'hud-combo', tl);
    this.mult = el('div', 'hud-mult', combo, 'x1');
    const cbw = el('div', 'hud-combo-bar', combo);
    this.comboBar = el('div', 'hud-combo-fill', cbw);

    const tr = el('div', 'hud-tr', r);
    const pause = el('button', 'hud-btn hud-pause', tr, '<span></span><span></span>');
    pause.setAttribute('aria-label', 'Pause');
    onTap(pause, () => this.cb.pause());

    this.progress = el('div', 'hud-progress', r);
    el('div', 'hud-progress-fill', this.progress);

    this.bossWrap = el('div', 'hud-boss hidden', r);
    this.bossName = el('div', 'hud-boss-name', this.bossWrap);
    const bb = el('div', 'hud-boss-bar', this.bossWrap);
    this.bossLag = el('div', 'hud-boss-lag', bb);
    this.bossFill = el('div', 'hud-boss-fill', bb);

    const bl = el('div', 'hud-bl', r);
    this.hearts = el('div', 'hud-hearts', bl);
    this.bombBtn = el('button', 'hud-btn hud-bomb', bl, '<span class="hud-bomb-icon"></span>');
    this.bombBtn.setAttribute('aria-label', 'Bomb');
    this.bombCount = el('span', 'hud-bomb-count', this.bombBtn, '1');
    onTap(this.bombBtn, () => this.cb.bomb());

    const br = el('div', 'hud-br', r);
    this.weaponBox = el('div', 'hud-weapon', br);
    this.weaponName = el('div', 'hud-weapon-name', this.weaponBox, 'PISTOL');
    this.ammoPips = el('div', 'hud-ammo', this.weaponBox);
    this.reserve = el('div', 'hud-reserve', this.weaponBox);
    this.heat = el('div', 'hud-heat hidden', this.weaponBox);
    this.heatFill = el('div', 'hud-heat-fill', this.heat);
    onTap(this.weaponBox, () => this.cb.cycleWeapon());
    this.reloadBtn = el('button', 'hud-btn hud-reload', br, '<span>RELOAD</span>');
    this.reloadRing = el('div', 'hud-reload-ring', this.reloadBtn);
    onTap(this.reloadBtn, () => this.cb.reload());

    this.bannerEl = el('div', 'hud-banner', r);
    this.bannerText = el('div', 'hud-banner-text', this.bannerEl);
    this.bannerSub = el('div', 'hud-banner-sub', this.bannerEl);
    this.promptEl = el('div', 'hud-prompt', r);
    this.popups = el('div', 'hud-popups', r);
    this.fpsEl = el('div', 'hud-fps hidden', r);
    this.debugEl = el('div', 'hud-debug hidden', r);
  }

  show(on: boolean) {
    toggle(this.root, 'hidden', !on);
    this.overlay.canvas.style.display = on ? 'block' : 'none';
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
    this.lastAmmoKey = '';
    this.shownScore = 0;
    this.bossLagFrac = 1;
    this.bannerTimer = 0;
    this.promptTimer = 0;
    toggle(this.bannerEl, 'show', false);
    toggle(this.promptEl, 'show', false);
    toggle(this.bossWrap, 'hidden', true);
    this.popups.innerHTML = '';
    this.splats.innerHTML = '';
    this.popupPool = [];
    this.overlay.clear();
    setStyle(this.vignette, 'opacity', '0');
  }

  // ─── HudApi ───────────────────────────────────────────────────────────────

  popup(text: string, x: number, y: number, style: PopupStyle) {
    const p = this.popupPool.pop() ?? el('div', '');
    p.className = `hud-popup pop-${style}`;
    p.textContent = text;
    const margin = 60;
    p.style.left = `${Math.max(margin, Math.min(window.innerWidth - margin, x))}px`;
    p.style.top = `${Math.max(40, Math.min(window.innerHeight - 40, y))}px`;
    this.popups.appendChild(p);
    const done = () => {
      p.remove();
      if (this.popupPool.length < 30) this.popupPool.push(p);
    };
    p.addEventListener('animationend', done, { once: true });
    setTimeout(() => p.isConnected && done(), 2000);
  }

  banner(text: string, sub = '', duration = 2.5) {
    setText(this.bannerText, text);
    setText(this.bannerSub, sub);
    this.bannerEl.classList.remove('show');
    void this.bannerEl.offsetWidth;
    this.bannerEl.classList.add('show');
    this.bannerTimer = duration;
  }

  damage() {
    this.flash('rgba(255,0,0,0.45)', 0.35);
    this.root.classList.remove('shake');
    void this.root.offsetWidth;
    this.root.classList.add('shake');
  }

  splat(color: number) {
    const s = el('div', 'hud-splat', this.splats);
    const hex = `#${color.toString(16).padStart(6, '0')}`;
    s.style.setProperty('--c', hex);
    s.style.left = `${20 + Math.random() * 60}%`;
    s.style.top = `${20 + Math.random() * 50}%`;
    s.style.setProperty('--r', `${Math.random() * 360}deg`);
    setTimeout(() => s.remove(), 2600);
  }

  flash(color = 'rgba(255,255,255,0.8)', duration = 0.25) {
    this.flashEl.style.background = color;
    this.flashEl.style.transition = 'none';
    this.flashEl.style.opacity = '1';
    void this.flashEl.offsetWidth;
    this.flashEl.style.transition = `opacity ${duration}s ease-out`;
    this.flashEl.style.opacity = '0';
  }

  hitMarker(x: number, y: number, kind: HitMarkerKind) {
    this.overlay.hitMarker(x, y, kind);
  }

  shotFired(x: number, y: number) {
    this.overlay.shot(x, y);
  }

  prompt(text: string | null) {
    if (text === null) {
      this.promptTimer = 0;
      toggle(this.promptEl, 'show', false);
      return;
    }
    setText(this.promptEl, text);
    toggle(this.promptEl, 'show', true);
    this.promptTimer = 1.6;
  }

  // ─── Per-frame sync ───────────────────────────────────────────────────────

  sync(world: World, dt: number, progress: number, fps: number) {
    const w = world;
    // Score rolls up toward the real value.
    const target = w.score.score;
    if (this.shownScore !== target) {
      const diff = target - this.shownScore;
      this.shownScore += Math.sign(diff) * Math.max(1, Math.ceil(Math.abs(diff) * Math.min(1, dt * 12)));
      if (Math.abs(target - this.shownScore) < 1) this.shownScore = target;
      setText(this.score, this.shownScore.toLocaleString('en-US'));
    }
    const mult = w.score.multiplier;
    setText(this.mult, `x${mult % 1 === 0 ? mult.toFixed(0) : mult.toFixed(1)}`);
    toggle(this.mult, 'hot', mult >= 2);
    setStyle(this.comboBar, 'width', `${mult >= 4 ? 100 : ((w.score.combo % 5) / 5) * 100}%`);

    if (w.player.hp !== this.lastHp || w.player.maxHp !== this.lastMaxHp) {
      this.lastHp = w.player.hp;
      this.lastMaxHp = w.player.maxHp;
      let html = '';
      for (let i = 0; i < w.player.maxHp; i++) html += `<span class="heart ${i < w.player.hp ? 'full' : 'empty'}"></span>`;
      this.hearts.innerHTML = html;
      toggle(this.root, 'low-hp', w.player.hp === 1);
    }
    setText(this.bombCount, String(w.player.bombs));
    toggle(this.bombBtn, 'disabled', w.player.bombs <= 0);

    const ws = w.weapons;
    const def = ws.def;
    const st = ws.state;
    const ammoKey = `${def.id}|${st.inMag}|${st.reserve}|${ws.override ?? ''}|${ws.owned.length}`;
    if (ammoKey !== this.lastAmmoKey) {
      this.lastAmmoKey = ammoKey;
      setText(this.weaponName, def.name + (ws.override ? '' : ws.owned.length > 1 ? ' ⇄' : ''));
      this.weaponName.style.color = def.color;
      if (def.mag === Infinity) {
        this.ammoPips.innerHTML = '';
        setText(this.reserve, '');
      } else {
        let html = '';
        const pipClass = def.mag > 12 ? 'pip small' : 'pip';
        for (let i = 0; i < def.mag; i++) html += `<span class="${pipClass} ${i < st.inMag ? 'on' : ''}"></span>`;
        this.ammoPips.innerHTML = html;
        setText(this.reserve, st.reserve === Infinity ? '∞' : String(st.reserve));
      }
      toggle(this.heat, 'hidden', def.heatPerShot === undefined);
      toggle(this.reloadBtn, 'hidden', def.mag === Infinity);
      toggle(this.ammoPips, 'empty', st.inMag === 0);
    }
    if (def.heatPerShot !== undefined) {
      setStyle(this.heatFill, 'width', `${Math.round(ws.heat * 100)}%`);
      toggle(this.heat, 'over', ws.overheated);
    }
    const reloading = ws.reloading > 0;
    toggle(this.reloadBtn, 'reloading', reloading);
    toggle(this.reloadBtn, 'urge', !reloading && st.inMag === 0 && def.mag !== Infinity);
    setStyle(this.reloadRing, '--p', reloading ? `${(1 - ws.reloading / ws.reloadTotal) * 100}%` : '0%');

    // Boss bar.
    const boss = w.boss;
    if (boss && !boss.removed) {
      toggle(this.bossWrap, 'hidden', false);
      setText(this.bossName, boss.title);
      const frac = Math.max(0, boss.hp / boss.maxHp);
      this.bossLagFrac = Math.max(frac, this.bossLagFrac - dt * 0.25);
      setStyle(this.bossFill, 'width', `${frac * 100}%`);
      setStyle(this.bossLag, 'width', `${this.bossLagFrac * 100}%`);
    } else {
      toggle(this.bossWrap, 'hidden', true);
      this.bossLagFrac = 1;
    }

    setStyle(this.progress.firstElementChild as HTMLElement, 'width', `${Math.round(progress * 100)}%`);

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
