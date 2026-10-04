/**
 * Procedural vector art for the menus and HUD (inline SVG strings, no asset files):
 * campaign-card scenes, tutorial illustrations and weapon silhouettes.
 */
import type { WeaponId } from '../core/types';

/** Deterministic pseudo-random sequence for layout. */
function seq(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const f = (n: number) => Math.round(n * 10) / 10;

/** Shambling zombie silhouette (≈ 34 × 60 at scale 1, feet at 0,0, facing right). */
export function zombiePath(x: number, y: number, s: number, flip = false, lean = 8): string {
  const sx = flip ? -s : s;
  return `<g transform="translate(${f(x)} ${f(y)}) scale(${f(sx * 100) / 100} ${f(s * 100) / 100}) rotate(${lean})">
    <circle cx="3" cy="-51" r="6.2"/>
    <path d="M-5,-45 L8,-45 L10,-24 L-6,-24 Z"/>
    <path d="M5,-43 L26,-38 L27,-34 L5,-37 Z"/>
    <path d="M2,-40 L24,-31 L24,-27 L1,-34 Z"/>
    <path d="M-6,-25 L1,-25 L-1,0 L-7,0 Z"/>
    <path d="M2,-25 L9,-25 L13,-1 L7,0 Z"/>
  </g>`;
}

/** Raptor silhouette, side view, jaws open, facing right (≈ 100 × 58, feet at y = 0). */
export function raptorPath(x: number, y: number, s: number, flip = false): string {
  const sx = flip ? -s : s;
  return `<g transform="translate(${f(x)} ${f(y)}) scale(${f(sx * 100) / 100} ${f(s * 100) / 100})">
    <path d="M-50,-30 Q-25,-36 -8,-33 Q4,-40 18,-38 Q26,-44 30,-52 L40,-55 L50,-50 L41,-47 L49,-41 L38,-43 Q32,-36 26,-30
      Q20,-24 14,-22 L16,-14 L10,-6 L15,0 L6,0 L5,-5 L8,-13 L3,-20 Q-10,-22 -50,-30 Z"/>
    <path d="M18,-28 L24,-21 L22,-20 L16,-26 Z"/>
    <path d="M-2,-22 L0,-12 L-4,0 L-11,0 L-8,-4 L-6,-13 L-9,-22 Z"/>
  </g>`;
}

function palmPath(x: number, y: number, h: number, lean: number): string {
  const tx = x + lean;
  const ty = y - h;
  let fronds = '';
  for (let i = 0; i < 7; i++) {
    const a = -160 + i * 30 + (i % 2 ? 6 : -4);
    fronds += `<path transform="translate(${f(tx)} ${f(ty)}) rotate(${a})" d="M0,0 Q18,-9 38,5 Q20,-2 0,3 Z"/>`;
  }
  return `<path d="M${f(x - 3)},${f(y)} Q${f(x + lean * 0.2)},${f(y - h * 0.5)} ${f(tx - 1.5)},${f(ty)} L${f(tx + 1.5)},${f(ty)} Q${f(x + lean * 0.2 + 4)},${f(y - h * 0.5)} ${f(x + 3)},${f(y)} Z"/>${fronds}`;
}

/** DEAD ZONE card: burning city skyline at night, moon, zombie horde in the street. */
export function cityCardArt(): string {
  const r = seq(11);
  let back = '';
  for (let x = -10; x < 410; ) {
    const w = 18 + r() * 26;
    const h = 60 + r() * 70;
    back += `<rect x="${f(x)}" y="${f(200 - h)}" width="${f(w)}" height="${f(h + 40)}"/>`;
    x += w + 2;
  }
  let front = '';
  let windows = '';
  for (let x = -6; x < 410; ) {
    const w = 26 + r() * 34;
    const h = 40 + r() * 90;
    const top = 214 - h;
    // jagged, broken roofs
    const j1 = r() * 14;
    const j2 = r() * 14;
    front += `<path d="M${f(x)},240 L${f(x)},${f(top + j1)} L${f(x + w * 0.3)},${f(top)} L${f(x + w * 0.55)},${f(top + j2)} L${f(x + w * 0.7)},${f(top + 3)} L${f(x + w)},${f(top + j1 * 0.5)} L${f(x + w)},240 Z"/>`;
    if (r() < 0.35) front += `<rect x="${f(x + w * 0.4)}" y="${f(top - 16)}" width="2" height="18"/>`;
    for (let wy = top + 14; wy < 196; wy += 12) {
      for (let wx = x + 5; wx < x + w - 6; wx += 9) {
        if (r() < 0.16) windows += `<rect x="${f(wx)}" y="${f(wy)}" width="4" height="6" opacity="${f(0.45 + r() * 0.55)}"/>`;
      }
    }
    x += w + 3 + r() * 8;
  }
  let zeds = '';
  const zs: [number, number, number, boolean][] = [
    [40, 238, 1.15, false],
    [92, 236, 0.95, false],
    [150, 240, 1.3, true],
    [236, 237, 1.05, false],
    [300, 239, 1.25, true],
    [352, 236, 0.9, false],
    [196, 232, 0.7, false],
    [270, 231, 0.68, true],
  ];
  for (const [x, y, s, fl] of zs) zeds += zombiePath(x, y, s, fl, fl ? -6 : 8);
  return `<svg class="card-svg" viewBox="0 0 400 240" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
    <defs>
      <linearGradient id="cz-sky" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#05070f"/><stop offset="0.55" stop-color="#1b0c1a"/><stop offset="0.85" stop-color="#6a1612"/><stop offset="1" stop-color="#c2361a"/>
      </linearGradient>
      <radialGradient id="cz-moon"><stop offset="0" stop-color="#f4f0dc"/><stop offset="0.35" stop-color="#d8d4c0" stop-opacity="0.5"/><stop offset="1" stop-color="#8090c0" stop-opacity="0"/></radialGradient>
      <radialGradient id="cz-fire" cx="0.5" cy="1" r="0.8"><stop offset="0" stop-color="#ff7a20" stop-opacity="0.75"/><stop offset="1" stop-color="#ff3a10" stop-opacity="0"/></radialGradient>
      <linearGradient id="cz-fog" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#a01810" stop-opacity="0"/><stop offset="1" stop-color="#c02010" stop-opacity="0.6"/></linearGradient>
      <radialGradient id="cz-street" cx="0.5" cy="1" r="0.75"><stop offset="0" stop-color="#ff7a30" stop-opacity="0.85"/><stop offset="0.5" stop-color="#c8281a" stop-opacity="0.5"/><stop offset="1" stop-color="#600" stop-opacity="0"/></radialGradient>
    </defs>
    <rect width="400" height="240" fill="url(#cz-sky)"/>
    <circle cx="318" cy="58" r="60" fill="url(#cz-moon)"/>
    <circle cx="318" cy="58" r="17" fill="#ece8d4"/>
    <ellipse cx="120" cy="230" rx="140" ry="90" fill="url(#cz-fire)"/>
    <g class="art-smoke" fill="#1a1216" opacity="0.8"><ellipse cx="110" cy="90" rx="30" ry="18"/><ellipse cx="128" cy="62" rx="38" ry="20"/><ellipse cx="160" cy="36" rx="46" ry="20"/></g>
    <g fill="#1d0f17">${back}</g>
    <g fill="#08050a">${front}</g>
    <g fill="#ffb35c">${windows}</g>
    <rect y="170" width="400" height="70" fill="url(#cz-fog)"/>
    <ellipse cx="200" cy="236" rx="230" ry="46" fill="url(#cz-street)"/>
    <g fill="#030203">${zeds}</g>
  </svg>`;
}

/** PRIMAL ISLAND card: dusk sky, smoking volcano, palms, pterosaurs and a raptor on a rock. */
export function jungleCardArt(): string {
  let palms = '';
  palms += palmPath(24, 240, 150, 22);
  palms += palmPath(70, 240, 112, -14);
  palms += palmPath(372, 240, 160, -26);
  palms += palmPath(330, 240, 96, 10);
  return `<svg class="card-svg" viewBox="0 0 400 240" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
    <defs>
      <linearGradient id="cd-sky" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#1e1236"/><stop offset="0.45" stop-color="#7a2e3c"/><stop offset="0.75" stop-color="#e2683a"/><stop offset="1" stop-color="#ffb867"/>
      </linearGradient>
      <radialGradient id="cd-sun"><stop offset="0" stop-color="#fff0c0"/><stop offset="0.3" stop-color="#ffc070" stop-opacity="0.7"/><stop offset="1" stop-color="#ff8040" stop-opacity="0"/></radialGradient>
      <radialGradient id="cd-lava" cx="0.5" cy="0.2" r="0.6"><stop offset="0" stop-color="#ff7a20" stop-opacity="0.9"/><stop offset="1" stop-color="#ff3a10" stop-opacity="0"/></radialGradient>
    </defs>
    <rect width="400" height="240" fill="url(#cd-sky)"/>
    <circle cx="150" cy="168" r="90" fill="url(#cd-sun)"/>
    <circle cx="150" cy="168" r="24" fill="#ffe6a8"/>
    <g class="art-smoke" fill="#2a1a24" opacity="0.85"><ellipse cx="286" cy="44" rx="26" ry="16"/><ellipse cx="306" cy="24" rx="34" ry="16"/><ellipse cx="338" cy="8" rx="44" ry="16"/></g>
    <ellipse cx="282" cy="74" rx="40" ry="26" fill="url(#cd-lava)"/>
    <path d="M190,200 L262,78 L270,72 L290,74 L298,80 L380,200 Z" fill="#2a1424"/>
    <g stroke="#ff5a14" stroke-width="2.4" fill="none" stroke-linecap="round" class="art-lava">
      <path d="M272,80 L262,108 L266,120"/><path d="M284,80 L290,112 L286,130"/><path d="M278,79 L276,96"/>
    </g>
    <path d="M-10,240 L-10,196 Q60,176 130,192 Q200,206 260,188 Q330,170 410,190 L410,240 Z" fill="#1a0c12"/>
    <g fill="#1a0c10"><path d="M200,46 l8,-4 l8,4 l-8,-1 z"/><path d="M226,30 l6,-3 l6,3 l-6,-1 z"/><path d="M180,60 l5,-2.5 l5,2.5 l-5,-1 z"/></g>
    <g fill="#0a0507">${palms}</g>
    <path d="M196,240 L206,212 Q236,198 266,206 L290,240 Z" fill="#0a0507"/>
    <g fill="#060304">${raptorPath(238, 209, 0.95, false)}</g>
    <circle cx="275" cy="160" r="1.4" fill="#ffd040" class="art-eyes"/>
  </svg>`;
}

// ─── Tutorial illustrations (viewBox 0 0 120 90) ─────────────────────────────

// Outer <g> carries the position; the inner one is free for CSS animation
// (a CSS transform would otherwise replace the SVG transform attribute).
const finger = (x: number, y: number) =>
  `<g transform="translate(${x} ${y})"><g class="tut-finger"><path d="M-6,4 L-6,-14 Q0,-20 6,-14 L6,4 Q14,8 12,22 L-12,22 Q-14,10 -6,4 Z" fill="#f2d2b0" stroke="#000" stroke-width="1.5"/></g></g>`;

export const TUTORIAL_ART = {
  tap: `<svg viewBox="0 0 120 90" aria-hidden="true">
    <g fill="#55604a" stroke="#000" stroke-width="1">${zombiePath(56, 86, 1.25, false, 4)}</g>
    <g class="tut-reticle" stroke="#fff" stroke-width="2.2" fill="none"><circle cx="62" cy="21" r="9"/><path d="M62,6 v7 M62,29 v7 M47,21 h7 M70,21 h7"/></g>
    <circle cx="62" cy="21" r="14" fill="none" stroke="#ffd84a" stroke-width="2" class="tut-ripple"/>
    ${finger(84, 50)}
  </svg>`,
  ring: `<svg viewBox="0 0 120 90" aria-hidden="true">
    <g fill="#55604a" stroke="#000" stroke-width="1">${zombiePath(56, 88, 1.3, false, 2)}</g>
    <circle cx="60" cy="40" r="30" fill="rgba(255,40,40,0.12)" stroke="#ff3b3b" stroke-width="3.5" class="tut-ring"/>
    <circle cx="60" cy="40" r="14" fill="none" stroke="#ff9a3b" stroke-width="2" stroke-dasharray="5 6" class="tut-spin"/>
    <text x="100" y="22" font-family="Black Ops One, Impact, sans-serif" font-size="22" fill="#ff3b3b">!</text>
  </svg>`,
  reload: `<svg viewBox="0 0 120 90" aria-hidden="true">
    <circle cx="36" cy="46" r="24" fill="rgba(10,12,18,0.9)" stroke="rgba(255,255,255,0.5)" stroke-width="3"/>
    <circle cx="36" cy="46" r="24" fill="none" stroke="#ffd84a" stroke-width="4" stroke-dasharray="151" class="tut-reload-ring" transform="rotate(-90 36 46)"/>
    <text x="36" y="50" text-anchor="middle" font-family="Black Ops One, Impact, sans-serif" font-size="9.5" fill="#fff">RELOAD</text>
    <text x="68" y="50" font-family="Rajdhani, sans-serif" font-weight="700" font-size="10" fill="#aaa">or</text>
    <path d="M96,14 L96,58" stroke="#5cc8ff" stroke-width="4" stroke-linecap="round" class="tut-swipe"/>
    <path d="M86,52 L96,66 L106,52" stroke="#5cc8ff" stroke-width="4" fill="none" stroke-linecap="round" stroke-linejoin="round" class="tut-swipe"/>
    ${finger(96, 64)}
  </svg>`,
  crate: `<svg viewBox="0 0 120 90" aria-hidden="true">
    <g class="tut-burst" stroke="#ffd84a" stroke-width="3" stroke-linecap="round"><path d="M60,10 v8 M60,72 v8 M24,45 h8 M88,45 h8 M35,20 l6,6 M85,20 l-6,6 M35,70 l6,-6 M85,70 l-6,-6"/></g>
    <g class="tut-crate"><rect x="40" y="26" width="40" height="38" rx="3" fill="#7a5a2c" stroke="#2a1a0a" stroke-width="2.5"/>
    <path d="M40,36 h40 M40,54 h40" stroke="#2a1a0a" stroke-width="2"/>
    <rect x="53" y="38" width="14" height="14" rx="2" fill="#f4f1ea"/><path d="M60,40 v10 M55,45 h10" stroke="#e0302a" stroke-width="3.4"/></g>
  </svg>`,
  civ: `<svg viewBox="0 0 120 90" aria-hidden="true">
    <g fill="#3a8fd0" class="tut-wave">
      <circle cx="60" cy="22" r="7"/><path d="M52,30 h16 l2,26 h-20 z"/>
      <path d="M52,32 L38,14 L42,11 L56,28 Z"/><path d="M68,32 L82,14 L78,11 L64,28 Z"/>
      <path d="M52,56 h7 l-1,28 h-6 z"/><path d="M61,56 h7 l0,28 h-6 z"/>
    </g>
    <circle cx="60" cy="46" r="36" fill="none" stroke="#ff3b3b" stroke-width="5"/>
    <path d="M35,21 L85,71" stroke="#ff3b3b" stroke-width="5" stroke-linecap="round"/>
  </svg>`,
} as const;

// ─── Weapon silhouettes (viewBox 0 0 48 20) ──────────────────────────────────

export const WEAPON_ICONS: Record<WeaponId, string> = {
  pistol: 'M6,4 H34 V10 H18 L15,18 H8 L11,10 H6 Z',
  shotgun: 'M1,7 H42 V10 H26 L24,13 H17 L8,17 L3,17 L5,11 L1,10 Z',
  smg: 'M4,5 H38 V9 H44 V11 H30 L28,18 H23 L24,11 H17 L15,15 H11 L12,11 H4 Z',
  magnum: 'M4,4 H40 V8 H24 Q22,12 18,12 L15,18 H8 L11,8 H4 Z',
  turret: 'M2,6 H30 V4 H44 V12 H30 V10 H22 L20,18 H12 L14,10 H2 Z',
};

export function weaponIcon(id: WeaponId, cls = ''): string {
  return `<svg class="wicon ${cls}" viewBox="0 0 48 20" aria-hidden="true"><path d="${WEAPON_ICONS[id]}"/></svg>`;
}

/** Padlock glyph. */
export const LOCK_ICON = `<svg class="lock-icon" viewBox="0 0 20 24" aria-hidden="true"><path d="M5,10 V7 a5,5 0 0 1 10,0 V10" fill="none" stroke="currentColor" stroke-width="2.6"/><rect x="2" y="10" width="16" height="13" rx="2" fill="currentColor"/></svg>`;

/** Skull glyph (boss markers). */
export const SKULL_ICON = `<svg class="skull-icon" viewBox="0 0 20 20" aria-hidden="true"><path d="M10,1 C4.5,1 2,4.6 2,8.6 C2,11.4 3.4,12.9 5,13.6 V17 H8 V15 H9 V17 H11 V15 H12 V17 H15 V13.6 C16.6,12.9 18,11.4 18,8.6 C18,4.6 15.5,1 10,1 Z M6.5,7.5 a2,2 0 1 1 0,4 a2,2 0 1 1 0,-4 Z M13.5,7.5 a2,2 0 1 1 0,4 a2,2 0 1 1 0,-4 Z" fill="currentColor" fill-rule="evenodd"/></svg>`;
