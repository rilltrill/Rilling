import * as THREE from 'three';
import type { Beat, StageDef } from '../../../gameplay/StageTypes';
import type { World } from '../../../gameplay/World';
import type { V3 } from '../../../core/types';
import { D, RAIL, rel, worldAt } from './layout';
import { buildPark, park } from './env';
import { JeepViewModel, buildJeepBody } from './jeep';
import './boss';

/**
 * PRIMAL ISLAND · STAGE 3 — TYRANT CHASE (campaign finale)
 *
 * Night, violent thunderstorm. The ranger jeep flees through the park toward
 * the helipad: the T-rex paddock's torn fence (compys + raptors spill through
 * the gap) → raptor pack chasing alongside → the dark visitor centre (compys on
 * the plaza, then raptors smash the doors open) → pteranodons out of the storm
 * → a roadblock with dilophosaurs (blow the fuel drums) → the jeep bogs down
 * in the mud and must hold out → the trestle bridge (pteranodons; lightning
 * brings it down behind you) → THE TYRANT bursts out of the trees and chases
 * the jeep to the helipad → shoot the fuel tank as it lunges → helicopter
 * escape.
 */

let viewModel: JeepViewModel | null = null;

const v3 = (v: THREE.Vector3): V3 => [Math.round(v.x * 100) / 100, Math.round(v.y * 100) / 100, Math.round(v.z * 100) / 100];
const HELI_LOOK = v3(worldAt(D.HELI, 0, 2.6));
const PAD_LOOK = v3(worldAt(D.PAD - 9, -1, 0));
const DOOR = rel(D.HOLD_VISITOR, D.VISITOR, D.VISITOR_SIDE + 2.5);

const beats: Beat[] = [
  {
    kind: 'banner',
    label: 'title',
    text: 'TYRANT CHASE',
    sub: 'PRIMAL ISLAND · STAGE 3',
    duration: 3,
    look: { at: rel(0, 58, D.FENCE_SIDE, 3), blend: 0.8 },
    onStart: (w) => w.later(0.7, () => park()?.strike(w, true)),
  },
  {
    kind: 'move',
    label: 'paddock road',
    to: D.HOLD_FENCE,
    speed: 7,
    look: { at: rel(0, 60, D.FENCE_SIDE - 2, 2), blend: 1.2 },
    onStart: (w) => w.audio.play('engine_rev', { volume: 0.7 }),
  },
  // ── 1. The paddock fence is down: compys pour through the gap. ──
  {
    kind: 'hold',
    label: 'torn fence',
    look: { at: rel(D.HOLD_FENCE, 57, 6, 1.6), blend: 0.8 },
    onStart: (w) => {
      w.hud.prompt('THE FENCE IS DOWN!');
      w.later(2, () => w.hud.prompt('HOLD TO FIRE!'));
    },
    pickups: [{ kind: 'points', pos: rel(D.HOLD_FENCE, 53, 3.4, 2.4), t: 1 }],
    waves: [
      {
        spawns: [
          { type: 'compy', pos: rel(D.HOLD_FENCE, 59, D.FENCE_SIDE), entry: 'leap', t: 0.4, count: 3, every: 0.45, offset: [-0.4, 0, -0.9] },
          { type: 'compy', pos: [-2.4, 0, 12], t: 1.6 },
        ],
      },
      {
        start: { remaining: 1 },
        spawns: [
          { type: 'raptor', pos: rel(D.HOLD_FENCE, 61, D.FENCE_SIDE + 1), entry: 'leap', opts: { variant: 'tan' } },
          { type: 'compy', pos: [-3, 0, 11.5], entry: 'leap', t: 0.8, count: 3, every: 0.4, offset: [0.8, 0, 0.9] },
        ],
      },
      {
        start: { remaining: 1 },
        spawns: [
          { type: 'raptor', pos: rel(D.HOLD_FENCE, 57, D.FENCE_SIDE + 1.5), entry: 'leap', opts: { variant: 'green' } },
          { type: 'raptor', pos: [-9, 0, 18], entry: 'leap', t: 0.8, opts: { variant: 'tan' } },
          { type: 'compy', pos: rel(D.HOLD_FENCE, 62, D.FENCE_SIDE), entry: 'leap', t: 1.4, count: 2, every: 0.4 },
        ],
      },
    ],
  },
  // ── 2. Raptor pack chasing alongside. ──
  {
    kind: 'move',
    label: 'raptor pack',
    to: D.HOLD_VISITOR,
    speed: 12,
    onStart: (w) => w.audio.play('engine_rev', { volume: 0.8 }),
    pickups: [{ kind: 'points', pos: [-2.6, 2.4, 66] }],
    waves: [
      {
        start: { atD: 60 },
        spawns: [
          { type: 'raptor', pos: [7, 0, 9], entry: 'leap', opts: { variant: 'tan' } },
          { type: 'raptor', pos: [-7.5, 0, 12], entry: 'leap', t: 0.7, opts: { variant: 'tan' } },
        ],
      },
      {
        start: { atD: 94 },
        spawns: [{ type: 'compy', pos: [-2.5, 0, 18], count: 4, every: 0.25, offset: [1.4, 0, 0.5] }],
      },
      {
        start: { atD: 116 },
        spawns: [
          { type: 'ptero', pos: [-6, 10, 24], entry: 'fly' },
          { type: 'raptor', pos: [7.5, 0, 10], entry: 'leap', t: 0.6, opts: { variant: 'blue' } },
        ],
      },
      {
        start: { atD: 138 },
        spawns: [
          { type: 'raptor', pos: [-7.5, 0, 9], entry: 'leap', opts: { variant: 'red' } },
          { type: 'raptor', pos: [7.5, 0, 13], entry: 'leap', t: 0.5, opts: { variant: 'tan' } },
        ],
      },
    ],
  },
  // ── 3. The dark visitor centre: compys swarm the plaza. ──
  {
    kind: 'hold',
    label: 'visitor centre',
    look: { at: rel(D.HOLD_VISITOR, 180, -11, 2.2), blend: 0.9 },
    civilians: [{ pos: rel(D.HOLD_VISITOR, 175, -6.2), variant: 'scientist' }],
    pickups: [{ kind: 'health', pos: rel(D.HOLD_VISITOR, 174, -2.6, 2.4), t: 2 }],
    onStart: (w) => w.later(0.5, () => park()?.strike(w)),
    waves: [
      {
        spawns: [
          { type: 'compy', pos: rel(D.HOLD_VISITOR, 181, -6.5), entry: 'leap', count: 5, every: 0.35, offset: [0.8, 0, -0.5] },
          { type: 'dilo', pos: rel(D.HOLD_VISITOR, 191, -15), t: 1.2 },
        ],
      },
      {
        start: { remaining: 1 },
        spawns: [
          { type: 'raptor', pos: rel(D.HOLD_VISITOR, 160, -14), entry: 'leap', opts: { variant: 'green' } },
          { type: 'compy', pos: rel(D.HOLD_VISITOR, 179, 4.5), entry: 'leap', t: 0.6, count: 3, every: 0.35, offset: [0.4, 0, 0.8] },
        ],
      },
    ],
  },
  // Set piece: raptors smash the visitor-centre doors open.
  {
    kind: 'action',
    label: 'doors burst',
    look: { at: [DOOR[0], 2.4, DOOR[2]], blend: 0.6 },
    run: (w) => {
      park()?.burstDoors(w);
      w.hud.prompt('INCOMING!');
    },
  },
  {
    kind: 'hold',
    label: 'raptors burst out',
    look: { at: [DOOR[0] * 0.6, 1.8, DOOR[2] * 0.8], blend: 0.8 },
    waves: [
      {
        spawns: [
          { type: 'raptor', pos: DOOR, entry: 'burst', t: 0.15, opts: { variant: 'red' } },
          { type: 'raptor', pos: [DOOR[0] + 0.8, 0, DOOR[2] - 1.2], entry: 'burst', t: 0.7, opts: { variant: 'tan' } },
          { type: 'raptor', pos: [DOOR[0] - 0.6, 0, DOOR[2] + 1], entry: 'burst', t: 1.5, opts: { variant: 'tan' } },
        ],
      },
      {
        start: { remaining: 1 },
        spawns: [
          { type: 'dilo', pos: rel(D.HOLD_VISITOR, 179, 10) },
          { type: 'compy', pos: rel(D.HOLD_VISITOR, 184, -6), entry: 'leap', t: 0.5, count: 4, every: 0.3, offset: [0.6, 0, -0.6] },
        ],
      },
    ],
  },
  // ── 4. Pteranodons out of the storm. ──
  {
    kind: 'move',
    label: 'storm road',
    to: D.HOLD_ROADBLOCK,
    speed: 10,
    onStart: (w) => {
      w.audio.play('engine_rev', { volume: 0.7 });
      w.later(2.2, () => {
        park()?.strike(w);
        w.audio.play('roar_distant', { volume: 0.9 });
      });
    },
    waves: [
      {
        start: { atD: 180 },
        spawns: [
          { type: 'ptero', pos: [-5, 10, 24], entry: 'fly' },
          { type: 'ptero', pos: [6, 11, 28], entry: 'fly', t: 0.7 },
        ],
      },
      {
        start: { atD: 204 },
        spawns: [{ type: 'compy', pos: [2, 0, 18], count: 4, every: 0.25, offset: [-1.2, 0, 0.4] }],
      },
      {
        start: { atD: 220 },
        spawns: [{ type: 'raptor', pos: [8, 0, 10], entry: 'leap', opts: { variant: 'blue' } }],
      },
    ],
  },
  // ── 5. Roadblock: dilophosaurs behind an overturned tour car. ──
  {
    kind: 'hold',
    label: 'roadblock',
    look: { at: rel(D.HOLD_ROADBLOCK, D.ROADBLOCK, 0, 1.6), blend: 0.8 },
    onStart: (w) => {
      park()?.spawnRoadblockDrums(w);
      w.later(4, () => {
        if (!park()?.roadblockBlasted) w.hud.prompt('SHOOT THE FUEL DRUMS!');
      });
    },
    civilians: [{ pos: rel(D.HOLD_ROADBLOCK, 244, -5.4), variant: 'ranger' }],
    pickups: [{ kind: 'bomb', pos: rel(D.HOLD_ROADBLOCK, 246, 3.2, 2.3), t: 2 }],
    waves: [
      {
        spawns: [
          { type: 'dilo', pos: rel(D.HOLD_ROADBLOCK, 250.5, -5), t: 0.3 },
          { type: 'dilo', pos: rel(D.HOLD_ROADBLOCK, 251.5, 5.8), t: 1.1 },
        ],
      },
      {
        start: { remaining: 1 },
        spawns: [
          { type: 'raptor', pos: [12, 0, 9], entry: 'leap', opts: { variant: 'blue' } },
          { type: 'raptor', pos: [-11, 0, 11], entry: 'leap', t: 0.7, opts: { variant: 'tan' } },
        ],
      },
      {
        // Last push only once the road is clear (keeps the peak under the mobile draw-call budget).
        start: { remaining: 0 },
        spawns: [
          { type: 'compy', pos: rel(D.HOLD_ROADBLOCK, 257, -1.5), entry: 'leap', t: 1.2, count: 3, every: 0.35, offset: [1.2, 0, 0] },
          { type: 'dilo', pos: rel(D.HOLD_ROADBLOCK, 254, 1), t: 1.8 },
          { type: 'raptor', pos: rel(D.HOLD_ROADBLOCK, 259, 5), entry: 'leap', t: 3.8, opts: { variant: 'red' } },
        ],
      },
    ],
  },
  {
    kind: 'action',
    label: 'blast the roadblock',
    run: (w) => park()?.blastRoadblock(w),
  },
  { kind: 'wait', label: 'debris settles', duration: 1.4 },
  // ── 6. Jungle road. ──
  {
    kind: 'move',
    label: 'jungle road',
    to: D.HOLD_MUD,
    speed: 10,
    onStart: (w) => {
      // (Debug jumps can skip the blast beat — never drive through the roadblock.)
      if (!park()?.roadblockBlasted) park()?.blastRoadblock(w);
      w.audio.play('engine_rev', { volume: 0.8 });
      w.later(3.5, () => w.audio.play('roar_distant', { volume: 1, pitch: 0.9 }));
    },
    pickups: [{ kind: 'points', pos: [3, 2.3, 40] }],
    waves: [
      {
        start: { atD: 256 },
        spawns: [
          { type: 'raptor', pos: [-7, 0, 9], entry: 'leap', opts: { variant: 'tan' } },
          { type: 'raptor', pos: [7, 0, 11], entry: 'leap', t: 0.5, opts: { variant: 'green' } },
        ],
      },
      {
        start: { atD: 272 },
        spawns: [{ type: 'compy', pos: [1, 0, 18], count: 3, every: 0.3, offset: [1, 0, 0] }],
      },
      {
        start: { atD: 285 },
        spawns: [
          { type: 'raptor', pos: [-8, 0, 12], entry: 'leap', opts: { variant: 'red' } },
          { type: 'ptero', pos: [5, 10, 22], entry: 'fly', t: 0.6 },
        ],
      },
    ],
  },
  // ── 7. Bogged down in the mud: hold out while the wheels spin. ──
  {
    kind: 'hold',
    label: 'stuck in the mud',
    look: { at: [0, 1.6, 13], blend: 0.8 },
    minTime: 13,
    onStart: (w) => {
      const env = park();
      if (env) env.mud = true;
      w.audio.play('engine_rev', { volume: 1, pitch: 0.8 });
      w.hud.prompt("WE'RE STUCK! HOLD THEM OFF!");
    },
    onEnd: (w) => {
      const env = park();
      if (env) env.mud = false;
      w.audio.play('engine_rev', { volume: 1, pitch: 1.1 });
      w.hud.prompt('WE\'RE FREE!');
    },
    civilians: [{ pos: rel(D.HOLD_MUD, 312, -4.4), variant: 'worker' }],
    pickups: [{ kind: 'health', pos: [-3.5, 2.3, 10], t: 3 }],
    waves: [
      {
        spawns: [
          { type: 'raptor', pos: [-9, 0, 12], entry: 'leap', opts: { variant: 'tan' } },
          { type: 'raptor', pos: [9, 0, 13], entry: 'leap', t: 0.6, opts: { variant: 'tan' } },
          { type: 'compy', pos: [-1, 0, 17], t: 1.2, count: 3, every: 0.3, offset: [1, 0, 0] },
        ],
      },
      {
        start: { remaining: 1 },
        spawns: [
          { type: 'ptero', pos: [-6, 10, 22], entry: 'fly' },
          { type: 'dilo', pos: [6.5, 0, 15], t: 0.5 },
          { type: 'compy', pos: [-3, 0, 11], entry: 'leap', t: 1, count: 3, every: 0.3, offset: [1.2, 0, 0.6] },
        ],
      },
      {
        // The pack's final rush once the road is clear (keeps the draw-call peak in budget).
        start: { remaining: 0 },
        spawns: [
          { type: 'raptor', pos: [-10, 0, 8], entry: 'leap', t: 0.8, opts: { variant: 'blue' } },
          { type: 'raptor', pos: [10, 0, 9], entry: 'leap', t: 1.3, opts: { variant: 'red' } },
          { type: 'raptor', pos: [0, 0, 19], entry: 'leap', t: 1.9, opts: { variant: 'green' } },
        ],
      },
    ],
  },
  // ── 8. The trestle bridge: pteranodons dive out of the storm. ──
  {
    kind: 'move',
    label: 'bridge',
    to: D.COLLAPSE_STOP,
    speed: 9,
    waitClear: true,
    onStart: (w) => w.later(5, () => w.audio.play('roar_distant', { volume: 1, pitch: 0.85 })),
    pickups: [{ kind: 'bomb', pos: [-2.4, 2.4, 52] }],
    waves: [
      {
        start: { atD: 324 },
        spawns: [
          { type: 'ptero', pos: [-8, 9, 24], entry: 'fly' },
          { type: 'ptero', pos: [7, 10, 28], entry: 'fly', t: 0.6 },
        ],
      },
      {
        start: { atD: 350 },
        spawns: [
          { type: 'ptero', pos: [-5, 7, 18], entry: 'fly' },
          { type: 'ptero', pos: [6, 8, 22], entry: 'fly', t: 0.5 },
        ],
      },
    ],
  },
  // Set piece: lightning brings the bridge down behind the jeep.
  {
    kind: 'action',
    label: 'bridge collapse',
    look: { yaw: 180, pitch: -7, blend: 0.8 },
    run: (w) => w.later(1.0, () => park()?.collapseBridge(w)),
  },
  { kind: 'wait', label: 'watch it fall', duration: 3.6 },
  // ── BOSS: THE TYRANT bursts out of the trees behind the jeep. ──
  {
    kind: 'boss',
    label: 'THE TYRANT',
    boss: 'tyrant',
    pos: [-14, 0, -6],
    moveTo: D.HELI_STOP,
    speed: 2.5,
    look: { yaw: 180 },
  },
  // ── Escape. ──
  {
    kind: 'move',
    label: 'to the chopper',
    to: D.HELI_STOP,
    speed: 6,
    look: { at: HELI_LOOK, world: true, blend: 0.9 },
    onStart: (w) => w.audio.playMusic('dino_drive'),
  },
  {
    kind: 'action',
    label: 'chopper spins up',
    look: { at: HELI_LOOK, world: true, blend: 1.2 },
    run: (w) => {
      park()?.heliSpinUp();
      w.audio.play('helicopter', { volume: 0.9 });
      w.hud.prompt('GET TO THE CHOPPER!');
    },
  },
  { kind: 'wait', label: 'rotors', duration: 2.2, look: { at: HELI_LOOK, world: true, blend: 0.6 } },
  { kind: 'move', label: 'board', to: D.BOARD, speed: 5, look: { at: HELI_LOOK, world: true, blend: 1 } },
  {
    kind: 'action',
    label: 'lift-off',
    run: (w) => board(w),
  },
  {
    kind: 'move',
    label: 'escape',
    to: D.END,
    speed: 5.5,
    look: { at: PAD_LOOK, world: true, blend: 1.2 },
    onStart: (w) => {
      w.audio.play('helicopter', { volume: 1 });
      w.later(1.6, () => w.hud.banner('ESCAPED!', 'PRIMAL ISLAND CLEARED', 3.6));
    },
  },
  { kind: 'wait', label: 'fly away', duration: 1.8 },
];

/** Board the helicopter: swap the jeep view for the cabin, park the jeep on the pad, jump the rig to the chopper. */
function board(w: World) {
  const env = park();
  w.hud.flash('#000000', 0.6);
  viewModel?.boardHelicopter();
  if (env) {
    env.hideHeli();
    const jeep = buildJeepBody(env.baker);
    jeep.position.copy(w.rig.space.position);
    jeep.rotation.y = w.rig.space.rotation.y + 0.15;
    env.root.add(jeep);
  }
  w.rig.d = D.LIFT_FROM;
  w.rig.moveTo(D.LIFT_FROM, 1);
  w.rig.update(0);
}

export const stage: StageDef = {
  id: 'd3',
  campaign: 'dino',
  index: 2,
  name: 'TYRANT CHASE',
  tagline: 'Outrun the king. Reach the chopper.',
  rail: RAIL,
  mode: 'drive',
  weapon: 'turret',
  music: 'dino_drive',
  beats,
  buildEnvironment: (world) => buildPark(world),
  setup(world) {
    viewModel?.dispose();
    const env = park();
    if (!env) return;
    const vm = new JeepViewModel(world, env.baker);
    viewModel = vm;
    world.rig.viewModelHolder.add(vm.root);
    env.onUpdate = (dt) => {
      vm.mud = env.mud;
      vm.update(dt);
    };
    const environment = world.env;
    if (environment) {
      const inner = environment.dispose;
      environment.dispose = () => {
        inner?.();
        vm.dispose();
        if (viewModel === vm) viewModel = null;
      };
    }
  },
};
