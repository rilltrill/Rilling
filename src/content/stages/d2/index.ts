import * as THREE from 'three';
import type { V3 } from '../../../core/types';
import type { Beat, SpawnDef, StageDef } from '../../../gameplay/StageTypes';
import type { World } from '../../../gameplay/World';
import { EnvKit } from '../../kit/EnvKit';
import { CURVE, D, PUMP_SIDE_Z, RAIL, TUNNEL, TUNNEL_SPOTS, dAtZ } from './layout';
import { buildLabs, labs } from './env';
import { propaneTank } from './setpieces';

import './boss';
import './hybrid';

/**
 * PRIMAL ISLAND · STAGE 2 — RESEARCH LABS
 *
 * On foot through the island's visitor & research complex after the
 * containment failure. Emergency power: cool white fill, slow red beacons,
 * green lab glow.
 *
 *   lobby       raptors drop off the mezzanine, burst through a staff door…
 *               then the giant skeleton display comes crashing down — its
 *               skull lands on the alpha leaping over the plinth
 *   gift shop   compys pour out of the ceiling vents, a raptor bursts from the
 *               stock room; a scientist hides behind the till
 *   atrium      dilos spit from the planting beds, a raptor pack flanks
 *   hatchery    raptors blow the lab doors off; hatchlings; a second scientist;
 *               the first of Specimen X's brood (hybrid.ts: shrugs off body
 *               hits — aim for the head). More hybrids in the kitchen, server
 *               room, pump room and containment wing.
 *   kitchen     raptors stalking between the counters, the freezer door flies
 *   servers     blinking racks, compys in the cable trays
 *   tunnels     steam, red strobes, an alcove ambush; pump-room pack + gas tanks
 *   containment the cell glass blows out and a triceratops charges through
 *   BOSS        SPECIMEN X in the holding hall; its pack breaks out of the tank
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
const tunnelEnd = onRail(dAtZ(-268.6), 0);
const pumpMouth = onRail(dAtZ(-273), 0);

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
    speed: 3.3,
    look: { at: W(-1.5, 3.6, -32), world: true, blend: 1.6 },
    onStart: (w) => w.later(1.8, () => w.audio.play('raptor_bark', { volume: 0.5, pitch: 0.9 })),
    // The first one is already on the mezzanine as you arrive — and comes over the rail.
    waves: [{ start: { atD: D.LOBBY_HOLD - 2 }, spawns: [at('raptor', -11.2, 5.2, -29, { entry: 'leap', opts: { variant: 'tan' } })] }],
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
          // From the back of the hall, right of the display plinth (never through it).
          at('raptor', 3.5, 0, -41, { t: 2.6, opts: { variant: 'green' } }),
        ],
      },
      {
        start: { remaining: 0, after: 12 },
        spawns: [
          at('raptor', staffSpawn[0], 0, staffSpawn[1], { entry: 'burst', opts: { variant: 'blue' } }),
          at('raptor', 11.2, 5.2, -37, { entry: 'leap', t: 1.4, opts: { variant: 'tan' } }),
        ],
      },
    ],
  },
  // ── Set piece: the skeleton display comes down — on top of a raptor ──────
  {
    kind: 'hold',
    label: 'skeleton collapse',
    look: { at: W(-1.8, 2.6, -28), world: true, blend: 0.8 },
    pickups: [{ kind: 'points', pos: W(-2.4, 1.6, -24.4), world: true, t: 3.2 }],
    onStart: (w) => {
      const lab = labs(w);
      w.audio.play('raptor_screech', { volume: 0.6, pitch: 0.8 });
      // The alpha bursts from behind the plinth just as the armature snaps:
      // the falling skull lands on it (crush() kills whatever is underneath).
      w.later(0.1, () => lab?.skeleton.collapse(w));
      w.later(0.5, () => popup(w, 'LOOK OUT!', 0.45, 0.28));
      w.later(2.3, () => w.fx.dust(new THREE.Vector3(1.6, 0.2, -33.8), 1.6, 0xb8ab90));
    },
    waves: [
      { spawns: [at('raptor', -4.4, 0, -33.4, { entry: 'leap', t: 0.5, hp: 3, opts: { variant: 'red' } })] },
      {
        // Compys scatter out of the debris (round the open end of the plinth).
        start: { after: 2.4 },
        spawns: [at('compy', 1.0, 0, -34, { count: 3, every: 0.3, offset: [0.9, 0, 0.5] })],
      },
      {
        start: { remaining: 0, after: 9 },
        spawns: [at('raptor', 4.5, 0, -49, { opts: { variant: 'blue' } })],
      },
    ],
  },
  // Pacing: the 50 m walk across the lobby is broken up — compys skitter out of the
  // gift shop, a straggler vaults down off the left mezzanine, then a second pair
  // darts out of the shop doorway as you reach it.
  {
    kind: 'move',
    label: 'to the gift shop',
    to: D.SHOP_HOLD,
    speed: 4.2,
    look: { at: W(0, 1.8, -70), world: true, blend: 1.6 },
    waves: [
      {
        start: { atD: D.LOBBY_HOLD + 6 },
        spawns: [at('compy', 0.4, 0, -53, { count: 3, every: 0.4, offset: [0.7, 0, 0.4] })],
      },
      {
        // Far end of the balcony (between the last pillar and the wall), ~30° off-axis.
        start: { atD: D.LOBBY_HOLD + 16 },
        spawns: [at('raptor', -11.2, 5.2, -50, { entry: 'leap', opts: { variant: 'green' } })],
      },
      {
        start: { atD: D.LOBBY_HOLD + 28 },
        spawns: [at('compy', -0.8, 0, -55, { count: 2, every: 0.45, offset: [1.3, 0, 0.3] })],
      },
    ],
  },
  // ── 2. Gift shop: compys from the vents, the stock-room door ─────────────
  {
    kind: 'hold',
    label: 'gift shop',
    look: { at: W(0, 1.6, -71), world: true, blend: 1.2 },
    // (In from the shop's front along the right-hand aisle, to cower in the gap between the display
    // tables: out at the side of the view, where the vents' compys never pounce across her — at the
    // back of the shop, by the plush T-rex, they did.)
    civilians: [{ pos: W(6.65, 0, -70.55), from: W(6.4, 0, -62.5), world: true, variant: 'tech', t: 0.3, act: 'cower' }],
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
  {
    kind: 'move',
    label: 'into the atrium',
    to: D.GREEN_HOLD,
    speed: 4.2,
    look: { at: W(-2, 2.4, -104), world: true, blend: 1.6 },
    waves: [
      {
        // Something rustles in the beds as the doors open onto the atrium.
        start: { atD: D.SHOP_HOLD + 13 },
        spawns: [at('compy', -0.6, 0, -95, { count: 2, every: 0.5, offset: [1.2, 0, 0] })],
      },
    ],
  },
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
          // Flankers break cover from the beds either side of the path — close
          // enough to the look target that they land inside the frame.
          // A coordinated rush: both flankers and the compys close in together.
          at('raptor', -7, 0, -101, { entry: 'leap', opts: { variant: 'tan' } }),
          at('raptor', 5, 0, -98.5, { entry: 'leap', t: 0.25, opts: { variant: 'red' } }),
          at('compy', -3, 0, -114, { t: 0.5, count: 3, every: 0.3, offset: [1.4, 0, 0] }),
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
  {
    kind: 'move',
    label: 'to the hatchery',
    to: D.HATCH_HOLD,
    speed: 4.3,
    look: { at: W(0, 1.8, -145), world: true, blend: 1.6 },
    waves: [
      {
        // A late flanker breaks out of the far planting bed.
        start: { atD: D.GREEN_HOLD + 8 },
        spawns: [at('raptor', -6, 0, -120, { entry: 'leap', opts: { variant: 'tan' } })],
      },
      {
        // Escaped hatchlings scurry out through the hatchery doorway ahead.
        start: { atD: D.GREEN_HOLD + 25 },
        spawns: [at('compy', 0.5, 0, -128.5, { count: 2, every: 0.5, offset: [-1.0, 0, 0.3] })],
      },
    ],
  },
  // ── 4. Hatchery: lab doors blown open, hatchlings ────────────────────────
  {
    kind: 'hold',
    label: 'hatchery',
    look: { at: W(0, 1.6, -144), world: true, blend: 1.2 },
    // (Runs in past the camera down the right-hand aisle and ducks by the far benches, out at the side
    // of the view; once the raptors are out she bolts back the way she came — not left cowering in
    // the middle of the aisle, in the room they're about to roam.)
    civilians: [{ pos: W(7.6, 0, -143.0), from: W(8.6, 0, -127.5), to: W(8.6, 0, -127.5), world: true, variant: 'tech', t: 0.3, act: 'flee' }],
    pickups: [{ kind: 'magnum', pos: W(-2.2, 1.35, -137.5), world: true, t: 1 }],
    waves: [
      {
        spawns: [
          at('raptor', labLSpawn[0], 0, labLSpawn[1], { entry: 'burst', t: 0.4, opts: { variant: 'blue' } }),
          at('compy', -4.65, 1.05, -138.7, { entry: 'leap', t: 1.6, count: 3, every: 0.45 }),
        ],
      },
      {
        start: { remaining: 1 },
        spawns: [
          at('raptor', labRSpawn[0], 0, labRSpawn[1], { entry: 'burst', opts: { variant: 'tan' } }),
          // Off the far-left incubator (lands clear of the scientist's line of fire):
          // one of Specimen X's brood — it shrugs off body hits, aim for the head.
          at('raptor_hybrid', -3.6, 0.95, -147.2, { entry: 'leap', t: 1.1 }),
        ],
      },
      {
        start: { remaining: 1 },
        spawns: [
          at('raptor', 0, 0, -165, { opts: { variant: 'red' } }),
          at('raptor', -2, 0, -160, { t: 0.8, opts: { variant: 'tan' } }),
        ],
      },
    ],
  },
  {
    kind: 'move',
    label: 'to the kitchen',
    to: D.KITCHEN_HOLD,
    speed: 4.2,
    look: { at: W(0, 1.6, -180), world: true, blend: 1.6 },
    waves: [
      {
        // Hatchlings scatter out of the kitchen doorway.
        start: { atD: D.HATCH_HOLD + 12 },
        spawns: [at('compy', 0.3, 0, -164, { count: 2, every: 0.45, offset: [-0.9, 0, 0.3] })],
      },
    ],
  },
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
          // Stalks up the central aisle between the islands…
          at('raptor', -1.6, 0, -191, { t: 0.4, opts: { variant: 'tan' } }),
          // …while another vaults off the far counter.
          at('raptor', 4.6, 0.95, -183, { entry: 'leap', t: 1.8, opts: { variant: 'green' } }),
        ],
      },
      {
        // The freezer door flies while the first pair is still closing in: the
        // kitchen is a juggling act (and the gas tanks earn their keep).
        start: { remaining: 2, after: 6 },
        spawns: [
          at('raptor_hybrid', freezerSpawn[0], 0, freezerSpawn[1], { entry: 'burst', t: 1.2 }),
          at('raptor', -4.6, 0.95, -184, { entry: 'leap', t: 2.6, opts: { variant: 'red' } }),
        ],
      },
      {
        start: { remaining: 1 },
        spawns: [
          at('raptor', 0, 0, -196, { opts: { variant: 'tan' } }),
          at('raptor', -1.2, 0, -193.2, { t: 0.7, opts: { variant: 'green' } }),
          at('compy', 3, 0, -193, { t: 1.2, count: 2, every: 0.3, offset: [-1, 0, 0] }),
        ],
      },
    ],
  },
  {
    kind: 'move',
    label: 'to the servers',
    to: D.SERVER_HOLD,
    speed: 4.2,
    look: { at: W(0, 1.6, -210), world: true, blend: 1.6 },
    waves: [
      {
        // One drops out of the cable tray over the server-room door.
        start: { atD: D.KITCHEN_HOLD + 13 },
        spawns: [at('compy', 0.3, 3.4, -195.5, { entry: 'drop' })],
      },
    ],
  },
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
        // A pair charges up the cold aisle between the racks (never through them).
        start: { remaining: 1 },
        spawns: [
          at('raptor', -0.9, 0, -217, { entry: 'burst', opts: { variant: 'tan' } }),
          at('raptor', 0.9, 0, -216.6, { entry: 'burst', t: 0.9, opts: { variant: 'green' } }),
        ],
      },
      {
        start: { remaining: 1 },
        spawns: [at('raptor_hybrid', 0, 0, -216.5, { entry: 'leap' })],
      },
    ],
  },
  // ── 7. Maintenance tunnels ───────────────────────────────────────────────
  {
    kind: 'move',
    label: 'maintenance tunnels',
    to: TUNNEL_SPOTS.ambush,
    speed: 3.9,
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
        spawns: [at('compy', tunnelEnd[0], 0, tunnelEnd[2], { count: 3, every: 0.35 })],
      },
    ],
  },
  {
    kind: 'move',
    label: 'to the pump room',
    to: D.PUMP_HOLD,
    speed: 4.3,
    waves: [
      {
        start: { atD: TUNNEL_SPOTS.ambush + 12 },
        spawns: [at('compy', pumpMouth[0], 0, pumpMouth[2], { count: 2, every: 0.4 })],
      },
    ],
  },
  // ── 8. Pump room: pack from both side tunnels, gas tanks ─────────────────
  // The player stops in the tunnel mouth, so the side openings sit ~30° off
  // the view axis; raptors vault out of the openings, compys pour in through
  // the containment-wing door straight ahead.
  {
    kind: 'hold',
    label: 'pump room',
    look: { at: W(11, 1.5, -288), world: true, blend: 1.2 },
    pickups: [{ kind: 'health', pos: W(13.2, 1.35, -281.5), world: true, t: 1 }],
    onStart: (w) => w.later(3, () => popup(w, 'GAS TANKS!', 0.5, 0.3)),
    waves: [
      {
        spawns: [
          at('raptor', 2.4, 0, PUMP_SIDE_Z - 0.8, { entry: 'leap', t: 0.5, opts: { variant: 'tan' } }),
          at('compy', 10.2, 0, -296, { t: 1.4, count: 3, every: 0.35, offset: [0.8, 0, 0] }),
        ],
      },
      {
        // Springs before the first wave is quite done.
        start: { remaining: 2, after: 6 },
        spawns: [
          // The pack springs the trap together: both side tunnels and the far door at once.
          at('raptor', 2.4, 0, PUMP_SIDE_Z - 0.4, { entry: 'leap', opts: { variant: 'blue' } }),
          at('raptor', 19.6, 0, PUMP_SIDE_Z - 0.4, { entry: 'leap', t: 0.2, opts: { variant: 'blue' } }),
          at('raptor_hybrid', 11, 0, -295, { t: 0.5 }),
        ],
      },
    ],
  },
  // ── Set piece: something big behind the glass ────────────────────────────
  // The build-up starts on the last metres of the walk (the cell is in view),
  // so the pause before the glass blows is short and tense, not empty.
  {
    kind: 'move',
    label: 'containment wing',
    to: D.WING_HOLD,
    speed: 4.3,
    look: { at: W(14, 2.2, -310), world: true, blend: 1.6 },
    // A pair of compys bolts out of the wing doorway — fleeing whatever is
    // pounding on the glass in there (keeps the build-up from going quiet).
    waves: [
      {
        start: { atD: D.PUMP_HOLD + 1.5 },
        spawns: [at('compy', 11.6, 0, -297.5, { count: 2, every: 0.45, offset: [-1.1, 0, 0.4] })],
      },
    ],
    onStart: (w) => {
      w.later(3.6, () => w.audio.play('trike_bellow', { volume: 0.8, pitch: 0.9 }));
      w.later(4.3, () => labs(w)?.cells[4]?.crack(w));
      w.later(4.35, () => w.audio.play('stomp', { volume: 1, pitch: 0.6 }));
    },
  },
  {
    kind: 'action',
    label: 'thud… thud…',
    look: { at: W(17.5, 2.4, -310.5), world: true, blend: 1.0 },
    run: (w) => {
      const cell = labs(w)?.cells[4];
      w.later(0.3, () => cell?.crack(w));
      w.later(0.35, () => w.audio.play('stomp', { volume: 1, pitch: 0.55 }));
    },
  },
  { kind: 'wait', label: 'the glass gives', duration: 1.1 },
  // ── 9. Containment: a triceratops smashes out; raptors from broken cells ─
  {
    kind: 'hold',
    label: 'containment',
    look: { at: W(14, 1.6, -310), world: true, blend: 1.0 },
    pickups: [
      { kind: 'bomb', pos: W(8.4, 1.35, -304), world: true, t: 0.5 },
      { kind: 'health', pos: W(13.6, 1.35, -305), world: true, t: 9 },
    ],
    // Scripted, not left to proximity: the glass blows out and the trike
    // comes through the shards (it charges from range, so it would otherwise
    // stand behind the pane).
    onStart: (w) => {
      const cell = labs(w)?.cells[4];
      if (cell) cell.shatter(w, new THREE.Vector3(16.6, 0, -310.5));
      w.audio.play('trike_bellow', { volume: 1, pitch: 0.85 });
    },
    waves: [
      { spawns: [at('trike', 16.2, 0, -310.5, { entry: 'burst', t: 0.05 })] },
      {
        // Out of the broken far cells, through the glass line (clear of the dividers).
        start: { after: 5, remaining: 0 },
        spawns: [
          at('raptor', 3.4, 0, -324.5, { entry: 'leap', opts: { variant: 'tan' } }),
          at('raptor', 11, 0, -331, { t: 0.9, opts: { variant: 'green' } }),
        ],
      },
      {
        start: { remaining: 1 },
        spawns: [
          at('raptor', 18.6, 0, -324.5, { entry: 'leap', opts: { variant: 'blue' } }),
          at('raptor_hybrid', 11, 0, -332, { t: 1.2 }),
        ],
      },
    ],
  },
  {
    kind: 'move',
    label: 'into the holding hall',
    to: D.END,
    speed: 4.0,
    look: { at: W(11, 2.6, -356), world: true, blend: 1.6 },
    waves: [
      {
        // Compys bolt out of the holding hall, fleeing something worse (late in the
        // walk, so the build-up into the lights-out never goes quiet for long).
        start: { atD: D.WING_HOLD + 14 },
        spawns: [at('compy', 11.6, 0, -333, { count: 3, every: 0.35, offset: [-0.8, 0, 0.3] })],
      },
    ],
  },
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
  { kind: 'wait', label: 'something in the dark', duration: 2.0 },
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
