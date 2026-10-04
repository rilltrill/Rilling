import './installHint.css';
import { canSuggestInstall } from './env';

const KEY = 'overrun.installHint.dismissed';

const SHARE_ICON =
  '<svg class="ih-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
  '<path d="M8.5 9.5H6.5a1.5 1.5 0 0 0-1.5 1.5v8.5A1.5 1.5 0 0 0 6.5 21h11a1.5 1.5 0 0 0 1.5-1.5V11a1.5 1.5 0 0 0-1.5-1.5h-2"/>' +
  '<path d="M12 2.8v12.2"/><path d="M8.2 6.6 12 2.8l3.8 3.8"/></svg>';

function dismissed(): boolean {
  try {
    return globalThis.localStorage?.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

function remember() {
  try {
    globalThis.localStorage?.setItem(KEY, '1');
  } catch {
    /* private mode — the hint just comes back next launch */
  }
}

/**
 * On iPhone Safari (not installed), shows a small dismissible pill on the title
 * screen: "tap Share → Add to Home Screen" for fullscreen, offline play.
 * Never shown in the native app, in installed mode, in automated tests or when
 * debug flags (?stage / ?autoplay) are present. `force` (?installhint=1) shows
 * it anyway, for testing.
 */
export function setupInstallHint(app: HTMLElement, opts: { force?: boolean; testMode?: boolean } = {}) {
  if (!opts.force) {
    if (opts.testMode || dismissed() || !canSuggestInstall()) return;
    if ((navigator as Navigator & { webdriver?: boolean }).webdriver) return;
  }
  const menuLayer = document.getElementById('menu-layer');
  if (!menuLayer) return;

  const hint = document.createElement('div');
  hint.id = 'install-hint';
  hint.setAttribute('role', 'note');
  hint.innerHTML =
    SHARE_ICON +
    '<span class="ih-text"><b>INSTALL</b>Tap Share, then <i>Add to Home Screen</i> for fullscreen play</span>' +
    '<button class="ih-close" type="button" aria-label="Dismiss">&times;</button>';
  app.appendChild(hint);

  let showTimer = 0;
  const setVisible = (on: boolean) => {
    clearTimeout(showTimer);
    if (on) showTimer = window.setTimeout(() => hint.classList.add('show'), 1600); // after the logo reveal
    else hint.classList.remove('show');
  };
  const update = () => setVisible(!!menuLayer.querySelector('.screen.title'));
  const observer = new MutationObserver(update);
  observer.observe(menuLayer, { childList: true, subtree: true });
  update();

  const close = hint.querySelector('button')!;
  const dismiss = (e: Event) => {
    e.preventDefault();
    e.stopPropagation();
    remember();
    observer.disconnect();
    setVisible(false);
    window.setTimeout(() => hint.remove(), 500);
  };
  close.addEventListener('pointerdown', dismiss);
  close.addEventListener('click', dismiss);
}
