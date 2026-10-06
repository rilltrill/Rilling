import * as THREE from 'three';
import type { TexName } from '../../kit/Textures';
import { PwAtlas, type PwTile } from '../../pixelworld/atlas';
import { PwBatch } from '../../pixelworld/batch';
import { pwMaterial } from '../../pixelworld/material';
import { NEUTRAL_HEX } from '../../pixelworld/retexture';
import { chequerTile, corrugatedTile, grateTile, hazardTile, tilesTile } from '../../pixelworld/surfaces';
import { rubbleTile } from '../../pixelworld/d2green';
import { D2_LEVEL_STATS, d2CalmLevels } from '../../pixelworld/d2levels';
import { d2BoneTile, d2ClothTile, d2ConcreteTile, d2MetalTile, d2PlainTile, d2PlasterTile, d2SteelTile, d2WoodTile } from '../../pixelworld/d2surfaces';
import { emitMesh, paintGroup, type Face, type MeshRule, type Paint } from './pixelMesh';

/**
 * RESEARCH LABS in ART: PIXEL WORLD.
 *
 * Every room is converted right before its classic bake (`ctx.pw.room(...)`):
 *  - the room's SHELL (the bullet-stopping walls / ceiling) is COPIED into the
 *    room's painted mesh and its baked meshes are hidden at `finish()` — they
 *    stay the very same occluders, invisible;
 *  - hand-painted features are laid as modules over the walls / floor (signs,
 *    murals, posters, desk fronts, merchandise walls, racks, hazard rings…);
 *  - the static dressing is MOVED into the painted mesh with a per-face rule
 *    (tagged meshes by `userData.pw`, the rest by material → the d2 generic
 *    painted set), so the bake only keeps what stays classic: glows, glass,
 *    animated materials (beacons, LEDs, flames, eggs, screens).
 * Each room's painted geometry is ONE mesh (+ one two-sided mesh for cut-out
 * cards: railings, banners, props) in the room's group, culled with the room.
 * Dynamic set pieces (doors, the banner, skeleton chunks, the bulkhead, robot
 * arms, glass frames) get their own painted mesh in their own frame.
 * Gameplay never sees any of it: occluders, ground, spawn data and the
 * room-building RNG are the classic ones.
 */

type GenKey = 'metal' | 'steel' | 'concrete' | 'plaster' | 'wood' | 'woodH' | 'cloth' | 'plain' | 'bone' | 'hazard' | 'corrugated' | 'tiles' | 'rock';

export interface RoomParts {
  root: THREE.Group;
  stat: THREE.Group;
  shell: THREE.Group;
  [k: string]: unknown;
}

export type RoomConverter = (pw: D2PixelWorld, parts: RoomParts) => void;

/** Room converters register themselves here (pixelLobby.ts, …). */
export const ROOM_CONVERTERS = new Map<string, RoomConverter>();

interface RoomBatches {
  main: PwBatch;
  card: PwBatch;
  sky: PwBatch | null;
  root: THREE.Object3D | null;
}

/** Debug / look-dev: the last RESEARCH LABS painter built (tile dumps). */
export const D2_DEBUG: { last: D2PixelWorld | null } = { last: null };

export class D2PixelWorld {
  readonly atlas = new PwAtlas('d2');
  /** Unlit far panels (night sky planes, the moon, jungle flats): one level, no mip pass (never minified much). */
  readonly skyAtlas = new PwAtlas('d2-sky', { levels: 1 });
  constructor() {
    D2_DEBUG.last = this;
  }
  private rooms = new Map<string, RoomBatches>();
  private dyn: { parent: THREE.Object3D; batch: PwBatch; card: boolean; onMesh?: (m: THREE.Mesh) => void }[] = [];
  /** Shell groups whose baked meshes are hidden at finish (they stay the occluders). */
  private shells: THREE.Object3D[] = [];
  /** Per-frame hooks (sky lightning) — allocation-free. */
  readonly animators: ((dt: number, t: number) => void)[] = [];
  /** Built materials by role (filled at finish). */
  readonly mats = new Map<string, THREE.Material>();
  /** Lazily created tiles shared by every room's generic rule. */
  private generic: Record<GenKey, PwTile> | null = null;
  /** Lighting gain of lit texels (matches the classic scenery brightness). */
  gain = 1;

  /** The room's main (one-sided) batch. */
  main(id: string): PwBatch {
    return this.room$(id).main;
  }

  /** The room's two-sided cut-out batch (cards: railings, banners, prop billboards). */
  card(id: string): PwBatch {
    return this.room$(id).card;
  }

  private room$(id: string): RoomBatches {
    let r = this.rooms.get(id);
    if (!r) this.rooms.set(id, (r = { main: new PwBatch(this.atlas), card: new PwBatch(this.atlas), sky: null, root: null }));
    return r;
  }

  /** The room's night-sky batch (unlit, fogless; the stage's lightning brightens it: `skyFlash`). */
  sky(id: string): PwBatch {
    const r = this.room$(id);
    if (!r.sky) r.sky = new PwBatch(this.skyAtlas);
    return r.sky;
  }

  /** Lightning on the painted skies (0 = none … 1 = a full bolt); call every frame. */
  skyFlash(k: number) {
    const m = this.mats.get('sky');
    const u = m?.userData.pw as { uPwGlow: { value: number } } | undefined;
    if (u) u.uPwGlow.value = 1 + k * 2.2;
  }

  /** A painted mesh for a dynamic object (geometry in `parent`'s frame; the mesh is added to `parent` at finish). */
  dynamic(parent: THREE.Object3D, card = false, onMesh?: (m: THREE.Mesh) => void): PwBatch {
    const b = new PwBatch(this.atlas);
    this.dyn.push({ parent, batch: b, card, onMesh });
    return b;
  }

  /** Convert a room (call right before its classic bake). */
  room(id: string, parts: RoomParts) {
    const r = this.room$(id);
    r.root = parts.root;
    this.shells.push(parts.shell);
    // (Rules read world positions: every matrix up to date once, before the converter.)
    parts.root.updateMatrixWorld(true);
    parts.stat.updateMatrixWorld(true);
    parts.shell.updateMatrixWorld(true);
    const conv = ROOM_CONVERTERS.get(id);
    if (conv) conv(this, parts);
    else {
      this.copyShell(parts.shell, r.main);
      paintGroup(parts.stat, r.main, this.genericRule(), { move: true });
    }
  }

  /** Copy a shell's meshes into a batch (world-mapped generic tiles unless `rule`); the meshes stay (hidden at finish). */
  copyShell(shell: THREE.Group, b: PwBatch, rule?: MeshRule) {
    paintGroup(shell, b, rule ?? this.genericRule('world'), { move: false });
  }

  /** The generic painted set (by the material's Kit texture), in `map` mode. */
  genericRule(map: Paint['map'] = 'local'): MeshRule {
    return (m: THREE.Mesh, face: Face, _col?: THREE.Color, wface?: Face) => this.genericPaint(m, map === 'world' ? (wface ?? face) : face, map);
  }

  genericPaint(m: THREE.Mesh, face: Face, map: Paint['map'] = 'local'): Paint | null {
    const g = this.gen();
    const mat = m.material as THREE.MeshLambertMaterial;
    const tex = mat.userData.retroTex as TexName | undefined;
    const scale = (mat.userData.retroScale as number | undefined) ?? 1;
    const up = face === 'py' || face === 'ny';
    let tile: PwTile | null;
    switch (tex) {
      case 'metal':
        tile = scale >= 3 ? g.steel : g.metal;
        break;
      case 'concrete':
      case 'marble':
        tile = g.concrete;
        break;
      case 'stucco':
      case 'wallpaper':
        tile = g.plaster;
        break;
      case 'planks':
      case 'cardboard':
      case 'bark':
        tile = up ? g.woodH : g.wood;
        break;
      case 'cloth':
      case 'fabric':
      case 'carpet':
        tile = g.cloth;
        break;
      case 'hazard':
        tile = g.hazard;
        break;
      case 'grate':
        tile = grateTile(this.atlas, { hex: mat.color.getHex() });
        break;
      case 'corrugated':
        tile = g.corrugated;
        break;
      case 'tiles':
        tile = g.tiles;
        break;
      case 'checker':
        tile = chequerTile(this.atlas, { a: mat.color.getHex(), b: 0x2a2a30 });
        break;
      case 'rock':
        tile = g.rock;
        break;
      case 'hide':
        tile = g.bone;
        break;
      case 'leaves':
      case 'water':
      case 'smoke':
      case 'clouds':
        return null;
      default:
        tile = g.plain;
    }
    // Cylinders (tanks, pipes, posts, pots) wrap round their axis instead of facet by facet.
    const side = face !== 'py' && face !== 'ny';
    if (map === 'local' && side && (m.geometry as THREE.BufferGeometry).type === 'CylinderGeometry') return { tile, map: 'cyl' };
    return { tile, map };
  }

  /** The shared generic tiles (each registered on first use: no unused tile is ever painted). */
  gen(): Record<GenKey, PwTile> {
    if (this.generic) return this.generic as Record<GenKey, PwTile>;
    const a = this.atlas;
    const make: Record<GenKey, () => PwTile> = {
      metal: () => d2MetalTile(a),
      steel: () => d2SteelTile(a),
      concrete: () => d2ConcreteTile(a),
      plaster: () => d2PlasterTile(a),
      wood: () => d2WoodTile(a),
      woodH: () => d2WoodTile(a, true),
      cloth: () => d2ClothTile(a),
      plain: () => d2PlainTile(a),
      bone: () => d2BoneTile(a),
      hazard: () => hazardTile(a, {}),
      corrugated: () => {
        const t = corrugatedTile(a, { hex: NEUTRAL_HEX, rust: 0.6 });
        t.neutral = NEUTRAL_HEX;
        return t;
      },
      tiles: () => {
        const t = tilesTile(a, { hex: NEUTRAL_HEX });
        t.neutral = NEUTRAL_HEX;
        return t;
      },
      rock: () => rubbleTile(a),
    };
    const cache: Partial<Record<GenKey, PwTile>> = {};
    const g = {} as Record<GenKey, PwTile>;
    for (const k of Object.keys(make) as GenKey[]) Object.defineProperty(g, k, { get: () => (cache[k] ??= make[k]()), enumerable: true });
    this.generic = g;
    return g;
  }

  /** Every tile registered in the stage atlas. */
  atlasTiles(): PwTile[] {
    const m = (this.atlas as unknown as { tiles: Map<string, { tile: PwTile }> }).tiles;
    return [...m.values()].map((t) => t.tile);
  }

  /** Paint the atlas and build every painted mesh; hide the classic shells (they stay the occluders). */
  finish() {
    if ([...this.rooms.values()].some((r) => r.sky)) this.skyAtlas.build();
    this.atlas.build();
    // Calm far levels on every tileable surface (no crawling grates / grout / chequer in motion).
    const tiles = this.atlasTiles();
    this.atlas.post((data) => {
      d2CalmLevels(data, tiles);
      // (Captures / bench read the PixelWorld stats from the page: report the calm pass beside the atlases.)
      if (typeof window !== 'undefined') {
        const ws = window as unknown as { __pixelWorld?: Record<string, unknown> };
        ws.__pixelWorld = { ...(ws.__pixelWorld ?? {}), 'd2-calm': { w: 0, h: 0, tiles: 0, bytes: 0, ms: D2_LEVEL_STATS.ms, texels: 0, cached: D2_LEVEL_STATS.ms === 0 } };
      }
    });
    const main = pwMaterial(this.atlas, { gain: this.gain });
    // Tileable surfaces (floors, walls, ceilings) switch to their calm levels a step sooner:
    // level texels 1–2 pixels (the cast's own chunkiness), nothing crawls in motion.
    const surf = pwMaterial(this.atlas, { gain: this.gain, bias: D2_SURF_BIAS, tag: 'surf' });
    const floor = pwMaterial(this.atlas, { gain: this.gain, bias: D2_FLOOR_BIAS, tag: 'floor' });
    const card = pwMaterial(this.atlas, { gain: this.gain, side: THREE.DoubleSide, tag: 'card' });
    this.mats.set('surf', surf);
    this.mats.set('floor', floor);
    const sky = pwMaterial(this.skyAtlas, { fog: false, tag: 'sky' });
    this.mats.set('main', main);
    this.mats.set('card', card);
    this.mats.set('sky', sky);
    for (const [id, r] of this.rooms) {
      if (!r.root) continue;
      const m = r.main.build(main);
      if (m) {
        m.name = `pw:d2:${id}`;
        splitSurfaces(m, main, surf, floor);
        r.root.add(m);
      }
      const c = r.card.build(card);
      if (c) {
        c.name = `pw:d2:${id}:cards`;
        r.root.add(c);
      }
      const s = r.sky?.build(sky);
      if (s) {
        s.name = `pw:d2:${id}:sky`;
        r.root.add(s);
      }
    }
    for (const d of this.dyn) {
      const m = d.batch.build(d.card ? card : main);
      if (!m) continue;
      m.matrixAutoUpdate = true;
      d.parent.add(m);
      d.onMesh?.(m);
    }
    // The classic shells: still the bullet-stoppers, no longer drawn.
    for (const s of this.shells) for (const c of s.children) c.visible = false;
  }
}

export { emitMesh };

/** Level bias of the tileable walls / ceilings (the modules keep the toolkit's 0.5: letters stay sharp). */
export const D2_SURF_BIAS = 1.0;
/** Level bias of the tileable FLOORS (right under the moving camera: level texels 1.4–2.8 pixels, the cast's own chunkiness). */
export const D2_FLOOR_BIAS = 1.5;

/**
 * One painted room mesh, up to three draws: its triangles re-ordered into
 * modules (signs, posters, doors: `mods`), tileable walls / ceilings (`surf`)
 * and tileable floors (`floor`), as geometry groups.
 */
function splitSurfaces(m: THREE.Mesh, mods: THREE.Material, surf: THREE.Material, floor: THREE.Material) {
  const g = m.geometry;
  const idx = g.index!;
  const rect = g.getAttribute('pwRect');
  const pos = g.getAttribute('position');
  const A: number[] = [];
  const B: number[] = [];
  const C: number[] = [];
  const pa = new THREE.Vector3();
  const pb = new THREE.Vector3();
  const pc = new THREE.Vector3();
  for (let t = 0; t < idx.count; t += 3) {
    const a = idx.getX(t);
    const b = idx.getX(t + 1);
    const c = idx.getX(t + 2);
    if (rect.getZ(a) <= 0) {
      A.push(a, b, c);
      continue;
    }
    // Up-facing (world) tileable triangles are floors.
    pa.fromBufferAttribute(pos, a);
    pb.fromBufferAttribute(pos, b).sub(pa);
    pc.fromBufferAttribute(pos, c).sub(pa);
    const n = pb.cross(pc);
    (n.y > 0.7 * n.length() ? C : B).push(a, b, c);
  }
  const groups = [A, B, C];
  const mats = [mods, surf, floor];
  const used = groups.map((x, i) => [x, mats[i]] as const).filter(([x]) => x.length);
  if (used.length === 1) {
    m.material = used[0][1];
    return;
  }
  const all = ([] as number[]).concat(...used.map(([x]) => x));
  g.setIndex(pos.count > 65535 ? new THREE.Uint32BufferAttribute(all, 1) : new THREE.Uint16BufferAttribute(all, 1));
  g.clearGroups();
  let start = 0;
  used.forEach(([x], i) => {
    g.addGroup(start, x.length, i);
    start += x.length;
  });
  m.material = used.map(([, mt]) => mt);
}
