import type { FloraBiome } from './floraSpecies';

/**
 * FLORA biomes: base colours for the pixel plants of each stage, taken from
 * the stage's own 3D vegetation palette so ART: 3D and ART: SPRITES read alike
 * (d1 `stages/d1/flora.ts` COL, d3 `stages/d3/flora.ts` FLORA, z1 props M).
 */

/** JUNGLE RUN (d1): sunlit park jungle. */
export const D1_BIOME: FloraBiome = {
  leaf: 0x2f6a28,
  leafLight: 0x46872e,
  leafDark: 0x23511e,
  frond: 0x56962e,
  frondDark: 0x3d7a28,
  fern: 0x3d8a2c,
  fernLight: 0x67a834,
  bark: 0x5a4632,
  barkDark: 0x3e2f22,
  palmTrunk: 0x766a58,
  palmRing: 0x52483a,
  moss: 0x6e9a34,
  vine: 0x356a22,
  grass: 0x6b8c34,
  grassLight: 0x8aaa3c,
  cycad: 0x6a9a2c,
  cycadTrunk: 0x6b5a3c,
  ear: 0x3d8a2c,
  coconut: 0x5a4024,
  flowers: [0xff5a3a, 0xffd23a, 0xff7ac0],
};

/** TYRANT CHASE (d3): the jungle at night in a storm (lifted so silhouettes read under moonlight). */
export const D3_BIOME: FloraBiome = {
  leaf: 0x355f38,
  leafLight: 0x3f6d3a,
  leafDark: 0x274b2c,
  frond: 0x4a7b42,
  frondDark: 0x355f36,
  fern: 0x3f7444,
  fernLight: 0x4b7d3e,
  bark: 0x4f4335,
  barkDark: 0x382f25,
  // (darker than the 3D base colour: the 3D trunk's bark texture and shading read this dark at night)
  palmTrunk: 0x5a4c3c,
  palmRing: 0x4c3f32,
  moss: 0x4b6a36,
  vine: 0x2f4a26,
  grass: 0x3f6a34,
  grassLight: 0x4f7a3e,
  cycad: 0x4a7b42,
  cycadTrunk: 0x5a4c3a,
  ear: 0x3a7a44,
  coconut: 0x4a3a22,
  flowers: [],
  sat: 0.95,
  // Storm night: highlights stay near the 3D foliage's lit value (no mint / pale tops in the headlights).
  light: 0.3,
  cap: 0.58,
};

/** MAIN STREET (z1): town street trees at night. */
export const Z1_BIOME: FloraBiome = {
  leaf: 0x34502a,
  leafLight: 0x395630,
  leafDark: 0x2c4424,
  frond: 0x3f5e30,
  frondDark: 0x2c4424,
  fern: 0x3f5e30,
  fernLight: 0x4a6a36,
  // (a notch darker than the 3D bark: its cylinder is mostly in shade under the street lamps)
  bark: 0x3e3126,
  barkDark: 0x32281f,
  palmTrunk: 0x4a3a2c,
  palmRing: 0x3e3024,
  moss: 0x4a5a30,
  vine: 0x2c4424,
  grass: 0x4a5e30,
  grassLight: 0x5a6e38,
  cycad: 0x3f5e30,
  cycadTrunk: 0x4a3a2c,
  ear: 0x3f5e30,
  coconut: 0x3e3024,
  flowers: [0xb04040],
  sat: 0.9,
  light: 0.3,
  cap: 0.55,
  // Street props (z1 props.ts colours): hydrant, trash can, traffic cone.
  // Identity colours kept saturated: highlights climb toward warm, never toward white.
  extra: {
    hydrant: { hex: 0xa82218, light: 0.3, sat: 1.1 },
    can: { hex: 0x3c4c42, light: 0.3 },
    canLid: { hex: 0x34363d, light: 0.3 },
    cone: { hex: 0xd9641c, light: 0.26, sat: 1.15 },
    band: { hex: 0xc4c6c0, light: 0.18, dark: 0.5 },
    coneBase: { hex: 0x2a2a30, light: 0.3 },
  },
};
