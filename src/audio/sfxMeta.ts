import type { SfxName } from './names';

/** Mixing / voice-management metadata per sound. */
export interface SfxMeta {
  /** Variants pre-rendered into buffers (0 = always synthesised live). */
  cache: number;
  /** Upper bound of the recipe's duration (s) — the pre-render slot. */
  len: number;
  /** Max simultaneous instances of this sound. */
  max: number;
  /** Min seconds between two starts of this sound. */
  gap: number;
  /** Voice-stealing priority: 0 ambience … 4 must-hear. */
  prio: number;
  /** When `max` is reached: steal the oldest instance (true) or drop the new one. */
  steal: boolean;
  /** Reverb send 0..1. */
  verb: number;
  /** Music ducking depth 0..1 and hold time (s). */
  duck: number;
  duckHold: number;
  /** Player-centric / UI sound: bypasses the hurt muffle filter. */
  ui: boolean;
  /** Render pre-cached variants at half rate (dark sounds: saves memory). */
  lo: boolean;
  /** Loudness trim applied to the recipe output. */
  trim: number;
}

/**
 * Loudness calibration: multiplier per recipe so every sound hits its target
 * short-term loudness (measured offline by rendering each recipe; see the audio
 * verification notes in the report). Re-measure after changing a recipe.
 */
const TRIM: Partial<Record<SfxName, number>> = {
  reload_shotgun: 2.25, reload_done_shotgun: 2.25, reload_magnum: 2.2, reload_done_magnum: 1.9,
  pistol: 1, shotgun: 0.66, smg: 1.63, magnum: 0.74, turret: 0.84, reload: 1.88, reload_done: 1.84, empty: 7.27,
  overheat: 1.02, bomb: 0.57, hit_flesh: 1.36, hit_head: 1.17, hit_armor: 1.06, hit_world: 2.65,
  hit_projectile: 1.35, gib: 0.83, explosion: 0.72, zombie_groan: 1.08, zombie_attack: 0.78, zombie_die: 1.03,
  brute_roar: 0.67, spit: 1.1, runner_shriek: 0.62, crawler_hiss: 0.87, bloater_gurgle: 0.77, boss_roar: 0.67,
  compy_chirp: 2.37, raptor_screech: 0.98, raptor_die: 0.83, dino_roar: 0.71, dino_die: 0.65, rex_roar: 0.62,
  stomp: 0.69, wing_flap: 1.27, compy_die: 1.21, raptor_bark: 0.64, dilo_hiss: 0.91, ptero_cry: 0.81,
  trike_bellow: 0.7, bite: 1.2, whoosh: 4.8, roar_distant: 0.59, player_hurt: 0.88, heartbeat: 0.71, pickup: 1.47,
  pickup_health: 1.79, weapon_get: 0.88, combo: 1.31, civilian_scream: 1.02, civilian_saved: 1.55,
  civilian_shot: 0.99, ui_click: 1.56, ui_back: 1.58, ui_start: 0.78, banner: 0.73, boss_warning: 0.84,
  stage_clear: 0.96, game_over: 0.71, continue_tick: 1.88, score_tick: 2.78, engine_rev: 0.66, crash: 0.72,
  glass: 1.72, door: 0.82, thunder: 1.07, wood_break: 1.28, metal_clang: 0.86, alarm: 0.85, helicopter: 1.8,
  splash: 1.1,
};

const D: SfxMeta = { cache: 0, len: 1, max: 3, gap: 0.03, prio: 1, steal: false, verb: 0.15, duck: 0, duckHold: 0, ui: false, lo: false, trim: 1 };

const m = (o: Partial<SfxMeta>): SfxMeta => ({ ...D, ...o });
const weapon = (o: Partial<SfxMeta>) => m({ prio: 3, steal: true, max: 4, verb: 0.16, ...o });
const impact = (o: Partial<SfxMeta>) => m({ prio: 2, steal: true, max: 3, verb: 0.1, ...o });
const creature = (o: Partial<SfxMeta>) => m({ prio: 1, max: 3, verb: 0.24, lo: true, gap: 0.12, ...o });
const ui = (o: Partial<SfxMeta>) => m({ prio: 3, ui: true, verb: 0.04, max: 2, steal: true, ...o });

const BASE: Record<SfxName, SfxMeta> = {
  // weapons
  pistol: weapon({ cache: 4, len: 0.45, gap: 0.04 }),
  shotgun: weapon({ cache: 3, len: 0.52, gap: 0.1, max: 3, verb: 0.24, duck: 0.15, duckHold: 0.25 }),
  smg: weapon({ cache: 5, len: 0.2, gap: 0.045, max: 4, verb: 0.1 }),
  magnum: weapon({ cache: 3, len: 1.4, gap: 0.12, max: 3, verb: 0.28, duck: 0.25, duckHold: 0.4 }),
  turret: weapon({ cache: 5, len: 0.26, gap: 0.045, max: 4, verb: 0.1 }),
  reload: weapon({ cache: 1, len: 0.45, gap: 0.15, max: 1, verb: 0.03, ui: true }),
  reload_done: weapon({ cache: 1, len: 0.28, gap: 0.1, max: 1, verb: 0.03, ui: true }),
  reload_shotgun: weapon({ cache: 1, len: 0.88, gap: 0.15, max: 1, verb: 0.03, ui: true }),
  reload_done_shotgun: weapon({ cache: 1, len: 0.33, gap: 0.1, max: 1, verb: 0.03, ui: true }),
  reload_magnum: weapon({ cache: 1, len: 0.86, gap: 0.15, max: 1, verb: 0.03, ui: true }),
  reload_done_magnum: weapon({ cache: 1, len: 0.3, gap: 0.1, max: 1, verb: 0.03, ui: true }),
  empty: weapon({ cache: 1, len: 0.12, gap: 0.08, max: 2, verb: 0.02, ui: true }),
  overheat: weapon({ cache: 1, len: 1, gap: 0.5, max: 1, verb: 0.08, ui: true }),
  bomb: weapon({ cache: 0, len: 2.6, gap: 0.3, max: 2, prio: 4, verb: 0.4, duck: 0.6, duckHold: 1.4 }),
  // impacts
  hit_flesh: impact({ cache: 5, len: 0.2, gap: 0.035, max: 4 }),
  hit_head: impact({ cache: 4, len: 0.52, gap: 0.04, max: 3 }),
  hit_armor: impact({ cache: 6, len: 0.42, gap: 0.05, max: 3, verb: 0.18 }),
  hit_world: impact({ cache: 4, len: 0.2, gap: 0.04, max: 3, prio: 1 }),
  hit_projectile: impact({ cache: 3, len: 0.42, gap: 0.05 }),
  gib: impact({ cache: 3, len: 0.65, gap: 0.05, lo: true }),
  explosion: impact({ cache: 3, len: 2, gap: 0.08, prio: 3, verb: 0.35, duck: 0.35, duckHold: 0.8, lo: true }),
  // zombies
  zombie_groan: creature({ cache: 6, len: 1.62, gap: 0.3, prio: 0 }),
  zombie_attack: creature({ cache: 4, len: 0.72, prio: 2, gap: 0.1 }),
  zombie_die: creature({ cache: 4, len: 1.12, gap: 0.08 }),
  brute_roar: creature({ cache: 2, len: 1.72, prio: 2, max: 2, gap: 0.3, duck: 0.2, duckHold: 1 }),
  spit: creature({ cache: 3, len: 0.42, prio: 2, gap: 0.08 }),
  runner_shriek: creature({ cache: 3, len: 0.77 }),
  crawler_hiss: creature({ cache: 3, len: 0.87 }),
  bloater_gurgle: creature({ cache: 3, len: 1.32 }),
  boss_roar: creature({ cache: 0, len: 2.4, prio: 3, max: 2, gap: 0.4, verb: 0.35, duck: 0.35, duckHold: 1.5 }),
  // dinosaurs
  compy_chirp: creature({ cache: 5, len: 0.36, gap: 0.06 }),
  compy_die: creature({ cache: 3, len: 0.26, gap: 0.05, lo: true }),
  raptor_bark: creature({ cache: 4, len: 0.34, max: 2 }),
  raptor_screech: creature({ cache: 4, len: 0.8, prio: 2, max: 2, gap: 0.15, lo: false }),
  raptor_die: creature({ cache: 3, len: 0.92, lo: false }),
  dilo_hiss: creature({ cache: 3, len: 1.1, prio: 2, lo: false }),
  ptero_cry: creature({ cache: 3, len: 0.94, prio: 2, lo: false, verb: 0.32 }),
  trike_bellow: creature({ cache: 2, len: 1.57, prio: 2, max: 2 }),
  dino_roar: creature({ cache: 3, len: 1.62, prio: 2, max: 2, duck: 0.15, duckHold: 0.8 }),
  dino_die: creature({ cache: 2, len: 2.17, max: 2 }),
  rex_roar: creature({ cache: 0, len: 2.9, prio: 3, max: 1, gap: 0.8, verb: 0.38, duck: 0.4, duckHold: 2.2 }),
  stomp: creature({ cache: 3, len: 0.54, prio: 2, gap: 0.09, verb: 0.12 }),
  wing_flap: creature({ cache: 3, len: 0.27, gap: 0.08, verb: 0.1 }),
  bite: creature({ cache: 3, len: 0.22, prio: 2, gap: 0.06, verb: 0.1, lo: true }),
  whoosh: creature({ cache: 3, len: 0.46, gap: 0.08, verb: 0.12, lo: true }),
  roar_distant: creature({ cache: 0, len: 2.25, prio: 0, max: 1, gap: 1, verb: 0.6 }),
  // player / feedback
  player_hurt: ui({ cache: 2, len: 0.97, prio: 4, verb: 0.08, duck: 0.35, duckHold: 0.5, lo: true }),
  heartbeat: ui({ cache: 1, len: 0.4, max: 1, verb: 0, lo: true }),
  pickup: ui({ cache: 1, len: 0.5 }),
  pickup_health: ui({ cache: 1, len: 0.82 }),
  weapon_get: ui({ cache: 1, len: 0.87, verb: 0.12 }),
  combo: ui({ cache: 1, len: 0.52, verb: 0.12 }),
  civilian_scream: creature({ cache: 3, len: 0.97, prio: 2, max: 2, lo: true }),
  civilian_saved: ui({ cache: 1, len: 0.87, verb: 0.12 }),
  civilian_shot: ui({ cache: 1, len: 0.52, prio: 4 }),
  // UI / flow
  ui_click: ui({ cache: 1, len: 0.08, gap: 0.04 }),
  ui_back: ui({ cache: 1, len: 0.1, gap: 0.04 }),
  ui_start: ui({ cache: 0, len: 1.1, verb: 0.2 }),
  banner: ui({ cache: 0, len: 1.55, verb: 0.3, duck: 0.3, duckHold: 0.6 }),
  boss_warning: ui({ cache: 0, len: 2.65, prio: 4, verb: 0.25, duck: 0.6, duckHold: 2.2 }),
  stage_clear: ui({ cache: 0, len: 2.15, prio: 4, verb: 0.25, duck: 0.7, duckHold: 1.8 }),
  game_over: ui({ cache: 0, len: 2.95, prio: 4, verb: 0.3, duck: 0.7, duckHold: 2.4 }),
  continue_tick: ui({ cache: 1, len: 0.14, gap: 0.2 }),
  score_tick: ui({ cache: 1, len: 0.11, gap: 0.02, max: 3 }),
  // vehicles / world
  engine_rev: m({ cache: 0, len: 1.3, prio: 1, max: 1, gap: 0.3 }),
  crash: m({ cache: 3, len: 1.35, prio: 3, max: 2, gap: 0.1, verb: 0.3, duck: 0.15, duckHold: 0.5, lo: true }),
  glass: m({ cache: 2, len: 0.78, prio: 2, gap: 0.05, lo: true }),
  door: m({ cache: 2, len: 0.62, prio: 2, gap: 0.08, lo: true }),
  thunder: m({ cache: 0, len: 3.35, prio: 1, max: 1, gap: 1, verb: 0.45 }),
  wood_break: m({ cache: 2, len: 0.52, prio: 2, gap: 0.05, lo: true }),
  metal_clang: m({ cache: 2, len: 1.17, prio: 2, gap: 0.05, verb: 0.25, lo: true }),
  alarm: m({ cache: 0, len: 2.1, prio: 1, max: 1, gap: 0.5, verb: 0.3 }),
  helicopter: m({ cache: 0, len: 3.6, prio: 1, max: 1, gap: 1, verb: 0.2 }),
  splash: m({ cache: 2, len: 0.77, prio: 1, gap: 0.08, lo: true }),
};

export const SFX_META = Object.fromEntries(
  (Object.keys(BASE) as SfxName[]).map((n) => [n, { ...BASE[n], trim: TRIM[n] ?? 1 }]),
) as Record<SfxName, SfxMeta>;

/** Sounds worth pre-rendering as soon as audio unlocks (the rest render on first use). */
export const PREWARM: SfxName[] = [
  'pistol', 'hit_flesh', 'hit_head', 'empty', 'reload', 'reload_done', 'ui_click', 'ui_back',
  'smg', 'shotgun', 'magnum', 'turret', 'hit_armor', 'hit_world', 'explosion', 'gib', 'combo', 'pickup', 'score_tick',
];
