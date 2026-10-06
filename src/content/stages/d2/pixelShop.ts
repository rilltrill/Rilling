import * as THREE from 'three';
import { ROOM_CONVERTERS, type D2PixelWorld, type RoomParts } from './pixel';
import { dropMeshes, paintGroup, type Paint } from './pixelMesh';
import { centreOf, matIs, NZ, paintDoor, voidPaint, paintSigns, paintWallTexts, roomRule, texOf, wallFace, X, Y, Z } from './pixelShared';
import type { BurstDoor } from './setpieces';
import { acousticTile, counterFrontTile, crateTile, mascotTile, merchCardTile, merchShelfTile, plushCardTile, postcardTile, shirtStackTile, shirtTopTile, shopCarpetTile, skirtLogoTile, tableclothTile, tableSkirtTile, ventGrilleTile, wallpaperTile } from '../../pixelworld/d2shop';
import { terrazzoTile } from '../../pixelworld/interior';
import { bloodDecal } from '../../pixelworld/d2decals';
import { hash2 } from '../../pixelworld/surfaces';

/** The GIFT SHOP in PIXEL WORLD. */

const _o = new THREE.Vector3();
const _p = new THREE.Vector3();

/** Vent grilles from below (shared by every room with `vent()` fixtures); `bentAt` = which one burst open. */
export function paintVents(pw: D2PixelWorld, stat: THREE.Object3D, bentAt?: (x: number, z: number) => boolean): (m: THREE.Mesh, wface: string) => Paint | null | undefined {
  dropMeshes(stat, (m) => m.userData.pw === 'vent' || m.userData.pw === 'ventSlat');
  return (m, wface) => {
    if (m.userData.pw !== 'ventFrame') return undefined;
    const c = centreOf(m);
    if (wface === 'ny') return { tile: ventGrilleTile(pw.atlas, !!bentAt?.(c.x, c.z)), map: 'fit' };
    return { tile: pw.gen().metal, map: 'local' };
  };
}

function convertShop(pw: D2PixelWorld, parts: RoomParts) {
  const a = pw.atlas;
  const b = pw.main('shop');
  const cards = pw.card('shop');
  const g = pw.gen();
  const { stat, shell } = parts;
  const paper = wallpaperTile(a);
  const ceil = acousticTile(a);
  const carpet = shopCarpetTile(a);
  const merchL = merchShelfTile(a, 0);
  const merchR = merchShelfTile(a, 1);
  const counter = counterFrontTile(a);
  const crate = crateTile(a, 0x5a4a34);
  const terrazzo = terrazzoTile(a, { hex: 0xc8c0b0, chips: [0x5a4a3a, 0xe8e0d0, 0xa05a30] });
  const shirtTop = shirtTopTile(a);
  const cloth = tableclothTile(a);
  const skirt = tableSkirtTile(a);
  const logo = skirtLogoTile(a);

  pw.copyShell(shell, b, (m, _f, _c, wface) => {
    if (texOf(m) === 'tiles') return wface === 'ny' ? { tile: ceil, map: 'world' } : wface === 'py' ? null : { tile: g.plaster, map: 'world', tint: 0xb4b0a4 };
    return { tile: paper, map: 'world' };
  });

  paintSigns(pw, stat, b);
  paintWallTexts(pw, stat, b);
  // Merchandise on the wall shelves is painted into the shelf fronts; toys elsewhere become plush cards.
  const toys: { x: number; y: number; z: number; hex: number; s: number }[] = [];
  stat.traverse((o) => {
    if (o.userData.pw !== 'toy') return;
    const p = centreOf(o, _p);
    if (Math.abs(p.x) > 6.75) return;
    const rec = o.userData.pwToy as { hex: number; s: number };
    toys.push({ x: p.x, y: p.y, z: p.z, hex: rec.hex, s: rec.s });
  });
  dropMeshes(stat, (m) => {
    let t: THREE.Object3D | null = m;
    while (t && !t.userData.pw) t = t.parent;
    const tag = t?.userData.pw;
    return tag === 'toy' || tag === 'shelfBoard' || tag === 'shelfBox' || tag === 'mascot';
  });
  const ventRule = paintVents(pw, stat, (x, z) => Math.abs(x + 1.6) < 0.2 && Math.abs(z + 65) < 0.2);
  // Display tables (their boxes stay classic-shaped under a draped skirt) and the T-shirt stacks on them.
  const tables: THREE.Box3[] = [];
  const stacks = new Map<string, { x: number; z: number; hex: number }>();
  stat.updateMatrixWorld(true);
  stat.traverse((o) => {
    if (o.userData.pw === 'table') tables.push(new THREE.Box3().setFromObject(o));
    if (o.userData.pw === 'shirts') {
      const c = centreOf(o, _p);
      const key = `${Math.round(c.x * 10)}|${Math.round(c.z * 10)}`;
      const hex = ((o as THREE.Mesh).material as THREE.MeshLambertMaterial).color.getHex();
      const st = stacks.get(key);
      // (The top shirt's colour tints the stack's top.)
      if (!st || c.y > 0) stacks.set(key, { x: c.x, z: c.z, hex });
    }
  });
  dropMeshes(stat, (m) => m.userData.pw === 'shirts');

  const rule = roomRule(pw, (m, face, tag, wface): Paint | null | undefined => {
    const v = ventRule(m, wface);
    if (v !== undefined) return v;
    switch (tag) {
      case 'trim':
        return { tile: g.woodH, map: 'world', tint: 0x2a5a3a };
      case 'shelf': {
        const c = centreOf(m);
        const into = c.x < 0 ? 'px' : 'nx';
        return wface === into ? { tile: c.x < 0 ? merchL : merchR, map: 'world' } : { tile: g.wood, map: 'local', tint: 0x8a6038 };
      }
      case 'backShelf':
        return wface === 'pz' ? { tile: merchL, map: 'world', u0: 70 } : { tile: g.wood, map: 'local', tint: 0x8a6038 };
      case 'counter':
        return wface === 'pz' ? { tile: counter, map: 'fit' } : { tile: g.wood, map: 'local', tint: 0x8a6038 };
      case 'counterTop':
        return { tile: terrazzo, map: 'world' };
      case 'table':
        // The draped skirt on every side (world: the hem always a hand above the floor); the top is under the cloth.
        return wallFace(wface) ? { tile: skirt, map: 'world' } : null;
      case 'tablecloth':
        return wface === 'py' ? { tile: cloth, map: 'fit' } : wface === 'ny' ? null : { tile: skirt, map: 'world' };
      case 'postcard': {
        const c = centreOf(m);
        return face === 'pz' || face === 'nz' ? { tile: postcardTile(a, Math.floor(hash2(Math.round(c.x * 20), Math.round(c.y * 20), 3) * 4)), map: 'fit' } : { tile: g.cloth, map: 'local' };
      }
      case 'crate':
        return { tile: crate, map: 'fit' };
      case 'void':
        return voidPaint(pw, m, wface, 0);
    }
    if (matIs(m, 0x32508a, 'carpet')) return wface === 'py' ? { tile: carpet, map: 'world' } : null;
    if (matIs(m, 0xc8a87e, 'wallpaper')) return wallFace(wface) ? { tile: paper, map: 'world' } : { tile: g.plaster, map: 'local', tint: 0xc8a87e };
    return undefined;
  });
  paintGroup(stat, b, rule, { move: true });

  // T-shirt stacks: one painted folded stack per pile (sides: folds, collars, a price tag; top: the print).
  let si = 0;
  for (const st of stacks.values()) {
    const t = shirtStackTile(a, si++);
    b.box(st.x, 0.86 + 0.12, st.z, 0.55, 0.24, 0.45, { px: t, nx: t, pz: t, nz: t });
    b.box(st.x, 0.86 + 0.12, st.z, 0.55, 0.24, 0.45, { py: shirtTop }, { tint: st.hex });
  }
  // The park emblem printed on each table's aisle-side skirt; merchandise stood on the tops (cut-out cards
  // break the box silhouette: mug pyramids, SALE easels, a big plush raptor).
  tables.forEach((tb, i) => {
    const cx = (tb.min.x + tb.max.x) / 2;
    const cz = (tb.min.z + tb.max.z) / 2;
    const inward = cx < 0 ? 1 : -1;
    const fx = inward > 0 ? tb.max.x + 0.012 : tb.min.x - 0.012;
    const lw = 1.5;
    b.rect(_o.set(fx, 0.2, inward > 0 ? cz + lw / 2 : cz - lw / 2), inward > 0 ? NZ : Z, Y, lw, 0.5625, logo);
    const z0 = tb.max.z;
    const yaw = inward * 0.45;
    const ux = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
    for (const [dz, kind] of [[0.9, i % 3], [2.4, (i + 1) % 3]] as const) {
      const w = kind === 2 ? 0.75 : 0.6;
      const x = cx + inward * 0.45;
      cards.rect(_o.set(x - ux.x * w / 2, 0.86, z0 - dz - ux.z * w / 2), ux, Y, w, w, merchCardTile(a, kind));
    }
  });
  // Plush toys (tables, floor) as little cards facing the aisle / the approach.
  toys.forEach((t, i) => {
    const sz = 0.34 * t.s;
    const kind = Math.floor(hash2(i, 3, 5) * 3);
    cards.rect(_o.set(t.x - sz / 2, t.y - 0.02, t.z), X, Y, sz, sz, plushCardTile(a, t.hex, kind));
  });
  // The plush T. rex mascot in the back corner, turned toward the aisle.
  const ux = new THREE.Vector3(Math.cos(0.5), 0, -Math.sin(0.5));
  cards.rect(_o.set(-5.0 - ux.x * 1.0, 0, -77.4 - ux.z * 1.0), ux, Y, 2.0, 2.6, mascotTile(a));
  // Spilled soda and a blood smear on the carpet.
  b.rect(_o.set(-1.2, 0.012, -66.5), X, new THREE.Vector3(0, 0, -1), 1, 1, bloodDecal(a, 2, false));
  if (parts.stockDoor) paintDoor(pw, parts.stockDoor as BurstDoor);
}

ROOM_CONVERTERS.set('shop', convertShop);
