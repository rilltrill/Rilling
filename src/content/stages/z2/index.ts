import type { V3 } from '../../../core/types';
import type { Beat, LookSpec, PickupDef, SpawnDef, StageDef } from '../../../gameplay/StageTypes';
import type { World } from '../../../gameplay/World';
import { B, POOL, RAIL, RAIL_LENGTH, dAt } from './layout';
import { D, buildEnv } from './env';
import { z2Scene } from './scene';
import { burstWall, crashAmbulance, ensureAmbulanceCrashed, spawnProps, ventRattle, wallThuds } from './setpieces';
import { CORR_B_DOOR, CORR_B_VENT, CORR_C_VENT, drawerFront } from './zonesLower';
import { CORR_A_VENT } from './zonesUpper';
import './boss';
import './brute';
import './riot';
import { Director } from './director';

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

/** Hospital security in riot gear (see riot.ts): body shots spark off — aim for the head. */
function R(x: number, z: number, o: SpawnOpts = {}): SpawnDef {
  return S('riot_z2', x, z, { ...o, opts: { variant: 'cop', ...(o.opts ?? {}) } });
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

/**
 * A walker vaulting the far (back-wall) balcony rail of the atrium, on the
 * boss camera's left (side 1) or right (−1), `t` s into its wave. It lands
 * ~16 m out at a ~22° bearing and walks straight in (so it stays near the
 * middle of the frame, clear of PATIENT ZERO's body), then winds up from 2.9 m
 * (its opening ring stays clear of the bomb button and the weapon panel).
 */
function balconyWalker(side: 1 | -1, variant: string, t = 0): SpawnDef {
  return S('walker', 25, POOL[2] + side * 9, { y: 0.02, entry: 'leap', t, speed: 1.4, opts: { variant, attackRange: 2.9, leapMax: 7, leapArc: 1.8 } });
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

/** Seconds of pounding before the boiler-room wall gives (the brute comes through). */
const WALL_GIVES = 2.3;

/** Rail x of the corridor-A stops (the rail runs along z −44 there). */
const HOLD_X = { corrVent: 31 };

const HOLD = {
  bay: dAt(0, 0.5),
  corrA: dAt(20.5, -44),
  /**
   * Stop 7 m short of door a38 (its doctor walks in down the middle of the
   * frame) and 6 m short of the corridor-A vent (its crawler lands well ahead).
   */
  corrVent: dAt(HOLD_X.corrVent, -44),
  ward: dAt(54, -44),
  morgue: dAt(79, -76.6),
  /** Mouth of the service corridor: its vent (z −100.6) is ~5 m ahead. */
  corrB: dAt(79, -95.4),
};

/** Vents crawlers drop out of (x, z) — must match the vents built in zonesUpper/zonesLower. */
const VENT_A = CORR_A_VENT;
const VENT_B = CORR_B_VENT;
/** Service-corridor DANGER door (breakable, see zonesLower CORR_B_DOOR). */
const DOOR_B: [number, number] = [CORR_B_DOOR.x, CORR_B_DOOR.z];

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
    speed: 3.3,
    look: L(0, 2.2, -18, 2),
    waves: [
      {
        spawns: [
          W(2.6, -15, 'patient', { frame: 'world', t: 1.6 }),
          W(-8.6, 6, 'worker', { frame: 'world', t: 3.4 }),
          W(8.8, -1, 'civilian', { frame: 'world', t: 5.2 }),
        ],
      },
    ],
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
          W(1.2, -15.5, 'patient', { t: 1.6 }),
          W(-7.8, -14.6, 'nurse', { t: 2.6 }),
        ],
      },
      {
        start: { remaining: 2 },
        spawns: [
          W(3.8, -12.6, 'patient'),
          // Another one tumbles out of the wreck's back doors.
          S('runner', -2.5, -9.2, { entry: 'burst', t: 1.2 }),
          // (Out from beside the wreck, ~9 m ahead: it walks in left of centre, its
          // ring clear of the lives/bomb panel.)
          W(-5.0, -8.6, 'doctor', { t: 0.8 }),
          S('crawler', 1.4, -7.2, { entry: 'rise', t: 1.8 }),
        ],
      },
      {
        start: { remaining: 2 },
        spawns: [
          S('runner', 13, -8, { t: 0.2 }),
          S('runner', -2.2, -9.3, { entry: 'burst', t: 0.7 }),
          W(6.6, -11.4, 'worker', { t: 0.8 }),
          R(-3.0, -14.2, { t: 1.4 }),
          W(0.6, -16, 'patient', { t: 2.2 }),
        ],
      },
    ],
  },
  // ── 2. ER: they vault the reception desk ────────────────────────────────
  {
    kind: 'move',
    label: 'into the ER',
    to: D.erHold,
    speed: 3.8,
    waves: [
      {
        start: { atD: dAt(0, -12) },
        // A nurse under the canopy. (No runner on the walk in: it would wind up
        // as you walked past it and swing from beside the camera.)
        spawns: [W(-7.6, -21.8, 'nurse', { frame: 'world' })],
      },
    ],
  },
  {
    kind: 'hold',
    label: 'ER reception',
    look: L(-1.2, 1.3, -39),
    civilians: [{ pos: [3.4, 0, -39], world: true, variant: 'nurse', t: 0.3 }],
    pickups: [P('health', -5.6, 1.6, -35.2, 0.5), P('points', 1.0, 2.4, -42.5, 3)],
    onStart: (w) => w.later(0.9, () => popup(w, "DON'T SHOOT THE NURSE!", 0.6, 0.26)),
    waves: [
      // A runner bolts out of the back of the ER as you stop.
      { spawns: [S('runner', 0.6, -44, { t: 0.2 }), W(-3.2, -45, 'nurse', { t: 0.3 }), W(2.2, -47.2, 'patient', { t: 1.3 })] },
      {
        start: { remaining: 1 },
        // A pack vaults the desk one after another.
        spawns: [
          S('runner', -5.2, -37.3, { entry: 'leap' }),
          S('runner', -3.9, -37.0, { entry: 'leap', t: 0.2 }),
          S('runner', -7.2, -37.6, { entry: 'leap', t: 0.4 }),
          S('runner', -6.2, -37.4, { entry: 'leap', t: 0.65 }),
          S('crawler', 2.4, -39.5, { y: 3.85, entry: 'drop', t: 1.5 }),
        ],
      },
      {
        start: { remaining: 1 },
        spawns: [
          W(-12.4, -44.5, 'doctor'),
          W(11.8, -45.4, 'patient', { t: 0.9 }),
          S('crawler', -2.2, -45.5, { y: 3.85, entry: 'drop', t: 1.7 }),
          W(-4, -48.6, 'office', { t: 2.4 }),
        ],
      },
    ],
  },
  // ── 3. Corridor A: doors burst open ─────────────────────────────────────
  {
    kind: 'move',
    label: 'to corridor A',
    to: HOLD.corrA,
    speed: 4.0,
    // Something shambles towards you down the corridor as you turn into it.
    waves: [{ start: { atD: dAt(8, -43.6) }, spawns: [W(31, -43.4, 'patient', { frame: 'world' })] }],
  },
  {
    kind: 'hold',
    label: 'corridor A',
    look: L(28, 1.3, -44.4),
    pickups: [P('points', 26, 1.8, -45.2, 1.5), P('smg', 31.6, 1.6, -45.5, 2.5)],
    waves: [
      { spawns: [W(35.5, -44.6, 'patient', { t: 0.4 }), W(41, -43.2, 'nurse', { t: 1.4 })] },
      {
        start: { remaining: 1 },
        spawns: [
          // (Hospital security, right beside you: aim for the head.)
          R(...behindDoor(DOOR.a24, [20.5, -44], 1.7), { entry: 'burst' }),
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
    to: HOLD.corrVent,
    speed: 3.0,
    // A doctor bursts out of the ward door ahead as you walk; you stop 7 m short
    // of it, so it comes at you down the middle of the corridor. (It keeps a
    // longer stand-off than a stock walker: if you let it get close, its ring
    // stays clear of the HUD panels.)
    waves: [
      {
        start: { atD: dAt(26, -44) },
        spawns: [
          S('walker', ...behindDoor(DOOR.a38, [28, -44], 1.6), { frame: 'world', entry: 'burst', opts: { variant: 'doctor', attackRange: 2.4 } }),
        ],
      },
    ],
  },
  {
    // (Only once the doctor is down: the vent crawler is never a second threat on top of it.)
    kind: 'action',
    label: 'corridor A clear',
    run: () => {},
    until: (w) => w.hostileCount() === 0,
  },
  {
    // Something scrabbles in the vent ahead: it drops ~6 m in front of the
    // stopped camera (never onto the rail under a walking one).
    kind: 'hold',
    label: 'corridor vent',
    look: L(37.5, 0.95, -44, 1.1),
    onStart: (w) => ventRattle(w, VENT_A[0], VENT_A[1], [0.15, 0.45, 0.7]),
    waves: [
      { spawns: [S('crawler', VENT_A[0], VENT_A[1], { y: 2.85, entry: 'drop', t: 0.95 })] },
      // Then a runner crashes out of the door ahead on the right (~13 m out).
      // (While the crawler is still dragging itself in: two threats at once.)
      { start: { after: 2.0 }, spawns: [S('runner', ...behindDoor(DOOR.a44, [HOLD_X.corrVent, -44], 1.4), { t: 0.3 })] },
    ],
  },
  // ── 4. Ward 3: something behind every curtain ───────────────────────────
  {
    kind: 'move',
    label: 'into the ward',
    to: HOLD.ward,
    speed: 3.3,
    // A curtain twitches ahead as you walk in: the first patient is already up.
    waves: [{ start: { atD: dAt(45, -44) }, spawns: [W(59.8, -39.6, 'patient', { frame: 'world' })] }],
  },
  {
    kind: 'hold',
    label: 'ward',
    look: L(63, 1.2, -44),
    pickups: [P('health', 66, 1.4, -41.6, 3), P('bomb', 60.6, 1.5, -46.6, 5)],
    waves: [
      { spawns: [W(64, -48.4, 'patient', { t: 0.9 })] },
      {
        start: { remaining: 1 },
        spawns: [
          S('crawler', 64, -38.6, { entry: 'burst' }),
          S('crawler', 59.8, -49.4, { entry: 'burst', t: 0.9 }),
          W(76.5, -44, 'nurse', { t: 1.6 }),
          S('runner', 76.5, -43.2, { t: 2.2 }),
        ],
      },
      {
        start: { remaining: 2 },
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
  {
    kind: 'move',
    label: 'to the nurse station',
    to: D.hubHold,
    speed: 3.8,
    // A runner crashes in through the hub's north door.
    waves: [{ start: { atD: dAt(62, -44) }, spawns: [S('runner', 83.5, -37.4, { frame: 'world' })] }],
  },
  {
    kind: 'hold',
    label: 'nurse station',
    look: L(83, 1.5, -45.2),
    pickups: [P('health', 82.4, 1.5, -40.9, 3)],
    onStart: (w) => w.later(2.2, () => popup(w, 'SHOOT THE BILE!', 0.5, 0.26)),
    waves: [
      {
        spawns: [
          S('spitter', 84.8, -45.6, { t: 0.4, opts: { variant: 'nurse' } }),
          W(83.5, -37.6, 'nurse', { t: 1.4 }),
          W(79.3, -51.6, 'patient', { t: 2.4 }),
        ],
      },
      {
        start: { remaining: 1 },
        // Pincer: runners crash in through the north AND south doors together.
        spawns: [
          S('spitter', 84.6, -42.2, { opts: { variant: 'patient' } }),
          S('runner', 83.5, -37.2, { t: 0.8 }),
          S('runner', 79.3, -51.8, { t: 0.95 }),
          // …and a crawler drags itself in through the south door behind its runner.
          S('crawler', 79.3, -52.6, { t: 1.7, opts: { variant: 'nurse' } }),
          R(79.3, -51.6, { t: 2.2 }),
        ],
      },
      {
        start: { remaining: 2 },
        spawns: [W(80.6, -38, 'patient'), W(83.5, -37.4, 'office', { t: 0.8 }), S('runner', 79.3, -51.8, { t: 1.6 }), S('runner', 83.5, -37.2, { t: 2.3 })],
      },
    ],
  },
  // ── 6. Stairwell: they come up from the basement ────────────────────────
  { kind: 'move', label: 'to the stairs', to: D.stairTop, speed: 3.6 },
  {
    kind: 'hold',
    label: 'stairwell',
    look: L(79, -2.8, -66.5, 1.1),
    pickups: [P('health', 78.2, -1.1, -61.5, 0.5)],
    waves: [
      { spawns: [W(78, -70.5, 'patient', { t: 0.3 }), W(80.6, -72.2, 'nurse', { t: 1.5 }), S('runner', 79, -74.4, { t: 2.4 })] },
      {
        start: { remaining: 1 },
        spawns: [
          S('crawler', 77.4, -62.4, { y: 3.25, entry: 'drop' }),
          S('runner', 79, -74.4, { t: 1.0 }),
          W(77.2, -73.4, 'doctor', { t: 1.8 }),
        ],
      },
      {
        start: { remaining: 2 },
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
    speed: 3.3,
    onStart: (w) => w.later(1.5, () => w.audio.play('zombie_groan', { volume: 0.9, pitch: 0.7 })),
    // One of them is already coming up the stairs.
    waves: [{ start: { atD: D.stairTop + 0.5 }, spawns: [W(80.2, -73.4, 'patient', { frame: 'world', t: 0.4 })] }],
  },
  {
    kind: 'hold',
    label: 'morgue',
    look: L(79.4, B + 1.2, -87),
    pickups: [P('magnum', 76.4, B + 1.5, -83.6, 1), P('health', 83, B + 1.6, -88.4, 6)],
    onStart: (w) => w.later(3.5, () => popup(w, 'SHOOT THE BLOATERS!', 0.5, 0.26)),
    waves: [
      { spawns: [S('bloater', 79.5, -87.4, { t: 0.4 }), W(77.4, -89.4, 'doctor', { t: 0.9 }), W(81.6, -89.2, 'patient', { t: 1.4 })] },
      {
        start: { remaining: 1 },
        spawns: [
          // Drawers bang open on BOTH walls at once: a pincer of crawlers.
          S('crawler', dE1[0], dE1[2], { y: dE1[1], entry: 'drop', opts: { variant: 'patient' } }),
          S('crawler', dW4[0], dW4[2], { y: dW4[1], entry: 'drop', t: 0.25, opts: { variant: 'patient' } }),
          W(79, -97, 'patient', { t: 1.2 }),
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
          S('crawler', dE4[0], dE4[2], { y: dE4[1], entry: 'drop', t: 1.4 }),
          S('crawler', dE6[0], dE6[2], { y: dE6[1], entry: 'drop', t: 2.3 }),
        ],
      },
    ],
  },
  // ── 8. Service corridor → surgery ───────────────────────────────────────
  { kind: 'move', label: 'to the service corridor', to: HOLD.corrB, speed: 3.4 },
  {
    // The vent rattles and a crawler drops ~5 m ahead (left of the rail) — and
    // while it drags itself at you, the DANGER door on the right bursts open and
    // a runner charges from ~9 m out: two threats, one from each side.
    kind: 'hold',
    label: 'service corridor',
    look: L(79.3, B + 1.0, -102.5, 1.0),
    onStart: (w) => ventRattle(w, VENT_B[0], VENT_B[1], [0.1, 0.4, 0.62]),
    waves: [
      {
        spawns: [
          S('crawler', VENT_B[0], VENT_B[1], { y: B + 2.85, entry: 'drop', t: 0.85 }),
          S('runner', ...behindDoor(DOOR_B, [79.6, -98], 1.5), { t: 1.5, opts: { variant: 'worker' } }),
        ],
      },
    ],
  },
  { kind: 'move', label: 'into surgery', to: D.orHold, speed: 3.3 },
  {
    kind: 'hold',
    label: 'operating theatre',
    look: L(82, B + 1.7, -118.4),
    civilians: [{ pos: [77.4, 0, -119.4], world: true, variant: 'scientist', t: 0.4 }],
    pickups: [P('health', 80.6, B + 1.6, -115.2, 1), P('shotgun', 80.6, B + 1.4, -117.5, 5)],
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
          // Something was hiding under the operating table.
          S('crawler', 84.0, -117.6, { entry: 'burst', t: 0.9, opts: { variant: 'patient' } }),
          W(84.8, -125.1, 'patient', { t: 0.6 }),
          W(86.2, -123.2, 'doctor', { t: 1.1 }),
          // (From the back right: its charge never lines up with the doctor on the left.)
          S('runner', 86.2, -125, { t: 2.0 }),
        ],
      },
      {
        start: { remaining: 1 },
        spawns: [S('bloater', 84.2, -123.4), W(81.2, -125.4, 'patient', { t: 0.5 }), W(86, -114.2, 'nurse', { t: 1.2 })],
      },
    ],
  },
  // ── 9. Basement corridor: the brute comes through the wall ──────────────
  { kind: 'move', label: 'towards the atrium', to: D.corrCHold, speed: 3.8 },
  {
    // Something pounds on the boiler-room wall (the lights die with the first
    // thud); the vent overhead rattles loose and a crawler drops ~5 m ahead of
    // the stopped camera — and while you deal with it, the wall gives.
    kind: 'hold',
    label: 'brute',
    look: L(60, B + 1.0, -122.2, 1.0),
    onStart: (w) => {
      wallThuds(w, [0.2, 0.95, 1.6]);
      ventRattle(w, CORR_C_VENT[0], CORR_C_VENT[1], [0.5, 0.78, 1.0]);
      w.later(WALL_GIVES, () => burstWall(w));
    },
    pickups: [
      P('shotgun', 61, B + 1.4, -120, WALL_GIVES),
      P('bomb', 55.6, B + 1.6, -121.8, WALL_GIVES + 4),
      // (A first-aid kit for after the fight: the brute's smash costs two hearts.)
      P('health', 58.4, B + 1.5, -120.6, WALL_GIVES + 9),
    ],
    waves: [
      { spawns: [S('crawler', CORR_C_VENT[0], CORR_C_VENT[1], { y: B + 3.05, entry: 'drop', t: 1.25 })] },
      {
        start: { after: WALL_GIVES },
        spawns: [
          // (Tougher and faster than stock: it comes for you through the dust, and
          // only headshots stop its long super-armoured windup.)
          S('brute_z2', 58.9, -124.3, { entry: 'burst', hp: 2.0, speed: 1.4 }),
          // Runners pour through the breach behind it, timed to reach you while
          // it winds up: split your fire.
          S('runner', 59.6, -124.8, { entry: 'burst', t: 2.6 }),
          S('runner', 58.2, -124.8, { entry: 'burst', t: 3.4 }),
          S('runner', 59.0, -124.9, { entry: 'burst', t: 4.6 }),
          W(52.6, -120.2, 'patient', { t: 2.4 }),
          R(52.8, -121.9, { t: 3.2 }),
        ],
      },
      {
        start: { remaining: 1 },
        spawns: [S('runner', 51.5, -121, { t: 0.2 }), S('crawler', 59.4, -124.6, { entry: 'burst', t: 0.9 }), W(52.4, -119.6, 'doctor', { t: 1.6 })],
      },
    ],
  },
  // ── Boss: PATIENT ZERO ──────────────────────────────────────────────────
  { kind: 'move', label: 'into the atrium', to: RAIL_LENGTH, speed: 4.0, look: L(POOL[0], B + 2.2, POOL[2], 1.3) },
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
  { kind: 'wait', label: 'the cocoon splits', duration: 1.2 },
  {
    kind: 'boss',
    label: 'PATIENT ZERO',
    boss: 'patient_zero',
    pos: [POOL[0], B, POOL[2]],
    world: true,
    // (Nearly level: keeps the pool crawlers' heads and rings well above the bottom HUD.)
    look: L(POOL[0] + 1.5, B + 2.25, POOL[2], 1.5),
    // (Timed for a ~60–80 s fight.)
    pickups: [
      P('shotgun', 42.6, B + 1.8, -118.4, 8),
      P('health', 42.8, B + 1.8, -123.6, 24),
      P('bomb', 42.2, B + 2.3, -121.2, 38),
      P('health', 42.6, B + 1.8, -118.6, 52),
      P('magnum', 42.8, B + 1.8, -123.4, 64),
    ],
    // Stragglers vault the far balcony rail behind PATIENT ZERO (~22 m out,
    // ±9 m) and come at you through the middle of the frame, one at a time:
    // their stand-off keeps the windup ring clear of the HUD panels.
    waves: [
      { start: { after: 12 }, spawns: [balconyWalker(-1, 'office')] },
      { start: { after: 21 }, spawns: [balconyWalker(1, 'patient'), balconyWalker(-1, 'nurse', 4.5)] },
      { start: { after: 33 }, spawns: [balconyWalker(1, 'worker')] },
      { start: { after: 44 }, spawns: [balconyWalker(-1, 'doctor'), balconyWalker(1, 'patient', 4.5)] },
      { start: { after: 58 }, spawns: [balconyWalker(-1, 'nurse'), balconyWalker(1, 'office', 4.5)] },
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
    // (First entity in the world: it updates before every enemy — see director.ts.)
    world.add(new Director(world));
    spawnProps(world);
  },
};
