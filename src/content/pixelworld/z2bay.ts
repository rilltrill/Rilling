import * as THREE from 'three';
import { Kit } from '../kit/ModelKit';
import { bayer, PWF } from './canvas';
import type { PwAtlas, PwTile } from './atlas';
import { FONT_BOLD, rasterText, textWidth } from './font';
import { darken, hash2, smooth } from './surfaces';

/**
 * ST. MERCY HOSPITAL's ambulance bay ground for PIXEL WORLD:
 *  - `z2WetAsphaltTile`: wet night asphalt with NO big shapes in the repeat —
 *    aggregate as 2–3-texel chips and pits in two tones, a couple of sealed
 *    cracks (tar snakes a step darker, a lit lip), rectangular cut patches a
 *    tone apart with a sealant seam one step darker (never a step-0 outline),
 *    short wet sheens; the puddles and stains are placed by rule elsewhere;
 *  - `z2PuddleTile`: an animated puddle (Z2_PUDDLE_FRAMES frames stacked,
 *    frame 0 at the bottom): a dark mirror with stepped, broken reflection
 *    streaks of a light (red EMERGENCY, cyan OUTPATIENTS, warm windows, the
 *    sky), a pale rim on the far (lit) side, rain rings spreading;
 *  - `z2ReflectDecal`: a sign's long broken reflection on the wet ground;
 *  - `z2RoadStencil`: road lettering drawn tall (read at a grazing angle);
 *  - `z2PoolTexture`: a stepped light pool (screened additively: the canopy's
 *    red neon spilling on the wet ground).
 */

const h6 = (n: number) => n.toString(16).padStart(6, '0');
const wrap = (v: number, n: number) => ((v % n) + n) % n;

/** Frames of the animated puddles (one material plays them). */
export const Z2_PUDDLE_FRAMES = 4;

export function z2WetAsphaltTile(atlas: PwAtlas, hex: number): PwTile {
  return atlas.tile(`z2asphalt|${h6(hex)}`, 256, 256, (c, k) => {
    const rng = k.rng;
    const W = c.w;
    const H = c.h;
    // Close steps: grit reads as texture, never as bright confetti (the CRT fringes lone bright texels).
    const a = k.ramp(hex, { light: 0.16, dark: 0.62, sat: 0.9 });
    const p = k.ramp(darken(hex, 0.9), { light: 0.16, dark: 0.62, sat: 0.95, shift: 0.6 });
    c.rect(0, 0, W, H, a, 3);
    // Cut patches: straight-edged rectangles a tone apart (newer, smoother asphalt), the sealant
    // seam one step darker than the patch, the near edge's lip a step lighter.
    const patches: [number, number, number, number][] = [];
    for (let i = 0; i < 3; i++) {
      const pw = rng.int(26, 62);
      const ph = rng.int(18, 40);
      const x0 = rng.int(0, W - 1);
      const y0 = rng.int(0, H - 1);
      patches.push([x0, y0, pw, ph]);
      for (let y = 0; y < ph; y++) {
        for (let x = 0; x < pw; x++) {
          const edge = x === 0 || y === 0 || x === pw - 1 || y === ph - 1;
          c.set(wrap(x0 + x, W), wrap(y0 + y, H), p, edge ? 2 : 3);
        }
      }
      for (let x = 1; x < pw - 1; x++) if (hash2(x, i, 3) < 0.6) c.set(wrap(x0 + x, W), wrap(y0 + ph, H), a, 4);
    }
    // Aggregate: chips (a step up) and pits (a step down) as 2–3-texel clusters; fewer on patches.
    const shapes = [2, 3, 7, 0, 1];
    for (let n = 0; n < 1500; n++) {
      const x = rng.int(0, W - 1);
      const y = rng.int(0, H - 1);
      const onPatch = c.ramp[y * W + x] === p;
      if (onPatch && rng.chance(0.6)) continue;
      const up = rng.chance(0.52);
      const s = shapes[rng.int(0, shapes.length - 1)];
      c.cluster(x, y, s, 0, up ? 1 : -1);
    }
    // Sealed cracks: meandering 1–2-texel tar snakes a step darker, a lit lip below-right.
    for (let i = 0; i < 4; i++) {
      let x = rng.int(0, W - 1);
      let y = rng.int(0, H - 1);
      let ang = rng.next() * Math.PI * 2;
      const len = rng.int(40, 110);
      const wide = rng.chance(0.5);
      for (let j = 0; j < len; j++) {
        const ix = wrap(Math.round(x), W);
        const iy = wrap(Math.round(y), H);
        c.set(ix, iy, a, 2);
        if (wide) c.set(wrap(ix + 1, W), iy, a, 2);
        if (j % 5 === 2) c.set(wrap(ix + (wide ? 2 : 1), W), wrap(iy + 1, H), a, 4);
        ang += rng.spread(0.45);
        x += Math.cos(ang);
        y += Math.sin(ang);
        if (rng.chance(0.04)) ang += rng.chance(0.5) ? 1.2 : -1.2;
      }
    }
    void patches;
  }, { wrap: true });
}

export type PuddleLight = 'red' | 'cyan' | 'warm' | 'sky';

const LIGHT: Record<PuddleLight, number> = { red: 0xff3a2a, cyan: 0x8ad8ff, warm: 0xffc070, sky: 0x6a7aa0 };

/** Inside a lumpy puddle outline (cx, cy, rx, ry in texels). */
function inBlob(x: number, y: number, cx: number, cy: number, rx: number, ry: number, k: number): boolean {
  const u = (x + 0.5 - cx) / rx;
  const v = (y + 0.5 - cy) / ry;
  const a = Math.atan2(v, u);
  const r = 1 + Math.sin(a * 3 + k) * 0.12 + Math.sin(a * 5 + k * 2.3) * 0.08;
  return u * u + v * v < r * r;
}

/**
 * Animated puddle (W × H a frame, frames stacked, frame 0 at the bottom), laid
 * flat with v away from the camera: the reflection streaks run toward the light.
 */
export function z2PuddleTile(atlas: PwAtlas, light: PuddleLight, variant = 0): PwTile {
  const F = Z2_PUDDLE_FRAMES;
  // (48 × 32 a frame, laid 2 × 1.25 m: the rings and dashes read chunky, a third fewer texels.)
  const FW = 48;
  const FH = 32;
  return atlas.tile(`z2pud|${light}|${variant}|${F}`, FW, FH * F, (c, k) => {
    const deep = k.ramp(0x141c28, { light: 0.4, sat: 1 });
    const rim = k.ramp(0x5a6478, { light: 0.4, sat: 0.8 });
    const lr = k.ramp(LIGHT[light], { light: 0.55, sat: 1.1 });
    const sky = k.ramp(0x4a5a80, { light: 0.4 });
    const kk = variant * 1.9 + 0.7;
    const cx = FW / 2;
    const cy = FH / 2;
    const rx = FW / 2 - 3;
    const ry = FH / 2 - 3;
    // Reflection columns (fixed across frames, the rings wobble them): x, width, strength.
    const cols: [number, number, number][] = [];
    const n = light === 'sky' ? 2 : 3;
    for (let i = 0; i < n; i++) cols.push([Math.round(cx - rx * 0.6 + hash2(i, variant, 41) * rx * 1.2), 2 + Math.floor(hash2(i, variant, 42) * (light === 'sky' ? 3 : 5)), i === 0 ? 1 : 0.6]);
    for (let f = 0; f < F; f++) {
      const y0 = c.h - (f + 1) * FH;
      // Rain rings this frame: two drops at different ages (radius grows a frame at a time).
      const rings: [number, number, number][] = [];
      for (let d = 0; d < 3; d++) {
        const age = (f + d * 2) % F;
        rings.push([Math.round(cx - rx * 0.5 + hash2(d, variant, 51) * rx), Math.round(cy - ry * 0.4 + hash2(d, variant, 52) * ry * 0.8), 1.5 + age * 2.2]);
      }
      for (let y = 0; y < FH; y++) {
        for (let x = 0; x < FW; x++) {
          if (!inBlob(x, y, cx, cy, rx, ry, kk)) continue;
          const edge = !inBlob(x, y, cx, cy, rx - 1.6, ry - 1.6, kk);
          const Y = y0 + y;
          if (edge) {
            // Far side (top of the canvas: v away from the camera) catches the light: a pale rim;
            // the near side is just wet asphalt a step darker.
            c.set(x, Y, rim, y < cy ? 3 : 1);
            continue;
          }
          // Dark mirror, a step lighter toward the far side (the sky's reflection).
          c.set(x, Y, deep, y < cy * 0.7 ? 2 : 1);
          if (light === 'sky' && y < cy * 0.6 && bayer(x, y) < 0.4) c.set(x, Y, sky, 2);
        }
      }
      // Reflection streaks: stacked short dashes, broken and wobbling (the rain on the surface).
      for (const [sx, sw, s] of cols) {
        for (let y = 2; y < FH - 2; y++) {
          const gap = hash2(sx, y >> 1, f + 7) < 0.22 + (y / FH) * 0.35;
          if (gap) continue;
          const wob = Math.round(Math.sin(y * 0.9 + f * 1.7 + sx) * 1.2);
          const w = Math.max(1, Math.round(sw * (1 - (y / FH) * 0.5)));
          for (let j = 0; j < w; j++) {
            const x = sx + wob + j - (w >> 1);
            const i = (y0 + y) * FW + x;
            if (x < 0 || x >= FW || c.ramp[i] !== deep) continue;
            const hot = j > 0 && j < w - 1 && y < FH * 0.55;
            c.set(x, y0 + y, lr, (hot ? 4 : 3) * s + (1 - s) * 2, PWF.GLOW);
          }
        }
      }
      for (const [rcx, rcy, r] of rings) {
        for (let t = 0; t < 6.283; t += 0.18) {
          const x = Math.round(rcx + Math.cos(t) * r * 1.5);
          const y = Math.round(rcy + Math.sin(t) * r * 0.6);
          if (x < 0 || y < 0 || x >= FW || y >= FH) continue;
          const i = (y0 + y) * FW + x;
          if (c.ramp[i] === deep) c.set(x, y0 + y, rim, r > 6 ? 2 : 3);
          else if (c.ramp[i] === lr) c.shift(x, y0 + y, -1);
        }
      }
    }
  });
}

/** A sign's light shimmering on the wet ground under it (cut out): stacked broken dashes, densest under the sign. */
export function z2ReflectDecal(atlas: PwAtlas, color: number, w: number, h: number): PwTile {
  return atlas.tile(`z2refl|${h6(color)}|${w}x${h}`, w, h, (c, k) => {
    const r = k.ramp(color, { light: 0.5, sat: 1.05 });
    for (let y = 0; y < h; y += 2) {
      // (Every other row: the dashes stack with a gap, like light broken by the rain.)
      // y = 0 is the far end (under the sign): the dashes thin out toward the eye.
      const t = y / h;
      let x = Math.floor(hash2(y, 1, 63) * 6);
      while (x < w) {
        const len = 2 + Math.floor(hash2(x, y, 64) * 6);
        const edge = Math.min(x, w - x) / (w * 0.5);
        if (hash2(x, y, 65) > t * 0.9 && edge > 0.1 + t * 0.4) for (let j = 0; j < len && x + j < w; j++) c.set(x + j, y, r, t < 0.3 && j > 0 && j < len - 1 ? 3 : 2, PWF.GLOW);
        x += len + 2 + Math.floor(hash2(x, y, 66) * 8);
      }
    }
  });
}

/** Road lettering, drawn twice as tall as wide (read at a grazing angle), worn paint. */
export function z2RoadStencil(atlas: PwAtlas, text: string, ink: number, s: number): PwTile {
  const to = { scale: s, spacing: 1 };
  const tw = textWidth(text, FONT_BOLD, to);
  const W = Math.ceil((tw + 8) / 2) * 2;
  const H = Math.ceil((FONT_BOLD.base * s * 2 + 8) / 2) * 2;
  return atlas.tile(`z2road|${text}|${h6(ink)}|${s}`, W, H, (c, k) => {
    const i = k.ramp(ink, { light: 0.4, sat: 0.8 });
    const m = rasterText(text, FONT_BOLD, to);
    for (let y = 0; y < m.h * 2; y++) {
      for (let x = 0; x < m.w; x++) {
        if (!m.data[(y >> 1) * m.w + x]) continue;
        // Worn by tyres: bites out of the paint along two wheel tracks, flecks elsewhere.
        const track = Math.abs(y - m.h * 0.6) < 3 || Math.abs(y - m.h * 1.4) < 3;
        if (hash2(x >> 1, y >> 1, 9) < (track ? 0.45 : 0.12)) continue;
        c.set(4 + x, 4 + y, i, hash2(x, y >> 1, 3) > 0.8 ? 3 : 4);
      }
    }
  });
}

/**
 * A stepped light pool (rings with Bayer-dithered seams, wobbling a little),
 * white with the strength in alpha: tinted and screened additively over the
 * ground by its material.
 */
export function z2PoolTexture(): THREE.DataTexture {
  const n = 128;
  const data = new Uint8Array(n * n * 4);
  const edges = [0.22, 0.42, 0.62, 0.82, 1.0];
  const level = [0.8, 0.56, 0.36, 0.2, 0.08, 0];
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const dx = (x + 0.5) / n - 0.5;
      const dy = (y + 0.5) / n - 0.5;
      const ang = Math.atan2(dy, dx);
      const r0 = Math.sqrt(dx * dx + dy * dy) * 2;
      let k = 0;
      while (k < edges.length && r0 > edges[k] * (1 + Math.sin(ang * 3 + k * 1.7) * 0.04)) k++;
      if (k < edges.length) {
        const d = edges[k] * (1 + Math.sin(ang * 3 + k * 1.7) * 0.04) - r0;
        if (d < 0.06 && (d / 0.06) < bayer(x, y)) k++;
      }
      const i = (y * n + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = 255;
      data[i + 3] = Math.round(level[Math.min(k, level.length - 1)] * 255);
    }
  }
  const t = new THREE.DataTexture(data, n, n, THREE.RGBAFormat);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestMipmapLinearFilter;
  t.generateMipmaps = true;
  t.needsUpdate = true;
  return Kit.track(t);
}

/** A flat additive light pool on the ground (one draw): `color` × the stepped rings. */
export function z2LightPool(tex: THREE.Texture, color: number, x: number, y: number, z: number, w: number, d: number, strength = 1): THREE.Mesh {
  const mat = Kit.track(
    new THREE.MeshBasicMaterial({ map: tex, color: new THREE.Color(color).multiplyScalar(strength), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: true }),
  );
  mat.userData.pixelWorld = true;
  const m = new THREE.Mesh(Kit.track(new THREE.PlaneGeometry(w, d)), mat);
  m.rotation.x = -Math.PI / 2;
  m.position.set(x, y, z);
  m.renderOrder = 2;
  m.raycast = () => {};
  m.userData.noMerge = true;
  m.userData.pixelWorld = true;
  m.name = 'pw:z2:pool';
  return m;
}

/** An oil stain (cut out round it): a dark ragged core, a ring a step lighter, a violet sheen arc. */
export function z2OilDecal(atlas: PwAtlas, v: number): PwTile {
  return atlas.tile(`z2oil|${v}`, 48, 32, (c, k) => {
    const oil = k.ramp(0x1c1c26, { light: 0.4, sat: 1.1 });
    const sheen = k.ramp(0x4a3a6a, { light: 0.45, sat: 1.1 });
    for (let y = 0; y < 32; y++) {
      for (let x = 0; x < 48; x++) {
        const u = (x + 0.5 - 24) / 21;
        const w = (y + 0.5 - 16) / 13;
        const ang = Math.atan2(w, u);
        const d = Math.sqrt(u * u + w * w) * (1 + Math.sin(ang * 3 + v * 2) * 0.13 + Math.sin(ang * 7 + v) * 0.06);
        if (d > 1) continue;
        // Drips trail off the edge: ragged dither in the outer rim.
        if (d > 0.82 && bayer(x, y) < (d - 0.82) / 0.18) continue;
        c.set(x, y, oil, d < 0.45 ? 1 : d < 0.75 ? 2 : 3);
        if (d > 0.5 && d < 0.62 && ang > -2.4 && ang < -0.6) c.set(x, y, sheen, 3);
      }
    }
  });
}

/** Tyre marks (wrap along v: laid as a ribbon down the skid): two rubber smears a step darker, fading in and out. */
export function z2SkidTile(atlas: PwAtlas, hex: number): PwTile {
  return atlas.tile(`z2skid|${h6(hex)}`, 48, 128, (c, k) => {
    const r = k.ramp(darken(hex, 0.72), { light: 0.16, dark: 0.62, sat: 0.9 });
    for (const x0 of [8, 34]) {
      for (let y = 0; y < 128; y++) {
        const fade = smooth(x0, y, 48, 128, 6, 71);
        for (let x = 0; x < 6; x++) {
          // Rubber laid unevenly: solid where the tyre bit, dithered where it skipped.
          if (fade < 0.35 || (fade < 0.55 && bayer(x0 + x, y) < 0.5)) continue;
          c.set(x0 + x, y, r, x === 0 || x === 5 ? 3 : fade > 0.75 ? 2 : 3);
        }
      }
    }
  }, { wrap: true });
}

/** A cut asphalt patch (2 × 3 m module): newer, smoother, a sealant seam a step darker, a lit lip. */
export function z2PatchDecal(atlas: PwAtlas, hex: number, v: number): PwTile {
  const w = v ? 96 : 64;
  const h = v ? 64 : 96;
  return atlas.tile(`z2patch|${h6(hex)}|${v}`, w, h, (c, k) => {
    const p = k.ramp(darken(hex, 0.86), { light: 0.16, dark: 0.62, sat: 0.95 });
    c.rect(0, 0, w, h, p, 3);
    c.frame(0, 0, w, h, p, 2);
    c.frame(1, 1, w - 2, h - 2, p, 2);
    c.hline(2, h - 1, w - 4, p, 4);
    c.scatter(k.rng, 2, 2, w - 4, h - 4, Math.round((w * h) / 90), 0, -1, { shapes: 3 });
    c.scatter(k.rng, 2, 2, w - 4, h - 4, Math.round((w * h) / 140), 0, 1, { shapes: 3 });
    // A settled crack across it.
    let x = k.rng.int(8, w - 8);
    for (let y = 3; y < h - 3; y++) {
      c.set(x, y, p, 2);
      if (k.rng.chance(0.3)) x += k.rng.chance(0.5) ? 1 : -1;
      x = Math.max(3, Math.min(w - 4, x));
    }
  });
}

/** A cast-iron manhole cover: rim, a waffle of raised studs, the pick holes, rust at the seam. */
export function z2ManholeDecal(atlas: PwAtlas): PwTile {
  return atlas.tile('z2manhole', 28, 28, (c, k) => {
    const iron = k.ramp(0x3a3a3c, { light: 0.4, sat: 0.6 });
    const rust = k.ramp(0x6a3a22, { light: 0.4 });
    for (let y = 0; y < 28; y++) {
      for (let x = 0; x < 28; x++) {
        const d = Math.hypot(x + 0.5 - 14, y + 0.5 - 14);
        if (d > 13.5) continue;
        if (d > 12) c.set(x, y, iron, y < 14 ? 2 : 4);
        else if (d > 11) c.set(x, y, rust, 2);
        else c.set(x, y, iron, (x % 4 === 1 && y % 4 === 1) ? 4 : (x % 4 === 2 && y % 4 === 2) ? 1 : 3);
      }
    }
    c.rect(8, 13, 2, 2, iron, 0);
    c.rect(18, 13, 2, 2, iron, 0);
  });
}

/**
 * Every light pool of a zone in ONE additive mesh (one draw): flat quads with
 * the stepped pool texture, each tinted by its colour × strength (vertex
 * colours). `pools`: [colour, x, y, z, w, d, strength].
 */
export function z2PoolMesh(tex: THREE.Texture, pools: number[][]): THREE.Mesh {
  const pos: number[] = [];
  const uv: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  const c = new THREE.Color();
  for (const [hex, x, y, z, w, d, k] of pools) {
    c.setHex(hex).multiplyScalar(k);
    const i = pos.length / 3;
    pos.push(x - w / 2, y, z + d / 2, x + w / 2, y, z + d / 2, x + w / 2, y, z - d / 2, x - w / 2, y, z - d / 2);
    uv.push(0, 0, 1, 0, 1, 1, 0, 1);
    for (let j = 0; j < 4; j++) col.push(c.r, c.g, c.b);
    idx.push(i, i + 1, i + 2, i, i + 2, i + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeBoundingSphere();
  const mat = poolMat(tex);
  const m = new THREE.Mesh(Kit.track(g), mat);
  m.renderOrder = 2;
  m.raycast = () => {};
  m.userData.noMerge = true;
  m.userData.pixelWorld = true;
  m.name = 'pw:z2:pools';
  return m;
}

const poolMats = new WeakMap<THREE.Texture, THREE.MeshBasicMaterial>();
function poolMat(tex: THREE.Texture): THREE.MeshBasicMaterial {
  let m = poolMats.get(tex);
  if (!m) {
    m = Kit.track(new THREE.MeshBasicMaterial({ map: tex, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: true }));
    m.userData.pixelWorld = true;
    poolMats.set(tex, m);
  }
  return m;
}

/** Floor tape round the operating table (3 × 4 m at 16 texels a metre → 48 × 64, cut out): the sterile field, worn. */
export function z2SterileField(atlas: PwAtlas): PwTile {
  return atlas.tile('z2sterile', 48, 64, (c, k) => {
    const tape = k.ramp(0xc8302a, { light: 0.4, sat: 1 });
    for (let y = 0; y < 64; y++) {
      for (let x = 0; x < 48; x++) {
        const edge = x < 2 || x > 45 || y < 2 || y > 61;
        if (!edge) continue;
        if (hash2(x >> 1, y >> 1, 3) < 0.18) continue;
        c.set(x, y, tape, (x + y) % 9 === 0 ? 2 : 3);
      }
    }
    // Corner arrows.
    for (const [x, y, dx, dy] of [[5, 5, 1, 1], [42, 5, -1, 1], [5, 58, 1, -1], [42, 58, -1, -1]] as const) for (let j = 0; j < 4; j++) c.set(x + dx * j, y + dy * j, tape, 3);
  });
}

/** Instruments dropped on the floor (24 × 16, cut out): a scalpel, forceps, a clamp, blood drops. */
export function z2InstrumentsDecal(atlas: PwAtlas): PwTile {
  return atlas.tile('z2instruments', 24, 16, (c, k) => {
    const st = k.ramp(0xb8c0c4, { light: 0.55, sat: 0.3 });
    const blood = k.ramp(0x5c0909, { light: 0.4, sat: 1.1 });
    c.line(2, 12, 9, 9, st, 4);
    c.line(3, 13, 9, 10, st, 2);
    c.line(12, 3, 19, 8, st, 3);
    c.line(12, 5, 19, 8, st, 3);
    c.ellipse(11, 3, 1.2, 1.2, st, 2);
    c.ellipse(11, 6, 1.2, 1.2, st, 2);
    c.rect(15, 12, 6, 2, st, 3);
    for (const [x, y] of [[6, 4], [7, 5], [17, 2], [20, 13], [21, 14], [4, 7]]) c.set(x, y, blood, 2);
  });
}
