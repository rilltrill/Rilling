import * as THREE from 'three';
import type { World } from '../../../gameplay/World';
import type { Destructible } from '../../../gameplay/Props';
import type { Ambulance } from './props';

/** Fluorescent panel that buzzes / blinks / dies. */
export interface Flicker {
  mesh: THREE.Mesh;
  on: THREE.Material;
  off: THREE.Material;
  seed: number;
  mode: 'buzz' | 'blink' | 'dying';
  pos: THREE.Vector3;
  lit: boolean;
}

/** Bed curtain that whips open when something comes through it. */
export interface Curtain {
  obj: THREE.Object3D;
  pos: THREE.Vector3;
  closed: THREE.Vector3;
  /** Local slide offset when open. */
  slide: THREE.Vector3;
  t: number;
  open: boolean;
}

/** Morgue drawer that bangs open. */
export interface Drawer {
  door: THREE.Object3D;
  tray: THREE.Object3D;
  trayFrom: THREE.Vector3;
  trayTo: THREE.Vector3;
  pos: THREE.Vector3;
  t: number;
  open: boolean;
}

/** Ceiling vent whose grate falls out when a crawler drops through. */
export interface Vent {
  grate: THREE.Object3D;
  pos: THREE.Vector3;
  floor: number;
  vy: number;
  spin: number;
  dropped: boolean;
  landed: boolean;
}

export interface Swinger {
  obj: THREE.Object3D;
  amp: number;
  rate: number;
  phase: number;
}

export interface Spinner {
  obj: THREE.Object3D;
  rate: number;
}

export interface Flame {
  obj: THREE.Object3D;
  seed: number;
  scale: number;
}

/** Where a breakable door goes (setup() spawns the Destructible). */
export interface DoorSlot {
  /** Hinge position (world, floor level). */
  hinge: THREE.Vector3;
  /** Yaw of the closed door panel (panel spans local +X from the hinge, front +Z). */
  ry: number;
  w: number;
  h: number;
  /** Unit vector pointing from the side room into the corridor. */
  out: THREE.Vector3;
  /** Door centre (world, floor level). */
  centre: THREE.Vector3;
  color: number;
}

export interface AccentLight {
  /** Active while rig.d ∈ [from, to). */
  from: number;
  to: number;
  pos: THREE.Vector3;
  color: number;
  intensity: number;
  distance: number;
  mode: 'steady' | 'strobe' | 'police' | 'buzz' | 'flesh' | 'surgical' | 'fire';
}

/** Flying debris piece (door slabs, wall chunks, grates). */
export interface Flyer {
  obj: THREE.Object3D;
  vel: THREE.Vector3;
  spin: THREE.Vector3;
  floor: number;
  rest: boolean;
  /** Half-height used to rest on the floor. */
  half: number;
}

export interface AmbulanceRig {
  amb: Ambulance;
  /** Crash state: -1 idle (parked off-screen), 0..1 driving, then crashed. */
  t: number;
  state: 'idle' | 'driving' | 'crashed';
  from: THREE.Vector3;
  to: THREE.Vector3;
  yawFrom: number;
  yawTo: number;
  doorsT: number;
  flames: Flame[];
  smokeT: number;
}

export interface BreakWall {
  pieces: THREE.Mesh[];
  holder: THREE.Group;
  centre: THREE.Vector3;
  /** Direction the wall bursts into (corridor side). */
  out: THREE.Vector3;
  shake: number;
  broken: boolean;
}

export interface Z2Scene {
  t: number;
  flickers: Flicker[];
  curtains: Curtain[];
  drawers: Drawer[];
  vents: Vent[];
  swingers: Swinger[];
  spinners: Spinner[];
  lightbars: { red: THREE.Mesh[]; blue: THREE.Mesh[] }[];
  doorSlots: DoorSlot[];
  doors: Destructible[];
  tanks: { pos: THREE.Vector3; kind: 'oxygen' | 'gas' }[];
  flyers: Flyer[];
  ambulance: AmbulanceRig | null;
  wall: BreakWall | null;
  accents: AccentLight[];
  /** Destructibles to hide when far away. */
  cullables: { obj: THREE.Object3D; pos: THREE.Vector3 }[];
  /** 0..1 boss-room flesh glow boost (set by the stage script). */
  fleshGlow: number;
  /** Extra global flicker (power surge) 0..1 set by set pieces. */
  surge: number;
  root: THREE.Group;
}

const SCENES = new WeakMap<World, Z2Scene>();

export function setZ2Scene(w: World, s: Z2Scene) {
  SCENES.set(w, s);
}

export function z2Scene(w: World): Z2Scene | undefined {
  return SCENES.get(w);
}

export function clearZ2Scene(w: World) {
  SCENES.delete(w);
}
