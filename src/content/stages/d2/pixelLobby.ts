import * as THREE from 'three';
import { ROOMS, railXAtZ } from './layout';
import { ROOM_CONVERTERS, type D2PixelWorld, type RoomParts } from './pixel';
import { dropMeshes, emitMesh, paintGroup, relativeMatrix, type Paint } from './pixelMesh';
import { centreOf, hexOf, matIs, NZ, paintDoor, voidPaint, paintRailings, paintSigns, paintWallTexts, roomRule, texOf, wallFace, X, Y, Z } from './pixelShared';
import type { BurstDoor, SkeletonDisplay } from './setpieces';
import {
  bloodDragTile, columnTile, cofferTile, deskFrontTile, emblemMosaic, fasciaTile, friezeTile, galleryDoorTile, graniteTile, lobbyFloorTile, muralTile, nightSkyPlaneTile,
  clerestoryTile, moonTile, paperTile, pillarBannerTile, plaqueTile, posterTile, vineCurtainTile, wainscotTile, welcomeBannerTile,
} from '../../pixelworld/d2lobby';
import { bloodDecal, gougeDecal, pocksDecal } from '../../pixelworld/d2decals';
import { lobbyAshlarTile, pilasterTile, waterStreakTile } from '../../pixelworld/d2walls';
import { crtScreenTile } from '../../pixelworld/d2lab';
import { stoneTile } from '../../pixelworld/surfaces';
import { terrazzoTile } from '../../pixelworld/interior';
import { tintFor } from '../../pixelworld/batch';
import { hash2 } from '../../pixelworld/surfaces';
import { SKULL_BACK, SKULL_PROFILE, SKULL_TOP, skullBackTile, skullProfileTile, skullTopTile } from '../../pixelworld/d2skull';

/**
 * The visitor-centre LOBBY in PIXEL WORLD (see pixel.ts for the scheme).
 */

const _o = new THREE.Vector3();
const _v = new THREE.Vector3();

function convertLobby(pw: D2PixelWorld, parts: RoomParts) {
  const R = ROOMS.lobby;
  const a = pw.atlas;
  const b = pw.main('lobby');
  const cards = pw.card('lobby');
  const g = pw.gen();
  const { stat, shell } = parts;

  const floor = lobbyFloorTile(a);
  const coffer = cofferTile(a);
  const wains = wainscotTile(a);
  const column = columnTile(a);
  const fascia = fasciaTile(a);
  const frieze = friezeTile(a);
  const granite = graniteTile(a);
  const capStone = stoneTile(a, { hex: 0xb0a48e });
  const terrazzo = terrazzoTile(a, { hex: 0xc8c0b0, chips: [0x5a4a3a, 0xe8e0d0, 0xa05a30] });
  const deskLong = deskFrontTile(a, true);
  const deskShort = deskFrontTile(a, false);
  const mural = muralTile(a);
  const drag = bloodDragTile(a);
  const ashlar = lobbyAshlarTile(a);

  // ── Shell: stucco walls (world-projected plaster in the wall's colour), coffered timber ceiling ──
  pw.copyShell(shell, b, (m, _face, _col, wface) => {
    if (texOf(m) === 'planks') {
      if (wface === 'ny') return { tile: coffer, map: 'world' };
      if (wface === 'py') return null;
      return { tile: g.woodH, map: 'world', tint: 0x4a3a2c };
    }
    // Rusticated sandstone ashlar (NEUTRAL: tinted to the render colour).
    return { tile: ashlar, map: 'world' };
  });

  // ── Replaced dressing ──
  dropMeshes(stat, (m) => {
    const t = m.userData.pw;
    return t === 'emblem' || t === 'muralBit' || t === 'sky' || t === 'pillarBanner' || t === 'deskSign' || t === 'smear';
  });
  // The INFORMATION letters (painted into the desk front).
  paintWallTexts(pw, stat, b, { skip: (s) => s === 'INFORMATION' });
  paintSigns(pw, stat, b);
  paintRailings(pw, stat, cards);

  // Posters: the framed print replaces the frame + block-silhouette boxes.
  const posters: THREE.Object3D[] = [];
  stat.traverse((o) => {
    if (o.userData.pw === 'poster') posters.push(o);
  });
  posters.forEach((p, i) => {
    dropMeshes(p, () => true);
    p.updateMatrixWorld(true);
    const t = posterTile(a, p.userData.pwPoster as number, i);
    b.withMatrix(p.matrixWorld, () => b.rect(_o.set(-0.8, -1.05, 0.0), X, Y, 1.6, 2.1, t));
  });

  // ── Static dressing by tag ──
  const rule = roomRule(pw, (m, face, tag, wface): Paint | null | undefined => {
    switch (tag) {
      case 'wainscot':
        return wallFace(face) ? { tile: wains, map: 'world' } : { tile: g.woodH, map: 'local', tint: 0x6a4428 };
      case 'dado':
      case 'cornice':
        return { tile: g.woodH, map: 'world', tint: 0x3e2a1a };
      case 'mural':
        return face === 'pz' ? { tile: mural, map: 'fit' } : { tile: g.plaster, map: 'local' };
      case 'balcony':
        return { tile: g.plaster, map: 'world' };
      case 'fascia':
        return face === 'px' || face === 'nx' ? { tile: fascia, map: 'world', v0: -4.55 * 32 } : { tile: g.woodH, map: 'local', tint: 0x6a4428 };
      case 'pillar':
        return wallFace(face) ? { tile: column, map: 'cyl' } : { tile: capStone, map: 'local' };
      case 'pillarBase':
        return { tile: granite, map: 'local' };
      case 'pillarCap':
        return { tile: capStone, map: 'local' };
      case 'gallery': {
        const into = centreOf(m).x < 0 ? 'px' : 'nx';
        return face === into ? { tile: galleryDoorTile(a, Math.round(centreOf(m).z) % 2 ? 1 : 0), map: 'fit' } : { tile: g.plain, map: 'local', tint: 0x101014 };
      }
      case 'skyGrid':
        return { tile: g.metal, map: 'local' };
      case 'desk':
        return face === 'nx' ? { tile: deskLong, map: 'fit' } : { tile: g.wood, map: 'local' };
      case 'deskReturn':
        return face === 'pz' ? { tile: deskShort, map: 'fit' } : { tile: g.wood, map: 'local' };
      case 'deskTop':
        return { tile: terrazzo, map: 'world' };
      case 'paper': {
        const c = centreOf(m);
        return { tile: paperTile(a, Math.floor(hash2(Math.round(c.x * 10), Math.round(c.z * 10), 3) * 3)), map: 'fit' };
      }
      case 'bloodDrag':
        return { tile: drag, map: 'fit' };
      case 'void':
        return voidPaint(pw, m, wface, 0);
    }
    // The floor (polished tiles material).
    if (matIs(m, 0x948a7a, 'tiles')) return wface === 'py' ? { tile: floor, map: 'world' } : null;
    return undefined;
  });
  paintGroup(stat, b, rule, { move: true });

  // ── Hand-placed paint ──
  // The emblem mosaic where the classic discs were.
  const em = new THREE.Vector3(1.4, 0, -19);
  b.rect(_o.set(em.x - 3.5, 0.012, em.z + 3.5), X, NZ, 7, 7, emblemMosaic(a));
  // Frieze band high on the side walls and the far wall.
  const fy = 13.4;
  b.rect(_o.set(R.x0 + 0.22, fy, R.z0), NZ, Y, R.z0 - R.z1, 0.75, frieze, { u0: 0, v0: 0 });
  b.rect(_o.set(R.x1 - 0.22, fy, R.z1), Z, Y, R.z0 - R.z1, 0.75, frieze, { u0: 0, v0: 0 });
  b.rect(_o.set(R.x0, fy, R.z1 + 0.22), X, Y, R.x1 - R.x0, 0.75, frieze, { u0: 0, v0: 0 });
  // Arched clerestory windows high on the side walls (the night jungle beyond).
  for (const side of [-1, 1]) {
    const x = side < 0 ? R.x0 + 0.215 : R.x1 - 0.215;
    [2, -10, -22, -34, -46].forEach((z, i) => {
      const zz = z - 6 + (side < 0 ? 1 : -1);
      b.rect(_o.set(x, 8.4, zz), side < 0 ? NZ : Z, Y, 2, 4, clerestoryTile(a, (i + (side > 0 ? 1 : 0)) % 2));
    });
  }
  // Pilasters on the column lines (balcony to frieze), water run down from the skylight's gutters.
  const pil = pilasterTile(a);
  const wallHex = 0x9a8a74;
  for (const side of [-1, 1]) {
    const x = side < 0 ? R.x0 + 0.21 : R.x1 - 0.21;
    const ux = side < 0 ? NZ : Z;
    for (const z of [2, -10, -22, -34, -46]) {
      b.rect(_o.set(x, 5.35, z + (side < 0 ? 0.5 : -0.5)), ux, Y, 1, 8.05, pil, { u0: 0, v0: 5.35 * 32, tintRGB: tintFor(pil, wallHex) });
    }
    const streaks = side < 0 ? [-8, -32] : [-12, -44];
    streaks.forEach((z, i) => {
      b.rect(_o.set(x + (side < 0 ? 0.004 : -0.004), 10.4, z + (side < 0 ? 0.5 : -0.5)), ux, Y, 1, 3, waterStreakTile(a, i + (side > 0 ? 1 : 0)));
    });
  }
  // Pillar banners (two-sided cards facing the hall).
  for (const side of [-1, 1]) {
    const xe = side * 11;
    for (const z of [2, -10, -22, -34, -46]) {
      const variant = (z / 12) % 2 === 0 ? 0 : 1;
      const x = xe - side * 0.52;
      const t = pillarBannerTile(a, variant);
      const ux = side < 0 ? NZ : Z;
      cards.rect(_o.set(x, 8.2 - 1.75, z + (side < 0 ? 0.5 : -0.5)), ux, Y, 1.0, 3.5, t);
    }
  }
  // Ivy hanging off the balcony fascia (breaks the long straight edge).
  const vines: [number, number, number][] = [
    [-1, 1.5, 0],
    [-1, -13.5, 1],
    [-1, -30, 0],
    [-1, -45, 1],
    [1, -5.5, 1],
    [1, -21, 0],
    [1, -39.5, 1],
  ];
  for (const [side, z, v] of vines) {
    const x = side * 11 - side * 0.14;
    const ux = side < 0 ? NZ : Z;
    cards.rect(_o.set(x, 5.2 - 1.6, z + (side < 0 ? 1 : -1)), ux, Y, 2, 1.6, vineCurtainTile(a, v));
  }
  // The night sky over the skylight: a plane far overhead (unlit; lightning brightens it).
  const sky = pw.sky('lobby');
  sky.rect(_o.set(-40, R.h + 22, -75), X, Z, 80, 95, nightSkyPlaneTile(pw.skyAtlas), { u0: 0, v0: 0 });
  sky.rect(_o.set(-9, R.h + 21.9, -22), X, Z, 7, 7, moonTile(pw.skyAtlas));
  // Story on the walls: claw gouges by the staff door, blood, pocks round the desk.
  const wall = 0x9a8a74;
  const gouge = gougeDecal(a, 0);
  b.rect(_o.set(R.x1 - 0.215, 1.0, -31.5), Z, Y, 1.5, 1.0, gouge, { tintRGB: tintFor(gouge, wall) });
  b.rect(_o.set(R.x1 - 0.215, 1.6, -40.5), Z, Y, 1.5, 1.0, gougeDecal(a, 1), { tintRGB: tintFor(gouge, wall) });
  b.rect(_o.set(R.x0 + 0.215, 1.5, -24), NZ, Y, 1.5, 1.0, gougeDecal(a, 2), { tintRGB: tintFor(gouge, wall) });
  b.rect(_o.set(R.x1 - 0.21, 1.4, -34), Z, Y, 1.0, 1.0, bloodDecal(a, 1, true));
  const pocks = pocksDecal(a, 2);
  b.rect(_o.set(R.x1 - 0.215, 2.2, -14), Z, Y, 1.0, 0.75, pocks, { tintRGB: tintFor(pocks, wall) });
  b.rect(_o.set(R.x1 - 0.215, 1.8, -21), Z, Y, 1.0, 0.75, pocksDecal(a, 4), { tintRGB: tintFor(pocks, wall) });
  // Floor: more blood and brochures along the walk.
  b.rect(_o.set(4.5, 0.014, -27), X, NZ, 1, 1, bloodDecal(a, 0, false));
  b.rect(_o.set(-2.6, 0.014, -36), X, NZ, 1, 1, bloodDecal(a, 3, false));
  for (const [x, z, r] of [
    [0.6, -9, 0.3],
    [-1.4, -14, 1.2],
    [3.1, -30, 2.2],
    [-3.5, -42, 0.7],
    [1.9, -47, 2.8],
  ] as [number, number, number][]) {
    const u = new THREE.Vector3(Math.cos(r), 0, -Math.sin(r));
    const w = new THREE.Vector3(-Math.sin(r), 0, -Math.cos(r));
    b.rect(_o.set(x, 0.013, z), u, w, 0.3, 0.42, paperTile(a, Math.round(r * 3) % 3));
  }
  void railXAtZ;
  // The reception CRTs: a painted screen over each glowing monitor box (turned 0.3 rad like the monitor).
  const crt = crtScreenTile(a);
  for (const z of [-13, -16.5]) {
    const yaw = 0.3;
    const n = new THREE.Vector3(-Math.cos(yaw), 0, Math.sin(yaw));
    const r = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
    const c = new THREE.Vector3(6.8 + 0.39, 1.42, z).addScaledVector(n, 0.016);
    b.rect(_o.copy(c).addScaledVector(r, -0.27).setY(1.42 - 0.17), r, Y, 0.54, 0.34, crt);
  }

  // ── Dynamic set pieces ──
  if (parts.banner) welcomeBanner(pw, parts.banner as THREE.Group);
  if (parts.skeleton) skeleton(pw, parts.skeleton as SkeletonDisplay);
  if (parts.staffDoor) paintDoor(pw, parts.staffDoor as BurstDoor);
}

/** The hanging WELCOME banner: one painted card in its swaying frame. */
function welcomeBanner(pw: D2PixelWorld, banner: THREE.Group) {
  const inner = banner.children[0];
  if (!inner) return;
  dropMeshes(inner, () => true);
  const c = pw.dynamic(inner, true);
  // Cloth from y −2.9…0 (12.6 m wide), ropes 1.6 m above.
  c.rect(_o.set(-6.3, -2.9, 0.03), X, Y, 12.6, 4.5, welcomeBannerTile(pw.atlas));
}

/** The skeleton display: granite plinth with a brass plaque; every bone chunk re-painted as fossil cast. */
function skeleton(pw: D2PixelWorld, s: SkeletonDisplay) {
  const a = pw.atlas;
  const g = pw.gen();
  const granite = graniteTile(a);
  const root = s.root;
  root.updateMatrixWorld(true);
  // Plinth (first child: its baked group).
  const plinth = root.children[0];
  const meshes: THREE.Mesh[] = [];
  plinth.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh);
  });
  const pb = pw.dynamic(root);
  for (const m of meshes) {
    emitMesh(
      pb,
      m,
      (mm, _face, col) => {
        // One baked mesh per recipe: granite (+ its darker rim), brass, the velvet rope.
        const tex = texOf(mm);
        if (tex === 'metal') return { tile: g.metal, map: 'local' };
        if (tex === 'cloth') return { tile: g.cloth, map: 'local' };
        return { tile: granite, map: 'local', tint: col && col.r < 0.03 ? 0x8a8a96 : 0xffffff };
      },
      relativeMatrix(m, root),
      { vertexColors: true },
    );
    m.parent?.remove(m);
  }
  pb.rect(_o.set(0.7, 0.22, 2.735), X, Y, 1.6, 0.5, plaqueTile(a, 'TYRANNOSAURUS REX', 'LATE CRETACEOUS'));
  // Bone chunks: each holder → inner group → baked meshes (vertex colours: bone, dark bone, teeth, sockets, steel).
  for (const holder of root.children.slice(1)) {
    const inner = holder.children[0];
    if (!inner) continue;
    if (holder === s.skullHolder) {
      skullCards(pw, inner);
      continue;
    }
    const list: THREE.Mesh[] = [];
    inner.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) list.push(o as THREE.Mesh);
    });
    if (!list.length) continue;
    const cb = pw.dynamic(inner);
    for (const m of list) {
      const steel = texOf(m) !== 'hide';
      emitMesh(cb, m, () => ({ tile: steel ? g.metal : g.bone, map: 'local' }), relativeMatrix(m, inner), { vertexColors: true });
      m.parent?.remove(m);
    }
  }
  void _v;
  void hexOf;
}

/**
 * The skull as three crossed painted cut-outs in its own frame (the profile with the hanging jaw,
 * the top, the back) in place of its box stack: it tumbles and lands as a skull from any side.
 */
function skullCards(pw: D2PixelWorld, inner: THREE.Object3D) {
  dropMeshes(inner, () => true);
  const a = pw.atlas;
  const cb = pw.dynamic(inner, true);
  const R = new THREE.Matrix4().makeRotationZ(-0.18);
  const ax = X.clone().applyMatrix4(R);
  const ay = Y.clone().applyMatrix4(R);
  const az = Z.clone().applyMatrix4(R);
  const P = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z).applyMatrix4(R);
  const pr = SKULL_PROFILE;
  cb.rect(P(pr.x0, pr.y0, 0), ax, ay, pr.w, pr.h, skullProfileTile(a));
  const tp = SKULL_TOP;
  cb.rect(P(tp.x0, 0.32, tp.z0), ax, az, tp.w, tp.d, skullTopTile(a));
  const bk = SKULL_BACK;
  cb.rect(P(-0.5, bk.y0, bk.z0), az, ay, bk.d, bk.h, skullBackTile(a));
}

ROOM_CONVERTERS.set('lobby', convertLobby);
