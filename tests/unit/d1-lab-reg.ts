import type { PwAtlas, PwTile } from '../../src/content/pixelworld/atlas';

/** Registers the d1 tiles under look-dev (scratch). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function register(a: PwAtlas, t: PwTile[], T: any) {
  t.push(T.d1BarkTile(a, { hex: 0x7a5434, lichen: 0x9aa088 }));
  t.push(T.d1BarkTile(a, { hex: 0x5a4632, moss: 0x6e9a34 }));
  t.push(T.d1HewnTile(a, { hex: 0xc8a06a }));
  t.push(T.d1LogEndModule(a, { wood: 0xc0965e, bark: 0x4a382a, broken: true }));
  t.push(T.d1IronTile(a, { hex: 0x3a3633 }));
  t.push(T.d1PalisadeTile(a, { log: 0x7a5434, logDark: 0x54361f, hewn: 0xc8a06a, rail: 0x4e331e, rope: 0x9a8058, moss: 0x6e9a34, grass: 0x6b8c34 }));
  t.push(T.d1GateDoorModule(a, { wood: 0x765032, woodDark: 0x4e331e, iron: 0x3a3633 }));
  t.push(T.d1GateSignModule(a, { board: 0x46301c, frame: 0x765032, gold: 0xe8b83a, iron: 0x3a3633 }));
  t.push(T.d1FlagModule(a, { hex: 0xe0401a, emblem: false }));
  t.push(T.d1FlagModule(a, { hex: 0xf4c43a, emblem: true }));
  t.push(T.d1PatchDecal(a, 'moss', { hex: 0x5b7a30, dark: 0x3a5622, accent: 0x8aaa3c }, 0));
  t.push(T.d1PatchDecal(a, 'litter', { hex: 0x5a4a2c, dark: 0x2a2018, accent: 0x8a6a34 }, 1));
  t.push(T.d1PatchDecal(a, 'earth', { hex: 0x6a5a3a, dark: 0x8a8478, accent: 0x6b8c34 }, 2));
  t.push(T.d1PuddleDecal(a, { mud: 0x5a4632, sky: 0xa8c8d8, tree: 0x4a6a4a }, 0));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function register2(a: PwAtlas, t: PwTile[]) {
  const P = await import('../../src/content/pixelworld/d1Props');
  const Wt = await import('../../src/content/pixelworld/d1Water');
  const car = { white: 0xe8e2d4, red: 0xd0321c, glass: 0x46627a, tyre: 0x26282a, steel: 0xa4a4a0, mud: 0x8a6e48 };
  t.push(P.d1GalvTile(a, { hex: 0x9a9a92 }));
  t.push(P.d1WireSpanModule(a, { wire: 0xa8aeb2, vine: 0x356a22 }, 1));
  t.push(P.d1WireSpanModule(a, { wire: 0xa8aeb2, vine: 0x356a22 }, 2));
  t.push(P.d1DangerSignModule(a));
  t.push(P.d1CarSideModule(a, car, true));
  t.push(P.d1CarCabinModule(a, car, true));
  t.push(P.d1CarFrontModule(a, car));
  t.push(P.d1CarBackModule(a, car));
  t.push(P.d1CarPaintTile(a, car));
  t.push(P.d1CarUnderModule(a, car));
  t.push(P.d1TreadTile(a, { hex: 0x26282a, mud: 0x8a6e48 }));
  t.push(P.d1WheelModule(a, { tyre: 0x26282a, rim: 0xa4a4a0, mud: 0x8a6e48 }));
  t.push(P.d1CrateModule(a, { wood: 0x6a5a3a }));
  t.push(P.d1ArrowSignModule(a, 'RIVER', { board: 0x2f5a2a, ink: 0xe8d8a0 }));
  t.push(P.d1BarricadeModule(a));
  t.push(P.d1ThatchTile(a, { hex: 0x8a6a34 }));
  t.push(P.d1MossTile(a, { hex: 0x5a8a2c, light: 0x8aaa3c }));
  t.push(P.d1KioskWindowModule(a, { wood: 0x8a6a44, shutter: 0x6a7a6a }));
  t.push(P.d1MapBoardModule(a));
  t.push(P.d1RoadTile(a, { hex: 0xa8885a, rut: 0x8a6a44, grass: 0x6b8c34, stone: 0x8a8478, leaf: 0x7a6a2a }));
  t.push(Wt.d1WaterTile(a, { hex: 0x2a98b4, deep: 0x1a6a8a }));
  t.push(Wt.d1FoamEdgeTile(a, { hex: 0xe8f4f4 }));
  t.push(Wt.d1FallTile(a, { hex: 0xb8e0ec }));
  t.push(Wt.d1SplashModule(a, { hex: 0xe8f4f4 }));
  t.push(Wt.d1BankTile(a, { earth: 0x6a5434, sand: 0x9a8a6a, mud: 0x4a3a28, grass: 0x6b8c34, stone: 0x8a8478 }));
}
