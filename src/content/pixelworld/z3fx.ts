import * as THREE from 'three';
import { Kit } from '../kit/ModelKit';
import { PwAtlas, type PwPainter, type PwTile } from './atlas';
import { bayer, PWF, type PwCanvas } from './canvas';
import { hash2 } from './surfaces';
import { z1FlameTile, Z1_FLAME_FRAMES, Z1_FLAME_H, Z1_FLAME_W } from './z1fire';

/**
 * HIGHWAY TO HELL (z3) fire and smoke for ART: PIXEL WORLD: the burning
 * wrecks' flames as hand-drawn animated strips (the cast's flame painter) and
 * the smoke as hand-pixelled puffs (a lumpy disc lit from the upper left, a
 * shadowed underside, a dithered ragged rim) — camera-facing sprites drawn by
 * the fire field's / sky plumes' own instanced meshes (one draw each, no
 * sorting: cut-out texels), tinted per instance (fire-lit to grey).
 */

export const PUFF = 48;

/** Puff variants in the strip: three cauliflower billows, a dense core, a thinning wisp, a sheared top. */
export const PUFF_CELLS = 6;

/** Puff cells per row of the strip (two rows: the fx atlas stays 256 wide). */
export const PUFF_COLS = 3;

/** Smoke puff sprites (PUFF_CELLS variants, PUFF_COLS a row, neutral grey: tinted per instance). */
export function z3PuffTile(atlas: PwAtlas): PwTile {
  const rows = Math.ceil(PUFF_CELLS / PUFF_COLS);
  return atlas.tile('z3puffs6', PUFF * PUFF_COLS, PUFF * rows, (c, k) => {
    const g = k.ramp(0xb0aaa8, { light: 0.45, dark: 0.35, sat: 0 });
    // Cell v sits in column v % cols of row floor(v / cols), rows counted from the BOTTOM of the
    // tile (the shader's v runs up): painter rows are top-down.
    for (let v = 0; v < PUFF_CELLS; v++) paintPuff(c, g, (v % PUFF_COLS) * PUFF, v, (rows - 1 - Math.floor(v / PUFF_COLS)) * PUFF);
  });
}

/** Lobes (x, y, r in a 32-unit cell) of each variant. */
function lobesOf(v: number): number[][] {
  if (v === 3)
    // Dense core: tight, round, heavy.
    return [[16, 17, 9.5], [11, 15, 6.5], [21, 14, 6.5], [16, 10, 6], [16, 22, 6]];
  if (v === 4)
    // Thinning wisp: drawn out sideways, low and broken.
    return [[11, 18, 6], [17, 17, 6.5], [23, 18, 5.5], [8, 20, 4], [27, 20, 3.5], [19, 13, 4]];
  if (v === 5)
    // Sheared top: the crown pushed downwind, a flat underside.
    return [[13, 20, 8], [19, 17, 7.5], [24, 12, 6.5], [28, 9, 4.5], [17, 12, 5]];
  return [
    [16, 19, 10.5],
    [9 + v, 16, 7 - (v & 1)],
    [23 - v, 15 + v, 7.5],
    [13 + v * 2, 10, 6.5],
    [20 - v, 9 + (v & 1) * 2, 5.5],
  ];
}

function paintPuff(c: PwCanvas, ramp: number, x0: number, v: number, y0 = 0) {
  const B = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  const S = PUFF / 32;
  // Overlapping lobes (a cauliflower billow), lit from the upper left, a flatter shadowed base.
  const lobes = lobesOf(v).map(([x, y, r]) => [x * S, y * S, r * S]);
  const thin = v === 4 ? 0.22 : 0;
  for (let y = 0; y < PUFF; y++) {
    for (let x = 0; x < PUFF; x++) {
      let best = 9;
      let lit = 0;
      for (const [cx, cy, r] of lobes) {
        const dx = x + 0.5 - cx;
        const dy = y + 0.5 - cy;
        const d = Math.sqrt(dx * dx + dy * dy) / r;
        if (d < best) {
          best = d;
          lit = (cx - x) * 0.8 / r + (cy - y) / r;
        }
      }
      const rag = hash2(x, y, 9 + v) * 0.1 + hash2(x >> 2, y >> 2, 19 + v) * (0.14 + thin);
      const d = best + rag;
      if (d > 1) continue;
      // The wisp breaks up into holes (whole 2-texel clumps, never single specks).
      if (thin && hash2(x >> 1, y >> 1, 31) < (d - 0.35) * 0.9) continue;
      // Ragged rim: an ordered-dither falloff over the outer fifth.
      if (d > 0.8 && (B[(y & 3) * 4 + (x & 3)] + 0.5) / 16 > (1 - d) * 5) continue;
      // Lit cap, a bright rim where the light grazes the lobe, mid body, the shadowed belly.
      const low = y > PUFF * (v === 3 ? 0.55 : 0.72) ? (v === 3 ? 0.6 : 0.35) : 0;
      const l = lit - low + (hash2(x >> 1, y >> 1, 29 + v) - 0.5) * 0.25;
      const t = l > 0.75 ? (d > 0.62 ? 4.6 : 4.1) : l > 0.3 ? 3.5 : l > -0.15 ? 2.9 : l > -0.6 ? 2.3 : 1.7;
      c.set(x0 + x, y0 + y, ramp, t);
    }
  }
}

/**
 * Detached flame licks (any 4-connected blob not joined to the frame's main body): stepped down a
 * shade and thinned toward their top with an ordered dither — a lick dying into the dark, never a
 * solid block. Per frame of `fh` rows.
 */
function taperDetached(c: PwCanvas, fh: number) {
  const W = c.w;
  const lab = new Int32Array(W * fh);
  const stack: number[] = [];
  for (let f = 0; f * fh < c.h; f++) {
    const y0 = f * fh;
    lab.fill(0);
    const sizes: number[] = [0];
    let n = 0;
    for (let i = 0; i < W * fh; i++) {
      if (lab[i] || !c.ramp[(y0 * W) + i]) continue;
      n++;
      let size = 0;
      stack.length = 0;
      stack.push(i);
      lab[i] = n;
      while (stack.length) {
        const j = stack.pop()!;
        size++;
        const x = j % W;
        const y = (j / W) | 0;
        const nb = [x > 0 ? j - 1 : -1, x < W - 1 ? j + 1 : -1, y > 0 ? j - W : -1, y < fh - 1 ? j + W : -1];
        for (const q of nb) {
          if (q < 0 || lab[q] || !c.ramp[y0 * W + q]) continue;
          lab[q] = n;
          stack.push(q);
        }
      }
      sizes.push(size);
    }
    let main = 1;
    for (let k = 2; k <= n; k++) if (sizes[k] > sizes[main]) main = k;
    for (let k = 1; k <= n; k++) {
      if (k === main || sizes[k] < 4) continue;
      let top = fh;
      let bot = 0;
      for (let i = 0; i < W * fh; i++) if (lab[i] === k) ((top = Math.min(top, (i / W) | 0)), (bot = Math.max(bot, (i / W) | 0)));
      const span = Math.max(1, bot - top);
      for (let i = 0; i < W * fh; i++) {
        if (lab[i] !== k) continue;
        const x = i % W;
        const y = (i / W) | 0;
        const rel = (y - top) / span;
        const g = (y0 + y) * W + x;
        if (bayer(x, y0 + y) > 0.2 + rel * 0.8) {
          c.ramp[g] = 0;
          c.flag[g] = 0;
        } else c.tone[g] = Math.max(1, c.tone[g] - 1.2);
      }
    }
  }
}

/** The fx atlas (flame strips + puffs, 3 levels). */
export class Z3FxAtlas {
  readonly atlas = new PwAtlas('z3-fx', { levels: 3 });
  readonly flame: PwTile[];
  readonly puff: PwTile;
  constructor() {
    // The cast's flame strip, its detached licks tapered (z3: a big fire right at the lens showed a
    // lone tongue as a flat red square hovering over the flames).
    const tmp = new PwAtlas('z3-fx-src', { levels: 1 });
    const src = z1FlameTile(tmp, 0);
    const paint = (tmp as unknown as { tiles: Map<string, { paint: PwPainter }> }).tiles.get(src.key)!.paint;
    this.flame = [
      this.atlas.tile(`${src.key}|z3lick`, src.w, src.h, (c, k) => {
        paint(c, k);
        taperDetached(c, Z1_FLAME_H);
      }),
    ];
    this.puff = z3PuffTile(this.atlas);
  }
}

/**
 * A camera-facing sprite material for an InstancedMesh whose geometry is `spriteGeometry()`
 * (a unit quad, origin at its bottom centre or centre): the instance's translation places it,
 * the instance's x / y scale sizes it, `instanceColor` tints it. Texels are fetched whole from
 * `tile` (frame `frames` strips animated at `fps`, each instance out of step with the others;
 * `cells` side-by-side variants picked per instance). `glow` = unlit at the painted colour.
 */
export function pwSpriteMaterial(atlas: PwAtlas, tile: PwTile, o: { frames?: number; fps?: number; cells?: number; cols?: number; glow?: boolean; fog?: boolean; gain?: number }): THREE.MeshBasicMaterial {
  const tex = atlas.texture();
  const frames = o.frames ?? 1;
  const cells = o.cells ?? 1;
  const cols = o.cols ?? cells;
  const rows = Math.ceil(cells / cols);
  const uniforms = {
    uPwAtlas: { value: tex },
    uPwTime: { value: 0 },
    uPwRect: { value: new THREE.Vector4(tile.x, tile.y, tile.w / cols, tile.h / frames / rows) },
    uPwCols: { value: cols },
    uPwAnim: { value: new THREE.Vector3(frames, o.fps ?? 0, cells) },
    uPwMaxLv: { value: atlas.levels - 1 },
    uPwGain: { value: o.gain ?? 1 },
  };
  const m = new THREE.MeshBasicMaterial({ color: 0xffffff, fog: o.fog ?? true });
  m.userData.pw = uniforms;
  m.userData.pixelWorld = true;
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec2 vPwUv;
        flat varying float vPwSeed;
        flat varying float vPwCell;`,
      )
      .replace(
        '#include <project_vertex>',
        `vec4 mvPosition = vec4(0.0, 0.0, 0.0, 1.0);
        #ifdef USE_INSTANCING
          mvPosition = instanceMatrix * mvPosition;
          vec2 pwS = vec2(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz));
          vPwSeed = fract(sin(dot(instanceMatrix[3].xyz, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
          // A stable variant from the (unused) z scale: 1 + cell; else hashed from the position.
          float pwCz = length(instanceMatrix[2].xyz);
          vPwCell = pwCz > 1.5 ? floor(pwCz - 1.0 + 0.5) : -1.0;
        #else
          vec2 pwS = vec2(1.0);
          vPwSeed = 0.0;
          vPwCell = -1.0;
        #endif
        mvPosition = modelViewMatrix * mvPosition;
        mvPosition.xy += position.xy * pwS;
        vPwUv = uv;
        gl_Position = projectionMatrix * mvPosition;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform sampler2D uPwAtlas;
        uniform float uPwTime;
        uniform vec4 uPwRect;
        uniform vec3 uPwAnim;
        uniform float uPwMaxLv;
        uniform float uPwGain;
        uniform float uPwCols;
        varying vec2 vPwUv;
        flat varying float vPwSeed;
        flat varying float vPwCell;`,
      )
      .replace(
        '#include <map_fragment>',
        `{
          vec2 pu = vPwUv * uPwRect.zw;
          vec2 pg = max(abs(dFdx(pu)), abs(dFdy(pu)));
          int lv = int(clamp(floor(log2(max(max(pg.x, pg.y), 1e-3)) + 0.5), 0.0, uPwMaxLv));
          float frame = floor(mod(uPwTime * uPwAnim.y + vPwSeed * uPwAnim.x, uPwAnim.x));
          float cell = vPwCell >= 0.0 ? vPwCell : floor(vPwSeed * 7.0 * uPwAnim.z);
          cell = mod(cell, uPwAnim.z);
          vec2 t = clamp(pu, vec2(0.0), uPwRect.zw - 0.001);
          t.x += mod(cell, uPwCols) * uPwRect.z;
          t.y += (floor(cell / uPwCols) + frame) * uPwRect.w;
          ivec2 ip = (ivec2(uPwRect.xy) + ivec2(floor(t))) >> lv;
          vec4 pc = texelFetch(uPwAtlas, ip, lv);
          if (pc.a < 0.25) discard;
          diffuseColor.rgb *= pc.rgb * uPwGain;
        }`,
      );
  };
  m.customProgramCacheKey = () => 'z3pwSprite3';
  m.name = 'pw:z3-sprite';
  void o.glow;
  void PWF;
  return Kit.track(m);
}

/** Unit sprite quad (uv 0…1), anchored at its bottom centre (`bottom`) or its centre. */
export function spriteGeometry(bottom: boolean): THREE.BufferGeometry {
  const g = new THREE.PlaneGeometry(1, 1);
  if (bottom) g.translate(0, 0.5, 0);
  return Kit.track(g);
}

/** Advance a sprite material's clock (allocation-free). */
export function spriteTick(m: THREE.Material, t: number) {
  const u = m.userData.pw as { uPwTime?: { value: number } } | undefined;
  if (u?.uPwTime) u.uPwTime.value = t;
}

export const FLAME = { frames: Z1_FLAME_FRAMES, w: Z1_FLAME_W, h: Z1_FLAME_H };
