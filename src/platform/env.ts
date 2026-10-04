/**
 * Where are we running? (iPhone Safari tab, installed home-screen web app,
 * Capacitor native shell, desktop…). Pure functions over injectable globals so
 * they can be unit-tested.
 */

export interface EnvGlobals {
  navigator: Pick<Navigator, 'userAgent' | 'maxTouchPoints'> & { standalone?: boolean; webdriver?: boolean };
  matchMedia?: (q: string) => { matches: boolean };
  Capacitor?: { isNativePlatform?: () => boolean; getPlatform?: () => string };
  /** True when the game runs inside another page's frame (e.g. a hosted preview). */
  embedded?: boolean;
}

function globals(): EnvGlobals {
  const g = globalThis as unknown as EnvGlobals & { matchMedia?: Window['matchMedia'] };
  return {
    navigator: g.navigator ?? { userAgent: '', maxTouchPoints: 0 },
    matchMedia: typeof g.matchMedia === 'function' ? (q) => g.matchMedia!(q) : undefined,
    Capacitor: g.Capacitor,
    embedded: (() => {
      try {
        return typeof window !== 'undefined' && window.self !== window.top;
      } catch {
        return true; // cross-origin parent
      }
    })(),
  };
}

/** Running inside the Capacitor native app (iOS or Android). */
export function isNative(env: EnvGlobals = globals()): boolean {
  try {
    return !!env.Capacitor?.isNativePlatform?.();
  } catch {
    return false;
  }
}

/** 'ios' | 'android' | 'web' as reported by Capacitor (web outside the native shell). */
export function nativePlatform(env: EnvGlobals = globals()): string {
  return isNative(env) ? env.Capacitor?.getPlatform?.() ?? 'web' : 'web';
}

/** iPhone / iPod / iPad, including iPadOS which reports itself as a Mac. */
export function isIOS(env: EnvGlobals = globals()): boolean {
  const ua = env.navigator.userAgent;
  if (/iPhone|iPod|iPad/i.test(ua)) return true;
  return /Macintosh/i.test(ua) && (env.navigator.maxTouchPoints ?? 0) > 1;
}

/** Launched from the home screen (installed web app) rather than a browser tab. */
export function isStandalone(env: EnvGlobals = globals()): boolean {
  if (env.navigator.standalone === true) return true;
  const mm = env.matchMedia;
  if (!mm) return false;
  return mm('(display-mode: standalone)').matches || mm('(display-mode: fullscreen)').matches;
}

/** In-app browsers (Instagram, Facebook, Google app…) can't add to the home screen. */
export function isInAppBrowser(env: EnvGlobals = globals()): boolean {
  return /FBAN|FBAV|Instagram|Line\/|GSA\/|Snapchat|TikTok|musical_ly|Twitter/i.test(env.navigator.userAgent);
}

/** Should we suggest "Share → Add to Home Screen"? */
export function canSuggestInstall(env: EnvGlobals = globals()): boolean {
  // Inside someone else's frame, "Add to Home Screen" would install the host page.
  if (env.embedded) return false;
  return isIOS(env) && !isStandalone(env) && !isNative(env) && !isInAppBrowser(env);
}
