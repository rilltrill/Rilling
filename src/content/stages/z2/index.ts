import type { V3 } from '../../../core/types';
import type { Beat, LookSpec, PickupDef, SpawnDef, StageDef } from '../../../gameplay/StageTypes';
import type { World } from '../../../gameplay/World';
import { B, POOL, RAIL, RAIL_LENGTH, dAt } from './layout';
import { D, buildEnv } from './env';
import { z2Scene } from './scene';
import { burstWall, crashAmbulance, ensureAmbulanceCrashed, spawnProps, wallThuds } from './setpieces';
import { drawerFront } from './zonesLower';
import './boss';

/**
 * STAGE 2 — ST. MERCY HOSPITAL (Dead Zone).
 *
 * The survivors' radio said the hospital was a safe zone. It wasn't. Through
 * the ambulance bay (an ambulance ploughs into the canopy and spills runners),
 * the ER, a corridor of slamming doors, a ward of curtained beds, the nurse
 * station, down the stairs to the morgue, through surgery, and into the atrium
 * where PATIENT ZERO has grown out of the fountain.
 *
 * Teaching beats on top of stage 1: runners burst through doors, crawlers drop
 * from vents and out of morgue drawers, spitters hold the nurse station and
 * the surgery gallery, bloaters clear crowds, a brute smashes through a wall.
 */

type SpawnOpts = Partial<Omit<SpawnDef, 'type' | 'pos' | 'world'>> & { y?: number };

/** World-space spawn. */
function S(type: string, x: number, z: number, o: SpawnOpts = {}): SpawnDef {
  const { y = 0, ...rest } = o;
  return { type, pos: [x, y, z], world: true, ...rest };
}

/** Walker of a given variant. */
function W(x: number, z: number, variant: string, o: SpawnOpts = {}): SpawnDef {
  return S('walker', x, z, { ...o, opts: { variant } });
}

function L(x: number, y: number, z: number, blend = 1.3): LookSpec {
  return { at: [x, y, z], world: true, blend };
}

function P(kind: PickupDef['kind'], x: number, y: number, z: number, t = 0): PickupDef {
  return { kind, pos: [x, y, z], world: true, t };
}

/** Point `depth` metres behind a doorway centre, on the line from `from` through the door. */
function behindDoor(door: [number, number], from: [number, number], depth: number): [number, number] {
  const dx = door[0] - from[0];
  const dz = door[1] - from[1];
  const l = Math.hypot(dx, dz);
  return [door[0] + (dx / l) * depth, door[1] + (dz / l) * depth];
}

function popup(w: World, text: string, x = 0.5, y = 0.3) {
  w.hud.popup(text, w.viewport.width * x, w.viewport.height * y, 'warning');
}

// Corridor A door centres (x, wall z).
const DOOR = {
  a24: [24, -46.3] as [number, number],
  a29: [29.5, -41.7] as [number, number],
  a38: [38, -46.3] as [number, number],
  a44: [44.5, -41.7] as [number, number],
};

const HOLD = {
  bay: dAt(0, 0.5),
  corrA: dAt(20.5, -44),
  corrAEnd: dAt(50.5, -44),
  ward: dAt(54, -44),
  morgue: dAt(79, -76.6),
};

const dr = (side: 'e' | 'w', col: number, row: number): [number, number, number] => drawerFront(side, col, row);
const dE1 = dr('e', 1, 1);
const dE4 = dr('e', 4, 2);
const dW4 = dr('w', 4, 1);
const dE6 = dr('e', 6, 1);

const beats: Beat[] = [
  {
    kind: 'banner',
    text: 'ST. MERCY HOSPITAL',
    sub: 'STAGE 2 · DEAD ZONE',
    duration: 2.6,
    look: L(0, 5, -26, 2),
  },
  // ── 1. Ambulance bay: an ambulance ploughs into the canopy ──────────────
  {
    kind: 'move',
    label: 'up the drive',
    to: HOLD.bay,
    speed: 2.6,
    look: L(0, 2.2, -18, 2),
    waves: [{ spawns: [W(2.6, -15, 'patient', { frame: 'world', t: 2 })] }],
  },
  {
    kind: 'action',
    label: 'ambulance crash',
    look: L(-2.5, 1.4, -11.5, 1.4),
    run: (w) => crashAmbulance(w),
  },
  { kind: 'wait', label: 'crash', duration: 1.75 },
  {
    kind: 'hold',
    label: 'ambulance bay',
    look: L(-1.2, 1.3, -12, 1.2),
    onStart: (w) => ensureAmbulanceCrashed(w),
    pickups: [P('shotgun', 3.4, 1.3, -5.6, 0.6)],
    waves: [
      {
        spawns: [
          S('runner', -2.2, -9.3, { entry: 'burst', t: 0.1 }),
          S('runner', -2.7, -9.0, { entry: 'burst', t: 1.0 }),
          W(1.4, -22.5, 'patient', { t: 1.6 }),
          W(-8.4, -15.5, 'nurse', { t: 2.6 }),
        ],
      },
      {
        start: { remaining: 1 },
        spawns: [
          W(4.4, -14.2, 'patient'),
          W(-6.6, -5.5, 'doctor', { t: 0.8 }),
          S('crawler', 1.4, -7.2, { entry: 'rise', t: 1.8 }),
        ],
      },
      {
        start: { remaining: 1 },
        spawns: [
          S('runner', 13, -8, { t: 0.2 }),
          W(7.2, -13.2, 'worker', { t: 0.8 }),
          W(-3.4, -16.4, 'soldier', { t: 1.4 }),
          W(0.6, -18.5, 'patient', { t: 2.2 }),
        ],
      },
    ],
  },
  // ── 2. ER: they vault the reception desk ────────────────────────────────
  {
    kind: 'move',
    label: 'into the ER',
    to: D.erHold,
    speed: 3.2,
    waves: [{ start: { atD: dAt(0, -12) }, spawns: [W(-7.6, -21.8, 'nurse', { frame: 'world' })] }],
  },
  {
    kind: 'hold',
    label: 'ER reception',
    look: L(-1.2, 1.3, -39),
    civilians: [{ pos: [3.4, 0, -39], world: true, variant: 'nurse', t: 0.3 }],
    pickups: [P('health', -5.6, 1.6, -35.2, 0.5), P('points', 7.4, 2.4, -37.2, 3)],
    onStart: (w) => w.later(0.9, () => popup(w, "DON'T SHOOT THE NURSE!", 0.6, 0.26)),
    waves: [
      { spawns: [W(-3.2, -45, 'nurse', { t: 0.3 }), W(2.2, -47.2, 'patient', { t: 1.3 })] },
      {
        start: { remaining: 1 },
        spawns: [
          S('runner', -5.2, -37.3, { entry: 'leap' }),
          S('runner', -7.2, -37.6, { entry: 'leap', t: 1.2 }),
          S('crawler', 2.4, -39.5, { y: 3.85, entry: 'drop', t: 2.2 }),
        ],
      },
      {
        start: { remaining: 1 },
        spawns: [
          W(-12.8, -31.5, 'doctor'),
          W(13.2, -44, 'patient', { t: 0.9 }),
          S('crawler', -2.2, -45.5, { y: 3.85, entry: 'drop', t: 1.7 }),
          W(-4, -48.6, 'office', { t: 2.4 }),
        ],
      },
    ],
  },
  // ── 3. Corridor A: doors burst open ─────────────────────────────────────
  { kind: 'move', label: 'to corridor A', to: HOLD.corrA, speed: 3.3 },
  {
    kind: 'hold',
    label: 'corridor A',
    look: L(28, 1.3, -44.4),
    pickups: [P('points', 22.4, 2.0, -45.4, 1.5), P('smg', 31.6, 1.6, -45.5, 2.5)],
    waves: [
      { spawns: [W(38.5, -44.6, 'patient', { t: 0.4 }), W(46, -43.2, 'nurse', { t: 1.6 })] },
      {
        start: { remaining: 1 },
        spawns: [
          S('walker', ...behindDoor(DOOR.a24, [20.5, -44], 1.7), { entry: 'burst', opts: { variant: 'patient' } }),
          S('runner', ...behindDoor(DOOR.a29, [20.5, -44], 1.2), { t: 1.4 }),
        ],
      },
      {
        start: { remaining: 1 },
        spawns: [
          S('crawler', 27, -43.2, { y: 2.85, entry: 'drop' }),
          W(50, -44.2, 'doctor', { t: 0.6 }),
          S('crawler', 33.4, -44.7, { y: 2.85, entry: 'drop', t: 1.5 }),
          W(48, -45.2, 'patient', { t: 2.2 }),
        ],
      },
    ],
  },
  {
    kind: 'move',
    label: 'down the corridor',
    to: HOLD.corrAEnd,
    speed: 2.6,
    waitClear: true,
    waves: [
      {
        start: { atD: dAt(32.5, -44) },
        spawns: [S('walker', ...behindDoor(DOOR.a38, [34, -44], 1.6), { frame: 'world', entry: 'burst', opts: { variant: 'doctor' } })],
      },
      {
        start: { atD: dAt(39, -44) },
        spawns: [
          S('runner', ...behindDoor(DOOR.a44, [40.5, -44], 1.4), { frame: 'world' }),
          S('crawler', 41.5, -43.4, { y: 2.85, entry: 'drop', frame: 'world', t: 1.2 }),
        ],
      },
    ],
  },
  // ── 4. Ward 3: something behind every curtain ───────────────────────────
  { kind: 'move', label: 'into the ward', to: HOLD.ward, speed: 2.8 },
  {
    kind: 'hold',
    label: 'ward',
    look: L(63, 1.2, -44),
    pickups: [P('health', 66, 1.4, -41.6, 6), P('bomb', 60.6, 1.5, -46.6, 10)],
    waves: [
      { spawns: [W(59.8, -39.6, 'patient', { t: 0.5 }), W(64, -48.4, 'patient', { t: 1.8 })] },
      {
        start: { remaining: 1 },
        spawns: [
          S('crawler', 64, -38.6, { entry: 'burst' }),
          S('crawler', 59.8, -49.4, { entry: 'burst', t: 0.9 }),
          W(76.5, -44, 'nurse', { t: 1.6 }),
        ],
      },
      {
        start: { remaining: 1 },
        spawns: [
          W(68.2, -39.6, 'doctor'),
          W(72.4, -48.4, 'patient', { t: 0.7 }),
          S('crawler', 61.6, -44.6, { y: 3.25, entry: 'drop', t: 1.6 }),
          S('runner', 76.5, -45, { t: 2.4 }),
        ],
      },
    ],
  },
  // ── 5. Nurse station: spitters behind the counter ───────────────────────
  { kind: 'move', label: 'to the nurse station', to: D.hubHold, speed: 3.2 },
  {
    kind: 'hold',
    label: 'nurse station',
    look: L(83, 1.5, -44),
    pickups: [P('health', 77, 1.4, -40.4, 4)],
    onStart: (w) => w.later(2.2, () => popup(w, 'SHOOT THE BILE!', 0.5, 0.26)),
    waves: [
      {
        spawns: [
          S('spitter', 84.8, -45.6, { t: 0.4, opts: { variant: 'nurse' } }),
          W(83.5, -37.6, 'nurse', { t: 1.4 }),
          W(79, -52.6, 'patient', { t: 2.4 }),
        ],
      },
      {
        start: { remaining: 1 },
        spawns: [
          S('spitter', 84.6, -42.2, { opts: { variant: 'patient' } }),
          S('runner', 83.5, -37.2, { t: 1.0 }),
          W(79, -52.6, 'doctor', { t: 1.8 }),
        ],
      },
      {
        start: { remaining: 1 },
        spawns: [W(80.6, -38, 'patient'), W(83.5, -37.4, 'office', { t: 0.8 }), S('runner', 79, -52.8, { t: 1.6 })],
      },
    ],
  },
  // ── 6. Stairwell: they come up from the basement ────────────────────────
  { kind: 'move', label: 'to the stairs', to: D.stairTop, speed: 3.0 },
  {
    kind: 'hold',
    label: 'stairwell',
    look: L(79, -2.8, -66.5, 1.1),
    pickups: [P('health', 77.2, 1.2, -57.6, 0.5)],
    waves: [
      { spawns: [W(78, -70.5, 'patient', { t: 0.3 }), W(80.6, -72.2, 'nurse', { t: 1.5 })] },
      {
        start: { remaining: 1 },
        spawns: [
          S('crawler', 77.4, -62.4, { y: 3.25, entry: 'drop' }),
          S('runner', 79, -74.4, { t: 1.0 }),
          W(77.2, -73.4, 'doctor', { t: 1.8 }),
        ],
      },
      {
        start: { remaining: 1 },
        spawns: [
          S('crawler', 80.8, -59.6, { y: 3.25, entry: 'drop' }),
          W(80.8, -73.6, 'patient', { t: 0.6 }),
          W(78.2, -74.2, 'worker', { t: 1.3 }),
        ],
      },
    ],
  },
  // ── 7. Morgue: drawers bang open, bloaters in the crowd ─────────────────
  {
    kind: 'move',
    label: 'down to the morgue',
    to: HOLD.morgue,
    speed: 2.7,
    onStart: (w) => w.later(2.5, () => w.audio.play('zombie_groan', { volume: 0.9, pitch: 0.7 })),
  },
  {
    kind: 'hold',
    label: 'morgue',
    look: L(79.4, B + 1.2, -87),
    pickups: [P('magnum', 75, B + 1.6, -80.6, 1), P('health', 83, B + 1.6, -89.4, 12)],
    onStart: (w) => w.later(3.5, () => popup(w, 'SHOOT THE BLOATERS!', 0.5, 0.26)),
    waves: [
      { spawns: [S('bloater', 79.5, -91.2, { t: 0.4 }), W(77.4, -93.4, 'doctor', { t: 0.9 }), W(81.6, -93.2, 'patient', { t: 1.4 })] },
      {
        start: { remaining: 1 },
        spawns: [
          S('crawler', dE1[0], dE1[2], { y: dE1[1], entry: 'drop', opts: { variant: 'patient' } }),
          S('crawler', dW4[0], dW4[2], { y: dW4[1], entry: 'drop', t: 1.3, opts: { variant: 'patient' } }),
          W(79, -97, 'patient', { t: 2.0 }),
        ],
      },
      {
        start: { remaining: 1 },
        spawns: [
          S('bloater', 77.2, -90.6),
          W(78.4, -93.8, 'patient', { t: 0.4 }),
          W(80.6, -94.2, 'nurse', { t: 0.9 }),
          S('bloater', 82.4, -92.4, { t: 1.2 }),
          W(76.2, -93.4, 'doctor', { t: 1.6 }),
          S('crawler', dE4[0], dE4[2], { y: dE4[1], entry: 'drop', t: 2.4 }),
          S('crawler', dE6[0], dE6[2], { y: dE6[1], entry: 'drop', t: 4.0 }),
        ],
      },
    ],
  },
  // ── 8. Service corridor → surgery ───────────────────────────────────────
  {
    kind: 'move',
    label: 'service corridor',
    to: D.orHold,
    speed: 2.7,
    waitClear: true,
    waves: [{ start: { atD: dAt(79, -96.5) }, spawns: [S('crawler', 79.6, -100.6, { y: B + 2.85, entry: 'drop', frame: 'world' })] }],
  },
  {
    kind: 'hold',
    label: 'operating theatre',
    look: L(82, B + 1.7, -118.4),
    civilians: [{ pos: [77.4, 0, -119.4], world: true, variant: 'scientist', t: 0.4 }],
    pickups: [P('health', 80.6, B + 1.6, -115.2, 1), P('shotgun', 73.4, B + 1.4, -111.0, 5)],
    onStart: (w) => {
      w.later(1.0, () => popup(w, "DON'T SHOOT THE DOCTOR!", 0.42, 0.26));
    },
    waves: [
      {
        spawns: [
          W(85.4, -121.8, 'doctor', { t: 0.4 }),
          W(83.6, -124.6, 'nurse', { t: 1.2 }),
          S('spitter', 88.4, -115.4, { y: B + 2.4, t: 2.2, opts: { variant: 'doctor' } }),
        ],
      },
      {
        start: { remaining: 1 },
        spawns: [
          S('spitter', 88.4, -119.6, { y: B + 2.4, opts: { variant: 'nurse' } }),
          W(84.8, -125.1, 'patient', { t: 0.6 }),
          W(86.2, -123.2, 'doctor', { t: 1.1 }),
          S('runner', 69.6, -121, { t: 2.0 }),
        ],
      },
      {
        start: { remaining: 1 },
        spawns: [S('bloater', 84.2, -123.4), W(81.2, -125.4, 'patient', { t: 0.5 }), W(86, -114.2, 'nurse', { t: 1.2 })],
      },
    ],
  },
  // ── 9. Basement corridor: the brute comes through the wall ──────────────
  { kind: 'move', label: 'towards the atrium', to: D.corrCHold, speed: 3.2 },
  {
    kind: 'action',
    label: 'pounding',
    look: L(60.5, B + 1.4, -123.2, 1.0),
    run: (w) => {
      wallThuds(w, [0.2, 0.95, 1.6]);
      w.later(2.3, () => burstWall(w));
    },
  },
  { kind: 'wait', label: 'the wall shakes', duration: 2.3 },
  {
    kind: 'hold',
    label: 'brute',
    look: L(59, B + 1.5, -122, 1.2),
    // (No-op unless a debug start skipped the pounding.)
    onStart: (w) => burstWall(w),
    pickups: [P('shotgun', 64.2, B + 1.4, -119.6, 0), P('bomb', 57, B + 1.6, -119.3, 8)],
    waves: [
      {
        spawns: [
          S('brute', 58.9, -124.3, { entry: 'burst' }),
          W(52.6, -120.2, 'patient', { t: 2.4 }),
          W(52.8, -121.9, 'nurse', { t: 3.4 }),
        ],
      },
      {
        start: { remaining: 1 },
        spawns: [S('runner', 51.5, -121, { t: 0.2 }), S('crawler', 59.4, -124.6, { entry: 'burst', t: 0.9 }), W(52.4, -119.6, 'doctor', { t: 1.6 })],
      },
    ],
  },
  // ── Boss: PATIENT ZERO ──────────────────────────────────────────────────
  { kind: 'move', label: 'into the atrium', to: RAIL_LENGTH, speed: 2.3, look: L(POOL[0], B + 2.2, POOL[2], 1.6) },
  {
    kind: 'action',
    label: 'it wakes',
    look: L(POOL[0] + 1, B + 2.4, POOL[2], 1.2),
    run: (w) => {
      w.audio.playMusic(null);
      w.audio.play('heartbeat', { volume: 1, pitch: 0.6 });
      w.later(0.7, () => w.audio.play('heartbeat', { volume: 1, pitch: 0.6 }));
      w.later(1.2, () => {
        w.audio.play('bloater_gurgle', { volume: 1, pitch: 0.4 });
        w.rig.shake(0.2);
        const sc = z2Scene(w);
        if (sc) sc.surge = 0.8;
      });
    },
  },
  { kind: 'wait', label: 'the cocoon splits', duration: 1.8 },
  {
    kind: 'boss',
    label: 'PATIENT ZERO',
    boss: 'patient_zero',
    pos: [POOL[0], B, POOL[2]],
    world: true,
    look: L(POOL[0] + 1.5, B + 2.6, POOL[2], 1.5),
    pickups: [
      P('shotgun', 42.6, B + 1.8, -118.4, 10),
      P('health', 42.8, B + 1.8, -123.6, 28),
      P('bomb', 42.2, B + 2.3, -121.2, 44),
      P('health', 42.6, B + 1.8, -118.6, 62),
      P('magnum', 42.8, B + 1.8, -123.4, 78),
    ],
    waves: [
      {
        start: { after: 24 },
        spawns: [W(40.5, -110.1, 'patient', { y: 0.6, entry: 'drop' }), W(40.5, -131.9, 'nurse', { y: 0.6, entry: 'drop', t: 1.2 })],
      },
      {
        start: { after: 52 },
        spawns: [
          W(33.5, -110.1, 'doctor', { y: 0.6, entry: 'drop' }),
          W(44.5, -131.9, 'patient', { y: 0.6, entry: 'drop', t: 0.8 }),
          S('runner', 40, -136.4, { t: 1.6 }),
        ],
      },
    ],
  },
];

export const stage: StageDef = {
  id: 'z2',
  campaign: 'zombie',
  index: 1,
  name: 'ST. MERCY HOSPITAL',
  tagline: 'The radio said it was a safe zone.',
  rail: RAIL as V3[],
  mode: 'walk',
  music: 'zombie',
  beats,
  buildEnvironment: (world, curve) => buildEnv(world, curve),
  setup(world) {
    spawnProps(world);
  },
};
