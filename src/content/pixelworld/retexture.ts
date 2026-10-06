import * as THREE from 'three';
import type { TexName } from '../kit/Textures';
import type { PwAtlas, PwTile } from './atlas';
import type { PwBatch } from './batch';
import {
  asphaltTile, brickTile, chequerTile, corrugatedTile, fabricTile, flatTile, grateTile, hazardTile, metalTile, panelTile, planksTile, plasterTile,
  roadPaintTile, roofTile, rockTile, sidewalkTile, tilesTile, dirtRoadTile, grassTile,
} from './surfaces';

/** Base colour of the NEUTRAL tiles (light grey: material colours darker than it tint it exactly). */
export const NEUTRAL_HEX = 0xd8d8d8;
/** Neutral brick (a pale brick: bricks keep their warm ramp under any tint). */
export const NEUTRAL_BRICK = 0xd8a890;

/** Mark a tile NEUTRAL (painted round `base`): every use is coloured per vertex. */
export function neutral(t: PwTile, base = NEUTRAL_HEX): PwTile {
  t.neutral = base;
  return t;
}

/**
 * Re-texturing existing scenery with PixelWorld tiles — the bulk path for a
 * stage conversion: every static Kit mesh is re-emitted into a PwBatch (one
 * draw call) with the painted tile its Kit texture + colour maps to, and
 * removed from the scene graph BEFORE the stage's own baker runs (so the baker
 * only merges what stays classic: glows, glass, special shaders).
 *
 *   const pick = kitTileRule(atlas, { overrides: new Map([[M.sidewalk, sidewalkRule]]) });
 *   retexture(zoneGroup, batch, pick);
 *
 * Mapping (KIT_MAP): brick → brick, stucco / wallpaper → plaster, concrete →
 * panels on walls / slabs on the ground, asphalt → asphalt, metal → painted
 * sheet metal, corrugated → ribbed sheet, planks / cardboard → planks, tiles →
 * tiles, checker → chequer, cloth / fabric → canvas, grate → grating, hazard →
 * stripes, rock → rock face, dirt → dirt, grass → grass, the default grain and
 * everything else → a plain painted surface in the material's colour.
 */

export type TileRule = (mat: THREE.Material, nx: number, ny: number, nz: number) => PwTile | null;

/** Is this a material PixelWorld re-paints? (opaque, single-sided Lambert / Standard with a colour; not glowing.) */
export function repaintable(m: THREE.Material): boolean {
  if (m.transparent || m.side !== THREE.FrontSide || m.userData.pixelWorld) return false;
  const l = m as THREE.MeshLambertMaterial;
  if (!(l.isMeshLambertMaterial || (m as THREE.MeshStandardMaterial).isMeshStandardMaterial)) return false;
  if (l.vertexColors || l.map) return false;
  if (l.emissive && l.emissive.getHex() !== 0) return false;
  return true;
}

/** The default Kit-texture → PixelWorld tile mapping (per face: `ny` > 0.7 = a floor / top). */
export function kitTile(atlas: PwAtlas, tex: TexName | undefined, hex: number, ny: number): PwTile | null {
  const up = ny > 0.7;
  switch (tex) {
    case 'brick':
      return neutral(brickTile(atlas, { hex: NEUTRAL_BRICK }), NEUTRAL_BRICK);
    case 'stucco':
    case 'wallpaper':
    case 'marble':
      return neutral(plasterTile(atlas, { hex: NEUTRAL_HEX }));
    case 'concrete':
      return up ? neutral(sidewalkTile(atlas, { hex: NEUTRAL_HEX })) : neutral(panelTile(atlas, { hex: NEUTRAL_HEX }));
    case 'asphalt':
      return up ? asphaltTile(atlas, { hex }) : roofTile(atlas, { hex });
    case 'metal':
    case 'slats':
      return neutral(metalTile(atlas, { hex: NEUTRAL_HEX }));
    case 'corrugated':
      return neutral(corrugatedTile(atlas, { hex: NEUTRAL_HEX }));
    case 'planks':
    case 'cardboard':
      return neutral(planksTile(atlas, { hex: NEUTRAL_HEX }));
    case 'tiles':
      return neutral(tilesTile(atlas, { hex: NEUTRAL_HEX }));
    case 'checker':
      return chequerTile(atlas, { a: hex, b: darkenHex(hex, 0.35) });
    case 'cloth':
    case 'fabric':
    case 'carpet':
      return neutral(fabricTile(atlas, { hex: NEUTRAL_HEX }));
    case 'grate':
      return grateTile(atlas, { hex });
    case 'hazard':
      return hazardTile(atlas, {});
    case 'rock':
      return rockTile(atlas, { hex });
    case 'dirt':
    case 'sand':
      return dirtRoadTile(atlas, { hex, width: 128 });
    case 'grass':
      return grassTile(atlas, { hex });
    case 'leaves':
    case 'bark':
    case 'water':
    case 'smoke':
    case 'clouds':
      return null;
    default:
      return neutral(flatTile(atlas, { hex: NEUTRAL_HEX }));
  }
}

function darkenHex(hex: number, f: number): number {
  return (Math.round(((hex >> 16) & 255) * f) << 16) | (Math.round(((hex >> 8) & 255) * f) << 8) | Math.round((hex & 255) * f);
}

/**
 * A TileRule from `kitTile`, with per-material overrides (the stage's own
 * materials that need a specific painter: sidewalks, curbs, road paint, trims).
 */
export function kitTileRule(atlas: PwAtlas, o: { overrides?: Map<THREE.Material, TileRule>; paint?: Set<THREE.Material> } = {}): TileRule {
  return (mat, nx, ny, nz) => {
    const ov = o.overrides?.get(mat);
    if (ov) return ov(mat, nx, ny, nz);
    if (o.paint?.has(mat)) return roadPaintTile(atlas, { hex: (mat as THREE.MeshLambertMaterial).color.getHex() });
    const tex = mat.userData.retroTex as TexName | undefined;
    return kitTile(atlas, tex, (mat as THREE.MeshLambertMaterial).color.getHex(), ny);
  };
}

/**
 * Re-emit every repaintable static mesh under `root` into `batch` (world
 * frame) and remove it. `skip` keeps a mesh classic. Returns the meshes moved.
 */
export function retexture(root: THREE.Object3D, batch: PwBatch, rule: TileRule, o: { skip?: (m: THREE.Mesh) => boolean; world?: (m: THREE.Mesh) => boolean } = {}): number {
  root.updateMatrixWorld(true);
  const list: THREE.Mesh[] = [];
  root.traverse((ob) => {
    const m = ob as THREE.Mesh;
    if (!m.isMesh || (m as THREE.InstancedMesh).isInstancedMesh || Array.isArray(m.material) || m.userData.noMerge || m.userData.pixelWorld) return;
    if (!repaintable(m.material) || o.skip?.(m)) return;
    // A material the rule leaves alone (water, foliage…) stays classic.
    if (!rule(m.material, 0, 1, 0) && !rule(m.material, 0, 0, 1)) return;
    list.push(m);
  });
  const base = new THREE.Color();
  const tint = [1, 1, 1];
  for (const m of list) {
    const mat = m.material as THREE.MeshLambertMaterial;
    // Neutral tiles take the material's own colour per vertex (linear ratio to the colour they were painted round).
    const tintOf = (t: PwTile) => {
      if (t.neutral === undefined) return null;
      base.setHex(t.neutral);
      tint[0] = Math.min(1, mat.color.r / Math.max(1e-4, base.r));
      tint[1] = Math.min(1, mat.color.g / Math.max(1e-4, base.g));
      tint[2] = Math.min(1, mat.color.b / Math.max(1e-4, base.b));
      return tint;
    };
    batch.geometry(m.geometry, m.matrixWorld, (nx, ny, nz) => rule(mat, nx, ny, nz), { world: o.world?.(m), tintRGB: tintOf });
    m.parent?.remove(m);
  }
  return list.length;
}
