import type { V3 } from '../../../core/types';
import type { Beat, StageDef } from '../../../gameplay/StageTypes';
import type { World } from '../../../gameplay/World';
import { EnvKit } from '../../kit/EnvKit';
import { D, RAIL, railCurve } from './layout';
import { buildHighway, z3Scene } from './env';
import { TruckViewModel } from './truck';
import './boss';
import './minions';

/**
 * DEAD ZONE · STAGE 3 — HIGHWAY TO HELL (campaign finale)
 *
 * Dusk. You man the twin gun in the bed of a pickup fleeing the burning city
 * down the interstate: runners chase the truck out of town → a pile-up blocks
 * the lanes (ram through) → spitters on an overpass, a car crashes off the deck
 * → billboard alley chase → an overturned tanker (shoot it!) → a tunnel where
 * the engine stalls in the dark → an overrun army barricade on the suspension
 * bridge → THE BEHEMOTH climbs onto the bridge and chases the truck.
 */

/** World position at rail distance d, x metres right, y up (for `world: true` spawns/looks). */
function W(d: number, x: number, y = 0): V3 {
  const p = EnvKit.besideRail(railCurve(), d, x, y);
  return [p.x, p.y, p.z];
}

let viewModel: TruckViewModel | null = null;

const beats: Beat[] = [
  {
    kind: 'banner',
    label: 'title',
    text: 'HIGHWAY TO HELL',
    sub: 'DEAD ZONE · FINAL STAGE',
    duration: 3.2,
    look: { yaw: 172, pitch: 5, blend: 0.4 },
    onStart: (w) => w.audio.play('engine_rev', { volume: 0.8 }),
  },
  // ── 1. Out of the city: runners chase the truck. ──
  {
    kind: 'move',
    label: 'leaving the city',
    to: D.PILEUP_STOP,
    speed: 12,
    onStart: (w) => {
      w.hud.prompt('HOLD TO FIRE!');
      w.later(2.5, () => w.hud.prompt(null));
    },
    pickups: [{ kind: 'points', pos: [4.2, 2.4, 46], t: 1.5 }],
    waves: [
      {
        start: { atD: 14 },
        spawns: [
          { type: 'runner', pos: [-6.5, 0, 13], entry: 'leap', opts: { variant: 'civilian' } },
          { type: 'runner', pos: [6.5, 0, 15], entry: 'leap', t: 0.7, opts: { variant: 'office' } },
        ],
      },
      {
        start: { atD: 50 },
        spawns: [
          { type: 'walker', frame: 'world', pos: [-4, 0, 34], opts: { variant: 'civilian' } },
          { type: 'walker', frame: 'world', pos: [4.2, 0, 38], opts: { variant: 'cop' } },
          { type: 'walker', frame: 'world', pos: [-11.5, 0, 36], opts: { variant: 'office' } },
          { type: 'runner', pos: [-4, 0, -7], entry: 'leap', t: 1.2, opts: { variant: 'biker' } },
        ],
      },
      {
        start: { atD: 92 },
        spawns: [
          { type: 'runner', pos: [4, 0, -8], entry: 'leap', opts: { variant: 'worker' } },
          { type: 'runner', pos: [-7, 0, 12], entry: 'leap', t: 0.5 },
          { type: 'walker', frame: 'world', pos: [3.8, 0, 30], t: 0.2, opts: { variant: 'nurse' } },
        ],
      },
    ],
  },
  // ── 2. Pile-up: every lane blocked; the dead crawl out of the wrecks. ──
  {
    kind: 'hold',
    label: 'pile-up',
    look: { at: [0, 1.3, 12], blend: 0.8 },
    civilians: [{ pos: [6.3, 0, 9.5], variant: 'default' }],
    pickups: [{ kind: 'bomb', pos: [-4.4, 2.4, 11], t: 3 }],
    waves: [
      {
        spawns: [
          { type: 'walker', pos: [-2.8, 0, 10.5], opts: { variant: 'cop' } },
          { type: 'walker', pos: [2.2, 0, 12.5], t: 0.5, opts: { variant: 'civilian' } },
          { type: 'walker', pos: [-0.8, 0, 15.5], t: 0.9, opts: { variant: 'office' } },
          { type: 'crawler', pos: [1.6, 0, 8.5], entry: 'rise', t: 1.6 },
        ],
      },
      {
        start: { remaining: 1 },
        spawns: [
          { type: 'walker', pos: [-9.5, 0, 9], opts: { variant: 'worker' } },
          { type: 'walker', pos: [-11.5, 0, 12], t: 0.4, opts: { variant: 'nurse' } },
          { type: 'crawler', pos: [-3.6, 0, 8], entry: 'rise', t: 1.0 },
          { type: 'runner', pos: [4.5, 0, -5], entry: 'leap', t: 1.8, opts: { variant: 'civilian' } },
        ],
      },
      {
        start: { remaining: 1 },
        spawns: [
          { type: 'bloater', pos: [0.5, 0, 14.5] },
          { type: 'walker', pos: [-2.4, 0, 15.5], t: 0.3, opts: { variant: 'patient' } },
          { type: 'walker', pos: [2.8, 0, 16], t: 0.6, opts: { variant: 'doctor' } },
          { type: 'runner', pos: [-7.5, 0, 12], entry: 'leap', t: 1.4 },
        ],
      },
    ],
  },
  // ── 3. Ram through (the env shoves the blocking car aside as we hit it). ──
  {
    kind: 'move',
    label: 'ram through',
    to: D.OVERPASS_SLOW_FROM,
    speed: 13,
    onStart: (w) => w.audio.play('engine_rev', { volume: 1 }),
    waves: [
      {
        start: { atD: 178 },
        spawns: [
          { type: 'runner', pos: [-5, 0, -6], entry: 'leap', opts: { variant: 'biker' } },
          { type: 'runner', pos: [5.5, 0, -7], entry: 'leap', t: 0.7 },
        ],
      },
      {
        start: { atD: 200 },
        spawns: [{ type: 'runner', pos: [6.8, 0, 12], entry: 'leap', opts: { variant: 'worker' } }],
      },
    ],
  },
  // ── 4. Creeping up to the overpass: spitters on the deck, a car goes over the edge. ──
  {
    kind: 'move',
    label: 'overpass approach',
    to: D.OVERPASS - 24,
    speed: 5,
    look: { at: W(D.OVERPASS - 2, -0.5, 7.6), world: true, blend: 1.2 },
    waves: [
      {
        start: { atD: D.OVERPASS_SLOW_FROM + 3 },
        spawns: [
          { type: 'deck_spitter', frame: 'world', world: true, pos: W(D.OVERPASS - 4.6, -1.6, 7.3) },
          { type: 'deck_spitter', frame: 'world', world: true, pos: W(D.OVERPASS - 4.4, -8.5, 7.3), t: 1.2 },
        ],
      },
    ],
  },
  {
    kind: 'hold',
    label: 'under the overpass',
    look: { at: [0, 4.4, 16], blend: 0.8 },
    pickups: [{ kind: 'health', pos: [-5.5, 8.8, 19.2], t: 1 }],
    waves: [
      {
        spawns: [
          { type: 'walker', pos: [-1.5, 7.3, 19.2], entry: 'drop', opts: { variant: 'worker' } },
          { type: 'walker', pos: [3.2, 7.3, 19.4], entry: 'drop', t: 0.9, opts: { variant: 'civilian' } },
          { type: 'deck_spitter', pos: [12, 7.3, 19.6], t: 1.6 },
        ],
      },
      {
        start: { remaining: 1 },
        spawns: [
          { type: 'walker', pos: [0, 0, 30], opts: { variant: 'office' } },
          { type: 'walker', pos: [-3, 0, 32], t: 0.4, opts: { variant: 'patient' } },
          { type: 'walker', pos: [3, 0, 33], t: 0.8, opts: { variant: 'cop' } },
          { type: 'runner', pos: [-7, 0, 6], entry: 'leap', t: 1.6 },
          { type: 'walker', pos: [-5.5, 7.3, 19.3], entry: 'drop', t: 2.2, opts: { variant: 'soldier' } },
        ],
      },
    ],
  },
  // ── 5. Billboard alley: full speed, runners alongside, crawlers out of wrecks. ──
  {
    kind: 'move',
    label: 'billboard alley',
    to: D.TANKER_STOP,
    speed: 14,
    pickups: [{ kind: 'health', pos: [-5, 2.4, 52], t: 4 }],
    waves: [
      {
        start: { atD: D.OVERPASS + 20 },
        spawns: [
          { type: 'runner', pos: [-4, 0, -6], entry: 'leap', opts: { variant: 'nurse' } },
          { type: 'runner', pos: [4.5, 0, -8], entry: 'leap', t: 0.6 },
        ],
      },
      {
        start: { atD: 322 },
        spawns: [
          { type: 'walker', frame: 'world', pos: [-4, 0, 36], opts: { variant: 'doctor' } },
          { type: 'walker', frame: 'world', pos: [4, 0, 39], opts: { variant: 'worker' } },
          { type: 'walker', frame: 'world', pos: [7.5, 0, 42], opts: { variant: 'civilian' } },
        ],
      },
      {
        start: { atD: 352 },
        spawns: [
          { type: 'runner', pos: [6.5, 0, 10], entry: 'leap' },
          { type: 'runner', pos: [-6.5, 0, 12], entry: 'leap', t: 0.5, opts: { variant: 'biker' } },
          { type: 'runner', pos: [0.5, 0, -8], entry: 'leap', t: 1.0 },
        ],
      },
      {
        start: { atD: 384 },
        spawns: [
          { type: 'crawler', frame: 'world', pos: [-4, 0, 26], entry: 'rise' },
          { type: 'crawler', frame: 'world', pos: [4.2, 0, 30], entry: 'rise', t: 0.4 },
        ],
      },
    ],
  },
  // ── 6. Overturned tanker: the horde pours round it. Shoot the tank! ──
  {
    kind: 'hold',
    label: 'tanker',
    look: { at: [-1, 1.6, 14], blend: 0.8 },
    onStart: (w) => {
      z3Scene(w)?.armTanker();
      w.later(2.2, () => {
        const z = z3Scene(w);
        if (z && !z.tankBlown) w.hud.prompt('SHOOT THE TANKER!');
      });
      w.later(6.5, () => {
        const z = z3Scene(w);
        if (z && !z.tankBlown) w.hud.prompt(null);
      });
    },
    pickups: [{ kind: 'health', pos: [5.2, 2.6, 9], t: 1 }],
    waves: [
      {
        spawns: [
          { type: 'walker', pos: [3.8, 0, 19], opts: { variant: 'worker' } },
          { type: 'walker', pos: [-10.2, 0, 17], t: 0.4, opts: { variant: 'civilian' } },
          { type: 'walker', pos: [-3.5, 0, 11.5], t: 0.8, opts: { variant: 'office' } },
          { type: 'crawler', pos: [-1.5, 0, 9.5], entry: 'rise', t: 1.3 },
          { type: 'walker', pos: [3.6, 0, 22], t: 1.6, opts: { variant: 'cop' } },
          { type: 'crawler', pos: [1.2, 0, 10.5], entry: 'rise', t: 2.2 },
        ],
      },
      {
        start: { remaining: 2, after: 9 },
        spawns: [
          { type: 'brute', pos: [3.8, 0, 22] },
          { type: 'walker', pos: [-11, 0, 15], t: 0.5, opts: { variant: 'nurse' } },
          { type: 'walker', pos: [-12.5, 0, 19], t: 0.9, opts: { variant: 'soldier' } },
          { type: 'walker', pos: [-9.6, 0, 21], t: 1.3, opts: { variant: 'patient' } },
        ],
      },
      {
        start: { remaining: 1 },
        spawns: [
          { type: 'runner', pos: [7, 0, 9], entry: 'leap' },
          { type: 'runner', pos: [-8, 0, 8], entry: 'leap', t: 0.6, opts: { variant: 'biker' } },
          { type: 'spitter', pos: [-14, 0, 21], t: 1.0 },
          { type: 'bloater', pos: [3.8, 0, 21], t: 1.4 },
        ],
      },
    ],
  },
  {
    kind: 'wait',
    label: 'tanker blast',
    duration: 1.4,
    onStart: (w) => z3Scene(w)?.detonateTanker(),
  },
  // ── 7. Into the tunnel: crawlers drop from the ceiling. ──
  {
    kind: 'move',
    label: 'into the tunnel',
    to: D.STALL,
    speed: 15,
    onStart: (w) => w.audio.play('engine_rev', { volume: 1 }),
    waves: [
      {
        start: { atD: 470 },
        spawns: [
          { type: 'runner', pos: [7, 0, 10], entry: 'leap', opts: { variant: 'worker' } },
          { type: 'runner', pos: [-7, 0, 12], entry: 'leap', t: 0.5 },
        ],
      },
      {
        start: { atD: D.TUNNEL_FROM + 8 },
        spawns: [
          { type: 'crawler', pos: [-3, 6, 9], entry: 'drop' },
          { type: 'crawler', pos: [3, 6, 11], entry: 'drop', t: 0.5 },
        ],
      },
      {
        start: { atD: D.TUNNEL_FROM + 30 },
        spawns: [
          { type: 'runner', pos: [-3.5, 0, -7], entry: 'leap', opts: { variant: 'patient' } },
          { type: 'runner', pos: [3.5, 0, -9], entry: 'leap', t: 0.6 },
          { type: 'crawler', pos: [0.8, 6, 10], entry: 'drop', t: 1.4 },
        ],
      },
    ],
  },
  // ── 8. The engine dies in the dark. ──
  {
    kind: 'hold',
    label: 'stalled in the tunnel',
    look: { at: [0, 1.5, 12], blend: 0.9 },
    onStart: (w) => {
      z3Scene(w)?.stall();
      w.hud.prompt('ENGINE STALLED!');
      w.later(2.4, () => w.hud.prompt(null));
    },
    onEnd: (w) => {
      z3Scene(w)?.restart();
      w.hud.prompt('GO GO GO!');
      w.later(1.6, () => w.hud.prompt(null));
    },
    civilians: [{ pos: [5.6, 0, 8], variant: 'nurse', t: 0.5 }],
    pickups: [{ kind: 'bomb', pos: [-3, 2.8, 10], t: 2 }],
    waves: [
      {
        spawns: [
          { type: 'walker', pos: [-3, 0, 19], t: 0.8, opts: { variant: 'office' } },
          { type: 'walker', pos: [2.5, 0, 21], t: 1.2, opts: { variant: 'civilian' } },
          { type: 'walker', pos: [0, 0, 25], t: 1.6, opts: { variant: 'patient' } },
          { type: 'walker', pos: [-5.5, 0, 23], t: 2.0, opts: { variant: 'nurse' } },
        ],
      },
      {
        start: { remaining: 1 },
        spawns: [
          { type: 'runner', pos: [-2, 0, -9] },
          { type: 'runner', pos: [3, 0, -11], t: 0.5 },
          { type: 'bloater', pos: [0.5, 0, 18], t: 1.0 },
          { type: 'walker', pos: [-2.5, 0, 20], t: 1.4, opts: { variant: 'doctor' } },
          { type: 'walker', pos: [3.2, 0, 21], t: 1.6, opts: { variant: 'cop' } },
        ],
      },
      {
        start: { remaining: 1 },
        spawns: [
          { type: 'crawler', pos: [-2.5, 6.5, 9], entry: 'drop' },
          { type: 'crawler', pos: [2.5, 6.5, 11], entry: 'drop', t: 0.4 },
          { type: 'brute', pos: [0, 0, 24], t: 0.8 },
          { type: 'walker', pos: [-4, 0, 17], t: 1.2, opts: { variant: 'worker' } },
          { type: 'walker', pos: [4, 0, 18], t: 1.5, opts: { variant: 'soldier' } },
        ],
      },
    ],
  },
  // ── 9. Out of the tunnel and onto the bridge. ──
  {
    kind: 'move',
    label: 'bridge approach',
    to: D.BARRICADE_STOP,
    speed: 16,
    waves: [
      {
        start: { atD: D.STALL + 22 },
        spawns: [
          { type: 'runner', pos: [-4, 0, -6], entry: 'leap', opts: { variant: 'office' } },
          { type: 'runner', pos: [4, 0, -7.5], entry: 'leap', t: 0.6 },
        ],
      },
      {
        start: { atD: D.TUNNEL_TO + 14 },
        spawns: [
          { type: 'walker', frame: 'world', pos: [-4, 0, 34], opts: { variant: 'soldier' } },
          { type: 'walker', frame: 'world', pos: [4, 0, 37], opts: { variant: 'soldier' } },
          { type: 'runner', pos: [6.5, 0, 11], entry: 'leap', t: 1.0 },
          { type: 'runner', pos: [-6, 0, 12], entry: 'leap', t: 1.4 },
        ],
      },
    ],
  },
  // ── 10. Overrun army checkpoint on the bridge. ──
  {
    kind: 'hold',
    label: 'army barricade',
    look: { at: [0, 1.6, 14], blend: 0.8 },
    civilians: [{ pos: [6.4, 0, 6.5], variant: 'cop' }],
    pickups: [
      { kind: 'health', pos: [4.6, 2.3, 10], t: 1 },
      { kind: 'bomb', pos: [-3, 2.6, 12], t: 5 },
    ],
    waves: [
      {
        spawns: [
          { type: 'walker', pos: [-1.2, 0, 13], opts: { variant: 'soldier' } },
          { type: 'walker', pos: [1.4, 0, 14.5], t: 0.4, opts: { variant: 'soldier' } },
          { type: 'walker', pos: [-4.4, 0, 15], t: 0.8, opts: { variant: 'soldier' } },
          { type: 'walker', pos: [4.6, 0, 13.5], t: 1.2, opts: { variant: 'biker' } },
        ],
      },
      {
        start: { remaining: 1 },
        spawns: [
          { type: 'brute', pos: [0, 0, 18] },
          { type: 'walker', pos: [-9.5, 0, 14], t: 0.4, opts: { variant: 'soldier' } },
          { type: 'walker', pos: [-12, 0, 16], t: 0.8, opts: { variant: 'biker' } },
          { type: 'spitter', pos: [7, 0, 20], t: 1.2 },
        ],
      },
      {
        start: { remaining: 1 },
        spawns: [
          { type: 'runner', pos: [-7, 0, 10], entry: 'leap', opts: { variant: 'soldier' } },
          { type: 'runner', pos: [7.5, 0, 12], entry: 'leap', t: 0.5, opts: { variant: 'soldier' } },
          { type: 'bloater', pos: [-1.5, 0, 16], t: 0.9 },
          { type: 'walker', pos: [2, 0, 18], t: 1.3, opts: { variant: 'soldier' } },
          { type: 'walker', pos: [-0.5, 0, 20], t: 1.6, opts: { variant: 'soldier' } },
        ],
      },
    ],
  },
  {
    kind: 'move',
    label: 'smash the gate',
    to: D.BOSS_START,
    speed: 7,
    onStart: (w) => w.audio.play('engine_rev', { volume: 1 }),
  },
  {
    kind: 'wait',
    label: 'something big',
    duration: 1.6,
    onStart: (w) => {
      w.audio.play('boss_roar', { volume: 0.6, pitch: 0.55 });
      w.rig.shake(0.5);
      w.hud.prompt('BEHIND YOU!');
      w.later(1.6, () => w.hud.prompt(null));
    },
  },
  // ── BOSS: the Behemoth hauls itself onto the bridge and gives chase. ──
  {
    kind: 'boss',
    label: 'THE BEHEMOTH',
    boss: 'behemoth',
    pos: [9, 0, -27],
    moveTo: D.BOSS_END,
    speed: 5.5,
    look: { yaw: 180, pitch: 7 },
    pickups: [
      { kind: 'health', pos: [-2.5, 2.6, -12], t: 24 },
      { kind: 'bomb', pos: [3, 2.8, -12], t: 48 },
      { kind: 'health', pos: [1.5, 2.6, -12], t: 75 },
    ],
    waves: [
      {
        start: { after: 18 },
        spawns: [
          { type: 'runner', pos: [-5, 0, -10], entry: 'leap', opts: { variant: 'worker' } },
          { type: 'runner', pos: [5, 0, -12], entry: 'leap', t: 0.6, opts: { variant: 'soldier' } },
        ],
      },
    ],
  },
  {
    kind: 'move',
    label: 'escape',
    to: D.END,
    speed: 15,
    look: 'path',
    onStart: (w) => {
      w.audio.play('engine_rev', { volume: 1 });
      w.hud.prompt(null);
    },
  },
];

export const stage: StageDef = {
  id: 'z3',
  campaign: 'zombie',
  index: 2,
  name: 'HIGHWAY TO HELL',
  tagline: 'One road out. Everything that walks is between you and it.',
  rail: RAIL,
  mode: 'drive',
  weapon: 'turret',
  music: 'zombie_drive',
  beats,
  buildEnvironment: (world, curve) => buildHighway(world, curve),
  setup(world: World) {
    viewModel?.dispose();
    const vm = new TruckViewModel(world);
    viewModel = vm;
    world.rig.viewModelHolder.add(vm.root);
    const env = world.env;
    if (env) {
      const inner = env.update;
      env.update = (dt, w) => {
        inner?.(dt, w);
        vm.update(dt);
      };
      const innerDispose = env.dispose;
      env.dispose = () => {
        innerDispose?.();
        vm.dispose();
        if (viewModel === vm) viewModel = null;
      };
    }
  },
};
