import type { Beat, StageDef } from '../../../gameplay/StageTypes';
import type { World } from '../../../gameplay/World';
import { RAIL } from './layout';
import { buildEnv, z1Scene } from './env';
import { GlassPane } from './setpieces';
import { explosiveBarrel } from '../../../gameplay/Props';
import './boss';
import { bakeMerge } from './bake';
import type { Destructible } from '../../../gameplay/Props';

/**
 * STAGE 1 — MAIN STREET (Dead Zone).
 *
 * Night, the evening the outbreak hit. Through the police barricade, down a
 * wet, neon-lit Main Street (diner, cinema, pharmacy), through a back alley,
 * onto Second Street (police station, gas station, overturned school bus) and
 * into the town square, where THE BUTCHER bursts out of PRIME MEATS.
 *
 * As the opening stage it teaches one idea per encounter: single walkers →
 * window ambush → crawlers → first runner → droppers from above → civilian
 * rescue → explosive barrels → runner swarm → mixed arena with a brute and
 * rooftop spitters → boss.
 */

function popupCenter(w: World, text: string, x = 0.5, y = 0.32) {
  w.hud.popup(text, w.viewport.width * x, w.viewport.height * y, 'warning');
}

const beats: Beat[] = [
  {
    kind: 'banner',
    text: 'MAIN STREET',
    sub: 'STAGE 1 · DEAD ZONE',
    duration: 2.6,
    look: { at: [0, 1.4, 14] },
  },
  // ── 1. First contact: one at a time, out of the fog ──────────────────────
  { kind: 'move', label: 'through the barricade', to: 20, speed: 2.6 },
  {
    kind: 'hold',
    label: 'first contact',
    look: { at: [0, 1.3, 16], blend: 1.5 },
    pickups: [{ kind: 'shotgun', pos: [4.6, 1.85, 7.3], t: 0.5 }],
    waves: [
      { spawns: [{ type: 'walker', pos: [0.6, 0, 21], t: 0.8, opts: { variant: 'cop' } }] },
      { spawns: [{ type: 'walker', pos: [-4.4, 0, 15], opts: { variant: 'civilian' } }] },
      {
        spawns: [
          { type: 'walker', pos: [3.4, 0, 17], opts: { variant: 'office' } },
          { type: 'walker', pos: [-1.8, 0, 22], t: 1.4, opts: { variant: 'worker' } },
        ],
      },
      { start: { remaining: 1 }, spawns: [{ type: 'walker', pos: [6, 0, 14], t: 0.4, opts: { variant: 'civilian' } }] },
    ],
  },
  // ── 2. The diner: shapes behind the glass, then through it ───────────────
  { kind: 'move', label: 'to the diner', to: 46, speed: 3.0 },
  {
    kind: 'hold',
    label: 'diner',
    look: { at: [-8, 1.6, 9.5], blend: 1.2 },
    pickups: [{ kind: 'points', pos: [-6.2, 3.9, 11], t: 2 }],
    waves: [
      { spawns: [{ type: 'walker', pos: [-8.4, 0, 15.6], t: 0.6, opts: { variant: 'worker' } }] },
      {
        start: { after: 6 },
        spawns: [
          // One shambles up to the window from behind the booths, one crashes straight through.
          { type: 'walker', pos: [-14.5, 0, 5.7], opts: { variant: 'civilian' } },
          { type: 'walker', pos: [-11.6, 0, 6.2], t: 2.2, entry: 'burst', opts: { variant: 'office' } },
        ],
      },
      {
        start: { remaining: 1 },
        spawns: [
          { type: 'walker', pos: [-11.6, 0, 12.3], entry: 'burst', opts: { variant: 'worker' } },
          { type: 'crawler', pos: [-11.4, 0, 11.6], t: 0.6, entry: 'burst' },
          { type: 'walker', pos: [1.5, 0, 21], t: 1.2, opts: { variant: 'civilian' } },
        ],
      },
    ],
  },
  // ── 3. Burning car / intersection: crawlers rise from the asphalt ────────
  {
    kind: 'move',
    label: 'past the burning car',
    to: 84,
    speed: 3.2,
    waves: [{ start: { atD: 58 }, spawns: [{ type: 'walker', pos: [-3, 0, 15], frame: 'world', opts: { variant: 'office' } }] }],
  },
  {
    kind: 'hold',
    label: 'crawlers',
    look: { at: [0, 1.0, 13], blend: 1.3 },
    pickups: [{ kind: 'health', pos: [-3.6, 1.3, 6.5] }],
    waves: [
      { spawns: [{ type: 'crawler', pos: [-2.2, 0, 9], t: 0.5, entry: 'rise' }] },
      {
        spawns: [
          { type: 'walker', pos: [3.5, 0, 15], opts: { variant: 'nurse' } },
          { type: 'walker', pos: [-5.5, 0, 18], t: 1, opts: { variant: 'civilian' } },
          { type: 'crawler', pos: [1.4, 0, 11], t: 2.4, entry: 'rise' },
        ],
      },
      {
        start: { remaining: 1 },
        spawns: [
          { type: 'walker', pos: [8, 0, 17], t: 0.4, opts: { variant: 'biker' } },
          { type: 'walker', pos: [10, 0, 19.5], t: 1.2, opts: { variant: 'office' } },
        ],
      },
    ],
  },
  // ── 4. Pharmacy: staff and patients… and the first runner ───────────────
  {
    kind: 'move',
    label: 'up Main Street',
    to: 126,
    speed: 3.3,
    waves: [{ start: { atD: 104 }, spawns: [{ type: 'runner', pos: [-1, 0, 20], frame: 'world' }] }],
  },
  {
    kind: 'hold',
    label: 'pharmacy',
    look: { at: [4, 1.4, 11], blend: 1.3 },
    pickups: [{ kind: 'health', pos: [-3, 1.3, 7], t: 4 }],
    waves: [
      {
        spawns: [
          { type: 'walker', pos: [7.6, 0, 9], t: 0.3, opts: { variant: 'patient' } },
          { type: 'walker', pos: [8, 0, 12.5], t: 1.6, opts: { variant: 'nurse' } },
        ],
      },
      {
        spawns: [
          { type: 'walker', pos: [6.5, 0, 15], opts: { variant: 'doctor' } },
          { type: 'runner', pos: [-2, 0, 24], t: 1.6 },
          { type: 'crawler', pos: [3, 0, 10], t: 2.6, entry: 'rise' },
        ],
      },
      {
        start: { remaining: 1 },
        spawns: [
          { type: 'walker', pos: [7.2, 0, 14.5], opts: { variant: 'patient' } },
          { type: 'runner', pos: [-5, 0, 21], t: 1.2 },
        ],
      },
    ],
  },
  // ── 5. The alley: they drop from the fire escapes ────────────────────────
  { kind: 'move', label: 'into the alley', to: 184, speed: 3.1 },
  {
    kind: 'hold',
    label: 'alley',
    look: { at: [0, 3.2, 10], blend: 1.2 },
    pickups: [{ kind: 'bomb', pos: [-2.3, 5.5, 9], t: 0.5 }],
    waves: [
      { spawns: [{ type: 'walker', pos: [2.3, 8.2, 6.8], t: 1.0, entry: 'drop', opts: { variant: 'worker' } }] },
      {
        spawns: [
          { type: 'walker', pos: [-2.3, 8.2, 8.6], entry: 'drop', opts: { variant: 'civilian' } },
          { type: 'walker', pos: [0.5, 0, 18], t: 0.8, opts: { variant: 'biker' } },
          { type: 'crawler', pos: [2.2, 6, 7.4], t: 2.0, entry: 'drop' },
        ],
      },
      {
        start: { remaining: 1 },
        spawns: [
          { type: 'walker', pos: [-1, 0, 16], opts: { variant: 'worker' } },
          { type: 'walker', pos: [1.5, 0, 19], t: 0.8, opts: { variant: 'biker' } },
          { type: 'walker', pos: [-2.3, 8.2, 7.6], t: 1.6, entry: 'drop', opts: { variant: 'civilian' } },
        ],
      },
    ],
    onEnd: (w) => w.rig.look('path'),
  },
  // ── 6. Rescue: a cop pinned against her cruiser ──────────────────────────
  { kind: 'move', label: 'onto Second Street', to: 228, speed: 3.1 },
  {
    kind: 'hold',
    label: 'rescue',
    look: { at: [0.5, 1.2, 12], blend: 1.2 },
    civilians: [{ pos: [3.8, 0, 8.2], variant: 'cop' }],
    pickups: [{ kind: 'health', pos: [-2.5, 1.3, 7] }],
    onStart: (w) => w.later(0.8, () => popupCenter(w, "DON'T SHOOT THE COP!", 0.62, 0.28)),
    waves: [
      {
        spawns: [
          { type: 'walker', pos: [-5, 0, 13], t: 0.8, opts: { variant: 'soldier' } },
          { type: 'walker', pos: [-3, 0, 18], t: 1.8, opts: { variant: 'civilian' } },
        ],
      },
      {
        spawns: [
          { type: 'walker', pos: [-6.5, 0, 11], opts: { variant: 'cop' } },
          { type: 'runner', pos: [-1, 0, 22], t: 1.5 },
        ],
      },
      {
        start: { remaining: 1 },
        spawns: [
          { type: 'walker', pos: [-1.5, 0, 19], opts: { variant: 'office' } },
          { type: 'walker', pos: [-4, 0, 17], t: 0.7, opts: { variant: 'worker' } },
        ],
      },
    ],
  },
  // ── 7. Gas station: shoot the barrels ────────────────────────────────────
  { kind: 'move', label: 'to the gas station', to: 250, speed: 3.1 },
  {
    kind: 'hold',
    label: 'gas station',
    look: { at: [-11, 1.4, 10], blend: 1.3 },
    civilians: [{ pos: [5, 0, 9.5], variant: 'worker', t: 0.5 }],
    pickups: [{ kind: 'smg', pos: [-5, 1.3, 6], t: 1 }],
    onStart: (w) => w.later(1.6, () => popupCenter(w, 'SHOOT THE BARRELS!', 0.36, 0.3)),
    waves: [
      {
        spawns: [
          { type: 'walker', pos: [-14, 0, 12], t: 0.3, opts: { variant: 'worker' } },
          { type: 'walker', pos: [-19, 0, 9], t: 1.0, opts: { variant: 'civilian' } },
          { type: 'walker', pos: [-13, 0, 15], t: 1.8, opts: { variant: 'biker' } },
        ],
      },
      {
        start: { after: 9 },
        spawns: [
          { type: 'bloater', pos: [-16, 0, 10] },
          { type: 'walker', pos: [-20, 0, 6.5], t: 0.8, opts: { variant: 'office' } },
          { type: 'walker', pos: [-12.5, 0, 16], t: 1.4, opts: { variant: 'worker' } },
        ],
      },
      {
        start: { remaining: 1 },
        spawns: [{ type: 'walker', pos: [-26, 0, 9], count: 4, every: 0.55, offset: [0.6, 0, 1.8], opts: { variant: 'civilian' } }],
      },
    ],
  },
  {
    kind: 'action',
    label: 'chain reaction',
    run: (w) => {
      const sc = z1Scene(w);
      if (sc && sc.town.gas.anyLeft) {
        popupCenter(w, 'GET DOWN!', 0.4, 0.3);
        sc.town.gas.blowAll(w);
      }
    },
  },
  { kind: 'wait', label: 'inferno', duration: 2.4, look: { at: [-12, 2.5, 10], blend: 1.5 } },
  // ── 8. The bus: something is banging inside… ─────────────────────────────
  { kind: 'move', label: 'to the bus', to: 282, speed: 3.1 },
  {
    kind: 'action',
    label: 'bus rocks',
    look: { at: [2.5, 1.5, 15], blend: 1.2 },
    run: (w) => {
      const sc = z1Scene(w);
      if (!sc) return;
      const bus = sc.town.bus;
      w.later(0.5, () => bus.bang(w));
      w.later(1.2, () => bus.bang(w));
      w.later(1.7, () => bus.bang(w));
      w.later(2.25, () => bus.blowDoor(w));
    },
  },
  {
    kind: 'hold',
    label: 'bus',
    look: { at: [2.5, 1.5, 15], blend: 1.2 },
    pickups: [{ kind: 'magnum', pos: [-2.6, 1.3, 7], t: 0.5 }],
    waves: [
      {
        start: { after: 2.3 },
        spawns: [{ type: 'runner', pos: [1.9, 0, 15.2], count: 3, every: 0.7, offset: [0.2, 0, 0.15], entry: 'burst' }],
      },
      {
        start: { remaining: 1 },
        spawns: [
          { type: 'runner', pos: [4.2, 2.6, 15.8], entry: 'leap' },
          { type: 'runner', pos: [6.8, 2.6, 15.2], t: 0.8, entry: 'leap' },
        ],
      },
      {
        start: { remaining: 1 },
        spawns: [
          { type: 'walker', pos: [-3, 0, 20], opts: { variant: 'civilian' } },
          { type: 'crawler', pos: [0.5, 0, 10], t: 0.6, entry: 'rise' },
          { type: 'runner', pos: [-5, 0, 22], t: 1.4 },
        ],
      },
    ],
  },
  // ── 9. Town square: brute + rooftop spitters ─────────────────────────────
  { kind: 'move', label: 'into the square', to: 319, speed: 3.0 },
  {
    kind: 'hold',
    label: 'town square',
    // Slightly up: spitters climb onto the two newsstand roofs ahead.
    look: { at: [-1.5, 2.6, 12], blend: 1.3 },
    pickups: [
      { kind: 'health', pos: [3.6, 1.3, 6.5] },
      { kind: 'bomb', pos: [-3.8, 1.5, 8], t: 12 },
    ],
    waves: [
      {
        spawns: [
          { type: 'walker', pos: [-3, 0, 16], t: 0.4, opts: { variant: 'office' } },
          { type: 'walker', pos: [4, 0, 19], t: 1.2, opts: { variant: 'civilian' } },
          { type: 'spitter', pos: [-4.6, 3.0, 8.7], t: 2.0, entry: 'rise' },
        ],
      },
      {
        start: { remaining: 1, after: 16 },
        spawns: [
          { type: 'brute', pos: [0.5, 0, 22] },
          { type: 'walker', pos: [-5, 0, 18], t: 1, opts: { variant: 'soldier' } },
          { type: 'walker', pos: [5, 0, 17], t: 1.6, opts: { variant: 'cop' } },
          { type: 'spitter', pos: [4.3, 3.0, 8.9], t: 2.5, entry: 'rise' },
        ],
      },
      {
        start: { remaining: 1 },
        spawns: [
          { type: 'runner', pos: [-6, 0, 20] },
          { type: 'runner', pos: [6, 0, 21], t: 0.5 },
          { type: 'bloater', pos: [0, 0, 19], t: 1.4 },
          { type: 'walker', pos: [-2.5, 0, 22], t: 2.2, opts: { variant: 'worker' } },
        ],
      },
    ],
  },
  // ── Boss: THE BUTCHER ────────────────────────────────────────────────────
  { kind: 'move', label: 'approach PRIME MEATS', to: 334.5, speed: 2.4, look: { at: [0, 2.4, 20], blend: 1.4 } },
  {
    kind: 'action',
    label: 'something big',
    look: { at: [0, 2.4, 20], blend: 1.2 },
    run: (w) => {
      const sc = z1Scene(w);
      w.audio.playMusic(null);
      w.audio.play('brute_roar', { volume: 0.7, pitch: 0.5 });
      w.rig.shake(0.2);
      if (sc) sc.bossLight = 0.6;
      w.later(0.9, () => {
        w.audio.play('door', { volume: 1, pitch: 0.5 });
        w.audio.play('hit_world', { volume: 0.8, pitch: 0.5 });
        w.rig.shake(0.25);
        if (sc) sc.bossLight = 1.4;
      });
      w.later(1.6, () => {
        w.audio.play('door', { volume: 1, pitch: 0.45 });
        w.audio.play('crash', { volume: 0.5, pitch: 0.6 });
        w.rig.shake(0.35);
        if (sc) sc.bossLight = 0.3;
      });
    },
  },
  { kind: 'wait', label: 'the doors bulge', duration: 2.1 },
  {
    kind: 'boss',
    label: 'THE BUTCHER',
    boss: 'butcher',
    pos: [0, 0, 22],
    look: { at: [0, 2.2, 16] },
    pickups: [
      { kind: 'shotgun', pos: [-4.2, 1.3, 6], t: 14 },
      { kind: 'health', pos: [4.2, 1.3, 6], t: 30 },
      { kind: 'health', pos: [-4, 1.3, 6.5], t: 55 },
    ],
    waves: [
      { start: { after: 26 }, spawns: [{ type: 'crawler', pos: [-4.5, 0, 9], entry: 'rise' }, { type: 'crawler', pos: [4.5, 0, 10], t: 0.6, entry: 'rise' }] },
      { start: { after: 58 }, spawns: [{ type: 'walker', pos: [-5, 0, 11], entry: 'rise', opts: { variant: 'worker' } }, { type: 'runner', pos: [5, 0, 14], t: 0.8 }] },
    ],
  },
];

export const stage: StageDef = {
  id: 'z1',
  campaign: 'zombie',
  index: 0,
  name: 'MAIN STREET',
  tagline: 'The evening it all went wrong.',
  rail: RAIL,
  mode: 'walk',
  music: 'zombie',
  beats,
  buildEnvironment: (world, curve) => buildEnv(world, curve),
  setup(world) {
    const sc = z1Scene(world);
    if (!sc) return;
    const t = sc.town;
    const cull = (d: Destructible) => sc.cullables.push({ obj: d.root, pos: d.root.position.clone(), r: 4 });
    // Diner windows (smash when shot or when a zombie crashes through).
    for (const p of t.dinerPanes) cull(world.add(new GlassPane(world, p.pos.clone(), p.yaw, p.w, p.h)));
    // Gas station pumps, barrels, propane cage.
    t.gas.spawn(world, t.pumps, t.barrels, t.propane);
    for (const d of t.gas.items) cull(d);
    // A few extra barrels where zombies gather.
    for (const b of t.extraBarrels) {
      const d = explosiveBarrel(world, b.clone());
      bakeMerge(d.root);
      cull(world.add(d));
    }
  },
};
