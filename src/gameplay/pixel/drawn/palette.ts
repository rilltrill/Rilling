import { celRamp, type CelKind } from '../materials';
import { RAMP_TONES } from './raster';

/**
 * DRAWN FIGURES: the figures' colour ramps. Same six-step hue-shifted ramps as the rest of the
 * cast (`celRamp`), held as data so a canvas texel is just (ramp, tone): the stage moves a whole
 * figure by whole steps of its own ramps, like the painted backgrounds.
 */

export interface RampDef {
  name: string;
  hex: number;
  kind: CelKind;
  /** Base-tone override of the ramp's colours (for special ramps: reflective tape, blood...). */
  colors?: readonly number[];
}

export const R = {
  shirtGrey: 0,
  hivis: 1,
  reflect: 2,
  denim: 3,
  boot: 4,
  hat: 5,
  skinDead: 6,
  hairDark: 7,
  blood: 8,
  bone: 9,
  eyeGlow: 10,
  flannel: 11,
  flannelDark: 12,
  skinLive: 13,
  denimCiv: 14,
  bootCiv: 15,
  teeth: 16,
  belt: 17,
  white: 18,
  count: 19,
} as const;

export const RAMPS: RampDef[] = [
  { name: 'shirtGrey', hex: 0x5a6a7a, kind: 'cloth' },
  { name: 'hivis', hex: 0xc8f020, kind: 'flat', colors: [0x20280c, 0x5e7a14, 0x96bf1a, 0xcceb22, 0xe8f65e, 0xfaffc4] },
  { name: 'reflect', hex: 0xdfe6e0, kind: 'metal' },
  { name: 'denim', hex: 0x3f5270, kind: 'cloth' },
  { name: 'boot', hex: 0x6a4524, kind: 'leather' },
  { name: 'hat', hex: 0xf2be1e, kind: 'flat' },
  { name: 'skinDead', hex: 0xa6b292, kind: 'dead' },
  { name: 'hairDark', hex: 0x4a3a2c, kind: 'hair' },
  { name: 'blood', hex: 0x8a1414, kind: 'gore' },
  { name: 'bone', hex: 0xe2d8ba, kind: 'flat' },
  { name: 'eyeGlow', hex: 0xfff2a0, kind: 'flat', colors: [0x402018, 0x80401c, 0xc08030, 0xf2c850, 0xfff0a8, 0xffffff] },
  { name: 'flannel', hex: 0xb4282e, kind: 'cloth' },
  { name: 'flannelDark', hex: 0x2c2c3a, kind: 'cloth' },
  { name: 'skinLive', hex: 0xd89a70, kind: 'live' },
  { name: 'denimCiv', hex: 0x3a5a94, kind: 'cloth' },
  { name: 'bootCiv', hex: 0x6e5038, kind: 'leather' },
  { name: 'teeth', hex: 0xece6cc, kind: 'flat' },
  { name: 'belt', hex: 0x5c3f20, kind: 'leather' },
  { name: 'white', hex: 0xf0f0e8, kind: 'flat' },
];

/** RGB of every (ramp, tone), `RAMP_TONES` entries per ramp (for PNG tools and tests). */
export function rampColors(): number[] {
  const out: number[] = [];
  for (const r of RAMPS) {
    const c = r.colors ?? celRamp(r.hex, r.kind);
    for (let t = 0; t < RAMP_TONES; t++) out.push(c[t]);
  }
  return out;
}
