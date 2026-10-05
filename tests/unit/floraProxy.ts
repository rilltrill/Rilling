import * as THREE from 'three';
import type { World } from '../../src/gameplay/World';
import { FLORA_SKY_NORMAL, floraLevelFor } from '../../src/content/pixel/floraField';

/**
 * CPU proxy of a frame's vegetation for the FLORA brightness tests (node has no
 * GL): a small software rasteriser draws the stage's 3D plants (ART: 3D) or its
 * billboards (ART: SPRITES) alone, from the camera where a beat starts, with a
 * depth buffer, three r186's light terms for every light in the scene
 * (hemisphere, directional, point and spot with distance / cone falloff; the
 * billboards with the shader's two normals, the local term half desaturated and
 * clamped, × the field's gain), ACES tone mapping at the renderer's exposure,
 * sRGB encoding and the stage's linear fog — and returns the mean display
 * luminance (0–255) of the pixels each covers. Retro textures (mean gain 1),
 * wind and the CRT pass are left out on both sides.
 */
export interface VegFrame {
  /** Mean display luminance (0–255) of the covered pixels. */
  lum: number;
  /** Covered pixels. */
  px: number;
}

const W = 211;
const H = 98;
const EXPOSURE = 1.05;

/** Where beat `beat` starts (StageRunner.fastForward's walk); moves the rig + camera there. */
export function cameraAtBeat(world: World, beats: readonly { kind: string; to?: number; moveTo?: number }[], beat: number) {
  let d = 0;
  for (let k = 0; k < beat && k < beats.length; k++) {
    const b = beats[k];
    if (b.kind === 'move' && b.to !== undefined) d = b.to;
    if (b.kind === 'boss' && b.moveTo !== undefined) d = b.moveTo;
  }
  world.rig.d = d;
  world.rig.moveTo(d, 1);
  world.rig.update(0);
  world.camera.updateMatrixWorld(true);
}

interface LightSet {
  hemi: { sky: THREE.Color; ground: THREE.Color }[];
  dir: { d: THREE.Vector3; c: THREE.Color }[];
  pt: { p: THREE.Vector3; c: THREE.Color; dist: number; decay: number; cone?: [number, number]; axis?: THREE.Vector3 }[];
}

function gatherLights(scene: THREE.Scene): LightSet {
  const L: LightSet = { hemi: [], dir: [], pt: [] };
  scene.updateMatrixWorld(true);
  scene.traverse((o) => {
    const l = o as THREE.Light;
    if (!l.isLight || l.intensity <= 0) return;
    let vis = true;
    for (let q: THREE.Object3D | null = l; q; q = q.parent) if (!q.visible) vis = false;
    if (!vis) return;
    const pos = new THREE.Vector3().setFromMatrixPosition(l.matrixWorld);
    if ((l as THREE.HemisphereLight).isHemisphereLight) {
      const h = l as THREE.HemisphereLight;
      L.hemi.push({ sky: h.color.clone().multiplyScalar(h.intensity), ground: h.groundColor.clone().multiplyScalar(h.intensity) });
    } else if ((l as THREE.DirectionalLight).isDirectionalLight) {
      const t = new THREE.Vector3().setFromMatrixPosition((l as THREE.DirectionalLight).target.matrixWorld);
      L.dir.push({ d: pos.clone().sub(t).normalize(), c: l.color.clone().multiplyScalar(l.intensity) });
    } else if ((l as THREE.SpotLight).isSpotLight) {
      const s = l as THREE.SpotLight;
      const t = new THREE.Vector3().setFromMatrixPosition(s.target.matrixWorld);
      L.pt.push({ p: pos, c: s.color.clone().multiplyScalar(s.intensity), dist: s.distance, decay: s.decay, cone: [Math.cos(s.angle), Math.cos(s.angle * (1 - s.penumbra))], axis: pos.clone().sub(t).normalize() });
    } else if ((l as THREE.PointLight).isPointLight) {
      const p = l as THREE.PointLight;
      L.pt.push({ p: pos, c: p.color.clone().multiplyScalar(p.intensity), dist: p.distance, decay: p.decay });
    }
  });
  return L;
}

const _l = new THREE.Vector3();
/** Irradiance at `p` with normal `n`: sky part (hemisphere + directional) into `sky`, local (point + spot) into `loc`. */
function irradiance(L: LightSet, p: THREE.Vector3, nSky: THREE.Vector3, nLoc: THREE.Vector3, sky: THREE.Color, loc: THREE.Color) {
  sky.setRGB(0, 0, 0);
  loc.setRGB(0, 0, 0);
  for (const h of L.hemi) {
    const w = 0.5 * nSky.y + 0.5;
    sky.r += h.ground.r + (h.sky.r - h.ground.r) * w;
    sky.g += h.ground.g + (h.sky.g - h.ground.g) * w;
    sky.b += h.ground.b + (h.sky.b - h.ground.b) * w;
  }
  for (const d of L.dir) {
    const k = Math.max(0, nSky.dot(d.d));
    sky.r += d.c.r * k;
    sky.g += d.c.g * k;
    sky.b += d.c.b * k;
  }
  for (const pl of L.pt) {
    _l.subVectors(pl.p, p);
    const dist = _l.length();
    _l.divideScalar(Math.max(1e-6, dist));
    let a = 1 / Math.max(Math.pow(dist, pl.decay), 0.01);
    if (pl.dist > 0) a *= Math.max(0, Math.min(1, 1 - Math.pow(dist / pl.dist, 4))) ** 2;
    if (pl.cone) {
      const c = _l.dot(pl.axis!);
      const [lo, hi] = pl.cone;
      const t = Math.max(0, Math.min(1, (c - lo) / Math.max(1e-6, hi - lo)));
      a *= t * t * (3 - 2 * t);
    }
    const k = Math.max(0, nLoc.dot(_l)) * a;
    loc.r += pl.c.r * k;
    loc.g += pl.c.g * k;
    loc.b += pl.c.b * k;
  }
}

/** three's ACESFilmicToneMapping + sRGB encode, then the (post-encode) linear fog mix; returns display luminance 0–255. */
function display(r: number, g: number, b: number, fog: number, fogCol: THREE.Color): number {
  const e = EXPOSURE / 0.6;
  r *= e;
  g *= e;
  b *= e;
  let ir = 0.59719 * r + 0.35458 * g + 0.04823 * b;
  let ig = 0.076 * r + 0.90834 * g + 0.01566 * b;
  let ib = 0.0284 * r + 0.13383 * g + 0.83777 * b;
  const fit = (v: number) => (v * (v + 0.0245786) - 0.000090537) / (v * (0.983729 * v + 0.432951) + 0.238081);
  ir = fit(ir);
  ig = fit(ig);
  ib = fit(ib);
  let or = 1.60475 * ir - 0.53108 * ig - 0.07367 * ib;
  let og = -0.10208 * ir + 1.10813 * ig - 0.00605 * ib;
  let ob = -0.00327 * ir - 0.07276 * ig + 1.07602 * ib;
  const enc = (v: number) => {
    v = Math.max(0, Math.min(1, v));
    return v < 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
  };
  or = enc(or);
  og = enc(og);
  ob = enc(ob);
  or += (fogCol.r - or) * fog;
  og += (fogCol.g - og) * fog;
  ob += (fogCol.b - ob) * fog;
  return (0.2126 * or + 0.7152 * og + 0.0722 * ob) * 255;
}

const srgbToLin = (v: number) => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));

/** Draw `group`'s 3D vegetation alone; mean display luminance of what it covers. */
export function render3D(world: World, group: THREE.Object3D): VegFrame {
  const cam = world.camera;
  const vp = new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
  const eye = cam.getWorldPosition(new THREE.Vector3());
  const L = gatherLights(world.scene);
  const fog = world.scene.fog as THREE.Fog | null;
  const depth = new Float32Array(W * H).fill(Infinity);
  const lum = new Float32Array(W * H);
  const a = new THREE.Vector4();
  const b = new THREE.Vector4();
  const c = new THREE.Vector4();
  const pa = new THREE.Vector3();
  const pb = new THREE.Vector3();
  const pc = new THREE.Vector3();
  const n = new THREE.Vector3();
  const cen = new THREE.Vector3();
  const sky = new THREE.Color();
  const loc = new THREE.Color();
  group.updateMatrixWorld(true);
  group.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const g = m.geometry;
    const pos = g.getAttribute('position');
    const packed = g.getAttribute('aCol') as THREE.BufferAttribute | undefined;
    const col = packed ?? (g.getAttribute('color') as THREE.BufferAttribute | undefined);
    const mat = m.material as THREE.MeshLambertMaterial;
    const mc = mat.color ?? new THREE.Color(1, 1, 1);
    const em = mat.emissive ?? new THREE.Color(0, 0, 0);
    const double = mat.side === THREE.DoubleSide;
    const idx = g.getIndex();
    const nt = (idx ? idx.count : pos.count) / 3;
    for (let t = 0; t < nt; t++) {
      const i0 = idx ? idx.getX(t * 3) : t * 3;
      const i1 = idx ? idx.getX(t * 3 + 1) : t * 3 + 1;
      const i2 = idx ? idx.getX(t * 3 + 2) : t * 3 + 2;
      pa.fromBufferAttribute(pos, i0).applyMatrix4(m.matrixWorld);
      pb.fromBufferAttribute(pos, i1).applyMatrix4(m.matrixWorld);
      pc.fromBufferAttribute(pos, i2).applyMatrix4(m.matrixWorld);
      a.set(pa.x, pa.y, pa.z, 1).applyMatrix4(vp);
      b.set(pb.x, pb.y, pb.z, 1).applyMatrix4(vp);
      c.set(pc.x, pc.y, pc.z, 1).applyMatrix4(vp);
      if (a.w < cam.near || b.w < cam.near || c.w < cam.near) continue;
      const ax = (a.x / a.w * 0.5 + 0.5) * W;
      const ay = (a.y / a.w * 0.5 + 0.5) * H;
      const bx = (b.x / b.w * 0.5 + 0.5) * W;
      const by = (b.y / b.w * 0.5 + 0.5) * H;
      const cx = (c.x / c.w * 0.5 + 0.5) * W;
      const cy = (c.y / c.w * 0.5 + 0.5) * H;
      const area = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
      if (Math.abs(area) < 1e-9) continue;
      if (area < 0 && !double) continue;
      const x0 = Math.max(0, Math.floor(Math.min(ax, bx, cx)));
      const x1 = Math.min(W - 1, Math.ceil(Math.max(ax, bx, cx)));
      const y0 = Math.max(0, Math.floor(Math.min(ay, by, cy)));
      const y1 = Math.min(H - 1, Math.ceil(Math.max(ay, by, cy)));
      if (x0 > x1 || y0 > y1) continue;
      // Flat-lit triangle (normal toward the viewer for a double-sided face).
      n.subVectors(pb, pa).cross(new THREE.Vector3().subVectors(pc, pa)).normalize();
      cen.copy(pa).add(pb).add(pc).multiplyScalar(1 / 3);
      if (n.dot(new THREE.Vector3().subVectors(eye, cen)) < 0) n.negate();
      let r = mc.r;
      let gg = mc.g;
      let bb = mc.b;
      if (col) {
        let cr = (col.getX(i0) + col.getX(i1) + col.getX(i2)) / 3;
        let cg = (col.getY(i0) + col.getY(i1) + col.getY(i2)) / 3;
        let cb = (col.getZ(i0) + col.getZ(i1) + col.getZ(i2)) / 3;
        if (packed) {
          cr = srgbToLin(cr);
          cg = srgbToLin(cg);
          cb = srgbToLin(cb);
        }
        r *= cr;
        gg *= cg;
        bb *= cb;
      }
      irradiance(L, cen, n, n, sky, loc);
      const lr = (r * (sky.r + loc.r)) / Math.PI + em.r;
      const lg = (gg * (sky.g + loc.g)) / Math.PI + em.g;
      const lb = (bb * (sky.b + loc.b)) / Math.PI + em.b;
      const dist = cen.distanceTo(eye);
      const f = fog ? Math.max(0, Math.min(1, (dist - fog.near) / (fog.far - fog.near))) : 0;
      const Y = display(lr, lg, lb, f, fog?.color ?? sky);
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          const px = x + 0.5;
          const py = y + 0.5;
          let w0 = (bx - px) * (cy - py) - (by - py) * (cx - px);
          let w1 = (cx - px) * (ay - py) - (cy - py) * (ax - px);
          let w2 = (ax - px) * (by - py) - (ay - py) * (bx - px);
          if (area < 0) {
            w0 = -w0;
            w1 = -w1;
            w2 = -w2;
          }
          if (w0 < 0 || w1 < 0 || w2 < 0) continue;
          const s = Math.abs(area);
          const z = (w0 * a.z / a.w + w1 * b.z / b.w + w2 * c.z / c.w) / s;
          const k = y * W + x;
          if (z >= depth[k]) continue;
          depth[k] = z;
          lum[k] = Y;
        }
      }
    }
  });
  return mean(depth, lum);
}

/** Draw the billboards of `mesh` alone (as the FLORA shader does, level-0 texels); mean display luminance of what they cover. */
export function renderBillboards(world: World, mesh: THREE.Mesh): VegFrame {
  const cam = world.camera;
  const vp = new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
  const eye = cam.getWorldPosition(new THREE.Vector3());
  const L = gatherLights(world.scene);
  const fog = world.scene.fog as THREE.Fog | null;
  const U = (mesh.material as THREE.Material).userData.flora as Record<string, { value: unknown }>;
  const atlas = U.uFAtlas.value as THREE.DataTexture;
  const levels = atlas.mipmaps as unknown as { data: Uint8Array; width: number }[];
  const pal = (U.uFPal.value as THREE.DataTexture).image.data as Uint8Array;
  const gain = U.uFGain.value as number;
  const cap = U.uFLocCap.value as number;
  const geo = mesh.geometry as THREE.InstancedBufferGeometry;
  const iPos = geo.getAttribute('iPos') as THREE.InstancedBufferAttribute;
  const iBox = geo.getAttribute('iBox') as THREE.InstancedBufferAttribute;
  const iDim = geo.getAttribute('iDim') as THREE.InstancedBufferAttribute;
  const iMisc = geo.getAttribute('iMisc') as THREE.InstancedBufferAttribute;
  const right = new THREE.Vector3(1, 0, 0).applyQuaternion(cam.quaternion).setY(0).normalize();
  const back = new THREE.Vector3(-right.z, 0, right.x);
  const nSky = new THREE.Vector3(0, FLORA_SKY_NORMAL[0], 0).addScaledVector(back, FLORA_SKY_NORMAL[1]).normalize();
  const nLoc = back.clone().multiplyScalar(0.9).add(new THREE.Vector3(0, 0.3, 0)).normalize();
  const depth = new Float32Array(W * H).fill(Infinity);
  const lum = new Float32Array(W * H);
  const sky = new THREE.Color();
  const loc = new THREE.Color();
  const p = new THREE.Vector3();
  const q = new THREE.Vector4();
  const corner = new THREE.Vector3();
  const lin = new Float32Array(256 * 3);
  for (let i = 0; i < 256; i++) for (let k = 0; k < 3; k++) lin[i * 3 + k] = srgbToLin(pal[i * 4 + k] / 255);
  for (let i = 0; i < geo.instanceCount; i++) {
    p.fromBufferAttribute(iPos, i);
    const bw = iBox.getZ(i);
    const bh = iBox.getW(i);
    const wM = iDim.getX(i);
    const hM = iDim.getY(i);
    const flip = iMisc.getX(i);
    const tint = iMisc.getY(i);
    const foot = flip < 0 ? bw - iMisc.getZ(i) : iMisc.getZ(i);
    const texM = hM / bh;
    // Screen rect of the quad (it faces the view plane: affine across it).
    const left = -foot * texM;
    const pts: [number, number, number][] = [];
    let ok = true;
    for (const [u, v] of [[left, 0], [left + wM, 0], [left, hM], [left + wM, hM]]) {
      corner.copy(p).addScaledVector(right, u).setY(p.y + v);
      q.set(corner.x, corner.y, corner.z, 1).applyMatrix4(vp);
      if (q.w < cam.near) ok = false;
      pts.push([(q.x / q.w * 0.5 + 0.5) * W, (q.y / q.w * 0.5 + 0.5) * H, q.z / q.w]);
    }
    if (!ok) continue;
    const [p00, p10, p01] = pts;
    const sx = p10[0] - p00[0];
    const sy = p01[1] - p00[1];
    if (sx <= 0.5 || sy <= 0.5) continue;
    const x0 = Math.max(0, Math.floor(p00[0]));
    const x1 = Math.min(W - 1, Math.ceil(p10[0]));
    const y0 = Math.max(0, Math.floor(p00[1]));
    const y1 = Math.min(H - 1, Math.ceil(p01[1]));
    if (x0 > x1 || y0 > y1) continue;
    corner.copy(p).setY(p.y + hM * 0.5);
    irradiance(L, corner, nSky, nLoc, sky, loc);
    const ll = 0.2126 * loc.r + 0.7152 * loc.g + 0.0722 * loc.b;
    const er = sky.r + Math.min(cap, (ll + loc.r) * 0.5);
    const eg = sky.g + Math.min(cap, (ll + loc.g) * 0.5);
    const eb = sky.b + Math.min(cap, (ll + loc.b) * 0.5);
    const dist = corner.distanceTo(eye);
    const f = fog ? Math.max(0, Math.min(1, (dist - fog.near) / (fog.far - fog.near))) : 0;
    const z = p00[2];
    // Texel pick like the shader (whole texels; level from the on-screen texel size).
    const rho = Math.max(bw / sx, bh / sy);
    const lv = floraLevelFor(rho);
    const lvl = levels[lv];
    const ox = iBox.getX(i) >> lv;
    const oy = iBox.getY(i) >> lv;
    for (let y = y0; y <= y1; y++) {
      const ty = Math.floor(((y + 0.5 - p00[1]) / sy) * bh);
      if (ty < 0 || ty >= bh) continue;
      for (let x = x0; x <= x1; x++) {
        let tx = Math.floor(((x + 0.5 - p00[0]) / sx) * bw);
        if (tx < 0 || tx >= bw) continue;
        if (flip < 0) tx = bw - 1 - tx;
        const id = lvl.data[(oy + (ty >> lv)) * lvl.width + ox + (tx >> lv)];
        if (!id) continue;
        const k = y * W + x;
        if (z >= depth[k]) continue;
        depth[k] = z;
        const g = (gain * tint) / Math.PI;
        lum[k] = display(lin[id * 3] * er * g, lin[id * 3 + 1] * eg * g, lin[id * 3 + 2] * eb * g, f, fog?.color ?? sky);
      }
    }
  }
  return mean(depth, lum);
}

function mean(depth: Float32Array, lum: Float32Array): VegFrame {
  let s = 0;
  let n = 0;
  for (let k = 0; k < depth.length; k++) {
    if (depth[k] === Infinity) continue;
    s += lum[k];
    n++;
  }
  return { lum: n ? s / n : 0, px: n };
}
