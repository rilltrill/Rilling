import * as THREE from 'three';
import type { TexName } from '../../kit/Textures';
import { PwAtlas, type PwTile } from '../../pixelworld/atlas';
import { PwBatch } from '../../pixelworld/batch';
import { PW_TPM, PW_TPM_MID } from '../../pixelworld/canvas';
import { pwMaterial, pwTick } from '../../pixelworld/material';
import { d2CalmLevels } from '../../pixelworld/d2levels';
import { z2VentModule } from '../../pixelworld/z2objects';
import { Z2_PUDDLE_FRAMES, z2PoolMesh, z2PoolTexture } from '../../pixelworld/z2bay';
import { hash2 } from '../../pixelworld/surfaces';
import { troffer } from '../../pixelworld/z2modules';
import { Z2Billboards } from '../../pixelworld/z2billboard';
import type { Ambulance } from './props';
import { PwBackdrop } from '../../pixelworld/backdrop';
import { z2CityTile, z2RoofsTile, z2SkyDome, z2StormSkyTile } from '../../pixelworld/z2sky';
import { emitMesh, pieceKind, X, Z, NZ, ZONE_DECAL0, ZONE_FLOOR, Z2Registry, type Job, type Pick, type Piece } from './pwCore';
import { paintAmbulance, registerBay } from './pwBay';
import { registerShell, roomGlimpse, scatter, z2InClinic, z2TrofferRect } from './pwShell';
import { z2ClinicTroffer, Z2_TROFFER_BODY } from '../../pixelworld/z2clinicCeiling';
import { paintDoor, paintTank, registerProps, registerPropsLast } from './pwProps';
import { paintWall, registerBasement } from './pwBasement';
import { paintShafts, registerAtrium } from './pwAtrium';

/**
 * ST. MERCY HOSPITAL in ART: PIXEL WORLD.
 *
 * Every zone is converted BEFORE z2's colour baker runs (`convertZone`), and
 * every `bakeInto` set piece (curtains, drawers, pendant lamps, the crashing
 * ambulance…) before its own bake (`convertInto`): what PixelWorld paints is
 * re-emitted into one PwBatch per zone / set piece (one draw call, culled with
 * its group) and removed; the baker only merges what stays classic (glows,
 * glass). Gameplay never sees it: occluders, ground, door slots, drawers,
 * vents and destructibles are the stage's own, built from the same RNG draws
 * in every ART style (the builders only RECORD what painting replaces).
 *
 * This file is the converter itself: jobs, the walk over a zone, the generic
 * re-texture, materials and the build. WHAT is painted lives in the parts —
 * pwBay (the ambulance bay), pwShell (the clinical floor's walls, floors,
 * ceilings, signs and decals), pwProps (furniture and props of the whole
 * stage), pwBasement (stairwell, morgue, service corridors, theatre), pwAtrium
 * (the boss arena) — which sign up to the registry (pwCore.ts): tag handlers,
 * tile rules by material and zone, mesh emitters, zone hooks.
 */

const REG = new Z2Registry();
// Tile rules are asked in this order (a zone's own surfaces before the generic materials).
registerBay(REG);
registerAtrium(REG);
registerBasement(REG);
registerShell(REG);
registerProps(REG);
registerPropsLast(REG);

const _m = new THREE.Matrix4();
const _o = new THREE.Vector3();
const _rel = new THREE.Matrix4();
const _inv = new THREE.Matrix4();
const _box = new THREE.Box3();

/** ST. MERCY HOSPITAL's PIXEL WORLD converter (one per stage build). */
export class Z2PixelWorld {
  readonly atlas = new PwAtlas('z2');
  readonly skyAtlas = new PwAtlas('z2-sky', { levels: 1 });
  readonly jobs: Job[] = [];
  private cache = new Map<string, Pick | null>();
  /** Flicker diffusers / vent grates painted after the atlas is built. */
  private dynFlickers: { mesh: THREE.Mesh; warm: boolean }[] = [];
  private dynGrates: THREE.Mesh[] = [];
  /** The animated puddles' material (its clock advances in `tick`). */
  private animMat: THREE.Material | null = null;
  /** Decal counter (staggers coplanar decal offsets). */
  nDecal = 0;
  /** Billboards of the group being converted. */
  bills = new Z2Billboards();
  /** The job being converted. */
  job: Job | null = null;
  /**
   * Modules whose far levels are re-made calm with the tileable surfaces' (wall panels: a painted
   * field of small tiles reduces to speckle otherwise). Whole levels only: sizes in multiples of 32.
   */
  readonly calm = new Set<PwTile>();

  // ─── Zones ────────────────────────────────────────────────────────────────

  /** Re-paint a zone's static scenery (call before `bake(g)`). */
  convertZone(g: THREE.Group) {
    const b = new PwBatch(this.atlas);
    this.bills = new Z2Billboards();
    // (The boss arena is on screen longest and its lights are low: its paint a step brighter.)
    const floor = ZONE_FLOOR[g.name] ?? 0;
    this.job = { parent: g, batch: b, bills: this.bills, anim: null, pools: [], gain: g.name === 'atrium' ? 1.3 : 1, floor: g.name.startsWith('bay') ? undefined : floor, zone: g.name };
    this.jobs.push(this.job);
    this.nDecal = ZONE_DECAL0[g.name] ?? this.nDecal;
    g.updateMatrixWorld(true);
    const pieces: Piece[] = [];
    for (const h of REG.preps.get(g.name) ?? []) h(this, b, g);
    this.handleTagged(g, b);
    this.emitAll(g, b, floor, true, pieces);
    (REG.scatters.get(g.name) ?? scatter)(this, b, pieces, g.name, floor);
    for (const h of REG.dresses.get(g.name) ?? []) h(this, b, g);
  }

  /** The animated batch of the job being converted (made on demand). */
  animOf(): PwBatch {
    const j = this.job!;
    if (!j.anim) j.anim = new PwBatch(this.atlas);
    return j.anim;
  }

  /** The moonlight shafts under the skylight (pwAtrium). */
  paintShafts(g: THREE.Object3D) {
    paintShafts(g);
  }

  /** `bakeInto` hook: re-paint a set piece's meshes into a batch in its parent's frame (call before its bake). */
  convertInto(g: THREE.Group, parent: THREE.Object3D) {
    const b = new PwBatch(this.atlas);
    this.bills = new Z2Billboards();
    this.job = { parent, batch: b, bills: this.bills, anim: null, pools: [], zone: '' };
    this.jobs.push(this.job);
    g.updateMatrixWorld(true);
    for (const h of REG.intos) h(this, g, b);
    this.handleTagged(g, b);
    this.emitAll(g, b, 0, false, null);
  }

  /** Register the dynamic panels / grates (their painted look is set in `finish`) and the tiles of what is painted after the build. */
  registerDynamic(flickers: { mesh: THREE.Mesh }[], grates: THREE.Object3D[], doorColors: number[] = []) {
    for (const h of REG.prebuilds) h.fn(this, { doorColors });
    for (const f of flickers) this.dynFlickers.push({ mesh: f.mesh, warm: (f.mesh.material as THREE.MeshBasicMaterial).color?.getHex?.() === 0xfff1d0 });
    for (const g of grates) this.dynGrates.push(g as THREE.Mesh);
  }

  /** Paint the atlas and build every batch (each mesh joins the group it was made for). */
  finish(gain = 1, flickers?: { mesh: THREE.Mesh; on: THREE.Material; off: THREE.Material }[]) {
    this.atlas.build();
    const tiles = this.atlasTiles();
    // Calm far levels on the tileable surfaces (grout, chequer, bricks collapse into their mid-tone
    // instead of crawling into dashes), and signs kept at level 0 a step longer (letters stay whole).
    const calm = [...tiles, ...[...this.calm].map((t) => ({ ...t, wrap: true }))];
    this.atlas.post((data) => d2CalmLevels(data, calm));
    // Which draw group each tile's triangles join (by the tile's place in the atlas).
    const groups = new Map<number, number>();
    for (const t of tiles) groups.set(t.x * 65536 + t.y, z2TileGroup(t));
    let anim: THREE.Material | null = null;
    let poolTex: THREE.Texture | null = null;
    for (const j of this.jobs) {
      const jg = gain * (j.gain ?? 1);
      const mods = pwMaterial(this.atlas, { gain: jg });
      const surf = pwMaterial(this.atlas, { gain: jg, bias: Z2_SURF_BIAS, tag: 'surf' });
      const sign = pwMaterial(this.atlas, { gain: jg, bias: Z2_SIGN_BIAS, tag: 'sign' });
      const mesh = j.batch.build(mods);
      if (mesh) {
        splitMaterials(mesh, mods, surf, sign, groups);
        j.parent.add(mesh);
      }
      const bm = j.bills.build(this.atlas, jg);
      if (bm) j.parent.add(bm);
      if (j.anim) {
        anim ??= pwMaterial(this.atlas, { gain, anim: { frames: Z2_PUDDLE_FRAMES, fps: 7 }, tag: 'puddle' });
        const am = j.anim.build(anim);
        if (am) j.parent.add(am);
      }
      if (j.pools.length) {
        poolTex ??= z2PoolTexture();
        j.parent.add(z2PoolMesh(poolTex, j.pools));
      }
    }
    this.animMat = anim;
    this.jobs.length = 0;
    // Flickering troffers: one painted quad geometry (mesh-local), lit / unlit by material.
    if (flickers?.length) {
      const on = pwMaterial(this.atlas, { gain });
      const off = pwMaterial(this.atlas, { gain, glow: 0.1, tag: 'off' });
      const geo = (t: PwTile) => {
        const b = new PwBatch(this.atlas);
        b.rect(_o.set(-0.345, -0.016, -0.625), X, Z, 22 / PW_TPM, 40 / PW_TPM, t);
        return b.build()!.geometry;
      };
      const gOn = geo(troffer(this.atlas, 'on'));
      const gWarm = geo(troffer(this.atlas, 'warm'));
      const body = { x: Z2_TROFFER_BODY.x, y: Z2_TROFFER_BODY.y, w: Z2_TROFFER_BODY.w, h: Z2_TROFFER_BODY.h };
      for (const f of flickers) {
        const warm = this.dynFlickers.find((d) => d.mesh === f.mesh)?.warm ?? false;
        const lit = f.mesh.material === f.on;
        f.mesh.updateWorldMatrix(true, false);
        _o.setFromMatrixPosition(f.mesh.matrixWorld);
        if (z2InClinic(_o.x, _o.y, _o.z)) {
          // The clinical floor's fittings sit in the ceiling grid: the diffuser shows the repainted fitting's
          // body (no light on the boards round it: it comes and goes), where its cells are — or, on a panel
          // hanging by its wires, where the panel is.
          const t = z2ClinicTroffer(this.atlas, warm ? 'warm' : 'on', 0x7a827c);
          const b = new PwBatch(this.atlas);
          const e = f.mesh.matrixWorld.elements;
          if (Math.abs(e[5]) > 0.99) {
            const r = z2TrofferRect({ x: _o.x, y: _o.y - 0.016, z: _o.z, alongX: Math.abs(e[8]) > 0.7 }, 'body');
            b.setMatrix(_inv.copy(f.mesh.matrixWorld).invert());
            b.rect(r.o, r.ux, r.vy, r.w, r.h, t, { sub: body });
            b.setMatrix(null);
          } else b.rect(_o.set(-body.w / 128, -0.016, -body.h / 128), X, Z, body.w / 64, body.h / 64, t, { sub: body });
          f.mesh.geometry = b.build()!.geometry;
        } else f.mesh.geometry = warm ? gWarm : gOn;
        f.on = on;
        f.off = off;
        f.mesh.material = lit ? on : off;
        f.mesh.raycast = () => {};
      }
    }
    // Vent grates: a painted louvre quad seen from below and above (they tumble when they drop).
    if (this.dynGrates.length) {
      const b = new PwBatch(this.atlas);
      const t = z2VentModule(this.atlas, 0x9aa09c);
      b.rect(_o.set(-0.35, -0.016, -0.35), X, Z, 0.7, 0.7, t);
      b.rect(_o.set(-0.35, 0.016, 0.35), X, NZ, 0.7, 0.7, t);
      const geo = b.build()!.geometry;
      const mat = pwMaterial(this.atlas, { gain });
      for (const m of this.dynGrates) {
        m.geometry = geo;
        m.material = mat;
      }
    }
  }

  /** Every tile registered in the stage atlas. */
  private atlasTiles(): PwTile[] {
    const m = (this.atlas as unknown as { tiles: Map<string, { tile: PwTile }> }).tiles;
    return [...m.values()].map((t) => t.tile);
  }

  /** Advance the animated puddles (every frame; allocation-free). */
  tick(dt: number) {
    if (this.animMat) pwTick(this.animMat, dt);
  }

  // ─── Painted in place after the build (pwProps / pwBasement / pwBay) ─────

  /** A breakable door re-painted in place (same triangles: same hit boxes). */
  paintDoor(root: THREE.Object3D, w: number, h: number, color: number, ox = 0, oy = 0) {
    paintDoor(this, root, w, h, color, ox, oy);
  }

  /** A gas / oxygen cylinder painted on its own triangles. */
  paintTank(root: THREE.Object3D, kind: 'gas' | 'oxygen') {
    paintTank(this, root, kind);
  }

  /** The boiler wall's blocks. */
  paintWall(w: { pieces: THREE.Mesh[] } | null) {
    paintWall(this, w);
  }

  /** The crashing ambulance (dynamic): body and doors painted into batches that ride with them. */
  paintAmbulance(amb: Ambulance) {
    paintAmbulance(this, amb);
  }

  // ─── Sky ──────────────────────────────────────────────────────────────────

  backdrop: PwBackdrop | null = null;
  private dome: THREE.Group | null = null;

  /**
   * The painted storm night over the bay: a sphere band of storm clouds up to
   * 50° (capped by the overcast deck's top row: the camera looks up at the
   * hospital), the far city (fires, smoke into the cloud base) and a nearer
   * roof layer drifting against it.
   */
  buildBackdrop(fog: number): THREE.Group {
    const s = this.skyAtlas;
    const sky = z2StormSkyTile(s, { fog, el0: -3, el1: 50 });
    const city = z2CityTile(s, { hex: 0x141a24, fog, el0: -2, el1: 9 });
    const roofs = z2RoofsTile(s, { hex: 0x0c1016, fog, el0: -2, el1: 6 });
    this.backdrop = new PwBackdrop(s, null, [
      { tile: city, radius: 300, el0: -2, el1: 9, repeat: 2, follow: 1 },
      { tile: roofs, radius: 240, el0: -2, el1: 6, repeat: 2, yaw: 33, follow: 0.9 },
    ]);
    this.backdrop.anchor.set(0, 0, -10);
    const g = this.backdrop.build();
    // The dome shares the layers' (unlit) material: the lightning gain lights all of it.
    const mat = (g.children[0] as THREE.Mesh).material as THREE.Material;
    this.dome = z2SkyDome(sky, mat, { radius: 330, el0: -3, el1: 50, repeat: 2 });
    g.add(this.dome);
    return g;
  }

  /** Follow the camera (every frame; allocation-free). */
  updateSky(cam: THREE.Vector3) {
    this.backdrop?.update(cam);
    this.dome?.position.set(cam.x, 0, cam.z);
  }

  /** Lightning lights the painted clouds (0 = none). Allocation-free. */
  lightning(k: number) {
    const g = this.backdrop?.group.children[0] as THREE.Mesh | undefined;
    const u = (g?.material as THREE.Material | undefined)?.userData.pw as { uPwGain: { value: number }; uPwGlow: { value: number } } | undefined;
    if (u) {
      u.uPwGain.value = 1 + k * 0.6;
      u.uPwGlow.value = 1 + k * 0.3;
    }
  }

  // ─── Tagged objects (signs, fixtures, blood, papers, windows…) ───────────

  private handleTagged(root: THREE.Object3D, b: PwBatch) {
    root.updateMatrixWorld(true);
    _inv.copy(root.matrixWorld).invert();
    const tagged: THREE.Object3D[] = [];
    root.traverse((o) => {
      if (o !== root && o.userData.pw) tagged.push(o);
    });
    const attached = (o: THREE.Object3D) => {
      let p: THREE.Object3D | null = o;
      while (p && p !== root) p = p.parent;
      return p === root;
    };
    for (const o of tagged) {
      if (!attached(o)) continue;
      _rel.multiplyMatrices(_inv, o.matrixWorld);
      const drop = this.handle(o, b, _rel.clone(), root);
      if (drop) o.parent?.remove(o);
    }
  }

  /** Paint what a tagged object stands for (the parts' handlers, by kind); returns true when the classic object goes. */
  private handle(o: THREE.Object3D, b: PwBatch, m: THREE.Matrix4, root: THREE.Object3D): boolean {
    const info = o.userData.pw as Record<string, unknown> & { kind: string };
    const list = REG.tags.get(info.kind);
    if (!list) return false;
    const hsh = hash2(Math.round(m.elements[12] * 7), Math.round(m.elements[14] * 7), 5);
    const c = { pw: this, o, b, m, inv: _inv, info, hsh, root };
    for (const h of list) {
      const r = h(c);
      if (r !== undefined) return r;
    }
    return false;
  }

  // ─── Generic re-texture ───────────────────────────────────────────────────

  /** Move every repaintable static mesh under `root` into `b` (in root's frame) and remove it. */
  emitAll(root: THREE.Object3D, b: PwBatch, floorY: number, world: boolean, pieces: Piece[] | null) {
    const list: THREE.Mesh[] = [];
    root.updateMatrixWorld(true);
    root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh || (m as THREE.InstancedMesh).isInstancedMesh || Array.isArray(m.material) || m.userData.noMerge || m.userData.pixelWorld) return;
      // Subtrees that opted out of baking stay as they are (animated parts).
      let p: THREE.Object3D | null = m.parent;
      while (p && p !== root) {
        if (p.userData.noMerge) return;
        p = p.parent;
      }
      if (!this.repaintable(m.material)) return;
      list.push(m);
    });
    _m.copy(root.matrixWorld).invert();
    const rel = new THREE.Matrix4();
    const zone = pieces ? (this.job?.zone ?? '') : '';
    for (const m of list) {
      const mat = m.material as THREE.MeshLambertMaterial;
      rel.multiplyMatrices(_m, m.matrixWorld);
      const flip = mat.side === THREE.BackSide;
      const both = mat.side === THREE.DoubleSide;
      const pick = (nx: number, ny: number, nz: number) => this.rule(mat, nx, ny, nz, zone);
      // Meshes a part emits its own way (round things painted round, the fountain's coping…).
      const mc = { pw: this, b, mesh: m, mat, rel, pick, world, floorY, zone };
      if (REG.meshes.some((em) => em(mc))) {
        m.parent?.remove(m);
        continue;
      }
      emitMesh(b, m.geometry, rel, pick, { world, flip, floorY });
      if (both) emitMesh(b, m.geometry, rel, pick, { world, flip: true, floorY });
      if (flip && m.geometry.type === 'BoxGeometry' && pieces) roomGlimpse(this, b, m, rel, mat);
      if (pieces && m.parent === root && m.geometry.type === 'BoxGeometry') {
        const kind = pieceKind(mat);
        if (kind) {
          if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
          pieces.push({ box: _box.copy(m.geometry.boundingBox!).applyMatrix4(rel).clone(), kind, hex: mat.color.getHex() });
        }
      }
      m.parent?.remove(m);
    }
  }
  private repaintable(m: THREE.Material): boolean {
    if (m.transparent || m.userData.pixelWorld) return false;
    const l = m as THREE.MeshLambertMaterial;
    if (!l.isMeshLambertMaterial) return false;
    if (l.vertexColors || l.map) return false;
    if (l.emissive && l.emissive.getHex() !== 0) return false;
    // Bullet occluders are invisible proxies (never repainted, never removed).
    if (l.color.getHex() === 0xff00ff) return false;
    return true;
  }

  /** The painted tile (and tint) for a Kit material on a face with world normal n, in a zone. */
  rule(mat: THREE.MeshLambertMaterial, _nx: number, ny: number, _nz: number, zone = ''): Pick | null {
    const tex = mat.userData.retroTex as TexName | undefined;
    const hex = mat.color.getHex();
    const face = ny > 0.7 ? 'up' : ny < -0.7 ? 'down' : 'side';
    const key = `${zone}|${tex}|${mat.userData.retroScale ?? ''}|${mat.userData.retroStrength ?? ''}|${hex}|${face}`;
    let p = this.cache.get(key);
    if (p === undefined) {
      p = this.pickFor(tex, `${tex}|${mat.userData.retroScale}|${mat.userData.retroStrength}`, hex, face, zone);
      this.cache.set(key, p);
    }
    return p;
  }

  /** The parts' tile rules, asked in registration order (the generic materials answer last). */
  pickFor(tex: TexName | undefined, preset: string, hex: number, face: 'up' | 'down' | 'side', zone = ''): Pick | null {
    const q = { tex, preset, hex, face, zone };
    for (const r of REG.picks) {
      const p = r(this, q);
      if (p !== undefined) return p;
    }
    return null;
  }
}

/** Level bias of the tileable surfaces: their calm levels a step sooner (nothing crawls in motion). */
const Z2_SURF_BIAS = 1.0;
/** Level bias of signs: level 0 a little longer (letters stay whole at a distance). */
const Z2_SIGN_BIAS = -0.25;

/**
 * The draw group of a tile's triangles: 0 = the default level bias (modules, and surfaces painted
 * at their viewing density), 1 = the first pass's tileable surfaces (`Z2_SURF_BIAS`: their calm
 * levels a step sooner), 2 = signs (`Z2_SIGN_BIAS`).
 *
 * A wrap tile painted natively (`PW_TPM_MID` texels a metre or more: docs/PIXELWORLD2.md §3) is
 * drawn at the default bias: its texels are already one frame pixel where the player looks, and a
 * level sooner would draw them twice as fat as painted. Only what is still first-pass paint (below
 * `PW_TPM_MID`, shown through the 2× fallback) keeps the old bias.
 */
export function z2TileGroup(t: { key: string; wrap: boolean; density: number }): 0 | 1 | 2 {
  if (/^z2(lit|plate|exit|stencil|road)\|/.test(t.key)) return 2;
  return t.wrap && t.density < PW_TPM_MID ? 1 : 0;
}

/**
 * One painted zone mesh, up to three draws: its triangles re-ordered into
 * the default group (`mods`), first-pass tileable surfaces (`surf`) and signs
 * (`sign`) — `groups`: `z2TileGroup` by atlas place — as geometry groups.
 */
function splitMaterials(m: THREE.Mesh, mods: THREE.Material, surf: THREE.Material, sign: THREE.Material, groups: Map<number, number>) {
  const g = m.geometry;
  const idx = g.index!;
  const rect = g.getAttribute('pwRect');
  const parts: number[][] = [[], [], []];
  for (let t = 0; t < idx.count; t += 3) {
    const v = idx.getX(t);
    const k = groups.get(rect.getX(v) * 65536 + rect.getY(v)) ?? 0;
    parts[k].push(v, idx.getX(t + 1), idx.getX(t + 2));
  }
  const mats = [mods, surf, sign];
  const used = [0, 1, 2].filter((k) => parts[k].length);
  if (used.length === 1) {
    m.material = mats[used[0]];
    return;
  }
  const all = used.flatMap((k) => parts[k]);
  g.setIndex(g.getAttribute('position').count > 65535 ? new THREE.Uint32BufferAttribute(all, 1) : new THREE.Uint16BufferAttribute(all, 1));
  g.clearGroups();
  let start = 0;
  used.forEach((k, gi) => {
    g.addGroup(start, parts[k].length, gi);
    start += parts[k].length;
  });
  m.material = used.map((k) => mats[k]);
}
