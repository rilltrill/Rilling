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
 *
 * As the campaign finale it is the hardest DEAD ZONE stage, tuned with the
 * human-like bot (tests/unit/humanbot.test.ts, seeds 1–12): ≈ 3.5–4 hearts lost
 * at σ 0.03 and ≈ 7–7.5 at σ 0.05 (the challenge of the build the owner played),
 * spread over the riot-brute stops and the boss — the army barricade is the
 * heaviest stop (≈ 1.5 at σ 0.03), and no regular fight regularly costs 3+.
 */

/** World position at rail distance d, x metres right, y up (for `world: true` spawns/looks). */
function W(d: number, x: number, y = 0): V3 {
  const p = EnvKit.besideRail(railCurve(), d, x, y);
  return [p.x, p.y, p.z];
}

let viewModel: TruckViewModel | null = null;

/**
 * FINALE TOUGHNESS. The truck's twin gun (0.8 a round, ~14 rounds/s) shreds the
 * stock roster before most of it can strike, which left the campaign finale's
 * regular fights harmless. Out here the dead are tougher (spawn hp multipliers,
 * unless a spawn sets its own) and they come in pincers (minions.ts): runner
 * packs that creep up both flanks out of sight and rush together, spitters on
 * the overpass deck, and at every stop a riot brute that can't be staggered by
 * the light rounds. Its pack slips aboard first and lies in wait; the brute
 * vaults in close and the pack comes round both sides with it, so the short
 * runner rings land while the big one soaks fire and heats the barrels. The
 * brute's smash ring closes on its split, glowing skull ("SHOOT THE HEAD!"):
 * the head takes ×2.5, the riot plates only dent (RIOT_ARMOR_DENT), so a
 * body-aimer still gets there, just slower. A player who hosepipes the nearest
 * target gets punished; one who answers the rings in order (and feathers the
 * trigger to keep the barrels cool) stays clean. Every attack still starts
 * framed in the middle band of the screen with a clear line of fire.
 */
const TOUGH: Record<string, number> = {
  walker: 1.6,
  truck_runner: 1.6,
  pack_runner: 2,
  crawler: 1.4,
  roadside_crawler: 1.4,
  riot_brute: 1.8,
  bloater: 1.4,
  spitter: 1.4,
  deck_spitter: 1.4,
};

function toughen(list: Beat[]): Beat[] {
  for (const b of list) {
    if (!('waves' in b) || !b.waves) continue;
    for (const wave of b.waves) for (const s of wave.spawns) if (s.hp === undefined && TOUGH[s.type]) s.hp = TOUGH[s.type];
  }
  return list;
}

const beats: Beat[] = toughen([
  {
    kind: 'banner',
    label: 'title',
    text: 'HIGHWAY TO HELL',
    sub: 'DEAD ZONE · FINAL STAGE',
    duration: 3.2,
    look: { yaw: 172, pitch: 5, blend: 0.4 },
    onStart: (w) => w.audio.play('engine_rev', { volume: 0.8 }),
  },
  // ── 1. Out of the city: runners chase the truck, in packs from both sides. ──
  {
    kind: 'move',
    label: 'leaving the city',
    to: D.PILEUP_STOP,
    speed: 11,
    onStart: (w) => {
      w.hud.prompt('HOLD TO FIRE!');
      w.later(2.5, () => w.hud.prompt(null));
    },
    pickups: [{ kind: 'points', pos: [4.2, 2.4, 46], t: 1.5 }],
    waves: [
      {
        start: { atD: 14 },
        spawns: [
          { type: 'truck_runner', pos: [-6.5, 0, 13], entry: 'leap', opts: { variant: 'civilian' } },
          { type: 'truck_runner', pos: [6.5, 0, 15], entry: 'leap', t: 0.7, opts: { variant: 'office' } },
        ],
      },
      {
        start: { atD: 50 },
        spawns: [
          { type: 'roadside_walker', frame: 'world', pos: [-2.6, 0, 25], opts: { variant: 'civilian' } },
          { type: 'roadside_walker', frame: 'world', pos: [3.2, 0, 27], opts: { variant: 'cop' } },
          { type: 'roadside_walker', frame: 'world', pos: [-5.2, 0, 29], opts: { variant: 'office' } },
          { type: 'truck_runner', pos: [-4, 0, -7], entry: 'leap', t: 1.2, opts: { variant: 'biker' } },
          { type: 'truck_runner', pos: [4.5, 0, -8], entry: 'leap', t: 1.5, opts: { variant: 'worker' } },
        ],
      },
      {
        // The first pincer: three climb over the tailgate, creep up the flanks out of sight and come round together.
        start: { atD: 92 },
        spawns: [
          { type: 'pack_runner', pos: [4, 0, -8], entry: 'leap', opts: { variant: 'worker', pack: 'city' } },
          { type: 'pack_runner', pos: [-4.5, 0, -7], entry: 'leap', t: 0.3, opts: { variant: 'nurse', pack: 'city' } },
          { type: 'pack_runner', pos: [5.5, 0, -9], entry: 'leap', t: 0.6, opts: { variant: 'cop', pack: 'city' } },
          { type: 'truck_runner', pos: [-7, 0, 12], entry: 'leap', t: 0.3 },
          { type: 'roadside_walker', frame: 'world', pos: [2.6, 0, 25], t: 0.2, opts: { variant: 'nurse' } },
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
          { type: 'walker', pos: [-3.0, 0, 17], t: 0.9, opts: { variant: 'office' } },
          { type: 'crawler', pos: [1.6, 0, 8.5], entry: 'rise', t: 1.6 },
        ],
      },
      {
        start: { remaining: 1 },
        spawns: [
          { type: 'walker', pos: [-9.5, 0, 9], opts: { variant: 'worker' } },
          { type: 'walker', pos: [-11.5, 0, 12], t: 0.4, opts: { variant: 'nurse' } },
          { type: 'crawler', pos: [-3.6, 0, 8], entry: 'rise', t: 1.0 },
          { type: 'pack_runner', pos: [4.5, 0, -5], entry: 'leap', t: 1.8, opts: { variant: 'civilian', pack: 'pile' } },
          { type: 'pack_runner', pos: [-5, 0, -6], entry: 'leap', t: 2.1, opts: { variant: 'office', pack: 'pile' } },
          { type: 'pack_runner', pos: [-4, 0, -8], entry: 'leap', t: 2.4, opts: { variant: 'worker', pack: 'pile' } },
        ],
      },
      {
        // A pack slips aboard and lies in wait beside the truck; then a brute vaults the police
        // cruiser, lands a few metres off the bumper, and the pack comes round both sides with it.
        start: { remaining: 1 },
        spawns: [
          { type: 'pack_runner', pos: [-4.5, 0, -6], entry: 'leap', opts: { pack: 'pile2', cue: 'brute', wait: 9 } },
          { type: 'pack_runner', pos: [5, 0, -7], entry: 'leap', t: 0.3, opts: { variant: 'worker', pack: 'pile2', cue: 'brute', wait: 9 } },
          { type: 'pack_runner', pos: [4, 0, -9], entry: 'leap', t: 0.6, opts: { variant: 'nurse', pack: 'pile2', cue: 'brute', wait: 9 } },
          { type: 'riot_brute', pos: [-4.6, 0, 8.4], entry: 'leap', t: 2.2, opts: { landAt: [-1.6, 0, 4.1], leapArc: 2.8 } },
          { type: 'walker', pos: [-3.4, 0, 16], t: 0.3, opts: { variant: 'patient' } },
          { type: 'walker', pos: [4.4, 0, 15.5], t: 0.6, opts: { variant: 'doctor' } },
          { type: 'bloater', pos: [3.7, 0, 17.5], t: 2.4 },
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
          { type: 'pack_runner', pos: [-5, 0, -6], entry: 'leap', opts: { variant: 'biker', pack: 'ram' } },
          { type: 'pack_runner', pos: [5.5, 0, -7], entry: 'leap', t: 0.3, opts: { pack: 'ram' } },
          { type: 'pack_runner', pos: [-4, 0, -8], entry: 'leap', t: 0.6, opts: { variant: 'soldier', pack: 'ram' } },
          { type: 'truck_runner', pos: [6.8, 0, 12], entry: 'leap', t: 0.9, opts: { variant: 'worker' } },
        ],
      },
      {
        start: { atD: 206 },
        spawns: [
          { type: 'truck_runner', pos: [6.8, 0, 12], entry: 'leap', opts: { variant: 'worker' } },
          { type: 'truck_runner', pos: [-4.5, 0, -7], entry: 'leap', t: 0.5, opts: { variant: 'civilian' } },
        ],
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
          { type: 'deck_spitter', frame: 'world', world: true, pos: W(D.OVERPASS - 4.5, 4.4, 7.3), t: 2.4 },
        ],
      },
    ],
  },
  {
    kind: 'hold',
    label: 'ambush from the deck',
    // Looking up at the deck edge (pitch ≈ 5°): the dead drop off it and a spitter holds the far end.
    look: { at: [0.5, 3.4, 17], blend: 0.8 },
    pickups: [{ kind: 'health', pos: [-5.5, 8.8, 19.2], t: 1 }],
    waves: [
      {
        spawns: [
          { type: 'walker', pos: [-1.5, 7.3, 19.2], entry: 'drop', opts: { variant: 'worker' } },
          { type: 'walker', pos: [3.2, 7.3, 19.4], entry: 'drop', t: 0.9, opts: { variant: 'civilian' } },
          { type: 'deck_spitter', pos: [12, 7.3, 19.6], t: 1.6 },
          // Two runners vault off the deck and sprint for the truck while the walkers shamble in.
          { type: 'truck_runner', pos: [-3.6, 7.3, 19.3], entry: 'drop', t: 2.2, opts: { variant: 'soldier' } },
          { type: 'truck_runner', pos: [4.6, 7.3, 19.5], entry: 'drop', t: 2.6, opts: { variant: 'biker' } },
          { type: 'walker', pos: [-5.5, 7.3, 19.3], entry: 'drop', t: 3.2, opts: { variant: 'soldier' } },
        ],
      },
    ],
  },
  {
    kind: 'hold',
    label: 'under the overpass',
    // Back down to the road (camera level) before anything can reach the truck.
    look: { at: [0, 1.5, 14], blend: 0.9 },
    waves: [
      {
        spawns: [
          { type: 'walker', pos: [0, 0, 24], opts: { variant: 'office' } },
          { type: 'walker', pos: [-3, 0, 26], t: 0.4, opts: { variant: 'patient' } },
          { type: 'walker', pos: [3, 0, 27], t: 0.8, opts: { variant: 'cop' } },
          { type: 'truck_runner', pos: [-7, 0, 9], entry: 'leap', t: 1.4 },
          { type: 'truck_runner', pos: [7, 0, 10], entry: 'leap', t: 1.7, opts: { variant: 'nurse' } },
          { type: 'walker', pos: [-4.5, 7.3, 19.3], entry: 'drop', t: 2.4, opts: { variant: 'soldier' } },
          { type: 'truck_runner', pos: [2.5, 7.3, 19.4], entry: 'drop', t: 3.0, opts: { variant: 'worker' } },
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
          { type: 'truck_runner', pos: [-4, 0, -6], entry: 'leap', opts: { variant: 'nurse' } },
          { type: 'truck_runner', pos: [4.5, 0, -8], entry: 'leap', t: 0.6 },
          { type: 'truck_runner', pos: [-6.8, 0, 12], entry: 'leap', t: 1.0, opts: { variant: 'office' } },
        ],
      },
      {
        start: { atD: 322 },
        spawns: [
          { type: 'roadside_walker', frame: 'world', pos: [-3, 0, 26], opts: { variant: 'doctor' } },
          { type: 'roadside_walker', frame: 'world', pos: [2.8, 0, 28], opts: { variant: 'worker' } },
          { type: 'roadside_walker', frame: 'world', pos: [5.6, 0, 31], opts: { variant: 'civilian' } },
        ],
      },
      {
        start: { atD: 352 },
        spawns: [
          { type: 'truck_runner', pos: [6.5, 0, 10], entry: 'leap' },
          { type: 'pack_runner', pos: [-4, 0, -7], entry: 'leap', t: 0.3, opts: { variant: 'biker', pack: 'bill' } },
          { type: 'pack_runner', pos: [4.5, 0, -8], entry: 'leap', t: 0.6, opts: { pack: 'bill' } },
          { type: 'pack_runner', pos: [-3.5, 0, -9], entry: 'leap', t: 0.9, opts: { variant: 'soldier', pack: 'bill' } },
        ],
      },
      {
        start: { atD: 384 },
        spawns: [
          { type: 'roadside_crawler', frame: 'world', pos: [-3, 0, 36], entry: 'rise' },
          { type: 'roadside_crawler', frame: 'world', pos: [3.2, 0, 40], entry: 'rise', t: 0.3 },
        ],
      },
      {
        start: { atD: 404 },
        spawns: [
          { type: 'truck_runner', pos: [4, 0, -7], entry: 'leap', opts: { variant: 'cop' } },
          { type: 'truck_runner', pos: [-6.8, 0, 11], entry: 'leap', t: 0.5, opts: { variant: 'worker' } },
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
          { type: 'truck_runner', pos: [-6.5, 0, -6], entry: 'leap', t: 2.6, opts: { variant: 'civilian' } },
        ],
      },
      {
        // A pack creeps aboard, then a brute vaults the median from the oncoming lanes and they rush with it.
        start: { remaining: 1 },
        spawns: [
          { type: 'pack_runner', pos: [5, 0, -6], entry: 'leap', opts: { variant: 'worker', pack: 'tank1', cue: 'brute', wait: 9 } },
          { type: 'pack_runner', pos: [-5, 0, -7], entry: 'leap', t: 0.3, opts: { variant: 'biker', pack: 'tank1', cue: 'brute', wait: 9 } },
          { type: 'pack_runner', pos: [4.5, 0, -9], entry: 'leap', t: 0.6, opts: { variant: 'cop', pack: 'tank1', cue: 'brute', wait: 9 } },
          { type: 'riot_brute', pos: [-8.6, 0, 9.5], entry: 'leap', t: 2.2, opts: { landAt: [-2, 0, 3.8], leapArc: 3 } },
          { type: 'walker', pos: [-11, 0, 15], t: 0.5, opts: { variant: 'nurse' } },
          { type: 'walker', pos: [-12.5, 0, 19], t: 0.9, opts: { variant: 'soldier' } },
          { type: 'walker', pos: [-9.6, 0, 21], t: 1.3, opts: { variant: 'patient' } },
        ],
      },
      {
        start: { remaining: 1 },
        spawns: [
          { type: 'pack_runner', pos: [5, 0, -7], entry: 'leap', opts: { pack: 'tank' } },
          { type: 'pack_runner', pos: [-5, 0, -6], entry: 'leap', t: 0.4, opts: { variant: 'biker', pack: 'tank' } },
          { type: 'pack_runner', pos: [4.5, 0, -9], entry: 'leap', t: 0.7, opts: { variant: 'office', pack: 'tank' } },
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
          { type: 'truck_runner', pos: [7, 0, 10], entry: 'leap', opts: { variant: 'worker' } },
          { type: 'truck_runner', pos: [-7, 0, 12], entry: 'leap', t: 0.5 },
          { type: 'truck_runner', pos: [-4, 0, -7], entry: 'leap', t: 0.9, opts: { variant: 'cop' } },
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
          { type: 'pack_runner', pos: [-3.5, 0, -7], entry: 'leap', opts: { variant: 'patient', pack: 'tun' } },
          { type: 'pack_runner', pos: [3.5, 0, -9], entry: 'leap', t: 0.4, opts: { pack: 'tun' } },
          { type: 'crawler', pos: [0.8, 6, 10], entry: 'drop', t: 1.4 },
          { type: 'pack_runner', pos: [4.5, 0, -7], entry: 'leap', t: 0.8, opts: { variant: 'soldier', pack: 'tun' } },
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
          { type: 'walker', pos: [-3, 0, 17], t: 0.8, opts: { variant: 'office' } },
          { type: 'walker', pos: [2.5, 0, 19], t: 1.2, opts: { variant: 'civilian' } },
          { type: 'walker', pos: [0, 0, 22], t: 1.6, opts: { variant: 'patient' } },
          { type: 'walker', pos: [-5.5, 0, 21], t: 2.0, opts: { variant: 'nurse' } },
          { type: 'crawler', pos: [2.2, 6.5, 10], entry: 'drop', t: 2.6 },
        ],
      },
      {
        start: { remaining: 1 },
        spawns: [
          { type: 'pack_runner', pos: [-2, 0, -9], opts: { pack: 'stall' } },
          { type: 'pack_runner', pos: [3, 0, -11], t: 0.4, opts: { pack: 'stall' } },
          { type: 'pack_runner', pos: [-4.5, 0, -10], t: 0.8, opts: { variant: 'soldier', pack: 'stall' } },
          { type: 'bloater', pos: [0.5, 0, 16], t: 1.0 },
          { type: 'walker', pos: [-2.5, 0, 18], t: 1.4, opts: { variant: 'doctor' } },
          { type: 'walker', pos: [3.2, 0, 19], t: 1.6, opts: { variant: 'cop' } },
        ],
      },
      {
        // Out of the dark: a brute leaps off the walkway into the headlight while crawlers drop from the ceiling.
        start: { remaining: 1 },
        spawns: [
          { type: 'crawler', pos: [-2.5, 6.5, 9], entry: 'drop' },
          { type: 'crawler', pos: [2.5, 6.5, 11], entry: 'drop', t: 0.4 },
          { type: 'pack_runner', pos: [4.5, 0, -8], t: 0.2, opts: { variant: 'nurse', pack: 'stall2', cue: 'brute', wait: 9 } },
          { type: 'pack_runner', pos: [-4, 0, -9], t: 0.5, opts: { variant: 'worker', pack: 'stall2', cue: 'brute', wait: 9 } },
          { type: 'pack_runner', pos: [3.5, 0, -10], t: 0.8, opts: { variant: 'office', pack: 'stall2', cue: 'brute', wait: 9 } },
          { type: 'riot_brute', pos: [-5.8, 0, 9.5], t: 2.6, entry: 'leap', opts: { landAt: [-1.4, 0, 3.9], leapArc: 2.6 } },
          { type: 'walker', pos: [-4, 0, 16], t: 1.2, opts: { variant: 'worker' } },
          { type: 'walker', pos: [4, 0, 17], t: 1.5, opts: { variant: 'soldier' } },
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
          { type: 'truck_runner', pos: [-4, 0, -6], entry: 'leap', opts: { variant: 'office' } },
          { type: 'truck_runner', pos: [4, 0, -7.5], entry: 'leap', t: 0.5 },
          { type: 'truck_runner', pos: [0.5, 0, -9], entry: 'leap', t: 0.9, opts: { variant: 'patient' } },
        ],
      },
      {
        start: { atD: D.TUNNEL_TO + 14 },
        spawns: [
          { type: 'roadside_walker', frame: 'world', pos: [-3, 0, 27], opts: { variant: 'soldier' } },
          { type: 'roadside_walker', frame: 'world', pos: [3.4, 0, 30], opts: { variant: 'soldier' } },
          { type: 'pack_runner', pos: [4, 0, -7], entry: 'leap', t: 1.0, opts: { variant: 'soldier', pack: 'bridge' } },
          { type: 'pack_runner', pos: [-4, 0, -6], entry: 'leap', t: 1.3, opts: { pack: 'bridge' } },
          { type: 'pack_runner', pos: [-4, 0, -8.5], entry: 'leap', t: 1.7, opts: { variant: 'soldier', pack: 'bridge' } },
        ],
      },
    ],
  },
  // ── 10. Overrun army checkpoint on the bridge: the toughest stop before the giant. ──
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
          { type: 'truck_runner', pos: [-5, 0, -7], entry: 'leap', t: 1.8, opts: { variant: 'soldier' } },
        ],
      },
      {
        // Over the sandbags on the left (the cop is on the right), pack in tow.
        start: { remaining: 1 },
        spawns: [
          { type: 'pack_runner', pos: [-4.5, 0, -7], entry: 'leap', opts: { variant: 'soldier', pack: 'barr1', cue: 'brute', wait: 9 } },
          { type: 'pack_runner', pos: [4.5, 0, -6], entry: 'leap', t: 0.3, opts: { variant: 'soldier', pack: 'barr1', cue: 'brute', wait: 9 } },
          { type: 'pack_runner', pos: [-4, 0, -8.5], entry: 'leap', t: 0.6, opts: { variant: 'soldier', pack: 'barr1', cue: 'brute', wait: 9 } },
          { type: 'riot_brute', pos: [-6.5, 0, 9.5], entry: 'leap', t: 2.2, opts: { landAt: [-1.8, 0, 4.1], leapArc: 2.8 } },
          { type: 'walker', pos: [-9.5, 0, 14], t: 0.4, opts: { variant: 'soldier' } },
          { type: 'walker', pos: [-12, 0, 16], t: 0.8, opts: { variant: 'biker' } },
          { type: 'spitter', pos: [7, 0, 20], t: 1.2 },
          { type: 'spitter', pos: [-6, 0, 22], t: 2.0, opts: { variant: 'soldier' } },
        ],
      },
      {
        // The last stand before the giant: the last pack rushes as soon as it's round both
        // flanks, and a second riot brute vaults the sandbags (left of centre, away from the
        // cop) on its heels — back-to-back threats rather than one pile-on.
        start: { remaining: 1 },
        spawns: [
          { type: 'pack_runner', pos: [-4.5, 0, -7], entry: 'leap', opts: { variant: 'soldier', pack: 'barr' } },
          { type: 'pack_runner', pos: [4.5, 0, -7], entry: 'leap', t: 0.4, opts: { variant: 'soldier', pack: 'barr' } },
          { type: 'pack_runner', pos: [5, 0, -9], entry: 'leap', t: 0.8, opts: { variant: 'soldier', pack: 'barr' } },
          { type: 'bloater', pos: [-1.5, 0, 16], t: 0.9 },
          { type: 'walker', pos: [1, 0, 19], t: 1.3, opts: { variant: 'soldier' } },
          { type: 'walker', pos: [-3, 0, 17], t: 1.8, opts: { variant: 'soldier' } },
          { type: 'riot_brute', pos: [-5.5, 0, 12], entry: 'leap', t: 2.2, opts: { landAt: [-0.8, 0, 4.1], leapArc: 2.8 } },
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
    // (The Behemoth paces the truck itself from here on — see Behemoth.pace.)
    moveTo: D.BOSS_END,
    speed: 4,
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
          { type: 'tail_runner', pos: [-5, 0, -11], entry: 'leap', opts: { variant: 'worker' } },
        ],
      },
    ],
  },
  // The giant went over the rail while the truck pulled away (see Behemoth.updateDeath):
  // eyes back on the open road and roll the credits — no empty drive to the results.
  {
    kind: 'action',
    label: 'escape',
    look: 'path',
    duration: 0.6,
    run: (w) => {
      w.audio.play('engine_rev', { volume: 1 });
      w.hud.prompt(null);
      w.rig.moveTo(Math.min(w.rig.length, Math.max(w.rig.d + 90, D.BOSS_END)), 18);
    },
  },
]);

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
