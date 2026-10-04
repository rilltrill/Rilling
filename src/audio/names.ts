/**
 * Every sound effect the game can request. The audio system synthesises each
 * of these procedurally (no audio files), so adding a name here means adding a
 * recipe in audio/Sfx.ts and a row in audio/sfxMeta.ts (voice limits, caching,
 * loudness trim).
 *
 * Tips for content: `pitch` < 1 makes anything bigger/heavier (a stomp at 0.6
 * is a giant), `vary` 0.1–0.25 keeps repeated sounds alive, and every sound is
 * already loudness-matched — use `volume` for distance/emphasis only.
 */
export const SFX_NAMES = [
  // weapons
  'pistol', // crisp crack + punchy body
  'shotgun', // boom with a pump-action tail
  'smg', // light, tight rattle (designed for 13 shots/s)
  'magnum', // heavy thunder with a rolling echo
  'turret', // mounted gun "chug"
  'reload', // mag out / mag in (auto-swaps to the shotgun/magnum flavour after those guns fire)
  'reload_done', // slide rack (auto-swaps like `reload`)
  'reload_shotgun', // three shells thumbed in
  'reload_done_shotgun', // pump rack
  'reload_magnum', // cylinder out, brass tinkles, speed-loader in
  'reload_done_magnum', // cylinder snap + hammer cock
  'empty', // dry trigger click
  'overheat', // steam hiss + warning beeps
  'bomb', // screen-clearing blast
  // impacts
  'hit_flesh', // wet, meaty thwack
  'hit_head', // bone crunch + reward ding
  'hit_armor', // ricochet whine / clang / spang (random)
  'hit_world', // concrete/dust impact
  'hit_projectile', // bile/venom glob popped mid-air (wet pop + acid sizzle)
  'gib', // splatter
  'explosion', // sub thump + blast + crackle tail
  // zombies
  'zombie_groan', // idle groan (6 variants)
  'zombie_attack', // snarl (attack telegraph)
  'zombie_die', // death gurgle
  'brute_roar', // deep, huge roar
  'spit', // hock + launch
  'runner_shriek', // raspy sprinting scream
  'crawler_hiss', // breathy rasp
  'bloater_gurgle', // wet bubbling belly groan
  'boss_roar', // monstrous layered roar (2 s)
  // dinosaurs
  'compy_chirp', // tiny chitter
  'raptor_screech', // bark into a shriek (attack)
  'raptor_die',
  'dino_roar', // generic big dino roar
  'dino_die', // long falling groan
  'rex_roar', // T-rex: huge, layered, 2.6 s
  'stomp', // giant footfall (sub thump + mid body + debris)
  'wing_flap',
  'compy_die', // squeak
  'raptor_bark', // short honk-bark (idle call)
  'dilo_hiss', // frill-rattle hiss + eerie hoot
  'ptero_cry', // piercing aerial cry
  'trike_bellow', // low tonal bellow
  'bite', // jaw snap
  'whoosh', // swoop / tail swipe / thrown object
  'roar_distant', // far-off roar (ambience)
  // player / feedback
  'player_hurt', // also muffles the world briefly ("ears ringing")
  'heartbeat',
  'pickup',
  'pickup_health',
  'weapon_get',
  'combo', // pass `pitch` to rise with the multiplier
  'civilian_scream',
  'civilian_saved',
  'civilian_shot',
  // UI / flow
  'ui_click',
  'ui_back',
  'ui_start',
  'banner', // riser into a cinematic hit
  'boss_warning', // klaxon over a low "braam"
  'stage_clear', // brass fanfare
  'game_over',
  'continue_tick', // rises in pitch on consecutive ticks
  'score_tick', // climbs a major scale on rapid repeats
  // vehicles / world
  'engine_rev',
  'crash', // metal crunch + glass
  'glass', // shatter
  'door', // heavy wooden slam
  'thunder',
  'wood_break', // crate/barricade splinter
  'metal_clang',
  'alarm', // car alarm (2 s)
  'helicopter', // fly-by (3.5 s)
  'splash',
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
