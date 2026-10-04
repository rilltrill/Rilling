import type * as THREE from 'three';
import type { World } from '../../../gameplay/World';
import type { Rng } from '../../../core/Rng';

/**
 * Shared, animated materials. They are owned by the stage (tracked custom
 * materials), so `env.update` may change their colours every frame: all
 * meshes using one of them across the building blink/pulse together for a
 * single draw call.
 */
export interface AnimMats {
  /** Red emergency beacons (slow pulse). */
  strobe: THREE.MeshBasicMaterial;
  /** Dying fluorescent tubes. */
  flicker: THREE.MeshBasicMaterial;
  /** Server LEDs, three blink patterns. */
  leds: THREE.MeshBasicMaterial[];
  /** Incubator eggs / heat lamps. */
  egg: THREE.MeshBasicMaterial;
  /** Embryo tank fluid (transparent). */
  fluid: THREE.MeshBasicMaterial;
  /** Stove gas flames. */
  flame: THREE.MeshBasicMaterial;
  /** Monitors. */
  screen: THREE.MeshBasicMaterial;
  /** Night sky behind the greenhouse glass (lightning). */
  sky: THREE.MeshBasicMaterial;
  /** Amber rotating warning lamps. */
  warn: THREE.MeshBasicMaterial;
  /** Specimen tank glow. */
  tank: THREE.MeshBasicMaterial;
}

export type Animator = (dt: number, t: number, world: World) => void;

/** One room's output: baked static scenery plus the meshes that stop bullets. */
export interface RoomOut {
  root: THREE.Group;
  shell: THREE.Object3D[];
}

export interface Ctx {
  world: World;
  curve: THREE.CatmullRomCurve3;
  am: AnimMats;
  animators: Animator[];
  rng: Rng;
}
