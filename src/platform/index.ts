/**
 * Platform bootstrapping: iPhone (Safari tab, home-screen web app, Capacitor
 * native shell) first, Android / desktop second. Everything here is
 * best-effort and guarded — a missing API must never break the game.
 *
 *   - browser gestures: pinch / double-tap zoom, scroll bounce, edge swipes
 *   - viewport: re-sync the canvas after iOS rotation / toolbar collapse
 *   - audio: iOS unlock on touchend/click, 'interrupted' contexts, Audio Session 'ambient'
 *   - screen wake lock during play (native: AppDelegate disables the idle timer)
 *   - "Add to Home Screen" hint on iPhone Safari, iOS launch-image links
 *   - service worker registration (offline play)
 */
import { isIOS, isNative, isStandalone, nativePlatform } from './env';
import { setupInstallHint } from './installHint';
import { ensureAppleLinks, registerServiceWorker } from './pwa';

/** The bits of `Game` this module touches (read lazily from window.__game). */
interface GameLike {
  state: string;
  audio: { ctx: AudioContext | null; unlock(): void };
}

const game = (): GameLike | undefined => (window as unknown as { __game?: GameLike }).__game;

export interface PlatformOptions {
  /** Debug/test session (?stage, ?autoplay): no install hint. */
  testMode?: boolean;
  /** ?installhint=1 — show the install hint regardless (testing / screenshots). */
  forceInstallHint?: boolean;
}

export function initPlatform(app: HTMLElement, opts: PlatformOptions = {}) {
  const run = (name: string, fn: () => void) => {
    try {
      fn();
    } catch (err) {
      console.warn(`[platform] ${name} failed`, err);
    }
  };
  run('env', () => {
    const root = document.documentElement;
    root.classList.toggle('is-ios', isIOS());
    root.classList.toggle('is-standalone', isStandalone());
    root.classList.toggle('is-native', isNative());
    if (isNative()) root.classList.add(`native-${nativePlatform()}`);
  });
  run('gestures', blockBrowserGestures);
  run('viewport', keepViewportInSync);
  run('audio', setupAudio);
  run('wakelock', setupWakeLock);
  run('native', setupNativeChrome);
  run('apple-links', ensureAppleLinks);
  run('install-hint', () => setupInstallHint(app, { testMode: opts.testMode, force: opts.forceInstallHint }));
  run('service-worker', registerServiceWorker);
}

// ─── Gestures ────────────────────────────────────────────────────────────────

function isFormControl(t: EventTarget | null): boolean {
  return t instanceof Element && !!t.closest('input, select, textarea');
}

/** True when a touchmove on `t` should keep its native behaviour (menu list scroll, slider drag). */
function scrollsNatively(t: EventTarget | null): boolean {
  if (!(t instanceof Element) || t.closest('#play-surface')) return false;
  if (t.closest('input[type="range"]')) return true;
  for (let el: Element | null = t; el && el !== document.body; el = el.parentElement) {
    if (el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1) {
      const s = getComputedStyle(el);
      if (/(auto|scroll)/.test(s.overflowY + s.overflowX)) return true;
    }
  }
  return false;
}

function blockBrowserGestures() {
  const active = { passive: false } as const;
  // Pinch zoom (Safari's proprietary gesture events).
  for (const type of ['gesturestart', 'gesturechange', 'gestureend']) {
    document.addEventListener(type, (e) => e.preventDefault(), active);
  }
  // Rubber-band scrolling / pull-to-refresh, except for scrollable menus and sliders.
  document.addEventListener(
    'touchmove',
    (e) => {
      if (e.touches.length > 1 || !scrollsNatively(e.target)) e.preventDefault();
    },
    active,
  );
  // Safari's edge swipe = history back/forward; two-finger touches = zoom.
  document.addEventListener(
    'touchstart',
    (e) => {
      if (isFormControl(e.target)) return;
      if (e.touches.length > 1) {
        e.preventDefault();
        return;
      }
      const x = e.touches[0]?.clientX ?? 100;
      if (x < 24 || x > window.innerWidth - 24) e.preventDefault();
    },
    active,
  );
  document.addEventListener('dblclick', (e) => e.preventDefault(), active);
  document.addEventListener('contextmenu', (e) => e.preventDefault());
  document.addEventListener('selectstart', (e) => {
    if (!isFormControl(e.target)) e.preventDefault();
  });
}

// ─── Viewport ────────────────────────────────────────────────────────────────

/**
 * iOS reports the new innerWidth/innerHeight some time *after* rotation and
 * Safari's toolbar collapse, so the engine's own resize handler can read stale
 * values. After any viewport change, re-check for a while and nudge the engine
 * (which listens to window 'resize') if the canvas no longer matches.
 */
function keepViewportInSync() {
  let timers: number[] = [];
  const check = () => {
    if (window.scrollX || window.scrollY) window.scrollTo(0, 0);
    const c = document.getElementById('game-canvas');
    if (!c) return;
    const w = window.innerWidth;
    const h = window.innerHeight;
    if (Math.abs(c.clientWidth - w) > 1 || Math.abs(c.clientHeight - h) > 1) {
      window.dispatchEvent(new Event('resize'));
    }
  };
  const burst = () => {
    for (const t of timers) clearTimeout(t);
    timers = [60, 250, 600, 1200].map((ms) => window.setTimeout(check, ms));
  };
  window.addEventListener('orientationchange', burst);
  screen.orientation?.addEventListener?.('change', burst);
  window.visualViewport?.addEventListener('resize', burst);
  window.addEventListener('pageshow', burst);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) burst();
  });
}

// ─── Audio ───────────────────────────────────────────────────────────────────

function setupAudio() {
  // Audio Session API (Safari 17+): 'ambient' respects the ring/silent switch
  // and mixes with whatever music the player already has playing.
  const session = (navigator as Navigator & { audioSession?: { type: string } }).audioSession;
  if (session && 'type' in session) {
    try {
      session.type = 'ambient';
    } catch {
      /* read-only in some versions */
    }
  }
  // The game unlocks audio on pointerdown. iOS only lets an AudioContext start
  // or resume inside touchend/click, and WebKit leaves contexts 'interrupted'
  // after phone calls, Siri or backgrounding — so retry at the end of every
  // gesture until the context is running. Cheap when it already is.
  const kick = () => {
    const audio = game()?.audio;
    if (!audio) return;
    if (audio.ctx?.state === 'running') return;
    audio.unlock();
    const ctx = audio.ctx;
    if (!ctx || ctx.state === 'running' || ctx.state === 'closed') return;
    void ctx.resume().catch(() => {});
    // Older iOS only truly unlocks once a sound starts inside the gesture: play one silent sample.
    try {
      const src = ctx.createBufferSource();
      src.buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
      src.connect(ctx.destination);
      src.start(0);
      src.onended = () => src.disconnect();
    } catch {
      /* ignore */
    }
  };
  for (const type of ['touchend', 'click', 'pointerup', 'keydown']) {
    window.addEventListener(type, kick, { capture: true, passive: true });
  }
}

// ─── Screen wake lock ────────────────────────────────────────────────────────

interface Sentinel {
  release(): Promise<void>;
  addEventListener(type: 'release', fn: () => void): void;
}

/** Keeps the screen on while a stage is running (players don't touch the screen during cut-scenes / banners). */
function setupWakeLock() {
  if (isNative()) return; // native: AppDelegate sets isIdleTimerDisabled
  const wl = (navigator as Navigator & { wakeLock?: { request(type: 'screen'): Promise<Sentinel> } }).wakeLock;
  if (!wl?.request) return;
  const AWAKE = new Set(['intro', 'playing', 'continue', 'results']);
  let sentinel: Sentinel | null = null;
  let pending = false;
  const sync = async () => {
    const want = !document.hidden && AWAKE.has(game()?.state ?? 'menu');
    if (want && !sentinel && !pending) {
      pending = true;
      try {
        const s = await wl.request('screen');
        sentinel = s;
        s.addEventListener('release', () => {
          if (sentinel === s) sentinel = null;
        });
      } catch {
        /* not allowed right now (no gesture yet, low battery…) — retried on the next sync */
      } finally {
        pending = false;
      }
    } else if (!want && sentinel) {
      const s = sentinel;
      sentinel = null;
      void s.release().catch(() => {});
    }
  };
  window.setInterval(() => void sync(), 2000);
  document.addEventListener('visibilitychange', () => void sync());
  window.addEventListener('pointerup', () => void sync(), { passive: true });
}

// ─── Native shell ────────────────────────────────────────────────────────────

function setupNativeChrome() {
  if (!isNative()) return;
  // iOS hides the status bar natively (Info.plist + MainViewController); this
  // covers Android, where the StatusBar plugin is the simplest switch.
  const plugins = (globalThis as unknown as { Capacitor?: { Plugins?: Record<string, { hide?: () => Promise<void> }> } })
    .Capacitor?.Plugins;
  void plugins?.StatusBar?.hide?.()?.catch(() => {});
}
