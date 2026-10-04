import type * as THREE from 'three';
import type { CampaignId, EntryKind, Frame, PickupKind, RigMode, V3, WeaponId } from '../core/types';
import type { World } from './World';
import type { MusicId } from '../audio/names';

/**
 * ─── Stage scripting contract ────────────────────────────────────────────────
 *
 * A stage is a camera rail (a smooth curve through `rail` points) plus an
 * ordered list of `beats`. The StageRunner plays beats one after another:
 *
 *   move   → rig travels along the rail to distance `to` (metres) at `speed`.
 *            Optional `waves` spawn while moving (chase sequences).
 *   hold   → rig stops; `waves` spawn; the beat ends when every hostile is dead
 *            (classic "clear the room before moving on").
 *   boss   → spawns a boss (registered enemy id); ends when it dies. The rig may
 *            keep moving during the fight (vehicle chase bosses).
 *   banner → shows a title card for `duration` seconds.
 *   wait   → pause for `duration` seconds (rig keeps current motion).
 *   action → run arbitrary code (open a door, explosion, swap scenery). If it
 *            returns a promise, the runner waits for it.
 *
 * COORDINATES. Unless `world: true`, all positions in beats (spawns, pickups,
 * civilians, look targets) are RIG-RELATIVE: [right, up, forward] in metres,
 * measured from the rig's ground position, oriented along the rail heading at
 * the moment the thing spawns (NOT along where the camera happens to look).
 * Example: [-3, 0, 12] = 3 m to the left, on the ground, 12 m ahead.
 */

export interface StageDef {
  /** Unique id, e.g. 'z1'. Used for saves and debug URLs (?stage=z1). */
  id: string;
  campaign: CampaignId;
  /** 0-based order within the campaign. */
  index: number;
  name: string;
  /** Flavour line shown on the stage title card. */
  tagline?: string;
  /** World-space rail control points (y is the ground height under the rig). */
  rail: V3[];
  /** Default rig mode for the stage ('walk' on foot, 'drive' in a vehicle). */
  mode: RigMode;
  /** Default weapon override for the stage (e.g. 'turret' for a vehicle-mounted gun). */
  weapon?: WeaponId | null;
  music?: MusicId;
  /** Builds scenery, lights, fog and sky into world.scene. */
  buildEnvironment(world: World, curve: THREE.CatmullRomCurve3): Environment;
  beats: Beat[];
  /** Optional hook after environment + rig are ready (e.g. attach a vehicle view-model). */
  setup?(world: World): void;
}

export interface Environment {
  /** Everything the environment added (already attached to world.scene by the builder). */
  root: THREE.Object3D;
  /** Meshes that stop bullets (walls, cars, trees). Keep this list short — it is raycast every shot. */
  occluders?: THREE.Object3D[];
  /** Ground height at world x/z. Defaults to 0 when omitted. */
  groundAt?(x: number, z: number): number;
  /** Surface used for bullet-impact FX when a shot hits the ground/occluders. */
  surface?: 'dirt' | 'concrete' | 'metal' | 'wood' | 'grass' | 'water';
  /** Per-frame animation (flickering lights, rain, swaying trees…). */
  update?(dt: number, world: World): void;
  dispose?(): void;
}

export type LookSpec =
  /** Look at a point (rig-relative unless world: true). */
  | { at: V3; world?: boolean; blend?: number }
  /** Yaw/pitch offset in DEGREES from the rail heading (positive yaw = turn left). */
  | { yaw: number; pitch?: number; blend?: number }
  /** Follow the rail tangent (default). */
  | 'path';

export interface SpawnDef {
  /** Registered enemy id (see content/registry.ts → ENEMY_IDS). */
  type: string;
  /** Position — rig-relative [right, up, forward] unless `world: true`. */
  pos: V3;
  world?: boolean;
  /** Seconds after the wave starts. */
  t?: number;
  /**
   * 'rig' keeps the enemy in the moving rig frame (chases), 'world' anchors it.
   * Default: 'rig' during move/boss-with-movement beats, 'world' during holds.
   */
  frame?: Frame;
  entry?: EntryKind;
  /** Repeat this spawn `count` times… */
  count?: number;
  /** …`every` seconds apart… */
  every?: number;
  /** …each one shifted by `offset` metres (rig-relative) from the previous. */
  offset?: V3;
  /** Multipliers. */
  hp?: number;
  speed?: number;
  /** Enemy-specific options (e.g. { variant: 'cop' }, { leap: true }). */
  opts?: Record<string, unknown>;
}

export interface WaveDef {
  spawns: SpawnDef[];
  /**
   * When the wave starts. Default: as soon as the previous wave is fully
   * cleared (first wave: at beat start). Conditions are OR'ed.
   */
  start?: {
    /** Seconds since beat start. */
    after?: number;
    /** When at most N hostiles remain alive. */
    remaining?: number;
    /** (move beats) When the rig has travelled to this rail distance. */
    atD?: number;
  };
}

export interface PickupDef {
  kind: PickupKind;
  pos: V3;
  world?: boolean;
  /** Seconds after beat start (default 0). */
  t?: number;
  /** Seconds before it disappears (default: until the beat ends). */
  ttl?: number;
}

export interface CivilianDef {
  pos: V3;
  world?: boolean;
  /** Appearance variant passed to the civilian model (e.g. 'scientist', 'cop'). */
  variant?: string;
  t?: number;
}

interface BeatBase {
  /** Debug label (shown in ?debug overlay and errors). */
  label?: string;
  look?: LookSpec;
  /** Switch rig mode at beat start. */
  mode?: RigMode;
  /** Force a weapon at beat start (e.g. 'turret'); null removes the override. */
  weapon?: WeaponId | null;
  pickups?: PickupDef[];
  civilians?: CivilianDef[];
  onStart?(world: World): void;
  onEnd?(world: World): void;
}

export interface MoveBeat extends BeatBase {
  kind: 'move';
  /** Target rail distance in metres (absolute, from the start of the rail). */
  to: number;
  /** Cruise speed m/s (walk ≈ 2.5–4, jog 5, vehicle 8–20). */
  speed: number;
  waves?: WaveDef[];
  /** Don't finish until all hostiles are dead (in addition to arriving). */
  waitClear?: boolean;
}

export interface HoldBeat extends BeatBase {
  kind: 'hold';
  waves: WaveDef[];
  /** Minimum seconds to stay even if cleared early. */
  minTime?: number;
  /** Give up waiting after this many seconds (remaining enemies stay alive). */
  timeout?: number;
}

export interface BossBeat extends BeatBase {
  kind: 'boss';
  /** Registered enemy id of the boss. */
  boss: string;
  pos: V3;
  world?: boolean;
  frame?: Frame;
  opts?: Record<string, unknown>;
  /** Keep moving during the fight (vehicle chase). */
  moveTo?: number;
  speed?: number;
  /** Extra minion waves during the fight. */
  waves?: WaveDef[];
}

export interface BannerBeat extends BeatBase {
  kind: 'banner';
  text: string;
  sub?: string;
  duration: number;
}

export interface WaitBeat extends BeatBase {
  kind: 'wait';
  duration: number;
}

export interface ActionBeat extends BeatBase {
  kind: 'action';
  run(world: World): void | Promise<void>;
}

export type Beat = MoveBeat | HoldBeat | BossBeat | BannerBeat | WaitBeat | ActionBeat;

export interface CampaignDef {
  id: CampaignId;
  name: string;
  tagline: string;
  /** CSS colour used for menus. */
  accent: string;
  stages: StageDef[];
}
