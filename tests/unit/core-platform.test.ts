import { describe, expect, it } from 'vitest';
import { canSuggestInstall, isIOS, isInAppBrowser, isNative, isStandalone, nativePlatform, type EnvGlobals } from '../../src/platform/env';

const UA = {
  iphoneSafari:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1',
  iphoneChrome:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/138.0 Mobile/15E148 Safari/604.1',
  iphoneInstagram:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 380.0.0',
  ipadOS: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15',
  macSafari: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15',
  android: 'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0 Mobile Safari/537.36',
};

function env(ua: string, o: { touch?: number; standalone?: boolean; displayMode?: string; native?: string } = {}): EnvGlobals {
  return {
    navigator: { userAgent: ua, maxTouchPoints: o.touch ?? 0, standalone: o.standalone },
    matchMedia: (q: string) => ({ matches: !!o.displayMode && q.includes(`display-mode: ${o.displayMode}`) }),
    Capacitor: o.native
      ? { isNativePlatform: () => true, getPlatform: () => o.native! }
      : { isNativePlatform: () => false, getPlatform: () => 'web' },
  };
}

describe('platform env detection', () => {
  it('recognises iPhone and iPadOS (which pretends to be a Mac)', () => {
    expect(isIOS(env(UA.iphoneSafari, { touch: 5 }))).toBe(true);
    expect(isIOS(env(UA.ipadOS, { touch: 5 }))).toBe(true);
    expect(isIOS(env(UA.macSafari, { touch: 0 }))).toBe(false);
    expect(isIOS(env(UA.android, { touch: 5 }))).toBe(false);
  });

  it('detects home-screen (standalone) mode via navigator.standalone or display-mode', () => {
    expect(isStandalone(env(UA.iphoneSafari, { standalone: true }))).toBe(true);
    expect(isStandalone(env(UA.android, { displayMode: 'fullscreen' }))).toBe(true);
    expect(isStandalone(env(UA.android, { displayMode: 'standalone' }))).toBe(true);
    expect(isStandalone(env(UA.iphoneSafari))).toBe(false);
  });

  it('detects the Capacitor native shell', () => {
    expect(isNative(env(UA.iphoneSafari, { native: 'ios' }))).toBe(true);
    expect(nativePlatform(env(UA.iphoneSafari, { native: 'ios' }))).toBe('ios');
    expect(isNative(env(UA.iphoneSafari))).toBe(false);
    expect(nativePlatform(env(UA.iphoneSafari))).toBe('web');
    expect(isNative({ navigator: { userAgent: '', maxTouchPoints: 0 } })).toBe(false);
  });

  it('suggests "Add to Home Screen" only in an iOS browser tab', () => {
    expect(canSuggestInstall(env(UA.iphoneSafari, { touch: 5 }))).toBe(true);
    expect(canSuggestInstall(env(UA.iphoneChrome, { touch: 5 }))).toBe(true);
    expect(canSuggestInstall(env(UA.ipadOS, { touch: 5 }))).toBe(true);
    expect(canSuggestInstall(env(UA.iphoneSafari, { touch: 5, standalone: true }))).toBe(false);
    expect(canSuggestInstall(env(UA.iphoneSafari, { touch: 5, native: 'ios' }))).toBe(false);
    expect(canSuggestInstall(env(UA.iphoneInstagram, { touch: 5 }))).toBe(false);
    expect(isInAppBrowser(env(UA.iphoneInstagram))).toBe(true);
    expect(canSuggestInstall(env(UA.android, { touch: 5 }))).toBe(false);
    expect(canSuggestInstall(env(UA.macSafari))).toBe(false);
  });
});
