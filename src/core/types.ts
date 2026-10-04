/**
 * Shared, dependency-free type contracts used across the whole game.
 * Content code (enemies, stages, bosses) should only need these plus the
 * gameplay base classes.
 */

/** Plain 3-tuple used in data definitions (stage scripts, spawn tables). */
export type V3 = [number, number, number];

export type CampaignId = 'zombie' | 'dino';

/** Weapons the player can hold. `turret` is the vehicle-mounted gun used in drive sections. */
export type WeaponId = 'pistol' | 'shotgun' | 'smg' | 'magnum' | 'turret';

/** Shootable pickups placed by stage scripts. */
export type PickupKind = 'health' | 'shotgun' | 'smg' | 'magnum' | 'bomb' | 'points';

/**
 * Coordinate frame for spawned entities.
 * - `world`: absolute world coordinates.
 * - `rig`: relative to the moving camera rig (x = right, y = up, z = forward).
 *   Entities spawned in the rig frame keep pace with the player — use this for
 *   chase sequences (enemies running alongside a moving vehicle).
 */
export type Frame = 'world' | 'rig';

/** How an enemy enters the scene. Enemy classes interpret these. */
export type EntryKind = 'walk' | 'rise' | 'drop' | 'leap' | 'burst' | 'fly';

/** Hit-zone of an enemy / boss. Multipliers live in `PART_MULT`. */
export type HitPart = 'head' | 'torso' | 'limb' | 'weak' | 'armor' | 'tail' | 'body';

export const PART_MULT: Record<HitPart, number> = {
  head: 2.5,
  torso: 1,
  body: 1,
  limb: 0.7,
  tail: 0.5,
  weak: 2,
  armor: 0,
};

/** Movement mode of the rail rig — controls camera height, bob and sway. */
export type RigMode = 'walk' | 'drive';

export type QualityLevel = 'low' | 'medium' | 'high';

/** Screen look: 'crt' = low-res + dithering + scanlines/curvature, 'pixel' = low-res + dithering, 'off' = clean. */
export type RetroMode = 'crt' | 'pixel' | 'off';

export interface Settings {
  sfxVolume: number; // 0..1
  musicVolume: number; // 0..1
  haptics: boolean;
  aimAssist: boolean;
  autoReload: boolean;
  /** Put the reload / weapon buttons on the left side of the screen. */
  leftHanded: boolean;
  quality: QualityLevel;
  /** Arcade-monitor post effect. */
  retro: RetroMode;
  showFps: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  sfxVolume: 0.8,
  musicVolume: 0.55,
  haptics: true,
  aimAssist: true,
  autoReload: true,
  leftHanded: false,
  quality: 'medium',
  retro: 'crt',
  showFps: false,
};

export type Grade = 'S' | 'A' | 'B' | 'C' | 'D';

export interface StageResult {
  stageId: string;
  score: number;
  kills: number;
  headshots: number;
  shots: number;
  hits: number;
  accuracy: number; // 0..1
  maxCombo: number;
  rescues: number;
  civiliansShot: number;
  damageTaken: number;
  continues: number;
  time: number; // seconds
  bonuses: { label: string; points: number }[];
  total: number;
  grade: Grade;
}
