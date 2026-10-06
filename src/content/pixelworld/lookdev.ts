import type { PwAtlas, PwTile } from './atlas';
import { acUnitModule, awningTile, corniceTile, doorModule, drainpipeTile, fireEscapeModule, graffitiDecal, posterDecal, shopfrontModule, valanceTile, wallFoot, wallHead, windowModule, type WindowKind } from './facade';
import { bladeSign, lightbox, marquee, neonSign, paintedSign, roadSign } from './signs';
import { daySkyTile, duskSkyTile, nightSkyTile, rangeTile, skylineTile, stormSkyTile, volcanoTile } from './sky';
import {
  asphaltTile, brickTile, chequerTile, corrugatedTile, curbTile, dirtRoadTile, grassTile, panelTile, plasterTile, roadPaintTile, rockTile,
  roofTile, sidewalkTile, sidingTile, stoneTile,
} from './surfaces';

/**
 * The PixelWorld catalogue: one of everything the toolkit paints, registered in
 * an atlas (look-dev dumps, the toolkit tests, the bench). Stage code registers
 * only what it uses.
 */
export function lookdevTiles(atlas: PwAtlas): PwTile[] {
  const t: PwTile[] = [];
  // Walls.
  t.push(brickTile(atlas, { hex: 0x7a3a2c }));
  t.push(brickTile(atlas, { hex: 0x664632 }));
  t.push(brickTile(atlas, { hex: 0x5a3a30, painted: 0x445670 }));
  t.push(plasterTile(atlas, { hex: 0x8a7454, under: 0x7a3a2c }));
  t.push(plasterTile(atlas, { hex: 0x4e6650 }));
  t.push(panelTile(atlas, { hex: 0x62656e }));
  t.push(sidingTile(atlas, { hex: 0x8c8370 }));
  t.push(corrugatedTile(atlas, { hex: 0x7a7e86 }));
  t.push(stoneTile(atlas, { hex: 0x86827a }));
  t.push(roofTile(atlas, { hex: 0x24252b }));
  // Ground.
  t.push(asphaltTile(atlas, { hex: 0x2c2f37, wet: true }));
  t.push(sidewalkTile(atlas, { hex: 0x5a5b62 }));
  t.push(curbTile(atlas, { hex: 0x7a7b80 }));
  t.push(chequerTile(atlas, { a: 0x8a9a96, b: 0x4a5a5a }));
  t.push(roadPaintTile(atlas, { hex: 0xb89a3a }));
  // Nature.
  t.push(dirtRoadTile(atlas, { hex: 0x9a7a52, ruts: true, grass: 0x5a8a30 }));
  t.push(grassTile(atlas, { hex: 0x4f8a2e, flowers: [0xffd23a, 0xff7ac0], dirt: 0x7a6040 }));
  t.push(rockTile(atlas, { hex: 0x8a8070, moss: 0x5a7a30 }));
  // Facade modules.
  const style = { wall: 0x7a3a2c, frame: 0xd8d4c8, stone: 0x86827a };
  (['dark', 'warm', 'dim', 'tv', 'blinds', 'ghoul', 'broken', 'boarded'] as WindowKind[]).forEach((k, i) => t.push(windowModule(atlas, k, style, i)));
  t.push(doorModule(atlas, 'wood', { hex: 0x45301f, stone: 0x86827a, wall: 0x7a3a2c }));
  t.push(doorModule(atlas, 'shop', { hex: 0x45301f, stone: 0x86827a, wall: 0x7a3a2c, lit: 0xffd58a }));
  t.push(doorModule(atlas, 'metal', { hex: 0x4a5058, stone: 0x86827a, wall: 0x7a3a2c }));
  t.push(shopfrontModule(atlas, { widthM: 8, goods: 'liquor', lit: 0xffa080, riser: 0x5a2a2a, frame: 0x34343b, lettering: 'LIQUOR' }));
  t.push(shopfrontModule(atlas, { widthM: 8, goods: 'laundry', lit: 0xd8f4ff, riser: 0x2a4a6a, frame: 0xa8acb0 }));
  t.push(shopfrontModule(atlas, { widthM: 8, goods: 'hardware', lit: 0, riser: 0x3a3a40, frame: 0x34343b, shutter: true }));
  t.push(shopfrontModule(atlas, { widthM: 8, goods: 'generic', lit: 0, riser: 0x5a2a2a, frame: 0x34343b, boarded: true, variant: 2 }));
  t.push(corniceTile(atlas, { hex: 0x86827a }));
  t.push(awningTile(atlas, { hex: 0x1f3a6a }));
  t.push(valanceTile(atlas, { hex: 0x1f3a6a }));
  t.push(wallFoot(atlas, t[0]));
  t.push(wallHead(atlas, t[0]));
  t.push(posterDecal(atlas, 0), posterDecal(atlas, 1));
  t.push(graffitiDecal(atlas, 1));
  t.push(drainpipeTile(atlas, { hex: 0x5a5c62 }));
  t.push(acUnitModule(atlas));
  t.push(fireEscapeModule(atlas, { hex: 0x34363d }));
  // Signs.
  t.push(neonSign(atlas, 'LIQUOR', 0xff2c2c).tile);
  t.push(neonSign(atlas, 'Diner', 0xff3c9a, { font: 'script', cap: 0.9, borderColor: 0x39e8ff }).tile);
  t.push(bladeSign(atlas, 'HOTEL', 0xff2c2c).tile);
  t.push(lightbox(atlas, 'PHARMACY', 0xe8f8f0, 0x1a6a3a).tile);
  t.push(marquee(atlas, ['LAST SHOW', 'TONIGHT'], { widthM: 12.6, heightM: 1.15 }).tile);
  t.push(paintedSign(atlas, 'JURASSIC PARK', { ground: 0x6a4a2a, ink: 0xe8d8a0, planks: true }).tile);
  t.push(roadSign(atlas, 'stop').tile, roadSign(atlas, 'speed', '25').tile, roadSign(atlas, 'warning').tile, roadSign(atlas, 'arrowR').tile);
  return t;
}

/** The backdrop catalogue (2048-wide panoramas; a separate one-level atlas in game). */
export function lookdevBackdrops(atlas: PwAtlas): PwTile[] {
  return [
    nightSkyTile(atlas, { horizon: 0x1a2133, top: 0x03050b, moonAz: 343, moonEl: 16, el0: -4, el1: 60 }),
    skylineTile(atlas, { hex: 0x232a40, fog: 0x1a2133, el0: -3, el1: 14, lights: 0.5, moonAz: 343, seed: 1 }),
    skylineTile(atlas, { hex: 0x161b2a, fog: 0x1a2133, el0: -3, el1: 9, lights: 0.35, tall: 0.95, moonAz: 343, seed: 2 }),
    daySkyTile(atlas, { horizon: 0xc6dfd6, top: 0x2f7fd0, el0: -4, el1: 60, sunAz: 30 }),
    rangeTile(atlas, { hex: 0x6e8c84, haze: 0xb3cfc2, el0: -2, el1: 14, jungle: true, lightAz: 30, seed: 1 }),
    volcanoTile(atlas, { hex: 0x6a7470, haze: 0xb3cfc2, el0: -2, el1: 30, az: 340, halfWidth: 26, lightAz: 30 }),
    stormSkyTile(atlas, { horizon: 0x1c2430, top: 0x2a3446, el0: -4, el1: 60 }),
    duskSkyTile(atlas, { horizon: 0xf0a060, mid: 0xc06070, top: 0x402850, el0: -4, el1: 60, sunAz: 200, sunEl: 4 }),
    rangeTile(atlas, { hex: 0x7a4a48, haze: 0xd08070, el0: -2, el1: 10, mesas: true, lightAz: 200, seed: 3 }),
  ];
}
