import type { Beat, StageDef } from '../../../gameplay/StageTypes';
import { D, RAIL } from './layout';
import { buildJungle, jungle } from './env';
import { JeepViewModel } from './jeep';
import './boss';
import './pack';

/**
 * PRIMAL ISLAND · STAGE 1 — JUNGLE RUN
 *
 * A park-tour jeep with a roll-bar mounted gun. Through the park gate → compy
 * ambush (teaches the gun) → raptors chasing alongside → raptors smash through
 * the electric fence → fallen tree hold (dilos + flanking raptors, blow the
 * fuel drums) → herbivore stampede → trike bursts out of a wrecked tour
 * vehicle → pteros over the cliffs → river ford with compys → the HORNED
 * DEVIL ambushes from the treeline and chases the jeep along the river.
 */

let viewModel: JeepViewModel | null = null;

const beats: Beat[] = [
  {
    kind: 'banner',
    label: 'title',
    text: 'JUNGLE RUN',
    sub: 'PRIMAL ISLAND · STAGE 1',
    duration: 2.6,
    look: { at: [0, 3.2, 30], blend: 0.6 },
  },
  {
    kind: 'action',
    label: 'gate opens',
    look: { at: [0, 3.2, 30] },
    run: (w) => jungle()?.openGate(w),
  },
  { kind: 'wait', label: 'gate swings', duration: 0.7 },
  {
    kind: 'move',
    label: 'through the gate',
    to: D.COMPY_HOLD,
    speed: 11,
    // A bonus gem hanging past the gate: a harmless first target while the park rolls by.
    pickups: [{ kind: 'points', pos: [2.2, 2.5, 42], t: 0.4 }],
    onStart: (w) => {
      // First compys hop out past the gate: the gun prompt goes up with them.
      w.later(2.4, () => w.hud.prompt('HOLD TO FIRE!'));
      // 'WATCH THE HEAT!' pops up the first time the barrel actually gets hot.
      jungle()?.armHeatTip(true);
    },
    waves: [
      {
        // Scouts out of the ferns just past the gate (the stage's first targets, ~5 s in).
        start: { atD: D.GATE + 2 },
        spawns: [
          { type: 'compy', pos: [-4.5, 0, 17], entry: 'leap', frame: 'world' },
          { type: 'compy', pos: [5, 0, 20], entry: 'leap', t: 0.5, frame: 'world' },
        ],
      },
    ],
  },
  // ── 1. Compy ambush: a sparse first wave to learn the mounted gun. ──
  {
    kind: 'hold',
    label: 'compy ambush',
    look: { at: [0, 1.2, 11], blend: 0.8 },
    pickups: [{ kind: 'points', pos: [4.4, 2.3, 13], t: 1 }],
    waves: [
      {
        // Two lone compys close enough to read clearly: learn to aim before the swarm.
        spawns: [
          { type: 'compy', pos: [-2.5, 0, 10], t: 0.4 },
          { type: 'compy', pos: [2.5, 0, 10.5], t: 1.6 },
        ],
      },
      {
        spawns: [
          { type: 'compy', pos: [-6.5, 0, 11], entry: 'leap' },
          { type: 'compy', pos: [6.5, 0, 12], entry: 'leap', t: 0.5 },
          { type: 'compy', pos: [-2.5, 0, 17], t: 1.0 },
          { type: 'compy', pos: [3, 0, 17.5], t: 1.4 },
        ],
      },
      {
        start: { remaining: 1 },
        spawns: [
          { type: 'compy', pos: [-3.5, 0, 20], count: 6, every: 0.32, offset: [1.3, 0, 0.3] },
          { type: 'compy', pos: [-7, 0, 12], entry: 'leap', t: 1.6 },
        ],
      },
    ],
  },
  // ── 2. Raptor chase. ──
  {
    kind: 'move',
    label: 'raptor chase',
    to: D.CHASE_SPLIT,
    speed: 13,
    onStart: (w) => w.audio.play('engine_rev', { volume: 0.7 }),
    waves: [
      {
        // A pair bursts out of the ferns on the right and springs at the jeep as it lands:
        // two rings at once (an ambush pounce takes a short burst to break).
        start: { atD: 76 },
        spawns: [
          { type: 'jungle_raptor', pos: [6.5, 0, 8], entry: 'leap', opts: { variant: 'tan', ambush: true } },
          { type: 'jungle_raptor', pos: [7.5, 0, 13], entry: 'leap', t: 0.5, opts: { variant: 'tan', ambush: true } },
        ],
      },
      {
        start: { atD: 100 },
        spawns: [{ type: 'compy', pos: [-1.5, 0, 18], count: 3, every: 0.3, offset: [1.4, 0, 0.8] }],
      },
      {
        // Two more out of the left treeline, springing as they land.
        start: { atD: 116 },
        spawns: [
          { type: 'jungle_raptor', pos: [-6.5, 0, 9], entry: 'leap', opts: { variant: 'blue', ambush: true } },
          { type: 'jungle_raptor', pos: [-7, 0, 14], entry: 'leap', t: 0.5, opts: { variant: 'tan', ambush: true } },
        ],
      },
    ],
  },
  // ── 3. Raptors smash through the electric fence (left). ──
  {
    kind: 'move',
    label: 'fence breach',
    to: D.TREE_HOLD,
    speed: 12,
    look: { yaw: 14, blend: 1.2 },
    waves: [
      {
        start: { atD: D.FENCE_BREAK - 12 },
        spawns: [
          { type: 'jungle_raptor', pos: [-8.5, 0, 12], entry: 'leap', t: 0.25, opts: { variant: 'red', ambush: true } },
          { type: 'jungle_raptor', pos: [-9.5, 0, 15], entry: 'leap', t: 0.65, opts: { variant: 'tan', ambush: true } },
          { type: 'jungle_raptor', pos: [-8, 0, 9.5], entry: 'leap', t: 1.1, opts: { variant: 'tan' } },
        ],
      },
      {
        start: { atD: 196 },
        spawns: [{ type: 'compy', pos: [3, 0, 17], count: 4, every: 0.3, offset: [-1.5, 0, 0.5] }],
      },
    ],
  },
  // ── 4. Fallen tree: dilos spit from the bushes, raptors flank. ──
  {
    kind: 'hold',
    label: 'fallen tree',
    look: { at: [-0.8, 1.7, 13], blend: 0.9 },
    onStart: (w) => {
      jungle()?.armHeatTip(false);
      jungle()?.spawnDrums(w);
      // Only if they're still there (stray fire often sets them off first).
      w.later(5, () => {
        if (!jungle()?.treeBlasted) w.hud.prompt('SHOOT THE FUEL DRUMS!');
      });
    },
    civilians: [{ pos: [-4.6, 0, 5.4], variant: 'ranger' }],
    pickups: [{ kind: 'health', pos: [-2.2, 2.4, 13.6] }],
    waves: [
      {
        spawns: [
          // Step out beside the bushes (bearing ≈ 24–29°, well clear of the ranger at ≈ 40° left).
          { type: 'dilo', pos: [-5.8, 0, 13], t: 0.3 },
          { type: 'dilo', pos: [7.0, 0, 12.8], t: 1.2 },
        ],
      },
      {
        start: { remaining: 1, after: 7 },
        spawns: [
          // Flank from the right (the ranger is sheltering on the left).
          { type: 'raptor', pos: [12, 0, 9], entry: 'leap', opts: { variant: 'blue' } },
          { type: 'raptor', pos: [4.5, 0, 20], entry: 'leap', t: 0.8, opts: { variant: 'tan' } },
        ],
      },
      {
        start: { remaining: 1 },
        spawns: [
          { type: 'raptor', pos: [0.5, 0, 19], entry: 'leap', opts: { variant: 'red' } },
          { type: 'compy', pos: [-1, 0, 16], count: 3, every: 0.4, offset: [2.5, 0, 0], t: 0.6 },
          { type: 'dilo', pos: [5.6, 0, 13.4], t: 1.6 },
        ],
      },
    ],
  },
  {
    kind: 'action',
    label: 'blast the tree',
    run: (w) => jungle()?.blastTree(w),
  },
  { kind: 'wait', label: 'debris settles', duration: 0.9 },
  // ── 5. Stampede across the meadow (the herd is harmless spectacle; a few
  //       compys bolt ahead of it — light action between the big encounters). ──
  {
    kind: 'move',
    label: 'to the meadow',
    to: D.STAMPEDE_WAIT,
    speed: 12,
    waves: [
      {
        // Land ahead-left of the stop: they skitter in as the jeep pulls up.
        start: { atD: D.STAMPEDE_WAIT - 26 },
        spawns: [
          { type: 'compy', pos: [-6, 0, 25], entry: 'leap' },
          { type: 'compy', pos: [-8.5, 0, 28], entry: 'leap', t: 0.5 },
        ],
      },
    ],
  },
  {
    kind: 'hold',
    label: 'stampede',
    minTime: 4.4,
    look: { at: [-3, 3, 25], blend: 1.0 },
    onStart: (w) => jungle()?.startStampede(w),
    waves: [
      {
        start: { after: 1.6 },
        spawns: [
          { type: 'compy', pos: [-7, 0, 12], entry: 'leap' },
          { type: 'compy', pos: [-9, 0, 15.5], entry: 'leap', t: 0.45 },
        ],
      },
    ],
  },
  {
    kind: 'move',
    label: 'into the meadow',
    to: D.TRIKE_HOLD,
    speed: 9,
  },
  // ── 6. Trike charge out of the wrecked tour vehicle. ──
  {
    kind: 'hold',
    label: 'trike charge',
    look: { at: [1.5, 1.9, 20], blend: 0.8 },
    onStart: (w) => w.later(0.3, () => jungle()?.flipCar(w)),
    civilians: [{ pos: [-6.4, 0, 8.5], variant: 'default' }],
    pickups: [{ kind: 'bomb', pos: [-3.5, 2.2, 12], t: 2 }],
    waves: [
      {
        // A big bull (twice the stock hp): it soaks up the opening burst (the frill and horns
        // are armour), so its charge usually gets going — break it with fire on the face.
        spawns: [{ type: 'trike', pos: [D.CAR_SIDE - 0.5, 0, D.CAR - D.TRIKE_HOLD], entry: 'burst', t: 0.35, hp: 2 }],
      },
      {
        start: { after: 4, remaining: 0 },
        spawns: [{ type: 'compy', pos: [-3, 0, 13], count: 4, every: 0.4, offset: [2.4, 0, 0.8], entry: 'leap' }],
      },
      {
        spawns: [
          // Left raptor comes in at ≈ 18° — never on the bearing of the civilian (≈ 37° left).
          { type: 'raptor', pos: [-7, 0, 22], entry: 'leap', opts: { variant: 'blue' } },
          { type: 'raptor', pos: [10, 0, 17], entry: 'leap', t: 0.8, opts: { variant: 'tan' } },
        ],
      },
    ],
  },
  // ── 7. Pteros swoop off the cliffs; a waterfall on the left. ──
  {
    kind: 'move',
    label: 'cliff road',
    to: D.FORD_HOLD,
    speed: 12,
    look: { yaw: 10, pitch: 3, blend: 1.4 },
    pickups: [{ kind: 'points', pos: [3, 2.2, 42] }],
    waves: [
      {
        start: { atD: 370 },
        spawns: [
          { type: 'ptero', pos: [-7, 10, 26], entry: 'fly' },
          { type: 'ptero', pos: [5, 11, 30], entry: 'fly', t: 0.8 },
        ],
      },
      {
        start: { atD: 408 },
        spawns: [{ type: 'compy', pos: [-1.5, 0, 20], count: 4, every: 0.25, offset: [1.1, 0, 0.6] }],
      },
      {
        start: { atD: 430 },
        spawns: [
          { type: 'ptero', pos: [-9, 11, 28], entry: 'fly' },
          { type: 'ptero', pos: [-2, 12, 32], entry: 'fly', t: 0.7 },
          { type: 'raptor', pos: [7, 0, 9], entry: 'leap', t: 1.2, opts: { variant: 'tan' } },
        ],
      },
    ],
  },
  // ── 8. River ford: compys leap off the rocks. ──
  {
    kind: 'hold',
    label: 'river ford',
    look: { at: [0, 1.3, 12], blend: 0.8 },
    civilians: [{ pos: [5.4, 0, 7], variant: 'scientist' }],
    pickups: [{ kind: 'health', pos: [-3.5, 2.6, 11], t: 1 }],
    waves: [
      {
        spawns: [
          { type: 'compy', pos: [-5.5, 0, 8.5], entry: 'leap' },
          { type: 'compy', pos: [3.5, 0, 11], entry: 'leap', t: 0.4 },
          { type: 'compy', pos: [-7, 0, 14], entry: 'leap', t: 0.9 },
          { type: 'compy', pos: [6.5, 0, 17], entry: 'leap', t: 1.3 },
          { type: 'compy', pos: [0, 0, 17], entry: 'leap', t: 1.7 },
        ],
      },
      {
        start: { remaining: 2 },
        spawns: [
          // Far bank, ≈ 20° right: clear of the scientist (≈ 38° right).
          { type: 'dilo', pos: [6.2, 0, 17], t: 0.2 },
          { type: 'compy', pos: [-4.5, 0, 15], count: 4, every: 0.35, offset: [2.2, 0, 0.5], entry: 'leap', t: 0.6 },
        ],
      },
      {
        spawns: [
          { type: 'jungle_raptor', pos: [-10, 0, 12], entry: 'leap', opts: { variant: 'blue', ambush: true } },
          { type: 'jungle_raptor', pos: [12, 0, 9], entry: 'leap', t: 0.6, opts: { variant: 'red', ambush: true } },
          { type: 'compy', pos: [-1.5, 0, 18], count: 3, every: 0.3, offset: [1.5, 0, 0], t: 1.0 },
        ],
      },
    ],
  },
  {
    kind: 'move',
    label: 'riverbank',
    to: D.BOSS_START,
    speed: 8,
    pickups: [{ kind: 'bomb', pos: [2.6, 1.8, 11] }],
  },
  // ── BOSS: the Horned Devil ambushes from the treeline and gives chase. ──
  {
    kind: 'boss',
    label: 'HORNED DEVIL',
    boss: 'carnotaur',
    pos: [-16, 0, -1],
    moveTo: D.END,
    speed: 5,
    look: { yaw: 70, blend: 0.8 },
    onStart: (w) => jungle()?.spawnBossDrums(w),
  },
];

export const stage: StageDef = {
  id: 'd1',
  campaign: 'dino',
  index: 0,
  name: 'JUNGLE RUN',
  tagline: 'The tour is over. The animals are out.',
  rail: RAIL,
  mode: 'drive',
  weapon: 'turret',
  music: 'dino_drive',
  beats,
  buildEnvironment: (world, curve) => buildJungle(world, curve),
  setup(world) {
    viewModel?.dispose();
    const vm = new JeepViewModel(world);
    viewModel = vm;
    world.rig.viewModelHolder.add(vm.root);
    // Drive the view model from the environment's per-frame hook.
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
