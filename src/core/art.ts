import type { ArtStyle } from './types';

/**
 * The ART setting's queries — the ONE place code asks what to draw.
 *
 *   ART        characters (PixelCast)   environments (PixelWorld)
 *   CLASSIC    3D models                3D (Kit textures)
 *   PIXEL CAST pixel art                3D (Kit textures)      ← the saved v3 look
 *   PIXEL WORLD pixel art               painted pixel art
 *
 * Characters follow the live setting (the pause chip swaps them at once).
 * Environments are built at stage load, so a stage keeps the environment style
 * it was loaded with (`World.art`); a change shows from the next stage load
 * (RETRY / RESTART / the next stage). Stage builders branch on
 * `pixelWorld(world)` — never on the setting itself.
 */

export const ART_STYLES: readonly ArtStyle[] = ['3d', 'sprites', 'pixel'];

/** Player-facing names (settings row, pause chip). */
export const ART_NAMES: Record<ArtStyle, string> = { '3d': 'CLASSIC', sprites: 'PIXEL CAST', pixel: 'PIXEL WORLD' };

export function isArtStyle(v: unknown): v is ArtStyle {
  return v === '3d' || v === 'sprites' || v === 'pixel';
}

/** Characters (and pickups, thrown things, gibs, plants) drawn as PixelCast pixel art. */
export function artCast(a: ArtStyle): boolean {
  return a !== '3d';
}

/** Environments painted as PixelWorld pixel art. */
export function artWorld(a: ArtStyle): boolean {
  return a === 'pixel';
}

/** The pause chip's cycle: CLASSIC → PIXEL CAST → PIXEL WORLD → CLASSIC. */
export function nextArt(a: ArtStyle): ArtStyle {
  return ART_STYLES[(ART_STYLES.indexOf(a) + 1) % ART_STYLES.length];
}

/**
 * Does the stage being built / played use PixelWorld environments? Fixed when the
 * stage loads (`World.art`); THE query for stage builders.
 */
export function pixelWorld(world: { readonly art: ArtStyle }): boolean {
  return world.art === 'pixel';
}

/** A setting change that only takes effect on the next stage load (the environment style differs from the loaded one). */
export function envPending(loaded: ArtStyle, wanted: ArtStyle): boolean {
  return artWorld(loaded) !== artWorld(wanted);
}
