import * as THREE from 'three';
import { Kit } from '../../kit/ModelKit';

/**
 * 5×7 block font for park signage ("DANGER", "HELIPAD"…). Each lit pixel is a
 * small box; signs are baked with the rest of the scenery so text costs no
 * extra draw calls.
 */
const GLYPHS: Record<string, string> = {
  A: '01110 10001 10001 11111 10001 10001 10001',
  B: '11110 10001 10001 11110 10001 10001 11110',
  C: '01111 10000 10000 10000 10000 10000 01111',
  D: '11110 10001 10001 10001 10001 10001 11110',
  E: '11111 10000 10000 11110 10000 10000 11111',
  F: '11111 10000 10000 11110 10000 10000 10000',
  G: '01111 10000 10000 10011 10001 10001 01111',
  H: '10001 10001 10001 11111 10001 10001 10001',
  I: '11111 00100 00100 00100 00100 00100 11111',
  K: '10001 10010 10100 11000 10100 10010 10001',
  L: '10000 10000 10000 10000 10000 10000 11111',
  M: '10001 11011 10101 10101 10001 10001 10001',
  N: '10001 11001 10101 10011 10001 10001 10001',
  O: '01110 10001 10001 10001 10001 10001 01110',
  P: '11110 10001 10001 11110 10000 10000 10000',
  R: '11110 10001 10001 11110 10100 10010 10001',
  S: '01111 10000 10000 01110 00001 00001 11110',
  T: '11111 00100 00100 00100 00100 00100 00100',
  U: '10001 10001 10001 10001 10001 10001 01110',
  V: '10001 10001 10001 10001 10001 01010 00100',
  W: '10001 10001 10001 10101 10101 10101 01010',
  X: '10001 10001 01010 00100 01010 10001 10001',
  Y: '10001 10001 01010 00100 00100 00100 00100',
  Z: '11111 00001 00010 00100 01000 10000 11111',
  '0': '01110 10001 10011 10101 11001 10001 01110',
  '1': '00100 01100 00100 00100 00100 00100 01110',
  '!': '00100 00100 00100 00100 00100 00000 00100',
  ',': '00000 00000 00000 00000 00110 00100 01000',
  '.': '00000 00000 00000 00000 00000 01100 01100',
  '-': '00000 00000 00000 11111 00000 00000 00000',
  '>': '01000 00100 00010 00001 00010 00100 01000',
  '<': '00010 00100 01000 10000 01000 00100 00010',
  ' ': '00000 00000 00000 00000 00000 00000 00000',
};

/**
 * Build `text` as pixel boxes in the XY plane (facing +Z), centred on x,
 * baseline at y = 0. `px` = pixel size in metres. Returns the group.
 */
export function blockText(text: string, px: number, mat: THREE.Material, depth = px * 0.6): THREE.Group {
  const g = new THREE.Group();
  const chars = text.toUpperCase().split('');
  const adv = 6 * px;
  const width = chars.length * adv - px;
  const geo = Kit.box(px * 1.02, px * 1.02, depth);
  chars.forEach((ch, ci) => {
    const glyph = GLYPHS[ch] ?? GLYPHS[' '];
    const rows = glyph.split(' ');
    for (let r = 0; r < 7; r++) {
      for (let c = 0; c < 5; c++) {
        if (rows[r][c] !== '1') continue;
        Kit.add(g, geo, mat, -width / 2 + ci * adv + c * px + px / 2, (6 - r) * px + px / 2, 0);
      }
    }
  });
  return g;
}

/** Width in metres of `text` at pixel size `px`. */
export function textWidth(text: string, px: number): number {
  return text.length * 6 * px - px;
}
