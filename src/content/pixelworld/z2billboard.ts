import * as THREE from 'three';
import { Kit } from '../kit/ModelKit';
import type { PwAtlas, PwTile } from './atlas';
import { PW_MIP_BIAS } from './material';

/**
 * PIXEL WORLD prop billboards for ST. MERCY HOSPITAL: small props painted as
 * sprites (wheelchairs, drip stands, bins, carts, cones, bodies) that turn to
 * face the camera about their upright axis, the way Doom / Duke Nukem 3D draw
 * their props — instead of stacks of boxes. They live in the stage's
 * PixelWorld atlas (same palette discipline, same hand-made mip levels) and
 * are ONE draw per zone (culled with it): each sprite is a quad whose four
 * vertices share the prop's foot position and carry their corner offset; the
 * vertex shader spreads them along the camera's horizontal right vector.
 * Flat-shaded Lambert (stage lights, flashlight, fog) like the scenery; cut-out
 * texels are discarded (depth-correct against characters). Never raycast.
 */

const VERT_DECL = /* glsl */ `
  attribute vec4 pwRect;
  attribute vec2 pwUv;
  attribute vec2 pwBill;
  flat varying vec4 vPwRect;
  varying vec2 vPwUv;
`;

const VERT_BEGIN = /* glsl */ `
  vec3 transformed = vec3(position);
  {
    // Camera right (world), yaw only: the sprite stands upright and faces the view plane.
    vec3 bR = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
    bR.y = 0.0;
    bR = normalize(bR + vec3(1e-5, 0.0, 0.0));
    transformed += bR * pwBill.x + vec3(0.0, pwBill.y, 0.0);
  }
  vPwRect = pwRect;
  vPwUv = pwUv;
`;

const FRAG_DECL = /* glsl */ `
  uniform sampler2D uPwAtlas;
  uniform float uPwBias;
  uniform float uPwGain;
  uniform float uPwGlow;
  uniform float uPwMaxLv;
  flat varying vec4 vPwRect;
  varying vec2 vPwUv;
`;

const FRAG_MAP = /* glsl */ `
  vec3 pwEmit = vec3(0.0);
  {
    vec2 pu = vPwUv;
    vec2 pg = max(abs(dFdx(pu)), abs(dFdy(pu)));
    float rho = max(pg.x, pg.y);
    int lv = int(clamp(floor(log2(max(rho, 1e-3)) + uPwBias), 0.0, uPwMaxLv));
    vec2 rs = abs(vPwRect.zw);
    vec2 t = clamp(pu, vec2(0.0), rs - 0.001);
    ivec2 ip = (ivec2(vPwRect.xy) + ivec2(floor(t))) >> lv;
    vec4 pc = texelFetch(uPwAtlas, ip, lv);
    if (pc.a < 0.25) discard;
    float glowK = pc.a < 0.85 ? 1.0 : 0.0;
    diffuseColor.rgb *= pc.rgb * (1.0 - glowK) * uPwGain;
    pwEmit = pc.rgb * glowK * uPwGlow;
  }
`;

const mats = new WeakMap<PwAtlas, Map<number, THREE.MeshLambertMaterial>>();

/** The (cached, Kit-tracked) billboard material for an atlas. */
export function z2BillboardMaterial(atlas: PwAtlas, gain = 1): THREE.MeshLambertMaterial {
  let byGain = mats.get(atlas);
  if (!byGain) mats.set(atlas, (byGain = new Map()));
  const hit = byGain.get(gain);
  if (hit) return hit;
  const uniforms = {
    uPwAtlas: { value: atlas.texture() },
    uPwBias: { value: PW_MIP_BIAS },
    uPwGain: { value: gain },
    uPwGlow: { value: 1 },
    uPwMaxLv: { value: atlas.levels - 1 },
  };
  const m = new THREE.MeshLambertMaterial({ color: 0xffffff, vertexColors: true, flatShading: true, side: THREE.DoubleSide });
  m.userData.pw = uniforms;
  m.userData.pixelWorld = true;
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader.replace('#include <common>', `#include <common>\n${VERT_DECL}`).replace('#include <begin_vertex>', VERT_BEGIN);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${FRAG_DECL}`)
      .replace('#include <map_fragment>', FRAG_MAP)
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n  totalEmissiveRadiance += pwEmit;');
  };
  m.customProgramCacheKey = () => 'z2Billboard1';
  m.name = `pwBill:${atlas.name}`;
  Kit.track(m);
  byGain.set(gain, m);
  return m;
}

interface Item {
  x: number;
  y: number;
  z: number;
  tile: PwTile;
  w: number;
  h: number;
  flip: boolean;
  tint: number;
}

const _c = new THREE.Color();

/** Collects sprite placements for one group; `build` makes the mesh (after the atlas is built). */
export class Z2Billboards {
  private items: Item[] = [];

  get count(): number {
    return this.items.length;
  }

  /** A sprite with its foot centre at (x, y, z), `h` metres tall (width from the tile's aspect unless given). */
  add(x: number, y: number, z: number, tile: PwTile, h: number, o: { w?: number; flip?: boolean; tint?: number } = {}) {
    this.items.push({ x, y, z, tile, h, w: o.w ?? (h * tile.w) / tile.h, flip: !!o.flip, tint: o.tint ?? 0xffffff });
  }

  build(atlas: PwAtlas, gain = 1): THREE.Mesh | null {
    const n = this.items.length;
    if (!n) return null;
    atlas.build();
    const pos = new Float32Array(n * 12);
    const bill = new Float32Array(n * 8);
    const uv = new Float32Array(n * 8);
    const rect = new Int16Array(n * 16);
    const col = new Uint8Array(n * 12);
    const idx = new Uint16Array(n * 6);
    let maxR = 0;
    this.items.forEach((it, i) => {
      const t = it.tile;
      const u0 = it.flip ? t.w : 0;
      const u1 = it.flip ? 0 : t.w;
      const corners = [
        [-it.w / 2, 0, u0, 0],
        [it.w / 2, 0, u1, 0],
        [it.w / 2, it.h, u1, t.h],
        [-it.w / 2, it.h, u0, t.h],
      ];
      _c.setHex(it.tint);
      for (let k = 0; k < 4; k++) {
        const v = i * 4 + k;
        pos.set([it.x, it.y, it.z], v * 3);
        bill.set([corners[k][0], corners[k][1]], v * 2);
        uv.set([corners[k][2], corners[k][3]], v * 2);
        rect.set([t.x, t.y, -t.w, t.h], v * 4);
        col.set([Math.round(_c.r * 255), Math.round(_c.g * 255), Math.round(_c.b * 255)], v * 3);
      }
      idx.set([i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3], i * 6);
      maxR = Math.max(maxR, Math.hypot(it.w / 2, it.h));
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('pwBill', new THREE.BufferAttribute(bill, 2));
    geo.setAttribute('pwUv', new THREE.BufferAttribute(uv, 2));
    geo.setAttribute('pwRect', new THREE.BufferAttribute(rect, 4));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3, true));
    geo.setIndex(new THREE.BufferAttribute(n * 4 > 65535 ? new Uint32Array(idx) : idx, 1));
    geo.computeBoundingSphere();
    geo.boundingSphere!.radius += maxR;
    Kit.track(geo);
    const mesh = new THREE.Mesh(geo, z2BillboardMaterial(atlas, gain));
    mesh.matrixAutoUpdate = false;
    mesh.name = 'pw:z2-bill';
    mesh.raycast = () => {};
    mesh.userData.noMerge = true;
    mesh.userData.pixelWorld = true;
    return mesh;
  }
}
