import * as THREE from 'three';
import { EnvKit } from '../../kit/EnvKit';
import type { TexName } from '../../kit/Textures';
import { PwAtlas, type PwTile } from '../../pixelworld/atlas';
import { PwBatch } from '../../pixelworld/batch';
import { PwBackdrop } from '../../pixelworld/backdrop';
import { kitTile, retexture, type TileRule } from '../../pixelworld/retexture';
import { daySkyTile, rangeTile, volcanoSpan, volcanoTile } from '../../pixelworld/sky';
import { dirtRoadTile, grassTile, rockTile } from '../../pixelworld/surfaces';
import { COL } from './flora';

/**
 * JUNGLE RUN in ART: PIXEL WORLD — the second reference conversion (an
 * outdoor, daylight stage with d1's own baker):
 *  - the dirt road is ONE ribbon laid along the rail with v running along it:
 *    packed earth, two compacted tyre tracks that follow every bend, pebbles,
 *    a grassy crown, ragged grass edges cut out over the meadow;
 *  - the meadow is a painted grass field (tufts, clover, flowers, bare earth);
 *  - rocks, boulders and the cliffs are re-painted as fractured rock faces
 *    (facets lit from the upper left, crevices, moss on the ledges) BEFORE
 *    d1's `merged()` bake runs on what stays classic;
 *  - the sky / mountain ring / volcano are a painted panorama (day sky with
 *    sunlit cumulus, a jungle-clad range, a smoking volcano with lava streaks)
 *    instead of cones and blobs.
 * River, waterfall, gate, fallen tree, car and the herd stay classic for the
 * stage agent (see the d1 work-list in docs/ARCHITECTURE.md).
 */

const FOG = 0xb3cfc2;

export class D1PixelWorld {
  readonly atlas = new PwAtlas('d1');
  readonly skyAtlas = new PwAtlas('d1-sky', { levels: 1 });
  /** Road + meadow (environment: always shown in a PIXEL WORLD stage). */
  readonly world: PwBatch;
  /** Rocks / cliffs re-painted out of the ART: SPRITES scenery chunks (toggled with them). */
  readonly veg: PwBatch;
  readonly rule: TileRule;
  backdrop: PwBackdrop | null = null;

  constructor() {
    this.world = new PwBatch(this.atlas);
    this.veg = new PwBatch(this.atlas);
    const a = this.atlas;
    // Rocks / boulders / cliffs: ONE painted rock face (round the lightest rock colour), tinted per material;
    // earth and grass patches: one painted patch tile, tinted. Few tiles → fast stage load.
    const rock = rockTile(a, { hex: 0x9a9282, moss: COL.moss, band: 22 });
    rock.neutral = 0x9a9282;
    const patch = grassTile(a, { hex: 0x8aa040, dirt: COL.litter });
    patch.neutral = 0x8aa040;
    this.rule = (mat, _nx, ny) => {
      const tex = mat.userData.retroTex as TexName | undefined;
      if (tex === 'rock') return rock;
      if (tex === 'grass' || tex === 'dirt') return patch;
      return kitTile(a, tex, (mat as THREE.MeshLambertMaterial).color.getHex(), ny);
    };
  }

  /** The meadow under everything (a painted grass field, world-projected). */
  ground(y: number) {
    const t = grassTile(this.atlas, { hex: COL.ground, flowers: [COL.flowerY, COL.flowerP], dirt: COL.litter });
    this.world.rect(new THREE.Vector3(-800, y, 460), new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, -1), 1600, 1600, t, { u0: 0, v0: 0 });
  }

  /** The road along the rail: one painted ribbon (ruts along v), grassy ragged edges over the meadow. */
  road(curve: THREE.Curve<THREE.Vector3>, to: number) {
    const W = 7.0;
    const t: PwTile = dirtRoadTile(this.atlas, { hex: COL.road, ruts: true, grass: COL.verge, width: 224 });
    const pts: THREE.Vector3[] = [];
    for (let d = 0; d <= to + 0.001; d += 2) pts.push(EnvKit.frameAt(curve, Math.min(d, to)).pos.clone());
    this.world.ribbon(pts, W + 1.0, t, { y: 0.02 });
  }

  /** Re-paint a group's rocks (and earth / grass patches) before it is baked; returns the meshes moved. */
  rocks(g: THREE.Object3D): number {
    return retexture(g, this.veg, this.rule, { world: () => false });
  }

  /** The painted panorama: day sky, the jungle range, the smoking volcano. */
  buildBackdrop(anchor: THREE.Vector3): THREE.Group {
    const s = this.skyAtlas;
    const sky = daySkyTile(s, { horizon: FOG, top: 0x3a86cc, el0: -4, el1: 48, sunAz: 124, clouds: 0.55, haze: 15 });
    const far = rangeTile(s, { hex: 0x7c9a92, haze: FOG, el0: -2, el1: 22, jungle: true, height: 0.85, lightAz: 124, seed: 4 });
    const near = rangeTile(s, { hex: 0x4f7258, haze: FOG, el0: -3, el1: 12, jungle: true, height: 0.7, rough: 0.8, lightAz: 124, seed: 7 });
    const vo = { hex: 0x707a76, haze: FOG, el0: -3, el1: 24, az: 340, halfWidth: 24, lightAz: 124 };
    const volcano = volcanoTile(s, vo);
    this.backdrop = new PwBackdrop(s, { tile: sky, el0: -4, el1: 48, radius: 330 }, [
      { tile: far, radius: 310, el0: -2, el1: 22, follow: 1 },
      { tile: volcano, radius: 280, el0: -3, el1: 24, yaw: vo.az, span: volcanoSpan(vo), follow: 0.85 },
      { tile: near, radius: 250, el0: -3, el1: 12, yaw: 77, follow: 0.92 },
    ]);
    this.backdrop.anchor.copy(anchor);
    return this.backdrop.build();
  }

  /** Paint the atlas and build the meshes: world → `root`, re-painted rocks → `vegPx`. */
  finish(root: THREE.Object3D, vegPx: THREE.Object3D) {
    this.atlas.build();
    const w = this.world.build();
    if (w) root.add(w);
    const v = this.veg.build();
    if (v) vegPx.add(v);
  }
}
