import * as THREE from 'three';
import type { Frame, HitPart, WeaponId } from '../core/types';
import type { World } from './World';
import type { PixelFigure } from './pixel/figure';

/** Data describing a bullet hitting a shootable mesh. */
export interface ShotHit {
  object: THREE.Object3D;
  part: HitPart;
  point: THREE.Vector3;
  normal: THREE.Vector3 | null;
  /** Normalised ray direction (world). */
  dir: THREE.Vector3;
  distance: number;
  /** Base weapon damage (before part multipliers). */
  damage: number;
  weapon: WeaponId;
  /** True when the hit came from aim-assist rather than the exact tap ray. */
  assisted: boolean;
  /** Screen position of the tap in client pixels (for popups). */
  screenX: number;
  screenY: number;
}

export type ShotOutcomeKind = 'enemy' | 'armor' | 'projectile' | 'pickup' | 'civilian' | 'prop' | 'none';

export interface ShotOutcome {
  kind: ShotOutcomeKind;
  /** Counts as an accurate hit (keeps the combo alive). */
  counts: boolean;
  killed?: boolean;
  headshot?: boolean;
}

export interface Telegraph {
  /** 0 → just started, 1 → attack lands. */
  progress: number;
  /** World object whose position is used for the on-screen warning ring. */
  anchor: THREE.Object3D;
  /** Visual size hint in metres (ring radius around the anchor). */
  radius?: number;
}

/**
 * Base for everything that lives in a stage and updates each frame: enemies,
 * bosses, projectiles, pickups, civilians and scripted props.
 */
export abstract class Entity {
  readonly root = new THREE.Group();
  /** Set to true to have the world remove (and dispose) the entity this frame. */
  removed = false;
  /** Hostiles must all be dead before a `hold` beat completes. */
  hostile = false;
  /** Aim assist may snap near-miss shots onto this (never true for civilians). */
  assistable = false;
  /**
   * Hitboxes stay shootable while the model is hidden (e.g. a pickup blinking
   * before it expires — a well-aimed shot on a flashing item must not miss).
   */
  shootableWhenHidden = false;
  /** Frame the root lives in (see core/types Frame). */
  frame: Frame = 'world';
  /** Non-null while the entity is about to hurt the player (drawn as a shrinking ring). */
  telegraph: Telegraph | null = null;
  /** Seconds since spawn. */
  age = 0;

  constructor(readonly world: World) {}

  /**
   * ART: SPRITES — paint this entity as hand-made pixel art (PixelCast, see
   * `gameplay/pixel/` and docs/ARCHITECTURE.md "Art style"). Called ~12×/s while
   * it is on screen, with its rig's joints already posed; add layers and
   * primitives to `f` in world space. Return false (or leave it undefined) to be
   * drawn by the older 3D impostor bake instead. Never touch gameplay state here.
   */
  paintPixels?(f: PixelFigure): boolean;

  /** Same, for a part this entity flung into the world (see `looseParts`). */
  paintPart?(obj: THREE.Object3D, f: PixelFigure): boolean;

  /** Called by World once when added. */
  onAdded(): void {}

  abstract update(dt: number): void;

  /** Shootable entities override this. */
  onShot(_hit: ShotHit): ShotOutcome {
    return { kind: 'none', counts: false };
  }

  /** Called by World when removed. Unregisters hitboxes and detaches. */
  dispose(): void {
    this.world.shootables.removeOwner(this);
    this.root.parent?.remove(this.root);
  }

  /** Register a mesh as a hitbox belonging to this entity. */
  hitbox(obj: THREE.Object3D, part: HitPart): void {
    this.world.shootables.add(obj, this, part);
  }

  /** World-space position of the root. */
  worldPos(out = new THREE.Vector3()): THREE.Vector3 {
    return this.root.getWorldPosition(out);
  }
}
