import * as THREE from 'three';
import { PwAtlas, type PwTile } from '../../pixelworld/atlas';
import { PwBatch, tintFor } from '../../pixelworld/batch';
import { PwBackdrop } from '../../pixelworld/backdrop';
import { PW_TPM } from '../../pixelworld/canvas';
import {
  acUnitModule, awningTile, corniceTile, doorModule, DOOR_M, drainpipeTile, graffitiDecal, posterDecal, SHOP_BAY_M, SHOPFRONT_H_M, shopfrontModule, valanceTile,
  wallFoot, wallHead, WINDOW_M, windowModule, type ShopGoods, type WindowKind,
} from '../../pixelworld/facade';
import { kitTileRule, neutral, NEUTRAL_BRICK, NEUTRAL_HEX, retexture, type TileRule } from '../../pixelworld/retexture';
import { bladeSign as pwBlade, marquee, moviePoster, neonEdge, neonSign } from '../../pixelworld/signs';
import { nightSkyTile, skylineTile } from '../../pixelworld/sky';
import {
  asphaltTile, brickTile, curbTile, hash2, metalTile, panelTile, plasterTile, roofTile, sidewalkTile, stoneTile,
} from '../../pixelworld/surfaces';
import { texStd } from './bake';
import { Kit } from '../../kit/ModelKit';
import { M, type FacadeRecord } from './props';
import type { ZoneId } from './town';

/**
 * MAIN STREET in ART: PIXEL WORLD — the reference conversion for the stage
 * agents (see docs/ARCHITECTURE.md "PixelWorld").
 *
 *  1. `building()` / `boardSign()` / `bladeSign()` record what a facade shows
 *     (`userData.pwBuilding`, `pwSign`) and tag the meshes painting replaces
 *     (`userData.pwFacade`); no rng draws change, so ART 3D / PIXEL CAST build
 *     byte-identically.
 *  2. Here, per zone and BEFORE the zone bake: every building's facade is laid
 *     as painted pixel art — the wall with a weathered foot band and drip-stained
 *     head band, window / door / shopfront modules, a cornice, awning canvas and
 *     a scalloped valance, posters, graffiti, drainpipes, AC units — and every
 *     sign becomes pixel-font neon. Everything else static (sidewalks, curbs,
 *     roads, lane paint, trims, roofs, cars, street furniture) is re-painted
 *     through `retexture` with the Kit-texture → tile mapping. All of a zone's
 *     PixelWorld geometry is ONE mesh (one draw call) in the zone's group, so it
 *     culls with the zone. Glows, glass and the fire effects stay classic.
 *  3. The sky is a painted panorama (night sky, moon, clouds) with two skyline
 *     layers, replacing the gradient dome / sphere moon.
 * Gameplay never sees any of it: occluders, ROOF_PADS and the destructibles are
 * the stage's own, unchanged.
 */

/** Facade texture per building colour (as z1 props FACADE_TEX). */
const WALL_KIND: Record<number, 'brick' | 'panel' | 'plaster'> = {
  0x7a3a2c: 'brick',
  0x664632: 'brick',
  0x62656e: 'panel',
  0x8a7454: 'plaster',
  0x445670: 'brick',
  0x4e6650: 'plaster',
  0x8c8370: 'plaster',
};
/** Painted-brick buildings (the blue): brick under peeling paint. */
const PAINTED: Record<number, number> = { 0x445670: 0x445670 };

const STONE_LIGHT = 0x86827a;
const STONE_DARK = 0x4a4a52;

const GOODS: Record<string, ShopGoods> = {
  HARDWARE: 'hardware',
  PAWN: 'pawn',
  LOANS: 'pawn',
  LAUNDRY: 'laundry',
  LIQUOR: 'liquor',
  PHARMACY: 'pharmacy',
  BARBER: 'barber',
  CAFE: 'cafe',
  BAR: 'bar',
  GUNS: 'guns',
};

const _m = new THREE.Matrix4();
const _o = new THREE.Vector3();
const X = new THREE.Vector3(1, 0, 0);
const Y = new THREE.Vector3(0, 1, 0);
const Z = new THREE.Vector3(0, 0, 1);
const NX = new THREE.Vector3(-1, 0, 0);
const NZ = new THREE.Vector3(0, 0, -1);

export class Z1PixelWorld {
  readonly atlas = new PwAtlas('z1');
  readonly skyAtlas = new PwAtlas('z1-sky', { levels: 1 });
  private batches = new Map<ZoneId, PwBatch>();
  private rule: TileRule;
  private groundMats: Set<THREE.Material>;
  backdrop: PwBackdrop | null = null;

  constructor() {
    const a = this.atlas;
    const sidewalk = M.sidewalk;
    const curb = M.curb;
    const ov = new Map<THREE.Material, TileRule>([
      [sidewalk, (_m, _x, ny) => (ny > 0.7 ? sidewalkTile(a, { hex: 0x56575d }) : curbTile(a, { hex: 0x6e6f75 }))],
      [curb, () => curbTile(a, { hex: 0x7a7b80 })],
      [M.trimLight, () => stoneTile(a, { hex: STONE_LIGHT })],
      [M.trimDark, () => stoneTile(a, { hex: STONE_DARK })],
      [M.roof, (_m, _x, ny) => (ny > 0.7 ? roofTile(a, { hex: 0x2a2b31 }) : stoneTile(a, { hex: STONE_DARK }))],
      [M.metal, () => metalTile(a, { hex: 0x3a3c44, rust: 0.6 })],
      [M.metalLight, () => metalTile(a, { hex: 0x6a6e75 })],
    ]);
    // Road surfaces (texStd wet asphalt): painted asphalt with wet glints.
    for (const m of roadMaterials()) ov.set(m, () => asphaltTile(a, { hex: 0x2c2f37, wet: true, wear: 0.6 }));
    this.rule = kitTileRule(a, { overrides: ov, paint: new Set([M.yellowPaint, M.whitePaint]) });
    this.groundMats = new Set<THREE.Material>([sidewalk, curb, ...roadMaterials()]);
  }

  private batch(id: ZoneId): PwBatch {
    let b = this.batches.get(id);
    if (!b) this.batches.set(id, (b = new PwBatch(this.atlas)));
    return b;
  }

  /** Paint a zone's buildings and signs, and re-paint the rest of its static scenery (call before its bake). */
  convertZone(id: ZoneId, zone: THREE.Group) {
    const b = this.batch(id);
    zone.updateMatrixWorld(true);
    const buildings: THREE.Object3D[] = [];
    const signs: THREE.Object3D[] = [];
    zone.traverse((o) => {
      if (o.userData.pwBuilding) buildings.push(o);
      if (o.userData.pwSign) signs.push(o);
    });
    buildings.forEach((g, i) => this.facade(b, g, g.userData.pwBuilding as FacadeRecord, i));
    for (const s of signs) this.sign(b, s);
    zone.updateMatrixWorld(true);
    retexture(zone, b, this.rule, { world: (m) => this.groundMats.has(m.material as THREE.Material) });
  }

  /** Build the atlases and the zone meshes (adds each zone's PixelWorld mesh to its group). */
  finish(zones: Record<ZoneId, THREE.Group>) {
    this.atlas.build();
    for (const [id, b] of this.batches) {
      const mesh = b.build(undefined, { gain: 1 });
      if (mesh) zones[id].add(mesh);
    }
  }

  // ─── Facades ──────────────────────────────────────────────────────────────

  /**
   * Facade wall tile: three NEUTRAL wall painters (brick, plaster, concrete panel)
   * tinted per building (vertex colour), plus the peeling painted brick — a
   * handful of tiles (× foot / head variants) for every building of the stage.
   */
  private wallTile(color: number): PwTile {
    const a = this.atlas;
    const kind = WALL_KIND[color] ?? 'brick';
    if (kind === 'panel') return neutral(panelTile(a, { hex: NEUTRAL_HEX }));
    if (kind === 'plaster') return neutral(plasterTile(a, { hex: NEUTRAL_HEX, under: 0x7a3a2c }));
    if (PAINTED[color] !== undefined) return brickTile(a, { hex: 0x6a3a2c, painted: PAINTED[color] });
    return neutral(brickTile(a, { hex: NEUTRAL_BRICK }), NEUTRAL_BRICK);
  }

  private facade(b: PwBatch, g: THREE.Object3D, rec: FacadeRecord, index: number) {
    const a = this.atlas;
    const { w, h, d } = rec;
    const color = rec.spec.color;
    const base = rec.spec.tex === 'brick' ? neutral(brickTile(a, { hex: NEUTRAL_BRICK }), NEUTRAL_BRICK) : this.wallTile(color);
    const foot = wallFoot(a, base);
    const head = wallHead(a, base);
    foot.neutral = head.neutral = base.neutral;
    // Neutral walls take the building's colour per vertex.
    const tintRGB = base.neutral !== undefined ? tintFor(base, color) : undefined;
    const stone = rec.trimLight ? STONE_LIGHT : STONE_DARK;
    const frameCol = rec.trimLight ? 0xd8d4c8 : 0x3a3a42;
    g.updateMatrixWorld(true);
    b.setMatrix(g.matrixWorld);
    // Wall: foot band (damp, splash-back), body, head band (drips under the cornice).
    const footH = 1.25;
    const headH = 1.0;
    const bodyH = Math.max(0, h - footH - headH);
    b.rect(_o.set(-w / 2, 0, 0), X, Y, w, footH, foot, { u0: 0, v0: 0, tintRGB });
    b.rect(_o.set(-w / 2, footH, 0), X, Y, w, bodyH, base, { u0: 0, v0: footH * PW_TPM, tintRGB });
    // Head band: shifted by whole bond periods (8 rows) so its top lands on a tile top (the drip rows).
    const vTop = h * PW_TPM;
    const shift = Math.round((Math.ceil(vTop / head.h) * head.h - vTop) / 8) * 8;
    b.rect(_o.set(-w / 2, footH + bodyH, 0), X, Y, w, headH, head, { u0: 0, v0: (h - headH) * PW_TPM + shift, tintRGB });
    // Sides and back (seen down the cross streets).
    b.rect(_o.set(w / 2, 0, 0), NZ, Y, d, h, base, { u0: 0, v0: 0, tintRGB });
    b.rect(_o.set(-w / 2, 0, -d), Z, Y, d, h, base, { u0: 0, v0: 0, tintRGB });
    b.rect(_o.set(w / 2, 0, -d), NX, Y, w, h, base, { u0: 0, v0: 0, tintRGB });
    // Upper windows.
    const style = { wall: color, frame: frameCol, stone };
    rec.windows.forEach((wr, i) => {
      const v = Math.floor(hash2(index, i, 7) * 2);
      let kind: WindowKind = wr.kind;
      if (wr.boarded) kind = 'boarded';
      else if (wr.ghoul) kind = 'ghoul';
      else if (wr.blind) kind = 'blinds';
      else if (kind === 'dark' && hash2(index, i, 9) > 0.86) kind = 'broken';
      const t = windowModule(a, kind, style, v);
      b.rect(_o.set(wr.x - WINDOW_M.w / 2, wr.y - WINDOW_M.openY, 0.015), X, Y, WINDOW_M.w, WINDOW_M.h, t);
      // An AC unit hanging under a few lit windows.
      if (kind !== 'boarded' && hash2(index, i, 11) > 0.84) b.rect(_o.set(wr.x - 0.44 + 0.2, wr.y - WINDOW_M.openY - 0.6, 0.03), X, Y, 28 / PW_TPM, 22 / PW_TPM, acUnitModule(a));
    });
    // Ground floor.
    const shop = rec.shop;
    if (shop && !shop.noWindow) {
      const sw = rec.shopW + 0.3;
      const bays = Math.max(1, Math.round(sw / SHOP_BAY_M));
      const goods = GOODS[shop.board?.text ?? shop.blade?.text ?? ''] ?? 'generic';
      const t = shopfrontModule(a, {
        widthM: SHOP_BAY_M,
        goods,
        lit: shop.interior,
        riser: goods === 'generic' || hash2(index, 1, 3) > 0.5 ? 0x5a2a2a : 0x2a3a4a,
        frame: frameCol === 0xd8d4c8 ? 0x8a8c90 : 0x34343b,
        shutter: shop.shutter,
        boarded: shop.boarded,
        variant: index % 2,
      });
      const x0 = rec.shopX - sw / 2;
      // Bays across the window (u spans whole bays: a mullion every 4 m), stone jambs at both ends.
      b.rect(_o.set(x0, 0, 0.02), X, Y, sw, SHOPFRONT_H_M, t, { u0: 0, v0: 0, uScale: (bays * t.w) / (sw * PW_TPM) });
      const jamb = stoneTile(a, { hex: stone });
      for (const jx of [x0 - 0.2, x0 + sw]) b.rect(_o.set(jx, 0, 0.03), X, Y, 0.2, SHOPFRONT_H_M, jamb);
    }
    if (shop) {
      const t = doorModule(a, shop.interior ? 'shop' : shop.shutter ? 'metal' : 'wood', { hex: 0x45301f, stone, wall: color, lit: shop.interior || undefined });
      b.rect(_o.set(rec.doorX - DOOR_M.w / 2, 0, 0.02), X, Y, DOOR_M.w, DOOR_M.h, t);
    } else {
      const t = doorModule(a, 'wood', { hex: hash2(index, 2, 3) > 0.5 ? 0x45301f : 0x2a3a2a, stone, wall: color, lit: rec.groundLit ? 0xd8914a : undefined });
      b.rect(_o.set(rec.doorX - DOOR_M.w / 2, 0, 0.02), X, Y, DOOR_M.w, DOOR_M.h, t);
      for (const sx of [-1, 1]) {
        const t2 = windowModule(a, rec.groundLit ? 'dim' : hash2(index, sx, 5) > 0.7 ? 'boarded' : 'dark', style, (index + sx + 2) % 2);
        b.rect(_o.set(sx * w * 0.28 - WINDOW_M.w / 2, 1.8 - WINDOW_M.openY, 0.015), X, Y, WINDOW_M.w, WINDOW_M.h, t2);
      }
    }
    // Wall decals: posters / bills at eye level, a tag on the foot, a drainpipe at one end.
    const freeX = (x: number) => (!shop || Math.abs(x - rec.shopX) > rec.shopW / 2 + 0.6) && Math.abs(x - rec.doorX) > 1.0;
    for (let p = 0; p < 3; p++) {
      const px = -w / 2 + 0.9 + hash2(index, p, 21) * (w - 1.8);
      if (!freeX(px) || hash2(index, p, 22) > 0.6) continue;
      b.rect(_o.set(px, 1.1 + hash2(index, p, 23) * 0.5, 0.03), X, Y, 24 / PW_TPM, 32 / PW_TPM, posterDecal(a, (index + p) % 4));
    }
    if (hash2(index, 3, 24) > 0.45) {
      const gx = -w / 2 + 1 + hash2(index, 3, 25) * (w - 3);
      if (freeX(gx) && freeX(gx + 2)) b.rect(_o.set(gx, 0.25, 0.03), X, Y, 2, 0.75, graffitiDecal(a, index % 7));
    }
    const pipeX = hash2(index, 4, 26) > 0.5 ? w / 2 - 0.75 : -w / 2 + 0.3;
    b.rect(_o.set(pipeX, 0, 0.04), X, Y, 0.5, h - 0.5, drainpipeTile(a, { hex: 0x4a4c52 }), { u0: 0, v0: 0 });
    // Replace the tagged meshes (cornice / awning / valance get painted faces; the rest go).
    const drop: THREE.Object3D[] = [];
    for (const c of g.children) {
      const tag = c.userData.pwFacade as string | undefined;
      if (!tag || tag === 'keep') continue;
      if (tag === 'cornice') this.cornice(b, c as THREE.Mesh, stone);
      else if (tag === 'poster') {
        const p = c.position;
        const t = moviePoster(a, index + Math.round(p.x));
        b.rect(_o.set(p.x - t.wM / 2, p.y - t.hM / 2, p.z + 0.04), X, Y, t.wM, t.hM, t.tile);
      }
      else if (tag === 'awning') b.geometry((c as THREE.Mesh).geometry, _m.copy(c.matrix), awningTile(a, { hex: awningHex(c as THREE.Mesh) }));
      else if (tag === 'valance') {
        const m = c as THREE.Mesh;
        const p = m.position;
        const aw = (m.geometry as THREE.BoxGeometry).parameters.width;
        b.rect(_o.set(p.x - aw / 2, p.y - 0.32, p.z + 0.03), X, Y, aw, 0.5, valanceTile(a, { hex: awningHex(m) }), { u0: 0, v0: 0 });
      }
      drop.push(c);
    }
    for (const c of drop) g.remove(c);
    b.setMatrix(null);
  }

  /** The cornice box: moulded front, stone top and returns. */
  private cornice(b: PwBatch, m: THREE.Mesh, stoneHex: number) {
    const a = this.atlas;
    const p = (m.geometry as THREE.BoxGeometry).parameters;
    const c = m.position;
    const front = corniceTile(a, { hex: stoneHex });
    const stone = stoneTile(a, { hex: stoneHex });
    const x0 = c.x - p.width / 2;
    const y0 = c.y - p.height / 2;
    const z1 = c.z + p.depth / 2;
    const z0 = c.z - p.depth / 2;
    // Front: the moulding stretched over the face height (16 rows ≈ 0.45 m).
    b.rect(_o.set(x0, y0, z1), X, Y, p.width, p.height, front, { u0: 0, v0: 0 });
    b.rect(_o.set(x0, y0 + p.height, z1), X, NZ, p.width, p.depth, stone);
    b.rect(_o.set(x0, y0, z0), X, Z, p.width, p.depth, stone);
    b.rect(_o.set(x0, y0, z0), Z, Y, p.depth, p.height, stone);
    b.rect(_o.set(x0 + p.width, y0, z1), NZ, Y, p.depth, p.height, stone);
  }

  // ─── Signs ────────────────────────────────────────────────────────────────

  private sign(b: PwBatch, s: THREE.Object3D) {
    const a = this.atlas;
    const info = s.userData.pwSign as {
      kind: 'board' | 'blade' | 'marquee';
      text: string;
      color: number;
      size: number;
      back?: number;
      script?: boolean;
      border?: number;
      frame?: boolean;
      w?: number;
      z?: number;
      /** The classic board's size (m): the painted board is at least that big. */
      bw?: number;
      bh?: number;
    };
    if (info.kind === 'marquee') {
      // The marquee's lit board (the metal box around it is re-painted with the rest).
      s.updateMatrixWorld(true);
      b.setMatrix(s.matrixWorld);
      const t = marquee(a, info.text.split('/'), { widthM: info.w ?? 12, heightM: info.size });
      b.rect(_o.set(-t.wM / 2, -t.hM / 2, info.z ?? 0.01), X, Y, t.wM, t.hM, t.tile);
      b.setMatrix(null);
      for (const c of s.children.filter((c) => c.userData.pwFacade === 'signBack' || c.type === 'Group')) s.remove(c);
      return;
    }
    s.updateMatrixWorld(true);
    b.setMatrix(s.matrixWorld);
    const backTile = metalTile(a, { hex: info.back ?? 0x1c1c22, rust: 0.2 });
    if (info.kind === 'board') {
      // Classic letters are `size` tall caps; script lower case runs a little smaller.
      const t = neonSign(a, info.text, info.color, {
        font: info.script ? 'script' : 'bold',
        cap: info.size * (info.script ? 0.9 : 1),
        border: info.frame !== false,
        borderColor: info.border,
        back: info.back,
        minW: Math.round((info.bw ?? 0) * PW_TPM),
        minH: Math.round((info.bh ?? 0) * PW_TPM),
      });
      // Board face at the front of the classic board, a 12 cm deep metal box behind it.
      b.rect(_o.set(-t.wM / 2, -t.hM / 2, 0.01), X, Y, t.wM, t.hM, t.tile);
      b.box(0, 0, -0.06, t.wM, t.hM, 0.12, { px: backTile, nx: backTile, py: backTile, ny: backTile, nz: backTile });
    } else {
      const t = pwBlade(a, info.text, info.color, { cap: info.size, back: info.back });
      const z0 = 0.35;
      const z1 = z0 + t.wM;
      b.rect(_o.set(0.11, -t.hM / 2, z1), NZ, Y, t.wM, t.hM, t.tile);
      b.rect(_o.set(-0.11, -t.hM / 2, z0), Z, Y, t.wM, t.hM, t.tile);
      // The outer edge carries the neon outline (what reads when the blade is seen edge-on).
      b.box(0, 0, (z0 + z1) / 2, 0.22, t.hM, t.wM, { pz: neonEdge(a, info.color, info.back), py: backTile, ny: backTile });
    }
    b.setMatrix(null);
    // Drop the board, block letters, neon tubes; keep brackets / legs (re-painted with the rest).
    const drop = s.children.filter((c) => c.userData.pwFacade === 'signBack' || c.type === 'Group' || isGlow((c as THREE.Mesh).material));
    for (const c of drop) s.remove(c);
  }

  // ─── Sky ──────────────────────────────────────────────────────────────────

  /** The painted night panorama: sky band (moon, stars, clouds) + far and near skyline layers. */
  buildBackdrop(moonDir: THREE.Vector3, fog: number): THREE.Group {
    const s = this.skyAtlas;
    const moonAz = (Math.atan2(moonDir.x, -moonDir.z) * 180) / Math.PI;
    const moonEl = (Math.asin(moonDir.y / moonDir.length()) * 180) / Math.PI;
    const sky = nightSkyTile(s, { horizon: fog, top: 0x03050b, moonAz: Math.round(moonAz), moonEl: Math.round(moonEl), el0: -4, el1: 48, clouds: 0.6 });
    const far = skylineTile(s, { hex: 0x222a3e, fog, el0: -2, el1: 13, lights: 0.45, tall: 0.85, moonAz: Math.round(moonAz), seed: 1 });
    const near = skylineTile(s, { hex: 0x151a28, fog, el0: -2, el1: 8, lights: 0.3, tall: 0.95, moonAz: Math.round(moonAz), seed: 2 });
    this.backdrop = new PwBackdrop(s, { tile: sky, el0: -4, el1: 48, radius: 330 }, [
      { tile: far, radius: 300, el0: -2, el1: 13, follow: 1 },
      { tile: near, radius: 260, el0: -2, el1: 8, yaw: 120, follow: 0.97 },
    ]);
    this.backdrop.anchor.set(-30, 0, -150);
    return this.backdrop.build();
  }
}

function isGlow(m: THREE.Material | THREE.Material[] | undefined): boolean {
  return !!m && !Array.isArray(m) && (m as THREE.MeshBasicMaterial).isMeshBasicMaterial === true;
}

function awningHex(m: THREE.Mesh): number {
  return ((m.material as THREE.MeshLambertMaterial).color?.getHex?.() ?? 0x3a2a24) as number;
}

/** The wet asphalt materials town.ts uses (texStd is cached: the same instances). */
function roadMaterials(): THREE.Material[] {
  return [texStd(0x23262e, 0.42, 0.1, 'asphalt', 1, 0.85), texStd(0x272a31, 0.5, 0.05, 'asphalt', 1.3, 0.9)];
}

/** Light pools in PIXEL WORLD: stepped pixel rings with Bayer-dithered step edges (screened over the surface by `LightPools.build(…, light)`). */
export function pwPoolTexture(): THREE.DataTexture {
  const n = 256;
  const data = new Uint8Array(n * n * 4);
  const bayer = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  const STEPS = 7;
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const dx = (x + 0.5) / n - 0.5;
      const dy = (y + 0.5) / n - 0.5;
      const r = Math.min(1, Math.sqrt(dx * dx + dy * dy) * 2);
      // A pixel artist's light pool: a few flat steps, the edge between two steps an
      // ordered (Bayer) dither — no smooth gradient, no hard paper disc.
      const a = Math.pow(1 - r, 1.5) * STEPS;
      const lo = Math.floor(a);
      const step = Math.min(STEPS, lo + (a - lo > (bayer[(y & 3) * 4 + (x & 3)] + 0.5) / 16 ? 1 : 0));
      const i = (y * n + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = 255;
      // Screened over the surface (see LightPools.build): ~3/4 strength at the centre.
      data[i + 3] = Math.round((step / STEPS) * 190);
    }
  }
  const t = new THREE.DataTexture(data, n, n, THREE.RGBAFormat);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.needsUpdate = true;
  return Kit.track(t);
}
