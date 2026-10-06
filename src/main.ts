import '@fontsource/press-start-2p/latin-400.css';
import '@fontsource/black-ops-one/latin-400.css';
import '@fontsource/rajdhani/latin-600.css';
import '@fontsource/rajdhani/latin-700.css';
import './styles.css';
import { Game, type DebugFlags } from './gameplay/Game';
import type { ArtStyle, RetroMode } from './core/types';
import { isArtStyle } from './core/art';
import { CAMPAIGNS } from './content';
import { initPlatform } from './platform';
import { pwStoreEnable } from './content/pixelworld/store';

function parseFlags(q: URLSearchParams): DebugFlags {
  const num = (k: string) => (q.has(k) ? Number(q.get(k)) : undefined);
  const bool = (k: string) => q.has(k) && q.get(k) !== '0';
  // Debug deep links render clean (no arcade-monitor pass) unless &retro=crt|pixel asks for it.
  const r = q.get('retro');
  const retro: RetroMode | undefined =
    r === 'crt' || r === 'pixel' || r === 'off' ? r : q.has('stage') || bool('autoplay') ? 'off' : undefined;
  const a = q.get('art');
  const art: ArtStyle | undefined = isArtStyle(a) ? a : undefined;
  return {
    retro,
    art,
    stage: q.get('stage') ?? undefined,
    beat: num('beat'),
    autoplay: bool('autoplay'),
    god: bool('god'),
    speed: num('speed'),
    seed: num('seed'),
    debug: bool('debug'),
    mute: bool('mute'),
  };
}

function webglAvailable(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

function showError(msg: string) {
  const e = document.getElementById('boot-error')!;
  e.hidden = false;
  e.textContent = msg;
}

function main() {
  const app = document.getElementById('app')!;
  const query = new URLSearchParams(location.search);
  const flags = parseFlags(query);
  // Dev / bench: `&pwstore=<tag>` persists painted PixelWorld atlases under that version (off on the dev server by default).
  const store = query.get('pwstore');
  if (store) pwStoreEnable(store === '0' ? '' : `dev-${store}`);

  // Landscape hint (dismissible).
  document.getElementById('rotate-dismiss')?.addEventListener('pointerdown', (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    document.body.classList.add('portrait-ok');
  });

  // iOS / PWA / native polish: gestures, viewport, audio unlock, wake lock,
  // install hint, service worker (src/platform).
  initPlatform(app, {
    testMode: !!(flags.stage || flags.autoplay),
    forceInstallHint: query.get('installhint') === '1',
  });

  if (!webglAvailable()) {
    showError('Your browser does not support WebGL, which OVERRUN needs to run.');
    return;
  }
  try {
    const game = new Game(app, CAMPAIGNS, flags);
    (window as unknown as { __game: Game }).__game = game;
    game.boot();
  } catch (err) {
    console.error(err);
    showError(`Failed to start: ${(err as Error).message}`);
  }
}

main();
