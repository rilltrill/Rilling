import * as THREE from 'three';
import { Kit } from '../kit/ModelKit';
import { PwAtlas, type PwTile } from './atlas';
import { PWF, type PwCanvas } from './canvas';
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

/** Smoke puff sprites (3 variants side by side, 144 × 48, neutral grey: tinted per instance). */
export function z3PuffTile(atlas: PwAtlas): PwTile {
  return atlas.tile('z3puffs', PUFF * 3, PUFF, (c, k) => {
    const g = k.ramp(0xb0aaa8, { light: 0.45, dark: 0.35, sat: 0 });
    for (let v = 0; v < 3; v++) paintPuff(c, g, v * PUFF, v);
  });
}

function paintPuff(c: PwCanvas, ramp: number, x0: number, v: number) {
  const B = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  const S = PUFF / 32;
  // Five overlapping lobes (a cauliflower billow), lit from the upper left, a flatter shadowed base.
  const lobes = [
    [16, 19, 10.5],
    [9 + v, 16, 7 - (v & 1)],
    [23 - v, 15 + v, 7.5],
    [13 + v * 2, 10, 6.5],
    [20 - v, 9 + (v & 1) * 2, 5.5],
  ].map(([x, y, r]) => [x * S, y * S, r * S]);
  for (let y = 0; y < PUFF; y++) {
    for (let x = 0; x < PUFF; x++) {
      let best = 9;
      let lit = 0;
      for (const [cx, cy, r] of lobes) {
        const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy) / r;
        if (d < best) {
          best = d;
          lit = (cx - x) * 0.8 / r + (cy - y) / r;
        }
      }
      const rag = hash2(x, y, 9 + v) * 0.1 + hash2(x >> 2, y >> 2, 19 + v) * 0.14;
      const d = best + rag;
      if (d > 1) continue;
      // Ragged rim: an ordered-dither falloff over the outer fifth.
      if (d > 0.8 && (B[(y & 3) * 4 + (x & 3)] + 0.5) / 16 > (1 - d) * 5) continue;
      // Lit cap, a bright rim where the light grazes the lobe, mid body, the shadowed belly.
      const low = y > PUFF * 0.72 ? 0.35 : 0;
      const l = lit - low + (hash2(x >> 1, y >> 1, 29 + v) - 0.5) * 0.25;
      const t = l > 0.75 ? (d > 0.62 ? 4.6 : 4.1) : l > 0.3 ? 3.5 : l > -0.15 ? 2.9 : l > -0.6 ? 2.3 : 1.7;
      c.set(x0 + x, y, ramp, t);
    }
  }
}

/** The fx atlas (flame strips + puffs, 3 levels). */
export class Z3FxAtlas {
  readonly atlas = new PwAtlas('z3-fx', { levels: 3 });
  readonly flame: PwTile[];
  readonly puff: PwTile;
  constructor() {
    this.flame = [z1FlameTile(this.atlas, 0)];
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
export function pwSpriteMaterial(atlas: PwAtlas, tile: PwTile, o: { frames?: number; fps?: number; cells?: number; glow?: boolean; fog?: boolean; gain?: number }): THREE.MeshBasicMaterial {
  const tex = atlas.texture();
  const frames = o.frames ?? 1;
  const cells = o.cells ?? 1;
  const uniforms = {
    uPwAtlas: { value: tex },
    uPwTime: { value: 0 },
    uPwRect: { value: new THREE.Vector4(tile.x, tile.y, tile.w / cells, tile.h / frames) },
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
        flat varying float vPwSeed;`,
      )
      .replace(
        '#include <project_vertex>',
        `vec4 mvPosition = vec4(0.0, 0.0, 0.0, 1.0);
        #ifdef USE_INSTANCING
          mvPosition = instanceMatrix * mvPosition;
          vec2 pwS = vec2(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz));
          vPwSeed = fract(sin(dot(instanceMatrix[3].xyz, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
        #else
          vec2 pwS = vec2(1.0);
          vPwSeed = 0.0;
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
        varying vec2 vPwUv;
        flat varying float vPwSeed;`,
      )
      .replace(
        '#include <map_fragment>',
        `{
          vec2 pu = vPwUv * uPwRect.zw;
          vec2 pg = max(abs(dFdx(pu)), abs(dFdy(pu)));
          int lv = int(clamp(floor(log2(max(max(pg.x, pg.y), 1e-3)) + 0.5), 0.0, uPwMaxLv));
          float frame = floor(mod(uPwTime * uPwAnim.y + vPwSeed * uPwAnim.x, uPwAnim.x));
          float cell = floor(vPwSeed * 7.0 * uPwAnim.z);
          cell = mod(cell, uPwAnim.z);
          vec2 t = clamp(pu, vec2(0.0), uPwRect.zw - 0.001);
          t.x += cell * uPwRect.z;
          t.y += frame * uPwRect.w;
          ivec2 ip = (ivec2(uPwRect.xy) + ivec2(floor(t))) >> lv;
          vec4 pc = texelFetch(uPwAtlas, ip, lv);
          if (pc.a < 0.25) discard;
          diffuseColor.rgb *= pc.rgb * uPwGain;
        }`,
      );
  };
  m.customProgramCacheKey = () => 'z3pwSprite1';
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
