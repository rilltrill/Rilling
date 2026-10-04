import * as THREE from 'three';
import type { Beat, StageDef } from '../../../gameplay/StageTypes';
import type { World } from '../../../gameplay/World';
import type { V3 } from '../../../core/types';
import { D, RAIL, rel, worldAt } from './layout';
import { buildPark, park } from './env';
import { JeepViewModel, buildJeepBody } from './jeep';
import { perch, type PerchedCivilian } from './civilian';
import { atDistance, lightningTree, when } from './hazards';
import './alpha';
import './boss';

/**
 * PRIMAL ISLAND · STAGE 3 — TYRANT CHASE (campaign finale)
 *
 * Night, violent thunderstorm. The ranger jeep flees through the park toward
 * the helipad: the T-rex paddock's torn fence (compys + raptors spill through
 * the gap) → raptor pack chasing alongside (the red ALPHA springs an ambush
 * with its pack) → the dark visitor centre (compys on the plaza, then the alpha
 * and its pack smash the doors open) → pteranodons out of the storm
 * (and a pack ambush) → a roadblock with dilophosaurs (blow the fuel drums) →
 * another pack ambush on the jungle road → the jeep bogs down in the mud and
 * must hold out (the alpha's last ambush) → the trestle bridge (pteranodons;
 * lightning brings it down behind you) → THE TYRANT bursts out of the trees
 * and chases the jeep to the helipad → shoot the fuel tank as it lunges → the
 * last of the pack on the pad → helicopter escape.
 *
 * Pressure curve: the finale's regular fights carry real threat through the
 * alpha pack (see alpha.ts: red = alpha, it takes sustained fire to break its
 * pounce and its pack pounces with it), so the Tyrant isn't the only thing
 * that can hurt you; the Tyrant itself is tuned in boss.ts (TYRANT_TUNE).
 */

let viewModel: JeepViewModel | null = null;

const v3 = (v: THREE.Vector3): V3 => [Math.round(v.x * 100) / 100, Math.round(v.y * 100) / 100, Math.round(v.z * 100) / 100];
const HELI_LOOK = v3(worldAt(D.HELI, 0, 2.6));
const PAD_LOOK = v3(worldAt(D.PAD - 9, -1, 0));
const DOOR = rel(D.HOLD_VISITOR, D.VISITOR, D.VISITOR_SIDE + 2.5);

// Civilians stand OUT of the attack lanes: out at the side of the frame (≈ 37°
// off the view axis — still inside the 39° the engine guarantees on portrait /
// 4:3 screens), farther away than the dinos' striking ring, or perched above
// them — and every leap / approach in their hold comes from the other side, so
// shots at an attacker never pass through them. Attackers enter through the
// middle of the view, clear of the HUD corners.
const SCIENTIST = rel(D.HOLD_VISITOR, 180, -1.2);
const RANGER = rel(D.HOLD_ROADBLOCK, 246.5, 6.5);

/** The mud hold's worker, perched on his truck (spawned by hand: the runner grounds its civilians). */
let worker: PerchedCivilian | null = null;

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
    speed: 8,
    look: { at: rel(0, 60, D.FENCE_SIDE - 2, 2), blend: 1.2 },
    onStart: (w) => w.audio.play('engine_rev', { volume: 0.7 }),
    pickups: [{ kind: 'points', pos: [-2.2, 2.5, 30], t: 0.3 }],
    waves: [
      {
        // A couple of scouts dart out of the ferns: first targets while the fence comes into view.
        start: { atD: 8 },
        spawns: [
          { type: 'compy', pos: [-4, 0, 17], entry: 'leap' },
          { type: 'compy', pos: [-2.5, 0, 19.5], entry: 'leap', t: 0.4 },
        ],
      },
    ],
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
        // The pack comes through: a pair from the gap and the road…
        start: { remaining: 1 },
        spawns: [
          { type: 'raptor', pos: rel(D.HOLD_FENCE, 57, D.FENCE_SIDE + 1.5), entry: 'leap', hp: 1.3, opts: { variant: 'green' } },
          { type: 'raptor', pos: [-7, 0, 19], entry: 'leap', t: 0.5, hp: 1.3, opts: { variant: 'tan' } },
          { type: 'compy', pos: rel(D.HOLD_FENCE, 62, D.FENCE_SIDE), entry: 'leap', t: 1.6, count: 2, every: 0.4 },
        ],
      },
      {
        // …and a straggler as soon as the first falls (staggered: keeps the draw-call peak down).
        start: { remaining: 3 },
        spawns: [{ type: 'raptor', pos: rel(D.HOLD_FENCE, 64, D.FENCE_SIDE + 1), entry: 'leap', t: 0.3, hp: 1.3, opts: { variant: 'tan' } }],
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
        // A flanking pair, one on each side of the jeep.
        start: { atD: 58 },
        spawns: [
          { type: 'raptor', pos: [7, 0, 11], entry: 'leap', hp: 1.3, opts: { variant: 'tan' } },
          { type: 'raptor', pos: [-7.5, 0, 12], entry: 'leap', t: 0.3, hp: 1.3, opts: { variant: 'tan' } },
        ],
      },
      {
        start: { atD: 90 },
        spawns: [
          { type: 'compy', pos: [-2.5, 0, 18], count: 4, every: 0.25, offset: [1.4, 0, 0.5] },
          { type: 'ptero', pos: [6, 10, 26], entry: 'fly', t: 0.6 },
        ],
      },
      {
        start: { atD: 110 },
        spawns: [
          { type: 'raptor', pos: [7.5, 0, 10], entry: 'leap', hp: 1.3, opts: { variant: 'blue' } },
          { type: 'raptor', pos: [-7, 0, 13], entry: 'leap', t: 0.4, hp: 1.3, opts: { variant: 'green' } },
        ],
      },
      {
        // AMBUSH: the alpha and its pack spring out of the ferns ahead and pounce as
        // they land (the leaps carry them to ~8–9 m, in the middle of the view).
        // Early enough to be over before the visitor-centre hold (whose scientist
        // stands at the right edge of the frame).
        start: { atD: 128 },
        spawns: [
          { type: 'raptor_alpha', pos: [-6, 0, 14.5], entry: 'leap', opts: { ambush: true } },
          { type: 'raptor_pack', pos: [4, 0, 15], entry: 'leap', t: 0.15, hp: 1.3, opts: { variant: 'tan', ambush: true } },
          { type: 'raptor_pack', pos: [0.5, 0, 16.5], entry: 'leap', t: 0.3, hp: 1.3, opts: { variant: 'blue', ambush: true } },
        ],
      },
    ],
  },
  // ── 3. The dark visitor centre: compys swarm the plaza. ──
  {
    kind: 'hold',
    label: 'visitor centre',
    look: { at: rel(D.HOLD_VISITOR, 180, -11, 2.2), blend: 0.9 },
    // Out on the road at the right edge of the frame; the pack comes across the plaza on the left.
    civilians: [{ pos: SCIENTIST, variant: 'scientist' }],
    pickups: [{ kind: 'health', pos: rel(D.HOLD_VISITOR, 174, -2.6, 2.4), t: 2 }],
    onStart: (w) => w.later(0.5, () => park()?.strike(w)),
    waves: [
      {
        spawns: [
          { type: 'compy', pos: rel(D.HOLD_VISITOR, 181, -6.5), entry: 'leap', count: 5, every: 0.35, offset: [-0.8, 0, -0.5] },
          { type: 'dilo', pos: rel(D.HOLD_VISITOR, 191, -15), t: 1.2 },
        ],
      },
      {
        start: { remaining: 1 },
        spawns: [
          { type: 'raptor', pos: rel(D.HOLD_VISITOR, 194, -9), entry: 'leap', hp: 1.3, opts: { variant: 'green' } },
          { type: 'compy', pos: rel(D.HOLD_VISITOR, 186, -10), entry: 'leap', t: 0.6, count: 3, every: 0.35, offset: [-0.8, 0, 0.6] },
          { type: 'raptor', pos: rel(D.HOLD_VISITOR, 196, -16), entry: 'leap', t: 1.1, hp: 1.3, opts: { variant: 'tan' } },
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
        // Three at once out of the doors.
        spawns: [
          // The alpha leads; the pack charges across the plaza and pounces as soon as it's in reach.
          { type: 'raptor_alpha', pos: DOOR, entry: 'burst', t: 0.15, opts: { ambush: true } },
          { type: 'raptor_pack', pos: [DOOR[0] + 0.8, 0, DOOR[2] - 1.2], entry: 'burst', t: 0.5, hp: 1.3, opts: { variant: 'tan', ambush: true } },
          { type: 'raptor_pack', pos: [DOOR[0] - 0.6, 0, DOOR[2] + 1], entry: 'burst', t: 0.85, hp: 1.3, opts: { variant: 'tan', ambush: true } },
        ],
      },
      {
        // Once the pack is down — a breath while the bodies sink (keeps the
        // draw-call peak down), then a spitter and compys across the plaza.
        start: { remaining: 0 },
        spawns: [
          { type: 'dilo', pos: rel(D.HOLD_VISITOR, 190, -22), t: 1.2 },
          { type: 'compy', pos: rel(D.HOLD_VISITOR, 186, -12), entry: 'leap', t: 1.9, count: 3, every: 0.3, offset: [-0.6, 0, -0.6] },
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
      // The storm splits a palm ahead just as the pack springs its ambush (atD 218).
      const onRoad = () => w.rig.d < D.HOLD_ROADBLOCK - 6;
      atDistance(w, 215, () => lightningTree(w, [-5, 4.5, 22], 2, onRoad), onRoad);
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
        // (Early enough that their bodies are left behind before the ambush at 218.)
        start: { atD: 196 },
        spawns: [{ type: 'compy', pos: [2, 0, 18], count: 4, every: 0.25, offset: [-1.2, 0, 0.4] }],
      },
      {
        // A lone hunter runs ahead of the pack.
        start: { atD: 205 },
        spawns: [{ type: 'raptor', pos: [-7.5, 0, 12], entry: 'leap', hp: 1.3, opts: { variant: 'green' } }],
      },
      {
        // Three of the pack spring out of the ferns ahead and pounce as they land.
        start: { atD: 218 },
        spawns: [
          { type: 'raptor_pack', pos: [6, 0, 14.5], entry: 'leap', hp: 1.3, opts: { variant: 'blue', ambush: true } },
          { type: 'raptor_pack', pos: [-5.5, 0, 15], entry: 'leap', t: 0.2, hp: 1.3, opts: { variant: 'tan', ambush: true } },
          { type: 'raptor_pack', pos: [0.5, 0, 16.5], entry: 'leap', t: 0.35, hp: 1.3, opts: { variant: 'green', ambush: true } },
        ],
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
    // On the cleared right verge, at the edge of the frame; everything comes in from the left and ahead.
    civilians: [{ pos: RANGER, variant: 'ranger' }],
    pickups: [{ kind: 'bomb', pos: rel(D.HOLD_ROADBLOCK, 246, -2.2, 2.3), t: 2 }],
    waves: [
      {
        spawns: [
          { type: 'dilo', pos: rel(D.HOLD_ROADBLOCK, 250.5, -5), t: 0.3 },
          { type: 'dilo', pos: rel(D.HOLD_ROADBLOCK, 256, -1.5), t: 1.1 },
        ],
      },
      {
        start: { remaining: 1 },
        spawns: [
          { type: 'raptor', pos: [-10, 0, 14], entry: 'leap', hp: 1.3, opts: { variant: 'blue' } },
          { type: 'raptor', pos: [-2, 0, 22], entry: 'leap', t: 0.4, hp: 1.3, opts: { variant: 'tan' } },
        ],
      },
      {
        // Last push only once the road is clear (keeps the peak under the mobile draw-call budget).
        start: { remaining: 0 },
        spawns: [
          { type: 'compy', pos: rel(D.HOLD_ROADBLOCK, 257, -3), entry: 'leap', t: 0.6, count: 3, every: 0.35, offset: [1, 0, 0] },
          { type: 'dilo', pos: rel(D.HOLD_ROADBLOCK, 254, -1), t: 1.2 },
          { type: 'raptor', pos: rel(D.HOLD_ROADBLOCK, 259, -4), entry: 'leap', t: 2.2, hp: 1.3, opts: { variant: 'tan' } },
          { type: 'raptor', pos: [-10, 0, 13], entry: 'leap', t: 2.6, hp: 1.3, opts: { variant: 'green' } },
        ],
      },
    ],
  },
  {
    kind: 'action',
    label: 'blast the roadblock',
    run: (w) => park()?.blastRoadblock(w),
  },
  { kind: 'wait', label: 'debris settles', duration: 1.2 },
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
      // Lightning splits a palm ahead on the right just as the pack springs its ambush (atD 284).
      const onRoad = () => w.rig.d < D.HOLD_MUD - 8;
      atDistance(w, 281, () => lightningTree(w, [5.5, 4.5, 22], 2, onRoad), onRoad);
    },
    pickups: [{ kind: 'points', pos: [3, 2.3, 40] }],
    waves: [
      {
        start: { atD: 256 },
        spawns: [
          { type: 'raptor', pos: [-7, 0, 9], entry: 'leap', hp: 1.3, opts: { variant: 'tan' } },
          { type: 'raptor', pos: [7, 0, 11], entry: 'leap', t: 0.3, hp: 1.3, opts: { variant: 'green' } },
        ],
      },
      {
        start: { atD: 270 },
        spawns: [
          { type: 'compy', pos: [1, 0, 18], count: 3, every: 0.3, offset: [1, 0, 0] },
          { type: 'ptero', pos: [-6, 10, 24], entry: 'fly', t: 0.3 },
        ],
      },
      {
        start: { atD: 284 },
        spawns: [
          // Another three out of the ferns, pouncing as they land.
          { type: 'raptor_pack', pos: [-5, 0, 15], entry: 'leap', hp: 1.3, opts: { variant: 'green', ambush: true } },
          { type: 'raptor_pack', pos: [6, 0, 14.5], entry: 'leap', t: 0.2, hp: 1.3, opts: { variant: 'blue', ambush: true } },
          { type: 'raptor_pack', pos: [1, 0, 16.5], entry: 'leap', t: 0.35, hp: 1.3, opts: { variant: 'tan', ambush: true } },
        ],
      },
    ],
  },
  // ── 7. Bogged down in the mud: hold out while the wheels spin. ──
  {
    kind: 'hold',
    label: 'stuck in the mud',
    // (Turned a touch left so the worker on his truck stays in frame on narrow screens.)
    look: { at: [-0.9, 1.6, 13], blend: 0.8 },
    minTime: 13,
    onStart: (w) => {
      const env = park();
      if (env) {
        env.mud = true;
        // The truck driver waits it out on his flatbed (left edge of the frame, above the fray).
        worker = perch(w, env.mudPerch, 'worker');
      }
      w.audio.play('engine_rev', { volume: 1, pitch: 0.8 });
      w.hud.prompt("WE'RE STUCK! HOLD THEM OFF!");
      // The storm joins the alpha's ambush: as the pack springs, a palm on the
      // right of the road (away from the worker) is struck and showers the jeep.
      const inMud = () => !!park()?.mud;
      when(
        w,
        () => w.enemies().some((e) => e.name === 'alpha'),
        () => w.later(0.6, () => lightningTree(w, [5.5, 4.5, 18], 3, inMud)),
        inMud,
      );
    },
    onEnd: (w) => {
      const env = park();
      if (env) env.mud = false;
      if (worker && !worker.removed) worker.rescue();
      worker = null;
      w.audio.play('engine_rev', { volume: 1, pitch: 1.1 });
      w.hud.prompt('WE\'RE FREE!');
    },
    pickups: [{ kind: 'health', pos: [1.5, 2.3, 10], t: 3 }],
    waves: [
      {
        spawns: [
          { type: 'raptor', pos: [-3, 0, 19], entry: 'leap', hp: 1.3, opts: { variant: 'tan' } },
          { type: 'raptor', pos: [8, 0, 14], entry: 'leap', t: 0.4, hp: 1.3, opts: { variant: 'tan' } },
          { type: 'compy', pos: [0, 0, 17], t: 1.2, count: 3, every: 0.3, offset: [1, 0, 0] },
        ],
      },
      {
        // (Spaced out a little so the first wave's bodies have sunk before the
        // compys arrive: keeps the draw-call peak down.)
        start: { remaining: 1 },
        spawns: [
          { type: 'ptero', pos: [4, 10, 22], entry: 'fly', t: 0.6 },
          { type: 'dilo', pos: [6.5, 0, 15], t: 1.2 },
          { type: 'compy', pos: [2, 0, 13], entry: 'leap', t: 2.2, count: 3, every: 0.3, offset: [1.2, 0, 0.6] },
        ],
      },
      {
        // The pack's final rush once the road is clear (keeps the draw-call peak in budget).
        start: { remaining: 0 },
        spawns: [
          // AMBUSH out of the reeds ahead and on the right (away from the worker on
          // the left) — after a short lull, once the last wave's bodies have sunk.
          { type: 'raptor_alpha', pos: [-2.5, 0, 16.5], entry: 'leap', t: 1.6, opts: { ambush: true } },
          { type: 'raptor_pack', pos: [6, 0, 14.5], entry: 'leap', t: 1.75, hp: 1.3, opts: { variant: 'blue', ambush: true } },
          { type: 'raptor_pack', pos: [2, 0, 17.5], entry: 'leap', t: 1.9, hp: 1.3, opts: { variant: 'green', ambush: true } },
        ],
      },
      {
        // A flier out of the storm for the last one standing (staggered for the draw-call budget).
        start: { remaining: 1 },
        spawns: [{ type: 'ptero', pos: [-3, 10, 24], entry: 'fly', t: 0.3 }],
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
        start: { atD: 318 },
        spawns: [
          { type: 'ptero', pos: [-8, 9, 24], entry: 'fly' },
          { type: 'ptero', pos: [7, 10, 28], entry: 'fly', t: 0.6 },
        ],
      },
      {
        start: { atD: 352 },
        spawns: [
          { type: 'ptero', pos: [-5, 7, 18], entry: 'fly' },
          { type: 'ptero', pos: [6, 8, 22], entry: 'fly', t: 0.4 },
          { type: 'ptero', pos: [0, 10, 28], entry: 'fly', t: 0.9 },
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
  { kind: 'wait', label: 'watch it fall', duration: 3.2 },
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
  {
    // While the rotors spin up, the last of the pack breaks out of the treeline
    // at the edges of the pad: one final shootable beat after the Tyrant falls
    // (no long empty stretch before the escape).
    kind: 'hold',
    label: 'last of the pack',
    minTime: 1.2,
    timeout: 14,
    look: { at: HELI_LOOK, world: true, blend: 0.6 },
    waves: [
      {
        spawns: [
          { type: 'raptor', pos: [-8, 0, 15], entry: 'leap', t: 0.3, opts: { variant: 'tan' } },
          { type: 'raptor', pos: [7.5, 0, 17], entry: 'leap', t: 0.8, opts: { variant: 'green' } },
        ],
      },
    ],
  },
  { kind: 'move', label: 'board', to: D.BOARD, speed: 10, look: { at: HELI_LOOK, world: true, blend: 1 } },
  {
    kind: 'action',
    label: 'lift-off',
    run: (w) => board(w),
  },
  {
    // The chopper climbs away over the pad. The stage clears mid-climb: the
    // world keeps running under the results card's 1.8 s lead-in, so the shot
    // never stops moving and there's no dead air after the last kill.
    kind: 'action',
    label: 'escape',
    look: { at: PAD_LOOK, world: true, blend: 1.2 },
    run: (w) => {
      w.rig.moveTo(D.END, 12);
      w.audio.play('helicopter', { volume: 1 });
      w.later(0.4, () => w.hud.banner('ESCAPED!', 'PRIMAL ISLAND CLEARED', 3.6));
    },
  },
  { kind: 'wait', label: 'fly away', duration: 3.6, look: { at: PAD_LOOK, world: true, blend: 1.2 } },
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
    worker = null;
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
