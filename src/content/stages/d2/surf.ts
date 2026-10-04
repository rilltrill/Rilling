import type * as THREE from 'three';
import { mat } from './bake';

/**
 * Canonical retro surfaces for RESEARCH LABS.
 *
 * Every distinct (texture, scale, strength) recipe costs one draw call per
 * baked group, so props pick from this small palette instead of inventing
 * their own: a room then bakes into a handful of meshes however many crates,
 * pipes and frames it holds. Big one-off surfaces (a room's floor, its walls)
 * may still use a bespoke recipe — they are a single mesh either way.
 *
 * Colour is free (vertex colours): `S.metal(0x8a3a2a)` and `S.metal(0x2a4a7a)`
 * share one draw call.
 */
export const S = {
  /** Painted / worn machinery, frames, fixtures, pipes, rails, brackets. */
  metal: (c: number): THREE.MeshLambertMaterial => mat(c, 'metal', 2, 0.7),
  /** Clean stainless (lab benches, kitchen steel, tanks): finer panels, faint rust. */
  steel: (c: number): THREE.MeshLambertMaterial => mat(c, 'metal', 3, 0.4),
  /** Walls, plinths, kerbs. */
  concrete: (c: number): THREE.MeshLambertMaterial => mat(c, 'concrete', 1, 0.75),
  /** Counter tops, terrazzo. */
  terrazzo: (c: number): THREE.MeshLambertMaterial => mat(c, 'concrete', 2, 0.45),
  /** Rendered / painted walls, pots, murals. */
  stucco: (c: number): THREE.MeshLambertMaterial => mat(c, 'stucco', 1.5, 0.8),
  /** Timber: shelving, benches, crates, wainscot. */
  planks: (c: number): THREE.MeshLambertMaterial => mat(c, 'planks', 1.5, 0.85),
  /** Fabric: banners, plush toys, merchandise, rope. */
  cloth: (c: number): THREE.MeshLambertMaterial => mat(c, 'cloth', 2.5, 0.55),
  /** Yellow / black warning stripes. */
  hazard: (c = 0xe0b020): THREE.MeshLambertMaterial => mat(c, 'hazard', 1.5, 1),
  /** Floor grating, cable trays, server front grilles. */
  grate: (c: number): THREE.MeshLambertMaterial => mat(c, 'grate', 1.5, 0.8),
  /** Corrugated sheet metal (service ceilings, wall cladding). */
  corrugated: (c: number): THREE.MeshLambertMaterial => mat(c, 'corrugated', 1.2, 0.8),
  /** Foliage (fronds, ferns, bushes, vines). */
  leaves: (c: number): THREE.MeshLambertMaterial => mat(c, 'leaves', 1.5, 0.65),
  bark: (c: number): THREE.MeshLambertMaterial => mat(c, 'bark', 2, 0.9),
  rock: (c: number): THREE.MeshLambertMaterial => mat(c, 'rock', 2, 0.7),
  water: (c: number): THREE.MeshLambertMaterial => mat(c, 'water', 1, 0.6),
  /** Grain-only (no pattern): signage boards, lettering, paper, dark voids. */
  plain: (c: number): THREE.MeshLambertMaterial => mat(c),
};
