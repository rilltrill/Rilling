import * as THREE from 'three';
import { PW_PAL_DEEP, PW_PAL_W } from '../../src/content/pixelworld/canvas';

/**
 * PIXEL WORLD look-dev preview (node only, no GL): a software render of a scene's PixelWorld
 * meshes as the phone's 288-line frame draws them — the same texel fetch as `pwFetchAxes`
 * (level picked per texel axis, the block reduced along the squeezed one), painted colours
 * straight from the palette (no lights, no fog: the paint as painted, which is what the
 * ramp-step light shows under an even light). Seconds instead of a browser capture, so a painter
 * can look at a ground module from the rail after every change:
 *
 *   PW_PREVIEW=/tmp/pw2/z1/pv npx vitest run tests/unit/pw2-z1-preview.test.ts
 *
 * Only UV-mapped PixelWorld meshes are drawn (no planar bakes, no animated strips, no cast,
 * no classic meshes, no light pools); everything else is the background colour.
 */

export interface PvCam {
  /** Eye (world). */
  pos: [number, number, number];
  /** Heading in degrees: 0 looks down −Z, 90 looks down −X (left of north). */
  yaw: number;
  /** Degrees up. */
  pitch?: number;
  fov?: number;
}

interface PvTex {
  levels: { data: Uint8Array; width: number; height: number }[];
  pal: Uint8Array;
  bias: number;
  maxLv: number;
}

const S2L = new Float32Array(256);
for (let i = 0; i < 256; i++) {
  const c = i / 255;
  S2L[i] = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}
const l2s = (v: number) => Math.round(255 * (v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(Math.min(1, v), 1 / 2.4) - 0.055));

/** Render the PixelWorld meshes under `root` from `cam` into an RGBA8 frame (rows top-down). */
export function pwPreview(root: THREE.Object3D, cam: PvCam, W = 624, H = 288, bg = 0x1a2133): Uint8Array {
  const camera = new THREE.PerspectiveCamera(cam.fov ?? 58, W / H, 0.1, 400);
  camera.position.set(cam.pos[0], cam.pos[1], cam.pos[2]);
  camera.rotation.set(((cam.pitch ?? 0) * Math.PI) / 180, (cam.yaw * Math.PI) / 180, 0, 'YXZ');
  camera.updateMatrixWorld(true);
  camera.updateProjectionMatrix();
  const vp = new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
  const out = new Uint8Array(W * H * 4);
  for (let i = 0; i < W * H; i++) {
    out[i * 4] = (bg >> 16) & 255;
    out[i * 4 + 1] = (bg >> 8) & 255;
    out[i * 4 + 2] = bg & 255;
    out[i * 4 + 3] = 255;
  }
  const depth = new Float32Array(W * H).fill(Infinity);
  root.updateMatrixWorld(true);
  const mvp = new THREE.Matrix4();
  const v4 = new THREE.Vector4();
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || !m.userData.pixelWorld) return;
    for (let p: THREE.Object3D | null = m; p; p = p.parent) if (!p.visible) return;
    const g = m.geometry;
    const pos = g.getAttribute('position');
    const uv = g.getAttribute('pwUv');
    const rect = g.getAttribute('pwRect');
    const col = g.getAttribute('color');
    const mat = m.material as THREE.Material;
    const u = mat.userData.pw as Record<string, { value: unknown }> | undefined;
    if (!pos || !uv || !rect || !u || (mat as THREE.Material & { defines?: Record<string, string> }).defines?.PW_ANIM !== undefined) return;
    const at = u.uPwAtlas.value as THREE.DataTexture;
    const img = at.image as unknown as { data: Uint8Array; width: number; height: number };
    const levels = (at.mipmaps?.length ? at.mipmaps : [img]) as unknown as { data: Uint8Array; width: number; height: number }[];
    const tex: PvTex = { levels, pal: (u.uPwPal.value as THREE.DataTexture).image.data as unknown as Uint8Array, bias: u.uPwBias.value as number, maxLv: u.uPwMaxLv.value as number };
    const gain = 1;
    void gain;
    mvp.multiplyMatrices(vp, m.matrixWorld);
    const index = g.index;
    const n = index ? index.count : pos.count;
    const cull = mat.side === THREE.FrontSide;
    // Clip-space vertices of one triangle: x, y, z, w, u, v, r, g, b.
    const V = [new Float64Array(9), new Float64Array(9), new Float64Array(9)];
    for (let t = 0; t + 2 < n; t += 3) {
      const i0 = index ? index.getX(t) : t;
      const ids = [i0, index ? index.getX(t + 1) : t + 1, index ? index.getX(t + 2) : t + 2];
      for (let k = 0; k < 3; k++) {
        const i = ids[k];
        v4.set(pos.getX(i), pos.getY(i), pos.getZ(i), 1).applyMatrix4(mvp);
        const a = V[k];
        a[0] = v4.x;
        a[1] = v4.y;
        a[2] = v4.z;
        a[3] = v4.w;
        a[4] = uv.getX(i);
        a[5] = uv.getY(i);
        a[6] = col ? col.getX(i) : 1;
        a[7] = col ? col.getY(i) : 1;
        a[8] = col ? col.getZ(i) : 1;
      }
      const r = [rect.getX(i0), rect.getY(i0), rect.getZ(i0), rect.getW(i0)];
      // Clip against the near plane (w > near).
      const NEAR = 0.1;
      let poly: Float64Array[] = [];
      for (let k = 0; k < 3; k++) {
        const a = V[k];
        const b = V[(k + 1) % 3];
        const ia = a[3] > NEAR;
        const ib = b[3] > NEAR;
        if (ia) poly.push(a);
        if (ia !== ib) {
          const s = (NEAR - a[3]) / (b[3] - a[3]);
          const c = new Float64Array(9);
          for (let q = 0; q < 9; q++) c[q] = a[q] + (b[q] - a[q]) * s;
          poly.push(c);
        }
      }
      if (poly.length < 3) continue;
      poly = poly.map((p) => Float64Array.from(p));
      for (let k = 1; k + 1 < poly.length; k++) raster(poly[0], poly[k], poly[k + 1], r, tex, cull, out, depth, W, H);
    }
  });
  return out;
}

function raster(a: Float64Array, b: Float64Array, c: Float64Array, rect: number[], tex: PvTex, cull: boolean, out: Uint8Array, depth: Float32Array, W: number, H: number) {
  const sx = (p: Float64Array) => (p[0] / p[3] * 0.5 + 0.5) * W;
  const sy = (p: Float64Array) => (1 - (p[1] / p[3] * 0.5 + 0.5)) * H;
  const ax = sx(a);
  const ay = sy(a);
  const bx = sx(b);
  const by = sy(b);
  const cx = sx(c);
  const cy = sy(c);
  const area = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
  if (Math.abs(area) < 1e-9) return;
  // (Screen y runs down: a front face is clockwise here.)
  if (cull && area > 0) return;
  const x0 = Math.max(0, Math.floor(Math.min(ax, bx, cx)));
  const x1 = Math.min(W - 1, Math.ceil(Math.max(ax, bx, cx)));
  const y0 = Math.max(0, Math.floor(Math.min(ay, by, cy)));
  const y1 = Math.min(H - 1, Math.ceil(Math.max(ay, by, cy)));
  if (x0 > x1 || y0 > y1) return;
  // Perspective-correct attributes: q/w is affine on screen.
  const iwA = 1 / a[3];
  const iwB = 1 / b[3];
  const iwC = 1 / c[3];
  const attr = (va: number, vb: number, vc: number) => {
    // Plane through the three screen points: v = v0 + gx (x − ax) + gy (y − ay).
    const gx = ((vb - va) * (cy - ay) - (vc - va) * (by - ay)) / area;
    const gy = ((vc - va) * (bx - ax) - (vb - va) * (cx - ax)) / area;
    return [va, gx, gy];
  };
  const IW = attr(iwA, iwB, iwC);
  const UW = attr(a[4] * iwA, b[4] * iwB, c[4] * iwC);
  const VW = attr(a[5] * iwA, b[5] * iwB, c[5] * iwC);
  const ZW = attr(a[2] * iwA, b[2] * iwB, c[2] * iwC);
  const RW = attr(a[6] * iwA, b[6] * iwB, c[6] * iwC);
  const GW = attr(a[7] * iwA, b[7] * iwB, c[7] * iwC);
  const BW = attr(a[8] * iwA, b[8] * iwB, c[8] * iwC);
  const rsx = Math.abs(rect[2]);
  const rsy = Math.abs(rect[3]);
  const wrap = rect[2] > 0;
  const ps = rect[3] < 0 ? 2 : 1;
  const e = (px: number, py: number, qx: number, qy: number, x: number, y: number) => (qx - px) * (y - py) - (qy - py) * (x - px);
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const fx = x + 0.5;
      const fy = y + 0.5;
      const w0 = e(bx, by, cx, cy, fx, fy);
      const w1 = e(cx, cy, ax, ay, fx, fy);
      const w2 = e(ax, ay, bx, by, fx, fy);
      if (area > 0 ? w0 < 0 || w1 < 0 || w2 < 0 : w0 > 0 || w1 > 0 || w2 > 0) continue;
      const dx = fx - ax;
      const dy = fy - ay;
      const iw = IW[0] + IW[1] * dx + IW[2] * dy;
      if (iw <= 0) continue;
      const z = ZW[0] + ZW[1] * dx + ZW[2] * dy;
      const di = y * W + x;
      if (z >= depth[di]) continue;
      const uw = UW[0] + UW[1] * dx + UW[2] * dy;
      const vw = VW[0] + VW[1] * dx + VW[2] * dy;
      const pu = uw / iw;
      const pv = vw / iw;
      // Screen derivatives of the texel coords (as dFdx / dFdy give them).
      const dudx = (UW[1] * iw - uw * IW[1]) / (iw * iw);
      const dudy = (UW[2] * iw - uw * IW[2]) / (iw * iw);
      const dvdx = (VW[1] * iw - vw * IW[1]) / (iw * iw);
      const dvdy = (VW[2] * iw - vw * IW[2]) / (iw * iw);
      const rhoU = Math.max(Math.abs(dudx), Math.abs(dudy));
      const rhoV = Math.max(Math.abs(dvdx), Math.abs(dvdy));
      let tu = wrap ? ((pu % rsx) + rsx) % rsx : Math.min(rsx - 0.001, Math.max(0, pu));
      let tv = wrap ? ((pv % rsy) + rsy) % rsy : Math.min(rsy - 0.001, Math.max(0, pv));
      tu = Math.floor(tu * ps);
      tv = Math.floor(tv * ps);
      const lu = Math.max(0, Math.min(tex.maxLv, Math.floor(Math.log2(Math.max(rhoU * ps, 1e-3)) + tex.bias)));
      const lvv = Math.max(0, Math.min(tex.maxLv, Math.floor(Math.log2(Math.max(rhoV * ps, 1e-3)) + tex.bias)));
      const hi = Math.max(lu, lvv);
      const lo = Math.max(Math.min(lu, lvv), hi - 2);
      const alongU = lu > lvv;
      const px = (rect[0] + tu) >> lo;
      const py = (rect[1] + tv) >> lo;
      const L = tex.levels[lo];
      const sh = hi - lo;
      let texel = 0;
      const fetch = (qx: number, qy: number) => {
        const i = (qy * L.width + qx) * 2;
        return L.data[i] | (L.data[i + 1] << 8);
      };
      if (sh === 0) texel = fetch(px, py);
      else {
        // The block along the squeezed axis, reduced as the levels are made.
        const along = alongU ? px : py;
        const base = (along >> sh) << sh;
        const cnt = 1 << sh;
        const ts: number[] = [];
        for (let k = 0; k < cnt; k++) ts.push(alongU ? fetch(base + k, py) : fetch(px, base + k));
        const lit = ts.filter((t) => t & 0x0fff && !(t & 0x8000));
        const glow = ts.filter((t) => t & 0x0fff && t & 0x8000);
        const lc = lit.length * (cnt === 2 ? 2 : 1);
        const gc = glow.length * (cnt === 2 ? 2 : 1);
        if (lc + gc <= 1 && gc === 0) texel = 0;
        else {
          const set = gc > 0 && gc >= lc ? glow : lit;
          let mr = 0;
          let mg = 0;
          let mb = 0;
          const cols = set.map((t) => {
            const p = ((t & 0x0fff) * PW_PAL_W + PW_PAL_DEEP + ((t >> 12) & 7)) * 4;
            const rgb = [S2L[tex.pal[p]], S2L[tex.pal[p + 1]], S2L[tex.pal[p + 2]]];
            mr += rgb[0];
            mg += rgb[1];
            mb += rgb[2];
            return rgb;
          });
          mr /= set.length;
          mg /= set.length;
          mb /= set.length;
          let bd = Infinity;
          cols.forEach((rgb, k) => {
            const d = (rgb[0] - mr) ** 2 + (rgb[1] - mg) ** 2 + (rgb[2] - mb) ** 2;
            if (d < bd) {
              bd = d;
              texel = set[k];
            }
          });
        }
      }
      if (!(texel & 0x0fff)) continue;
      const p = ((texel & 0x0fff) * PW_PAL_W + PW_PAL_DEEP + ((texel >> 12) & 7)) * 4;
      depth[di] = z;
      const glowT = (texel & 0x8000) !== 0;
      const tr = glowT ? 1 : (RW[0] + RW[1] * dx + RW[2] * dy) / iw;
      const tg = glowT ? 1 : (GW[0] + GW[1] * dx + GW[2] * dy) / iw;
      const tb = glowT ? 1 : (BW[0] + BW[1] * dx + BW[2] * dy) / iw;
      out[di * 4] = tr > 0.995 ? tex.pal[p] : l2s(S2L[tex.pal[p]] * tr);
      out[di * 4 + 1] = tg > 0.995 ? tex.pal[p + 1] : l2s(S2L[tex.pal[p + 1]] * tg);
      out[di * 4 + 2] = tb > 0.995 ? tex.pal[p + 2] : l2s(S2L[tex.pal[p + 2]] * tb);
    }
  }
}
