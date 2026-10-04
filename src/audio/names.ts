/**
 * Every sound effect the game can request. The audio system synthesises each
 * of these procedurally (no audio files), so adding a name here means adding a
 * recipe in audio/Sfx.ts.
 */
export const SFX_NAMES = [
  // weapons
  'pistol',
  'shotgun',
  'smg',
  'magnum',
  'turret',
  'reload',
  'reload_done',
  'empty',
  'overheat',
  'bomb',
  // impacts
  'hit_flesh',
  'hit_head',
  'hit_armor',
  'hit_world',
  'hit_projectile',
  'gib',
  'explosion',
  // zombies
  'zombie_groan',
  'zombie_attack',
  'zombie_die',
  'brute_roar',
  'spit',
  // dinosaurs
  'compy_chirp',
  'raptor_screech',
  'raptor_die',
  'dino_roar',
  'dino_die',
  'rex_roar',
  'stomp',
  'wing_flap',
  // player / feedback
  'player_hurt',
  'heartbeat',
  'pickup',
  'pickup_health',
  'weapon_get',
  'combo',
  'civilian_scream',
  'civilian_saved',
  'civilian_shot',
  // UI / flow
  'ui_click',
  'ui_back',
  'ui_start',
  'banner',
  'boss_warning',
  'stage_clear',
  'game_over',
  'continue_tick',
  'score_tick',
  // vehicles / world
  'engine_rev',
  'crash',
  'glass',
  'door',
  'thunder',
] as const;

export type SfxName = (typeof SFX_NAMES)[number];

/** Procedural music tracks. */
export const MUSIC_IDS = ['menu', 'zombie', 'zombie_drive', 'dino', 'dino_drive', 'boss', 'results', 'gameover'] as const;
export type MusicId = (typeof MUSIC_IDS)[number];

export interface PlayOptions {
  /** 0..1 multiplier. */
  volume?: number;
  /** Playback rate multiplier (1 = normal). */
  pitch?: number;
  /** Stereo pan -1..1. */
  pan?: number;
  /** Small random pitch variation (e.g. 0.08). */
  vary?: number;
}
