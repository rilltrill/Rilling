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

/**
 * Untextured Kit.mat materials carry the default retro 'grain' (Kit.retro.grain).
 * Record it so the baker buckets every grainy colour into ONE draw call instead
 * of leaving one merged mesh per colour.
 */
function noteGrain(m: THREE.MeshLambertMaterial): THREE.MeshLambertMaterial {
  const rt = m.userData.retroTex as TexName | undefined;
  if (rt && !INFO.has(m)) INFO.set(m, { tex: rt, scale: 1, strength: 0.6 });
  return m;
}

/** Flat Lambert scenery material, optionally with a retro detail texture. */
export function M(color: number, tex?: TexName, scale = 1, strength = 1): THREE.MeshLambertMaterial {
  if (!tex) return noteGrain(Kit.mat(color));
  const m = Kit.mat(color, { tex, texScale: scale, texStrength: strength });
  INFO.set(m, { tex, scale, strength });
  return m;
}

/** Back-faced (room interior) Lambert, optionally textured. */
export function MB(color: number, tex?: TexName, scale = 1, strength = 1): THREE.MeshLambertMaterial {
  if (!tex) return noteGrain(Kit.mat(color, { side: THREE.BackSide }));
  const m = Kit.mat(color, { side: THREE.BackSide, tex, texScale: scale, texStrength: strength });
  INFO.set(m, { tex, scale, strength });
  return m;
}

/** Double-sided Lambert (curtains, papers, signs). */
export function MD(color: number, tex?: TexName, scale = 1, strength = 1): THREE.MeshLambertMaterial {
  if (!tex) return noteGrain(Kit.mat(color, { side: THREE.DoubleSide }));
  const m = Kit.mat(color, { side: THREE.DoubleSide, tex, texScale: scale, texStrength: strength });
  INFO.set(m, { tex, scale, strength });
  return m;
}

/** A retro texture preset: [texture, texScale, texStrength]. */
export type Preset = readonly [TexName, number, number];

/**
 * The stage's texture palette. Every (texture, scale, strength) combination is
 * one baked draw call per zone, so scenery picks from this short list instead
 * of inventing new combinations — colour is free (it is baked into vertices).
 */
export const TX = {
  // ── Architecture ──
  /** Glazed wainscot / wall tiles (clinic, ward, morgue, OR). */
  wallTile: ['tiles', 1.2, 0.62],
  /** Painted plaster above the wainscot, side rooms. */
  plaster: ['stucco', 1, 0.65],
  /** Patterned wallpaper (lobby, offices, patient rooms). */
  paper: ['wallpaper', 1, 0.4],
  /** Poured concrete: slabs, stairs, canopy, basement floors/ceilings. */
  concrete: ['concrete', 1, 0.8],
  /** Painted cinder block (basement service walls). */
  block: ['brick', 1.25, 0.5],
  /** Exterior brick (hospital facade, wings). */
  brick: ['brick', 0.8, 0.85],
  /** Sheet linoleum laid in a checkerboard. */
  lino: ['checker', 0.55, 0.34],
  /** Big lobby marble checker. */
  marble: ['checker', 0.32, 0.36],
  /** Small ceramic floor tiles (morgue, OR). */
  floorTile: ['tiles', 0.5, 0.85],
  /** Speckled terrazzo (the asphalt map's chips on a light ground). */
  terrazzo: ['asphalt', 1.6, 0.6],
  /** Acoustic ceiling tiles. */
  ceiling: ['tiles', 0.5, 0.8],
  asphalt: ['asphalt', 1, 0.9],
  /** Rain puddles. */
  water: ['water', 1.2, 0.7],
  // ── Fixtures / props ──
  /** Brushed / stainless steel (gurneys, IV stands, trays, drawers, sinks). */
  steel: ['metal', 2, 0.5],
  /** Painted sheet metal (cabinets, vending machines, carts, doors, cylinders). */
  paint: ['metal', 1.5, 0.32],
  /** Vehicle body panels. */
  panel: ['metal', 1, 0.3],
  /** Fabric: sheets, curtains, upholstery, body bags, scrubs. */
  cloth: ['cloth', 0.5, 0.55],
  /** Printed privacy curtains. */
  curtain: ['wallpaper', 0.7, 0.55],
  /** Wood veneer: doors, counters, benches. */
  wood: ['planks', 1.2, 0.35],
  /** Vent grilles, drains, cable trays, chain-link. */
  grate: ['grate', 1.5, 0.9],
  /** Yellow/black safety striping. */
  hazard: ['hazard', 1, 0.7],
  /** Corrugated shutters / pipes lagging. */
  ribbed: ['corrugated', 1.2, 0.5],
  /** Dead bark (bay trees). */
  bark: ['bark', 1, 0.8],
  // ── Flesh ──
  /** Bumpy wrinkled flesh mass (Patient Zero, the cocoon, creeping veins). */
  flesh: ['hide', 1.3, 0.75],
  /** Veiny human skin with rot sores. */
  skin: ['skin', 0.7, 0.65],
  /** Bone / cartilage. */
  bone: ['hide', 2.2, 0.45],
} as const satisfies Record<string, Preset>;

/** Lambert scenery material from a palette preset. */
export function T(color: number, p: Preset): THREE.MeshLambertMaterial {
  return M(color, p[0], p[1], p[2]);
}

/** Back-faced preset material (room interiors seen through doorways). */
export function TB(color: number, p: Preset): THREE.MeshLambertMaterial {
  return MB(color, p[0], p[1], p[2]);
}

/** Double-sided preset material. */
export function TD(color: number, p: Preset): THREE.MeshLambertMaterial {
  return MD(color, p[0], p[1], p[2]);
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
  wallLow: 0x2a6258,
  wallHigh: 0x86968a,
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
  curtain: 0xc49a7a,
  curtainAlt: 0xb8a882,
  // Glows.
  panel: 0xe6fff2,
  panelWarm: 0xfff1d0,
  exit: 0x3cff6a,
  red: 0xff2a1a,
  screen: 0x3aff8a,
  screenBlue: 0x6ac8ff,
  moon: 0x8fb0ff,
} as const;
