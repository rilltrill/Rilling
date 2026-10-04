import * as THREE from 'three';
import { Kit, type TexName } from '../../kit/ModelKit';

/**
 * Material helpers for ST. MERCY HOSPITAL.
 *
 * Every scenery material goes through `M()` so the colour baker (bake.ts) knows
 * which retro detail texture (if any) a material carries and can bake many
 * colours that share a texture into one vertex-coloured draw call.
 */

export interface TexInfo {
  tex: TexName;
  scale: number;
  strength: number;
}

const INFO = new WeakMap<THREE.Material, TexInfo>();

/** Flat Lambert scenery material, optionally with a retro detail texture. */
export function M(color: number, tex?: TexName, scale = 1, strength = 1): THREE.MeshLambertMaterial {
  if (!tex) return Kit.mat(color);
  const m = Kit.mat(color, { tex, texScale: scale, texStrength: strength });
  INFO.set(m, { tex, scale, strength });
  return m;
}

/** Back-faced (room interior) Lambert, optionally textured. */
export function MB(color: number, tex?: TexName, scale = 1, strength = 1): THREE.MeshLambertMaterial {
  const m = tex
    ? Kit.mat(color, { side: THREE.BackSide, tex, texScale: scale, texStrength: strength })
    : Kit.mat(color, { side: THREE.BackSide });
  if (tex) INFO.set(m, { tex, scale, strength });
  return m;
}

/** Double-sided Lambert (curtains, papers, signs). */
export function MD(color: number): THREE.MeshLambertMaterial {
  return Kit.mat(color, { side: THREE.DoubleSide });
}

/** Unlit glow (lamps, screens, signs). */
export function G(color: number, intensity = 1): THREE.MeshBasicMaterial {
  return Kit.glow(color, intensity);
}

export function texInfo(m: THREE.Material): TexInfo | undefined {
  return INFO.get(m);
}

/** Shared vertex-coloured Lambert used by the baker for one texture bucket. */
export function bakedLambert(info: TexInfo | undefined, side: THREE.Side): THREE.MeshLambertMaterial {
  if (!info) return Kit.mat(0xffffff, { vertexColors: true, side });
  return Kit.mat(0xffffff, { vertexColors: true, side, tex: info.tex, texScale: info.scale, texStrength: info.strength });
}

// ─── Palette ────────────────────────────────────────────────────────────────

export const C = {
  // Clinic walls / floors.
  wallLow: 0x2f5b54,
  wallHigh: 0x7c8c84,
  wallRail: 0xc9cdbf,
  floor: 0x5d6a63,
  floorAlt: 0x46524c,
  ceiling: 0x7a827c,
  ceilingGrid: 0x4d5550,
  door: 0x5f7f7a,
  doorFrame: 0x9aa39c,
  kick: 0x8d9696,
  // Stairs / basement.
  concrete: 0x6a6c66,
  concreteDark: 0x4a4c48,
  stairRail: 0xc9a227,
  // Morgue / OR.
  tileWhite: 0x9fb2b4,
  tileLow: 0x587478,
  steel: 0x9aa4a8,
  steelDark: 0x5a6266,
  orGreen: 0x3a7462,
  orFloor: 0x4b5a54,
  // Atrium.
  marble: 0x77736a,
  marbleDark: 0x4e4a44,
  balcony: 0x9a9c94,
  // Gore.
  blood: 0x5c0909,
  bloodDark: 0x3a0505,
  bloodFresh: 0x7e0d0d,
  flesh: 0x7a2a2a,
  fleshDark: 0x4a1212,
  // Fabric.
  sheet: 0xc8d2cc,
  sheetBlue: 0x8fb4c4,
  curtain: 0x6f9e98,
  curtainAlt: 0x8aa6b8,
  // Glows.
  panel: 0xe6fff2,
  panelWarm: 0xfff1d0,
  exit: 0x3cff6a,
  red: 0xff2a1a,
  screen: 0x3aff8a,
  screenBlue: 0x6ac8ff,
  moon: 0x8fb0ff,
} as const;
