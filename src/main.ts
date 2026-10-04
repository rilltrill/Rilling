import '@fontsource/black-ops-one/latin-400.css';
import '@fontsource/rajdhani/latin-600.css';
import '@fontsource/rajdhani/latin-700.css';
import './styles.css';
import { Game, type DebugFlags } from './gameplay/Game';
import { CAMPAIGNS } from './content';

function parseFlags(): DebugFlags {
  const q = new URLSearchParams(location.search);
  const num = (k: string) => (q.has(k) ? Number(q.get(k)) : undefined);
  const bool = (k: string) => q.has(k) && q.get(k) !== '0';
  return {
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
  // Landscape hint (dismissible).
  document.getElementById('rotate-dismiss')?.addEventListener('pointerdown', (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    document.body.classList.add('portrait-ok');
  });
  // Block pinch-zoom / scroll bounce on iOS.
  document.addEventListener('gesturestart', (e) => e.preventDefault());
  document.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });

  if (!webglAvailable()) {
    showError('Your browser does not support WebGL, which OVERRUN needs to run.');
    return;
  }
  try {
    const game = new Game(app, CAMPAIGNS, parseFlags());
    (window as unknown as { __game: Game }).__game = game;
    game.boot();
  } catch (err) {
    console.error(err);
    showError(`Failed to start: ${(err as Error).message}`);
  }

  if (import.meta.env.PROD && 'serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
}

main();
