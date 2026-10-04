import * as THREE from 'three';
import { Kit } from '../../kit/ModelKit';

/**
 * 5×7 block font for hospital signage (EMERGENCY, MORGUE, EXIT…). Each lit
 * row-run of pixels becomes one box, so a word is a few dozen boxes that the
 * baker merges into the stage's glow draw call.
 */
const GLYPHS: Record<string, string[]> = {
  A: [' ### ', '#   #', '#   #', '#####', '#   #', '#   #', '#   #'],
  B: ['#### ', '#   #', '#   #', '#### ', '#   #', '#   #', '#### '],
  C: [' ####', '#    ', '#    ', '#    ', '#    ', '#    ', ' ####'],
  D: ['#### ', '#   #', '#   #', '#   #', '#   #', '#   #', '#### '],
  E: ['#####', '#    ', '#    ', '#### ', '#    ', '#    ', '#####'],
  G: [' ####', '#    ', '#    ', '# ###', '#   #', '#   #', ' ### '],
  H: ['#   #', '#   #', '#   #', '#####', '#   #', '#   #', '#   #'],
  I: ['#####', '  #  ', '  #  ', '  #  ', '  #  ', '  #  ', '#####'],
  K: ['#   #', '#  # ', '# #  ', '##   ', '# #  ', '#  # ', '#   #'],
  L: ['#    ', '#    ', '#    ', '#    ', '#    ', '#    ', '#####'],
  M: ['#   #', '## ##', '# # #', '# # #', '#   #', '#   #', '#   #'],
  N: ['#   #', '##  #', '# # #', '#  ##', '#   #', '#   #', '#   #'],
  O: [' ### ', '#   #', '#   #', '#   #', '#   #', '#   #', ' ### '],
  P: ['#### ', '#   #', '#   #', '#### ', '#    ', '#    ', '#    '],
  R: ['#### ', '#   #', '#   #', '#### ', '# #  ', '#  # ', '#   #'],
  S: [' ####', '#    ', '#    ', ' ### ', '    #', '    #', '#### '],
  T: ['#####', '  #  ', '  #  ', '  #  ', '  #  ', '  #  ', '  #  '],
  U: ['#   #', '#   #', '#   #', '#   #', '#   #', '#   #', ' ### '],
  V: ['#   #', '#   #', '#   #', '#   #', '#   #', ' # # ', '  #  '],
  W: ['#   #', '#   #', '#   #', '# # #', '# # #', '## ##', '#   #'],
  X: ['#   #', '#   #', ' # # ', '  #  ', ' # # ', '#   #', '#   #'],
  Y: ['#   #', '#   #', ' # # ', '  #  ', '  #  ', '  #  ', '  #  '],
  '0': [' ### ', '#   #', '#  ##', '# # #', '##  #', '#   #', ' ### '],
  '1': ['  #  ', ' ##  ', '  #  ', '  #  ', '  #  ', '  #  ', ' ### '],
  '2': [' ### ', '#   #', '    #', '   # ', '  #  ', ' #   ', '#####'],
  '3': ['#### ', '    #', '    #', ' ### ', '    #', '    #', '#### '],
  '4': ['#   #', '#   #', '#   #', '#####', '    #', '    #', '    #'],
  '5': ['#####', '#    ', '#### ', '    #', '    #', '#   #', ' ### '],
  '6': [' ### ', '#    ', '#    ', '#### ', '#   #', '#   #', ' ### '],
  '7': ['#####', '    #', '   # ', '  #  ', ' #   ', ' #   ', ' #   '],
  '8': [' ### ', '#   #', '#   #', ' ### ', '#   #', '#   #', ' ### '],
  '9': [' ### ', '#   #', '#   #', ' ####', '    #', '    #', ' ### '],
  '>': ['#    ', ' #   ', '  #  ', '   # ', '  #  ', ' #   ', '#    '],
  '<': ['    #', '   # ', '  #  ', ' #   ', '  #  ', '   # ', '    #'],
  '^': ['  #  ', ' ### ', '# # #', '  #  ', '  #  ', '  #  ', '  #  '],
  v: ['  #  ', '  #  ', '  #  ', '  #  ', '# # #', ' ### ', '  #  '],
  '+': ['     ', '  #  ', '  #  ', '#####', '  #  ', '  #  ', '     '],
  '.': ['     ', '     ', '     ', '     ', '     ', '     ', '  #  '],
  '-': ['     ', '     ', '     ', '#####', '     ', '     ', '     '],
  ' ': ['     ', '     ', '     ', '     ', '     ', '     ', '     '],
};

export interface TextOpts {
  /** Pixel size in metres. */
  px: number;
  mat: THREE.Material;
  /** Box depth. */
  depth?: number;
  /** Characters to leave dark (broken letters), by index. */
  broken?: number[];
  /** Material for broken letters (default: skip them). */
  brokenMat?: THREE.Material;
}

/** Width of a string in metres. */
export function textWidth(text: string, px: number): number {
  return Math.max(0, text.length * 6 - 1) * px;
}

/**
 * Add `text` centred on (x, y, z) to `g`, reading along local +X of a sub-group
 * rotated by `ry`, front facing +Z. Returns the sub-group.
 */
export function pixelText(g: THREE.Object3D, text: string, x: number, y: number, z: number, ry: number, o: TextOpts): THREE.Group {
  const holder = new THREE.Group();
  holder.position.set(x, y, z);
  holder.rotation.y = ry;
  g.add(holder);
  const px = o.px;
  const depth = o.depth ?? px * 0.6;
  const w = textWidth(text, px);
  let cx = -w / 2;
  const chars = [...text.toUpperCase()];
  chars.forEach((ch, ci) => {
    const glyph = GLYPHS[ch] ?? GLYPHS[ch.toLowerCase()] ?? GLYPHS[' '];
    const broken = o.broken?.includes(ci);
    const mat = broken ? o.brokenMat : o.mat;
    if (mat) {
      for (let r = 0; r < 7; r++) {
        const row = glyph[r];
        let c = 0;
        while (c < 5) {
          if (row[c] !== '#') {
            c++;
            continue;
          }
          let e = c;
          while (e < 5 && row[e] === '#') e++;
          const len = e - c;
          const m = new THREE.Mesh(Kit.box(len * px, px, depth), mat);
          m.position.set(cx + (c + len / 2) * px, (3 - r) * px, 0);
          holder.add(m);
          c = e;
        }
      }
    }
    cx += 6 * px;
  });
  return holder;
}
