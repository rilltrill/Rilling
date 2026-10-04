import * as THREE from 'three';
import type { V3 } from '../../../core/types';
import type { Beat, SpawnDef, StageDef } from '../../../gameplay/StageTypes';
import type { World } from '../../../gameplay/World';
import { EnvKit } from '../../kit/EnvKit';
import { CURVE, D, PUMP_SIDE_Z, RAIL, TUNNEL, TUNNEL_SPOTS } from './layout';
import { buildLabs, labs } from './env';
import { propaneTank } from './setpieces';

import './boss';

/**
 * PRIMAL ISLAND · STAGE 2 — RESEARCH LABS
 *
 * On foot through the island's visitor & research complex after the
 * containment failure. Emergency power: cool white fill, slow red beacons,
 * green lab glow.
 *
 *   lobby       raptors drop off the mezzanine, burst through a staff door…
 *               then the giant skeleton display comes crashing down
 *   gift shop   compys pour out of the ceiling vents, a raptor bursts from the
 *               stock room; a scientist hides behind the till
 *   atrium      dilos spit from the planting beds, a raptor pack flanks
 *   hatchery    raptors blow the lab doors off; hatchlings; a second scientist
 *   kitchen     raptors stalking between the counters, the freezer door flies
 *   servers     blinking racks, compys in the cable trays
 *   tunnels     steam, red strobes, an alcove ambush; pump-room pack + gas tanks
 *   containment a triceratops smashes out of its glass enclosure
 *   BOSS        SPECIMEN X in the holding hall
 */

/** World-space spawn helper. */
const at = (type: string, x: number, y: number, z: number, o: Partial<SpawnDef> = {}): SpawnDef => ({
  type,
  pos: [x, y, z],
  world: true,
  frame: 'world',
  ...o,
});
const W = (x: number, y: number, z: number): V3 => [x, y, z];

/** Point on the rail (world) at distance d, `side` metres right, `up` metres up. */
const onRail = (d: number, side = 0, up = 0): V3 => {
  const p = EnvKit.besideRail(CURVE, d, side, up);
  return [p.x, p.y, p.z];
};

/** Spawn point just behind a doorway on the line from the player through the door. */
const behindDoor = (door: [number, number], player: [number, number], dist = 1.6): [number, number] => {
  const dx = door[0] - player[0];
  const dz = door[1] - player[1];
  const l = Math.hypot(dx, dz);
  return [door[0] + (dx / l) * dist, door[1] + (dz / l) * dist];
};

function popup(w: World, text: string, x = 0.5, y = 0.3) {
  w.hud.popup(text, w.viewport.width * x, w.viewport.height * y, 'warning');
}

const PLAYER = {
  lobby: [2.48, -11] as [number, number],
  shop: [0, -61] as [number, number],
  hatch: [0.26, -131] as [number, number],
  kitchen: [0, -167] as [number, number],
};
const staffSpawn = behindDoor([15, -37], PLAYER.lobby, 1.8);
const stockSpawn = behindDoor([-8, -74.3], PLAYER.shop, 1.7);
const labLSpawn = behindDoor([-10, -143], PLAYER.hatch, 1.7);
const labRSpawn = behindDoor([10, -149], PLAYER.hatch, 1.7);
const freezerSpawn = behindDoor([9, -183.5], PLAYER.kitchen, 1.7);
const vent1 = onRail(TUNNEL_SPOTS.vents[0], 0.4, 3.2);
const vent2 = onRail(TUNNEL_SPOTS.vents[1], -0.4, 3.2);
const alcove = onRail(TUNNEL_SPOTS.alcove, -(TUNNEL.half + 1.2));
const tunnelEnd = onRail(D.PUMP_HOLD - 9, 0);

const beats: Beat[] = [
  {
    kind: 'banner',
    label: 'title',
    text: 'RESEARCH LABS',
    sub: 'PRIMAL ISLAND · STAGE 2',
    duration: 2.6,
    look: { at: W(-2, 4.5, -32), world: true, blend: 0.8 },
  },
  {
    kind: 'move',
    label: 'into the visitor centre',
    to: D.LOBBY_HOLD,
    speed: 2.6,
    look: { at: W(-1.5, 3.6, -32), world: true, blend: 1.6 },
    onStart: (w) => w.later(2.2, () => w.audio.play('raptor_bark', { volume: 0.5, pitch: 0.9 })),
  },
  // ── 1. Lobby: off the mezzanine, out of the staff door ──────────────────
  {
    kind: 'hold',
    label: 'lobby',
    look: { at: W(0.5, 2.2, -30), world: true, blend: 1.3 },
    pickups: [{ kind: 'shotgun', pos: W(5.2, 1.3, -21.5), world: true, t: 0.5 }],
    waves: [
      {
        spawns: [
          at('raptor', -11.2, 5.2, -29, { entry: 'leap', t: 0.8, opts: { variant: 'tan' } }),
          at('raptor', -7.0, 0, -36.5, { t: 2.6, opts: { variant: 'green' } }),
        ],
      },
      {
        start: { remaining: 0, after: 12 },
        spawns: [
          at('raptor', staffSpawn[0], 0, staffSpawn[1], { entry: 'burst', opts: { variant: 'blue' } }),
          at('raptor', -11.2, 5.2, -37, { entry: 'leap', t: 1.4, opts: { variant: 'tan' } }),
        ],
      },
      {
        start: { remaining: 1 },
        spawns: [
          at('compy', -4.0, 0, -33.8, { count: 4, every: 0.3, offset: [1.1, 0, 0.4] }),
          at('raptor', 11.2, 5.2, -44, { entry: 'leap', t: 1.6, opts: { variant: 'green' } }),
        ],
      },
    ],
  },
  // ── Set piece: the skeleton display comes down ───────────────────────────
  {
    kind: 'action',
    label: 'skeleton collapses',
    look: { at: W(-2.2, 4.2, -29), world: true, blend: 0.9 },
    run: (w) => {
      const lab = labs(w);
      w.audio.play('raptor_screech', { volume: 0.6, pitch: 0.8 });
      w.later(0.5, () => lab?.skeleton.collapse(w));
      w.later(0.5, () => popup(w, 'LOOK OUT!', 0.45, 0.28));
    },
  },
  { kind: 'wait', label: 'bones rain down', duration: 2.6, look: { at: W(-2.0, 1.2, -25.5), world: true, blend: 1.4 } },
  {
    kind: 'hold',
    label: 'bone yard',
    look: { at: W(-0.5, 1.6, -31), world: true, blend: 1.2 },
    pickups: [{ kind: 'points', pos: W(-2.4, 1.6, -24.4), world: true }],
    waves: [
      {
        spawns: [
          at('raptor', -5.0, 1.8, -30.0, { entry: 'leap', t: 0.2, opts: { variant: 'red' } }),
          at('compy', -7, 0, -33, { t: 0.9, count: 3, every: 0.3, offset: [1.2, 0, 0.3] }),
        ],
      },
      {
        start: { remaining: 1 },
        spawns: [
          at('raptor', -2, 0, -50, { opts: { variant: 'tan' } }),
          at('raptor', 4.5, 0, -48, { t: 0.8, opts: { variant: 'blue' } }),
        ],
      },
    ],
  },
  { kind: 'move', label: 'to the gift shop', to: D.SHOP_HOLD, speed: 3.5, look: { at: W(0, 1.8, -70), world: true, blend: 1.6 } },
  // ── 2. Gift shop: compys from the vents, the stock-room door ─────────────
  {
    kind: 'hold',
    label: 'gift shop',
    look: { at: W(0, 1.6, -71), world: true, blend: 1.2 },
    civilians: [{ pos: W(5.0, 0, -76.4), world: true, variant: 'scientist', t: 0.3 }],
    pickups: [{ kind: 'bomb', pos: W(-3.7, 1.35, -66.5), world: true, t: 1 }],
    onStart: (w) => w.later(1.0, () => popup(w, "DON'T SHOOT THE SCIENTIST!", 0.6, 0.26)),
    waves: [
      {
        spawns: [
          at('compy', -1.6, 4.4, -65, { entry: 'drop', t: 0.8 }),
          at('compy', 1.8, 4.4, -69, { entry: 'drop', t: 1.3 }),
          at('compy', 0, 4.4, -73.5, { entry: 'drop', t: 1.8 }),
          at('compy', -1.6, 4.4, -65, { entry: 'drop', t: 2.4 }),
        ],
      },
      {
        start: { remaining: 1 },
        spawns: [
          at('raptor', stockSpawn[0], 0, stockSpawn[1], { entry: 'burst', opts: { variant: 'green' } }),
          at('compy', 1.8, 4.4, -69, { entry: 'drop', t: 1.4 }),
          at('compy', 0, 4.4, -73.5, { entry: 'drop', t: 1.8 }),
        ],
      },
      {
        start: { remaining: 1 },
        spawns: [
          at('raptor', 5.4, 0, -71, { entry: 'leap', opts: { variant: 'tan' } }),
          at('raptor', 0, 0, -84, { t: 1.0, opts: { variant: 'tan' } }),
        ],
      },
    ],
  },
  { kind: 'move', label: 'into the atrium', to: D.GREEN_HOLD, speed: 3.4, look: { at: W(-2, 2.4, -104), world: true, blend: 1.6 } },
  // ── 3. Botanical atrium: dilos in the beds, a raptor pack flanks ─────────
  {
    kind: 'hold',
    label: 'atrium',
    look: { at: W(-1.5, 1.8, -103), world: true, blend: 1.3 },
    pickups: [{ kind: 'health', pos: W(2.6, 1.4, -96), world: true, t: 1.5 }],
    waves: [
      {
        spawns: [
          at('dilo', -9.5, 0, -100, { t: 0.5 }),
          at('dilo', 7.5, 0, -111, { t: 1.6 }),
        ],
      },
      {
        start: { remaining: 1, after: 9 },
        spawns: [
          at('raptor', -12, 0, -96, { entry: 'leap', opts: { variant: 'green' } }),
          at('raptor', 11, 0, -100, { entry: 'leap', t: 0.7, opts: { variant: 'green' } }),
          at('compy', -3, 0, -118, { t: 1.4, count: 3, every: 0.3, offset: [1.4, 0, 0] }),
        ],
      },
      {
        start: { remaining: 1 },
        spawns: [
          at('dilo', -8, 0, -112),
          at('raptor', 2, 0, -121, { t: 1.0, opts: { variant: 'red' } }),
        ],
      },
    ],
  },
  { kind: 'move', label: 'to the hatchery', to: D.HATCH_HOLD, speed: 3.5, look: { at: W(0, 1.8, -145), world: true, blend: 1.6 } },
  // ── 4. Hatchery: lab doors blown open, hatchlings ────────────────────────
  {
    kind: 'hold',
    label: 'hatchery',
    look: { at: W(0, 1.6, -144), world: true, blend: 1.2 },
    civilians: [{ pos: W(1.7, 0, -142.6), world: true, variant: 'scientist', t: 0.3 }],
    pickups: [{ kind: 'magnum', pos: W(-2.2, 1.35, -137.5), world: true, t: 1 }],
    waves: [
      {
        spawns: [
          at('raptor', labLSpawn[0], 0, labLSpawn[1], { entry: 'burst', t: 0.8, opts: { variant: 'blue' } }),
          at('compy', -4.65, 1.05, -138.7, { entry: 'leap', t: 2.0, count: 3, every: 0.45 }),
        ],
      },
      {
        start: { remaining: 1 },
        spawns: [
          at('raptor', labRSpawn[0], 0, labRSpawn[1], { entry: 'burst', opts: { variant: 'tan' } }),
          at('raptor', 4.65, 0.95, -146.7, { entry: 'leap', t: 1.1, opts: { variant: 'green' } }),
        ],
      },
      {
        start: { remaining: 1 },
        spawns: [
          at('raptor', 0, 0, -165, { opts: { variant: 'red' } }),
          at('raptor', -5, 0, -158, { t: 0.8, opts: { variant: 'tan' } }),
        ],
      },
    ],
  },
  { kind: 'move', label: 'to the kitchen', to: D.KITCHEN_HOLD, speed: 3.4, look: { at: W(0, 1.6, -180), world: true, blend: 1.6 } },
  // ── 5. Kitchen: raptors between the counters, the freezer door ───────────
  {
    kind: 'hold',
    label: 'kitchen',
    look: { at: W(0, 1.4, -180), world: true, blend: 1.2 },
    pickups: [
      { kind: 'smg', pos: W(-2.4, 1.35, -173), world: true, t: 0.8 },
      { kind: 'health', pos: W(2.4, 1.35, -174), world: true, t: 10 },
    ],
    onStart: (w) => w.later(6, () => popup(w, 'SHOOT THE GAS TANKS!', 0.5, 0.3)),
    waves: [
      {
        spawns: [
          at('raptor', -6.6, 0, -186, { t: 0.4, opts: { variant: 'tan' } }),
          at('raptor', 4.6, 0.95, -183, { entry: 'leap', t: 1.8, opts: { variant: 'green' } }),
        ],
      },
      {
        start: { remaining: 1, after: 10 },
        spawns: [
          at('raptor', freezerSpawn[0], 0, freezerSpawn[1], { entry: 'burst', opts: { variant: 'blue' } }),
          at('raptor', -4.6, 0.95, -184, { entry: 'leap', t: 1.4, opts: { variant: 'red' } }),
        ],
      },
      {
        start: { remaining: 1 },
        spawns: [
          at('raptor', 0, 0, -196, { opts: { variant: 'tan' } }),
          at('raptor', -3, 0, -194, { t: 0.7, opts: { variant: 'green' } }),
          at('compy', 3, 0, -193, { t: 1.2, count: 3, every: 0.3, offset: [-1, 0, 0] }),
        ],
      },
    ],
  },
  { kind: 'move', label: 'to the servers', to: D.SERVER_HOLD, speed: 3.4, look: { at: W(0, 1.6, -210), world: true, blend: 1.6 } },
  // ── 6. Server room ───────────────────────────────────────────────────────
  {
    kind: 'hold',
    label: 'server room',
    look: { at: W(0, 1.5, -209), world: true, blend: 1.2 },
    pickups: [{ kind: 'points', pos: W(-1.2, 1.3, -205), world: true, t: 0.5 }],
    waves: [
      {
        spawns: [
          at('compy', -1.1, 3.8, -201, { entry: 'drop', t: 0.5 }),
          at('compy', 1.1, 3.8, -206, { entry: 'drop', t: 0.9 }),
          at('compy', -1.1, 3.8, -201, { entry: 'drop', t: 1.4 }),
          at('compy', 1.1, 3.8, -206, { entry: 'drop', t: 1.8 }),
        ],
      },
      {
        start: { remaining: 1 },
        spawns: [
          at('raptor', -5, 0, -211, { opts: { variant: 'green' } }),
          at('raptor', 5, 0, -206, { t: 0.9, opts: { variant: 'tan' } }),
        ],
      },
      {
        start: { remaining: 1 },
        spawns: [
          at('raptor', 0, 0, -216.5, { entry: 'leap', opts: { variant: 'red' } }),
          at('compy', -4, 0, -216, { t: 0.6, count: 3, every: 0.3, offset: [0.8, 0, 0] }),
        ],
      },
    ],
  },
  // ── 7. Maintenance tunnels ───────────────────────────────────────────────
  {
    kind: 'move',
    label: 'maintenance tunnels',
    to: TUNNEL_SPOTS.ambush,
    speed: 3.6,
    waves: [
      {
        start: { atD: D.TUNNEL_IN - 1 },
        spawns: [at('compy', vent1[0], vent1[1], vent1[2], { entry: 'drop', count: 2, every: 0.5 })],
      },
      {
        start: { atD: TUNNEL_SPOTS.vents[0] + 1 },
        spawns: [at('compy', vent2[0], vent2[1], vent2[2], { entry: 'drop', count: 3, every: 0.45 })],
      },
    ],
  },
  {
    kind: 'hold',
    label: 'alcove ambush',
    look: { at: onRail(TUNNEL_SPOTS.alcove + 1, -1.2, 1.4), world: true, blend: 1.3 },
    waves: [
      {
        spawns: [
          at('raptor', alcove[0], 0, alcove[2], { entry: 'leap', t: 0.6, opts: { variant: 'blue' } }),
          at('raptor', tunnelEnd[0], 0, tunnelEnd[2], { t: 2.0, opts: { variant: 'tan' } }),
        ],
      },
      {
        start: { remaining: 0 },
        spawns: [at('compy', tunnelEnd[0], 0, tunnelEnd[2], { count: 4, every: 0.35 })],
      },
    ],
  },
  { kind: 'move', label: 'to the pump room', to: D.PUMP_HOLD, speed: 3.6 },
  // ── 8. Pump room: pack from both side tunnels, gas tanks ─────────────────
  {
    kind: 'hold',
    label: 'pump room',
    look: { at: W(11, 1.5, -288), world: true, blend: 1.2 },
    pickups: [{ kind: 'health', pos: W(13.2, 1.35, -283.5), world: true, t: 1 }],
    onStart: (w) => w.later(3, () => popup(w, 'GAS TANKS!', 0.5, 0.3)),
    waves: [
      {
        spawns: [
          at('raptor', -0.5, 0, PUMP_SIDE_Z, { t: 0.5, opts: { variant: 'tan' } }),
          at('compy', 22.5, 0, PUMP_SIDE_Z, { t: 1.4, count: 3, every: 0.3 }),
        ],
      },
      {
        start: { remaining: 1 },
        spawns: [
          at('raptor', -0.5, 0, PUMP_SIDE_Z - 0.5, { opts: { variant: 'blue' } }),
          at('raptor', 22.5, 0, PUMP_SIDE_Z + 0.5, { t: 0.3, opts: { variant: 'blue' } }),
          at('raptor', 11, 0, -297, { t: 1.6, opts: { variant: 'red' } }),
        ],
      },
    ],
  },
  { kind: 'move', label: 'containment wing', to: D.WING_HOLD, speed: 3.2, look: { at: W(14, 2.2, -310), world: true, blend: 1.6 } },
  // ── Set piece: something big behind the glass ────────────────────────────
  {
    kind: 'action',
    label: 'thud… thud…',
    look: { at: W(17.5, 2.4, -310.5), world: true, blend: 1.0 },
    run: (w) => {
      const cell = labs(w)?.cells[4];
      w.audio.play('trike_bellow', { volume: 0.8, pitch: 0.9 });
      w.later(0.6, () => cell?.crack(w));
      w.later(0.65, () => w.audio.play('stomp', { volume: 1, pitch: 0.6 }));
      w.later(1.5, () => cell?.crack(w));
      w.later(1.55, () => w.audio.play('stomp', { volume: 1, pitch: 0.55 }));
    },
  },
  { kind: 'wait', label: 'the glass gives', duration: 1.9 },
  // ── 9. Containment: a triceratops smashes out; raptors from broken cells ─
  {
    kind: 'hold',
    label: 'containment',
    look: { at: W(14, 1.6, -310), world: true, blend: 1.0 },
    pickups: [
      { kind: 'bomb', pos: W(8.4, 1.35, -304), world: true, t: 0.5 },
      { kind: 'health', pos: W(13.6, 1.35, -305), world: true, t: 9 },
    ],
    waves: [
      { spawns: [at('trike', 20.4, 0, -310.5, { entry: 'burst', t: 0.15 })] },
      {
        start: { after: 5, remaining: 0 },
        spawns: [
          at('raptor', 2.5, 0, -321, { entry: 'leap', opts: { variant: 'tan' } }),
          at('raptor', 11, 0, -331, { t: 0.9, opts: { variant: 'green' } }),
        ],
      },
      {
        start: { remaining: 1 },
        spawns: [
          at('raptor', 2.0, 0, -319.5, { entry: 'leap', opts: { variant: 'blue' } }),
          at('raptor', 1.5, 0, -324, { entry: 'leap', t: 0.5, opts: { variant: 'blue' } }),
          at('raptor', 11, 0, -332, { t: 1.4, opts: { variant: 'red' } }),
        ],
      },
    ],
  },
  { kind: 'move', label: 'into the holding hall', to: D.END, speed: 3.0, look: { at: W(11, 2.6, -356), world: true, blend: 1.6 } },
  {
    kind: 'action',
    label: 'lights out',
    look: { at: W(8, 2.2, -362), world: true, blend: 1.2 },
    run: (w) => {
      const lab = labs(w);
      if (lab) lab.dimTarget = 0.75;
      w.audio.playMusic(null);
      w.audio.play('alarm', { volume: 0.35, pitch: 0.45 });
      w.later(0.6, () => w.audio.play('raptor_screech', { volume: 0.5, pitch: 0.4 }));
      w.later(1.4, () => lab?.panes[1].crack(w));
    },
  },
  { kind: 'wait', label: 'something in the dark', duration: 2.3 },
  // ── BOSS: SPECIMEN X ─────────────────────────────────────────────────────
  {
    kind: 'boss',
    label: 'SPECIMEN X',
    boss: 'specimen_x',
    pos: W(3.2, 0, -369),
    world: true,
    pickups: [
      { kind: 'shotgun', pos: W(8.6, 1.3, -341), world: true, t: 6 },
      { kind: 'health', pos: W(14, 1.3, -341.5), world: true, t: 24 },
      { kind: 'health', pos: W(7.5, 1.3, -342), world: true, t: 50 },
    ],
  },
];

export const stage: StageDef = {
  id: 'd2',
  campaign: 'dino',
  index: 1,
  name: 'RESEARCH LABS',
  tagline: 'Containment failure. Every door is open.',
  rail: RAIL,
  mode: 'walk',
  music: 'dino',
  beats,
  buildEnvironment: (world, curve) => buildLabs(world, curve),
  setup(world) {
    const lab = labs(world);
    // Gas tanks: kitchen and pump room.
    const tanks: [number, number, number][] = [
      [-7.2, -181, D.KITCHEN_HOLD],
      [7.0, -180.5, D.KITCHEN_HOLD],
      [5.2, PUMP_SIDE_Z + 2.2, D.PUMP_HOLD],
      [16.8, PUMP_SIDE_Z - 2.0, D.PUMP_HOLD],
    ];
    for (const [x, z, d] of tanks) {
      const t = propaneTank(world, new THREE.Vector3(x, 0, z));

      world.add(t);
      lab?.cull(t.root, d + 8);
    }
  },
};
