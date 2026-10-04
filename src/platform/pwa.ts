import iosDevices from './ios-devices.json';
import { isIOS, isNative } from './env';

/**
 * Registers the service worker emitted by the build (vite.config.ts → dist/sw.js)
 * for offline play. Production web builds only: never in dev (where it removes
 * leftovers instead, see below), never in the single-file build (file:// / artifact hosting) and never inside the native
 * app (assets are already local there and a SW would only risk stale caches).
 */
export function registerServiceWorker() {
  if (import.meta.env.DEV) {
    unregisterStaleWorkers();
    return;
  }
  if (import.meta.env.MODE === 'single') return;
  if (isNative() || !('serviceWorker' in navigator)) return;
  const secure = location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1';
  if (!secure) return;
  const go = () => navigator.serviceWorker.register('./sw.js').catch((err) => console.warn('[pwa] service worker', err));
  if (document.readyState === 'complete') go();
  else window.addEventListener('load', go, { once: true });
}

/**
 * Dev server only: a production build previously served on the same origin
 * (e.g. `vite preview` on the same port) leaves its worker behind, which would
 * keep answering /src/* requests from its cache. Remove it and its caches, and
 * reload once if it was controlling this page.
 */
function unregisterStaleWorkers() {
  const sw = navigator.serviceWorker;
  if (!sw?.getRegistrations) return;
  const controlled = !!sw.controller;
  void sw
    .getRegistrations()
    .then(async (regs) => {
      if (!regs.length) return;
      await Promise.all(regs.map((r) => r.unregister()));
      const keys = (await globalThis.caches?.keys?.()) ?? [];
      await Promise.all(keys.filter((k) => k.startsWith('overrun-')).map((k) => caches.delete(k)));
      console.info(`[pwa] dev: removed ${regs.length} stale service worker(s)`);
      if (controlled && !sessionStorage.getItem('overrun.dev.swReload')) {
        sessionStorage.setItem('overrun.dev.swReload', '1');
        location.reload();
      }
    })
    .catch(() => {});
}

/**
 * iOS home-screen polish. index.html should carry these links statically (see
 * docs/IOS.md); this only fills them in when they are missing, which works for
 * launch images on current iOS because Safari reads the live DOM when the user
 * taps "Add to Home Screen".
 */
export function ensureAppleLinks() {
  if (!isIOS() || isNative() || import.meta.env.MODE === 'single') return;
  const head = document.head;
  const touch = head.querySelector<HTMLLinkElement>('link[rel="apple-touch-icon"]');
  if (!touch) addLink('apple-touch-icon', './apple-touch-icon.png');
  else if (/icon-192\.png$/.test(touch.getAttribute('href') ?? '')) touch.href = './apple-touch-icon.png';
  if (head.querySelector('link[rel="apple-touch-startup-image"]')) return;
  for (const d of iosDevices.devices) {
    for (const o of ['landscape', 'portrait'] as const) {
      const w = (o === 'landscape' ? d.h : d.w) * d.dpr;
      const h = (o === 'landscape' ? d.w : d.h) * d.dpr;
      const l = addLink('apple-touch-startup-image', `./splash/apple-splash-${w}-${h}.png`);
      l.media = `(device-width: ${d.w}px) and (device-height: ${d.h}px) and (-webkit-device-pixel-ratio: ${d.dpr}) and (orientation: ${o})`;
    }
  }
}

function addLink(rel: string, href: string): HTMLLinkElement {
  const l = document.createElement('link');
  l.rel = rel;
  l.href = href;
  document.head.appendChild(l);
  return l;
}
