import * as THREE from 'three';
import { Kit } from '../../kit/ModelKit';
import { bake, glow, mat } from './bake';
import { beacon, bush, box, cyl, decal, floorQuad, frameZ, lightPanel, palm, pipe, railing, sign, slab, vent, wallX, wallZ } from './build';
import type { Ctx, RoomOut } from './ctx';
import { pixelText } from './font';
import { ROOMS, railXAtZ } from './layout';
import { BurstDoor, SkeletonDisplay } from './setpieces';
import { S } from './surf';

/** Glass used across the building (transparent, shared). */
export function glassMat(tint = 0x9fd0ea, opacity = 0.2): THREE.Material {
  return Kit.mat(tint, { transparent: true, opacity, side: THREE.DoubleSide, smooth: true });
}

export interface LobbyOut extends RoomOut {
  skeleton: SkeletonDisplay;
  banner: THREE.Group;
  staffDoor: BurstDoor;
}

// ─── Visitor-centre lobby ─────────────────────────────────────────────────

export function buildLobby(ctx: Ctx): LobbyOut {
  const R = ROOMS.lobby;
  const rnd = () => ctx.rng.next();
  const root = new THREE.Group();
  root.name = 'lobby';
  const stat = new THREE.Group();
  const shellG = new THREE.Group();
  const am = ctx.am;

  // Visitor-centre palette: warm rendered walls, timber, sandstone pillars.
  // Walls + ceiling bake into the shell; everything else into a handful of
  // `S` recipes (see surf.ts).
  const stucco = mat(0x9a8a74, 'stucco', 1, 0.9);
  const wood = S.planks(0x6a4428);
  const trim = S.planks(0x3e2a1a);
  const stone = mat(0xb0a48e, 'concrete', 0.8, 0.65);
  const ceil = mat(0x4a3a2c, 'planks', 0.7, 0.9);
  const metal = S.metal(0x6a6e76);
  const terrazzo = S.terrazzo(0xc8c0b0);
  const floor = mat(0x948a7a, 'tiles', 0.6, 0.85);
  const doorH = 3.3;
  const shopX = railXAtZ(R.z1);

  // Floor: polished tiles + inlaid park emblem.
  floorQuad(stat, floor, R.x0, R.x1, R.z1, R.z0, 0);
  // Park emblem inlaid in the same tiles (a mosaic, one draw call with the floor).
  const em = new THREE.Vector3(1.4, 0, -19);
  Kit.add(stat, Kit.cyl(3.5, 3.5, 0.02, 28), mat(0xd08420, 'tiles', 0.6, 0.85), em.x, 0.008, em.z);
  Kit.add(stat, Kit.cyl(3.1, 3.1, 0.02, 28), mat(0x24563a, 'tiles', 0.6, 0.85), em.x, 0.014, em.z);
  const print = mat(0xe0bc68, 'tiles', 0.6, 0.85);
  Kit.add(stat, Kit.cyl(0.7, 0.8, 0.02, 10), print, em.x, 0.02, em.z + 0.6);
  for (const a of [-0.45, 0, 0.45]) {
    Kit.add(stat, Kit.box(0.34, 0.02, 1.5), print, em.x + Math.sin(a) * 1.1, 0.02, em.z - 0.4 - Math.cos(a) * 0.7, 0, a, 0);
    Kit.add(stat, Kit.cone(0.17, 0.5, 4), print, em.x + Math.sin(a) * 1.85, 0.02, em.z - 0.4 - Math.cos(a) * 1.45, -Math.PI / 2, 0, -a);
  }

  // Walls (shell = bullet stoppers).
  wallX(shellG, stucco, R.x0, R.z0, R.z1, R.h);
  wallX(shellG, stucco, R.x1, R.z0, R.z1, R.h, [{ c: -37, w: 1.8, h: 2.5 }]);
  wallZ(shellG, stucco, R.z1, R.x0, R.x1, R.h, [{ c: shopX, w: 3.6, h: doorH }]);
  wallZ(shellG, stucco, R.z0, R.x0, R.x1, R.h, [{ c: 2.5, w: 5, h: 3.4 }]);
  // Ceiling with a big skylight opening.
  const sky = { x0: -6, x1: 6, z0: -6, z1: -40 };
  slab(shellG, ceil, R.x0, R.x1, R.h, R.h + 0.4, sky.z0, R.z0);
  slab(shellG, ceil, R.x0, R.x1, R.h, R.h + 0.4, R.z1, sky.z1);
  slab(shellG, ceil, R.x0, sky.x0, R.h, R.h + 0.4, sky.z1, sky.z0);
  slab(shellG, ceil, sky.x1, R.x1, R.h, R.h + 0.4, sky.z1, sky.z0);

  // Wainscot + cornice.
  for (const x of [R.x0 + 0.25, R.x1 - 0.25]) {
    slab(stat, wood, x - 0.06, x + 0.06, 0, 1.3, R.z1, R.z0);
    slab(stat, trim, x - 0.09, x + 0.09, 1.28, 1.4, R.z1, R.z0);
  }
  slab(stat, wood, R.x0, shopX - 2.0, 0, 1.3, R.z1 + 0.2, R.z1 + 0.32);
  slab(stat, wood, shopX + 2.0, R.x1, 0, 1.3, R.z1 + 0.2, R.z1 + 0.32);
  for (const z of [R.z1 + 0.25]) slab(stat, trim, R.x0, R.x1, R.h - 0.5, R.h - 0.3, z - 0.1, z + 0.1);
  frameZ(stat, trim, R.z1 + 0.1, shopX, 3.6, doorH);

  // Mural on the far wall: jungle ridge + volcano silhouette.
  const muralZ = R.z1 + 0.24;
  slab(stat, S.stucco(0x2e4860), -11, 11, 5.6, 12.5, muralZ - 0.02, muralZ + 0.02);
  const ridge = S.stucco(0x1c3424);
  for (let i = 0; i < 9; i++) {
    const x = -10 + i * 2.5;
    const h = 1.2 + Math.abs(Math.sin(i * 1.7)) * 1.6;
    Kit.add(stat, Kit.cone(1.9, h, 3), ridge, x, 5.6 + h / 2, muralZ + 0.05, 0, 0, 0, 1, 1, 0.05);
  }
  Kit.add(stat, Kit.cone(4.2, 4.6, 4), S.stucco(0x3c3640), 3.5, 5.6 + 2.3, muralZ + 0.04, 0, Math.PI / 4, 0, 1, 1, 0.04);
  Kit.add(stat, Kit.box(1.2, 0.4, 0.05), glow(0xff6a20, 0.8), 3.5, 10.0, muralZ + 0.09);
  Kit.add(stat, Kit.sphere(0.9, 12, 6), glow(0xf0e0b0, 0.7), -6.5, 9.4, muralZ + 0.05, 0, 0, 0, 1, 1, 0.05);

  // Gift shop sign over the doorway.
  sign(stat, 'GIFT SHOP', shopX, doorH + 0.75, R.z1 + 0.32, 0, 0.1, 0x1c3a24, glow(0xffc840, 0.95));

  // Balconies (mezzanine) on both sides + pillars.
  for (const side of [-1, 1]) {
    const xe = side * 11;
    const xw = side * 15;
    slab(stat, stone, Math.min(xe, xw), Math.max(xe, xw), 4.8, 5.2, -52, 6);
    slab(stat, wood, xe - 0.12, xe + 0.12, 4.55, 5.35, -52, 6);
    slab(stat, glow(0xdde8ff, 0.9), xe - side * 0.35 - 0.06, xe - side * 0.35 + 0.06, 4.74, 4.78, -51, 5);
    railing(stat, xe - side * 0.05, 6, xe - side * 0.05, -52, 5.2);
    for (const z of [2, -10, -22, -34, -46]) {
      cyl(stat, stone, xe, R.h / 2, z, 0.48, R.h, 12);
      box(stat, trim, xe, 0.2, z, 1.25, 0.4, 1.25);
      box(stat, stone, xe, R.h - 0.3, z, 1.3, 0.6, 1.3);
      beacon(stat, am.strobe, xe - side * 0.5, 3.5, z, side > 0 ? -Math.PI / 2 : Math.PI / 2);
      // Hanging fabric banners on the pillars.
      const col = (z / 12) % 2 === 0 ? 0xd06a1c : 0x2a7040;
      box(stat, S.cloth(col), xe - side * 0.52, 8.2, z, 0.04, 3.4, 1.0);
      box(stat, S.cloth(0xe8d8a0), xe - side * 0.54, 8.4, z, 0.03, 0.7, 0.6);
    }
    // Dark gallery doorways upstairs.
    for (const z of [-4, -16, -28, -40]) slab(stat, S.plain(0x0c0c10), xw - side * 0.22, xw - side * 0.18, 5.2, 7.6, z - 0.9, z + 0.9);
  }

  // Skylight: glass, steel grid, a moonlit sky and a soft moon shaft.
  const skyGlass = glassMat(0x8ab0d0, 0.12);
  slab(stat, skyGlass, sky.x0, sky.x1, R.h + 0.3, R.h + 0.34, sky.z1, sky.z0);
  for (let x = sky.x0; x <= sky.x1 + 0.01; x += 3) slab(stat, metal, x - 0.08, x + 0.08, R.h + 0.1, R.h + 0.4, sky.z1, sky.z0);
  for (let z = sky.z1; z <= sky.z0 + 0.01; z += 4.25) slab(stat, metal, sky.x0, sky.x1, R.h + 0.1, R.h + 0.4, z - 0.08, z + 0.08);
  slab(stat, glow(0x0e1a34, 1), sky.x0 - 2, sky.x1 + 2, R.h + 2.4, R.h + 2.5, sky.z1 - 2, sky.z0 + 2);
  for (let i = 0; i < 26; i++) {
    const x = sky.x0 + rnd() * (sky.x1 - sky.x0);
    const z = sky.z1 + rnd() * (sky.z0 - sky.z1);
    box(stat, glow(0xc8d8ff, 0.6 + rnd() * 0.6), x, R.h + 2.35, z, 0.07, 0.02, 0.07);
  }
  const shaft = Kit.add(root, Kit.box(9, 16, 5), Kit.glow(0x7a9ad8, 1, true, 0.05), -4.2, 7.5, -27, 0, 0, -0.18);
  shaft.renderOrder = 3;
  shaft.userData.noMerge = true;

  // Hanging pendant lamps (two dead).
  for (const [x, z, lit] of [
    [-6, -12, true],
    [6, -12, false],
    [-6, -44, true],
    [6, -44, true],
  ] as [number, number, boolean][]) {
    pipe(stat, S.plain(0x111114), new THREE.Vector3(x, R.h, z), new THREE.Vector3(x, 8.6, z), 0.02, 4);
    Kit.add(stat, Kit.cone(0.75, 0.6, 10), S.metal(0x3a4048), x, 8.4, z);
    Kit.add(stat, Kit.cyl(0.5, 0.5, 0.05, 10), lit ? glow(0xffe0a8, 1.1) : S.metal(0x3a3a3a), x, 8.1, z);
  }

  // Reception desk (right).
  const desk = { x: 6.8, z0: -11, z1: -19 };
  slab(stat, wood, desk.x, desk.x + 0.7, 0, 1.1, desk.z1, desk.z0);
  slab(stat, terrazzo, desk.x - 0.1, desk.x + 0.9, 1.1, 1.18, desk.z1 - 0.1, desk.z0 + 0.1);
  slab(stat, wood, desk.x, desk.x + 3.2, 0, 1.1, desk.z1 - 0.7, desk.z1);
  slab(stat, terrazzo, desk.x - 0.1, desk.x + 3.3, 1.1, 1.18, desk.z1 - 0.8, desk.z1 + 0.1);
  box(stat, S.plain(0xc87a1a), desk.x - 0.02, 0.62, (desk.z0 + desk.z1) / 2, 0.04, 0.5, 5.4);
  pixelText(stat, 'INFORMATION', S.plain(0xf0e0b0), desk.x - 0.05, 0.62, (desk.z0 + desk.z1) / 2, 0.055, -Math.PI / 2, 0.03);
  for (const z of [-13, -16.5]) {
    box(stat, S.plain(0x1a1a1e), desk.x + 0.45, 1.42, z, 0.08, 0.42, 0.62, 0.3);
    box(stat, am.screen, desk.x + 0.39, 1.42, z, 0.02, 0.34, 0.54, 0.3);
    box(stat, S.plain(0x1a1a1e), desk.x + 0.5, 1.2, z, 0.2, 0.04, 0.3);
  }
  // Papers and a knocked-over chair.
  for (let i = 0; i < 12; i++) decal(stat, S.plain(0xe8e4dc), 4 + rnd() * 4, 0.006, -12 - rnd() * 12, 0.22, 0.3, rnd() * 3);
  box(stat, S.metal(0x3a3a44), 5.6, 0.25, -21, 0.5, 0.08, 0.5, 0.4, 1.2);
  box(stat, S.metal(0x3a3a44), 5.9, 0.45, -21.3, 0.5, 0.5, 0.08, 0.4, 1.2);
  // Drag marks… something happened at the desk.
  decal(stat, S.plain(0x3a0806), 6.2, 0.006, -20.4, 0.9, 2.2, 0.35);
  for (let i = 0; i < 3; i++) box(stat, S.plain(0x1e1c1a), 7.6, 1.6 + i * 0.12, -20.2 - i * 0.08, 0.03, 0.04, 1.1, 0, 0, 0.5);

  // Info kiosk + directory board.
  box(stat, S.metal(0x3a4048), 6.0, 0.8, -31, 0.6, 1.6, 0.5);
  box(stat, am.screen, 6.0, 1.3, -30.74, 0.5, 0.42, 0.02, 0, -0.3);
  sign(stat, 'HATCHERY TOUR', -14.6, 3.0, -8, Math.PI / 2, 0.07, 0x1c3a24, S.plain(0xf0e0b0));
  sign(stat, 'EXHIBIT HALL', 14.6, 3.0, -8, -Math.PI / 2, 0.07, 0x1c3a24, S.plain(0xf0e0b0));

  // Wall posters (framed dinosaur silhouettes).
  const poster = (x: number, z: number, ry: number, col: number) => {
    const p = new THREE.Group();
    p.position.set(x, 2.6, z);
    p.rotation.y = ry;
    stat.add(p);
    box(p, trim, 0, 0, 0, 1.6, 2.1, 0.06);
    box(p, S.plain(col), 0, 0, 0.04, 1.4, 1.9, 0.02);
    const ink = S.plain(0x18120c);
    box(p, ink, -0.05, -0.1, 0.06, 0.7, 0.3, 0.02, 0, 0, 0.1);
    box(p, ink, 0.3, 0.15, 0.06, 0.4, 0.22, 0.02, 0, 0, -0.5);
    box(p, ink, -0.45, -0.25, 0.06, 0.5, 0.1, 0.02, 0, 0, 0.3);
    box(p, ink, -0.05, -0.5, 0.06, 0.08, 0.4, 0.02);
    box(p, ink, 0.12, -0.5, 0.06, 0.08, 0.4, 0.02, 0, 0, 0.2);
  };
  poster(R.x0 + 0.3, -16, Math.PI / 2, 0xd8902a);
  poster(R.x0 + 0.3, -40, Math.PI / 2, 0x3a8a6a);
  poster(R.x1 - 0.3, -16, -Math.PI / 2, 0xb84a2a);

  // Benches, bins, plants.
  const bench = (x: number, z: number, ry: number, tipped = false) => {
    const b = new THREE.Group();
    b.position.set(x, 0, z);
    b.rotation.y = ry;
    if (tipped) b.rotation.z = Math.PI / 2 - 0.1;
    stat.add(b);
    box(b, wood, 0, 0.45, 0, 2.2, 0.08, 0.6);
    box(b, wood, 0, 0.8, -0.27, 2.2, 0.5, 0.06);
    for (const sx of [-0.9, 0.9]) box(b, metal, sx, 0.22, 0, 0.08, 0.45, 0.55);
  };
  bench(-6.5, -8, 0);
  bench(-6.5, -44, 0);
  bench(7.5, -38, 0.3, true);
  for (const [x, z] of [
    [-9, -2],
    [9, -1],
    [-9, -50],
    [9, -51],
    [-3, -53],
  ]) palm(stat, x, z, 2.6 + rnd() * 1.2, rnd);
  bush(stat, 5.6, -52.5, 0.8, 4);

  // Lobby entrance doors behind the start (dark glass).
  slab(stat, glassMat(0x405870, 0.5), 0, 5, 0, 3.4, R.z0 - 0.05, R.z0 + 0.05);
  for (const x of [0, 2.5, 5]) slab(stat, metal, x - 0.07, x + 0.07, 0, 3.4, R.z0 - 0.1, R.z0 + 0.1);

  // ── Dynamic: skeleton, banner, staff door ──
  const skeleton = new SkeletonDisplay(new THREE.Vector3(-6.0, 0, -30), 0);
  root.add(skeleton.root);

  const banner = new THREE.Group();
  banner.position.set(0.5, 13.5, -46);
  root.add(banner);
  {
    const inner = new THREE.Group();
    banner.add(inner);
    const cloth = S.cloth(0x1e5a34);
    box(inner, cloth, 0, -1.45, 0, 12.6, 2.9, 0.05);
    box(inner, S.cloth(0xe0a020), 0, -0.08, 0, 12.6, 0.16, 0.06);
    box(inner, S.cloth(0xe0a020), 0, -2.82, 0, 12.6, 0.16, 0.06);
    pixelText(inner, 'WELCOME', glow(0xffc23a, 1.0), 0, -1.12, 0.04, 0.24, 0, 0.04);
    pixelText(inner, 'TO PRIMAL ISLAND', glow(0xf0e8c8, 0.75), 0, -2.42, 0.04, 0.085, 0, 0.03);
    // Torn corner flap.
    box(inner, cloth, 6.0, -3.1, 0.04, 0.6, 0.7, 0.05, 0, 0, 0.6);
    for (const x of [-5.8, 5.8]) pipe(inner, S.cloth(0x111114), new THREE.Vector3(x, 0, 0), new THREE.Vector3(x * 0.95, 1.6, 0), 0.015, 4);
    bake(inner);
  }
  banner.rotation.z = 0.04;

  // Staff door on the right wall (a raptor comes through here).
  const staffDoor = new BurstDoor({ hinge: new THREE.Vector3(R.x1 - 0.05, 0, -36.1), w: 1.8, h: 2.45, yaw: Math.PI / 2, swing: 1, kind: 'swing', style: 'wood' });
  root.add(staffDoor.root);
  // Dark corridor behind it.
  slab(stat, S.plain(0x0a0a0c), R.x1 + 0.2, R.x1 + 3, 0, 2.6, -39, -35);
  slab(stat, S.plain(0x0a0a0c), R.x1 + 0.2, R.x1 + 3, 2.6, 2.7, -39, -35);
  sign(stat, 'STAFF ONLY', R.x1 - 0.25, 2.85, -37, -Math.PI / 2, 0.05, 0x5a1010, S.plain(0xf0f0f0));

  bake(stat);
  bake(shellG);
  root.add(stat, shellG);
  return { root, shell: shellG.children.slice(), skeleton, banner, staffDoor };
}

// ─── Gift shop ────────────────────────────────────────────────────────────

export interface ShopOut extends RoomOut {
  stockDoor: BurstDoor;
}

export function buildShop(ctx: Ctx): ShopOut {
  const R = ROOMS.shop;
  const rnd = () => ctx.rng.next();
  const root = new THREE.Group();
  root.name = 'shop';
  const stat = new THREE.Group();
  const shellG = new THREE.Group();
  const am = ctx.am;
  const exitX = railXAtZ(R.z1);

  // Souvenir-shop palette: striped wallpaper, blue carpet, timber shelving.
  const paint = mat(0xc8a87e, 'wallpaper', 1.2, 0.7);
  const shelfWood = S.planks(0x8a6038);
  const metal = S.metal(0x6a6e76);

  floorQuad(stat, mat(0x32508a, 'carpet', 1.2, 0.9), R.x0, R.x1, R.z1, R.z0, 0.005);
  wallX(shellG, paint, R.x0, R.z0, R.z1, R.h, [{ c: -74.3, w: 1.6, h: 2.3 }]);
  wallX(shellG, paint, R.x1, R.z0, R.z1, R.h);
  wallZ(shellG, paint, R.z1, R.x0, R.x1, R.h, [{ c: exitX, w: 3.6, h: 3.1 }]);
  slab(shellG, mat(0xb4b0a4, 'tiles', 0.7, 0.7), R.x0, R.x1, R.h, R.h + 0.3, R.z1, R.z0);
  // Shop-side skin of the shared lobby wall.
  wallZ(stat, paint, R.z0 - 0.25, R.x0, R.x1, R.h, [{ c: railXAtZ(R.z0), w: 3.6, h: 3.3 }], 0.08);
  for (const x of [R.x0 + 0.22, R.x1 - 0.22]) slab(stat, S.planks(0x2a5a3a), x - 0.04, x + 0.04, 2.6, 2.9, R.z1, R.z0);

  // Ceiling panels (one flickering) + vents the compys use.
  for (const z of [-60, -66, -72, -78]) {
    lightPanel(stat, -3, R.h, z, 1.2, 0.6, z === -72 ? am.flicker : glow(0xe8f0ff, 1.1));
    lightPanel(stat, 3, R.h, z, 1.2, 0.6, z === -66 ? am.flicker : glow(0xe8f0ff, 1.1));
  }
  vent(stat, -1.6, R.h - 0.02, -65);
  vent(stat, 1.8, R.h - 0.02, -69);
  vent(stat, 0, R.h - 0.02, -73.5);

  // Merchandise palette.
  const toyCols = [0x3aa04a, 0xe07a20, 0x8a4ac0, 0x2a8ad0, 0xd0402a, 0xe0c030];
  const toy = (x: number, y: number, z: number, s: number, ry: number) => {
    const c = S.cloth(toyCols[Math.floor(rnd() * toyCols.length)]);
    const t = new THREE.Group();
    t.position.set(x, y, z);
    t.rotation.y = ry;
    stat.add(t);
    Kit.add(t, Kit.sphere(0.13 * s, 7, 5), c, 0, 0.12 * s, 0, 0, 0, 0, 1, 0.9, 1.25);
    Kit.add(t, Kit.sphere(0.09 * s, 7, 5), c, 0, 0.26 * s, 0.12 * s);
    Kit.add(t, Kit.cone(0.06 * s, 0.22 * s, 5), c, 0, 0.1 * s, -0.17 * s, -Math.PI / 2 - 0.4, 0, 0);
    box(t, S.cloth(0x101010), 0.05 * s, 0.29 * s, 0.19 * s, 0.025 * s, 0.025 * s, 0.01);
    box(t, S.cloth(0x101010), -0.05 * s, 0.29 * s, 0.19 * s, 0.025 * s, 0.025 * s, 0.01);
  };
  // Wall shelving.
  for (const side of [-1, 1]) {
    const x = side * 7.4;
    const runs: [number, number][] = side < 0 ? [[-57.5, -72.8], [-75.8, -79.5]] : [[-57.5, -79.5]];
    for (const [z0, z1] of runs) {
      slab(stat, shelfWood, x - 0.4, x + 0.4, 0, 2.4, z1, z0).scale.set(1, 1, 1);
      for (let k = 0; k < 4; k++) {
        const y = 0.35 + k * 0.55;
        slab(stat, S.planks(0xc8a878), x - side * 0.42, x - side * 0.4, y - 0.02, y + 0.03, z1, z0);
        for (let z = z0 - 0.35; z > z1 + 0.2; z -= 0.42 + rnd() * 0.3) {
          if (rnd() < 0.55) toy(x - side * 0.25, y + 0.03, z, 1 + rnd() * 0.5, side > 0 ? -Math.PI / 2 : Math.PI / 2);
          else box(stat, S.cloth(toyCols[Math.floor(rnd() * toyCols.length)]), x - side * 0.25, y + 0.03 + 0.17, z, 0.3, 0.34, 0.24);
        }
      }
    }
  }
  // Display tables with plush toys and t-shirt stacks.
  for (const side of [-1, 1]) {
    for (const [z0, z1] of [
      [-61, -65],
      [-68, -72],
    ]) {
      const xa = side * 2.9;
      const xb = side * 4.6;
      slab(stat, shelfWood, Math.min(xa, xb), Math.max(xa, xb), 0, 0.82, z1, z0);
      slab(stat, S.cloth(0xe8dcc0), Math.min(xa, xb) - 0.05, Math.max(xa, xb) + 0.05, 0.82, 0.86, z1 - 0.05, z0 + 0.05);
      for (let i = 0; i < 5; i++) {
        const z = z0 - 0.5 - i * 0.75;
        if (i % 2) toy((xa + xb) / 2 + rnd() * 0.4 - 0.2, 0.86, z, 1.4, rnd() * 6);
        else for (let k = 0; k < 3; k++) box(stat, S.cloth(toyCols[(i + k) % toyCols.length]), (xa + xb) / 2, 0.9 + k * 0.08, z, 0.55, 0.07, 0.45);
      }
    }
  }
  // Toppled toys on the floor.
  for (let i = 0; i < 6; i++) toy((i % 2 ? 1 : -1) * (5.2 + rnd() * 1.0), 0, -60 - rnd() * 16, 1.2, rnd() * 6);

  // Register counter (a scientist hides behind it).
  slab(stat, shelfWood, 2.6, 7.0, 0, 1.0, -75.3, -74.3);
  slab(stat, S.terrazzo(0xd8d0c0), 2.5, 7.1, 1.0, 1.06, -75.4, -74.2);
  box(stat, S.metal(0x3a3a44), 4.2, 1.18, -74.8, 0.45, 0.24, 0.4);
  box(stat, am.screen, 4.2, 1.42, -74.68, 0.32, 0.2, 0.02, -0.2);
  box(stat, S.cloth(0xc04020), 5.6, 1.2, -74.7, 0.5, 0.28, 0.3);
  // Back shelf behind the counter.
  slab(stat, shelfWood, 2.6, 6.8, 0, 2.2, -79.6, -79.0);

  // Giant plush T-rex mascot (left-back corner).
  {
    const t = new THREE.Group();
    t.position.set(-5.0, 0, -77.4);
    t.rotation.y = 0.5;
    stat.add(t);
    const g = S.cloth(0x4aa03a);
    const belly = S.cloth(0xe8d890);
    Kit.add(t, Kit.sphere(0.75, 10, 8), g, 0, 1.15, 0, 0, 0, 0, 1, 1.15, 0.95);
    Kit.add(t, Kit.sphere(0.55, 10, 8), belly, 0, 1.05, 0.32, 0, 0, 0, 0.9, 1.1, 0.7);
    Kit.add(t, Kit.sphere(0.6, 10, 8), g, 0, 2.15, 0.35, 0, 0, 0, 1, 0.9, 1.1);
    Kit.add(t, Kit.box(0.7, 0.18, 0.5), belly, 0, 1.92, 0.75);
    for (const sx of [-1, 1]) {
      Kit.add(t, Kit.sphere(0.13, 8, 6), S.cloth(0xf8f8f8), sx * 0.25, 2.35, 0.82);
      Kit.add(t, Kit.sphere(0.06, 6, 4), S.cloth(0x101010), sx * 0.25, 2.35, 0.94);
      Kit.add(t, Kit.capsule(0.22, 0.4, 2, 8), g, sx * 0.42, 0.35, 0.1);
      Kit.add(t, Kit.capsule(0.08, 0.2, 2, 6), g, sx * 0.45, 1.45, 0.55, -1.2, 0, 0);
    }
    Kit.add(t, Kit.cone(0.4, 1.4, 8), g, 0, 0.6, -0.9, -Math.PI / 2 - 0.5, 0, 0);
  }

  // Spinner rack + exit framing.
  cyl(stat, metal, -2.4, 0.9, -78.2, 0.04, 1.8, 6);
  for (let k = 0; k < 4; k++) for (let a = 0; a < 4; a++) box(stat, S.cloth(toyCols[(k + a) % 6]), -2.4 + Math.sin(a * 1.57) * 0.22, 0.6 + k * 0.32, -78.2 + Math.cos(a * 1.57) * 0.22, 0.2, 0.28, 0.02, a * 1.57);
  frameZ(stat, metal, R.z1 + 0.1, exitX, 3.6, 3.1);
  sign(stat, 'BOTANICAL ATRIUM', exitX, 3.6, R.z1 + 0.3, 0, 0.055, 0x1c3a24, S.plain(0xe8f0d0));
  beacon(stat, am.strobe, exitX - 2.6, 3.2, R.z1 + 0.25, 0);
  beacon(stat, am.strobe, exitX + 2.6, 3.2, R.z1 + 0.25, 0);

  // Stockroom behind the burst door.
  slab(stat, S.plain(0x16161a), -11.5, R.x0 - 0.2, 0, 2.6, -77.5, -71.5);
  slab(stat, S.plain(0x0e0e10), -11.5, R.x0 - 0.2, 2.5, 2.6, -77.5, -71.5);
  for (let i = 0; i < 4; i++) box(stat, S.planks(0x5a4a34), -10.2 + (i % 2) * 0.7, 0.3 + Math.floor(i / 2) * 0.6, -76.5, 0.6, 0.6, 0.6, i * 0.3);
  const stockDoor = new BurstDoor({ hinge: new THREE.Vector3(R.x0 + 0.05, 0, -73.5), w: 1.6, h: 2.3, yaw: Math.PI / 2, swing: -1, kind: 'swing', style: 'wood' });
  root.add(stockDoor.root);
  sign(stat, 'STOCK', R.x0 + 0.25, 2.6, -74.3, Math.PI / 2, 0.045, 0x2a2a2a, S.plain(0xe0e0e0));

  bake(stat);
  bake(shellG);
  root.add(stat, shellG);
  return { root, shell: shellG.children.slice(), stockDoor };
}
