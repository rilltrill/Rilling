import * as THREE from 'three';
import { FloraField, floraAtlas } from '../../pixel/floraField';
import { D1_HERD, D1_HERD_BIOME, D1_HERD_FRAMES } from '../../pixelworld/d1Herd';

/**
 * The herd in ART: PIXEL WORLD: every duck-bill and long-neck is a
 * hand-pixelled side-view billboard (FLORA machinery: one instanced draw, lit
 * like the scenery) whose frame plays the run / walk cycle from the herd's own
 * gait phase and which turns to face the way the animal moves across the
 * screen. The herd's logic (paths, timing, dust, sounds, RNG draws) is
 * untouched: it only hands each animal's pose to `set`.
 */
export class D1HerdSprites {
  readonly mesh: THREE.Mesh;
  private pos: Float32Array;
  private box: Float32Array;
  private misc: Float32Array;
  private iPos: THREE.InstancedBufferAttribute;
  private iBox: THREE.InstancedBufferAttribute;
  private iMisc: THREE.InstancedBufferAttribute;
  private frames: { hadro: number[][]; sauro: number[][] };
  private dirty = false;
  private readonly camRight = new THREE.Vector3();

  constructor(hadros: { scale: number }[], giants: number) {
    const field = new FloraField(floraAtlas(D1_HERD, D1_HERD_BIOME, 'd1-herd'), { far: 220 });
    const atlas = field.atlas;
    const rects = (key: string) => (atlas.sprites.get(key) ?? []).slice().sort((a, b) => a.variant - b.variant).map((s) => [s.x, s.y, s.w, s.h]);
    this.frames = { hadro: rects('hadroRun'), sauro: rects('sauroWalk') };
    // Hidden below the ground until posed.
    for (const h of hadros) field.add('hadroRun', 0, -500, 0, 3.9 * h.scale, { variant: 0, flip: false });
    for (let i = 0; i < giants; i++) field.add('sauroWalk', 0, -500, 0, 15, { variant: 0, flip: false, tint: i % 2 ? 1.06 : 0.94 });
    this.mesh = field.build();
    this.mesh.name = 'd1-herd';
    const g = this.mesh.geometry;
    this.iPos = g.getAttribute('iPos') as THREE.InstancedBufferAttribute;
    this.iBox = g.getAttribute('iBox') as THREE.InstancedBufferAttribute;
    this.iMisc = g.getAttribute('iMisc') as THREE.InstancedBufferAttribute;
    for (const a of [this.iPos, this.iBox, this.iMisc]) a.setUsage(THREE.DynamicDrawUsage);
    this.pos = this.iPos.array as Float32Array;
    this.box = this.iBox.array as Float32Array;
    this.misc = this.iMisc.array as Float32Array;
    this.hadros = hadros.length;
    // Per-animal hide tints (the classic herd's five colours, as brightness).
    for (let i = 0; i < hadros.length; i++) this.misc[i * 4 + 1] = [1, 1.08, 0.9, 1.02, 1.12][i % 5];
  }

  private hadros: number;

  /** Camera right (call once a frame before posing). Allocation-free. */
  view(cam: THREE.Camera) {
    const e = cam.matrixWorld.elements;
    this.camRight.set(e[0], 0, e[2]);
  }

  /**
   * Pose animal `i` (hadros first, then giants: `giant`): foot at `p`
   * (`visible` false hides it), gait phase `ph` (radians), moving along (dx, dz).
   */
  set(i: number, giant: boolean, p: THREE.Vector3, visible: boolean, ph: number, dx: number, dz: number) {
    const k = giant ? this.hadros + i : i;
    const fr = giant ? this.frames.sauro : this.frames.hadro;
    const n = fr.length || 1;
    const f = ((Math.floor((ph / (Math.PI * 2)) * D1_HERD_FRAMES) % n) + n) % n;
    this.pos[k * 3] = p.x;
    this.pos[k * 3 + 1] = visible ? p.y : -500;
    this.pos[k * 3 + 2] = p.z;
    const r = fr[f];
    if (r) {
      this.box[k * 4] = r[0];
      this.box[k * 4 + 1] = r[1];
    }
    // Face the way it moves across the screen (sprites are painted facing right).
    this.misc[k * 4] = dx * this.camRight.x + dz * this.camRight.z >= 0 ? 1 : -1;
    this.dirty = true;
  }

  /** Upload this frame's poses. */
  flush() {
    if (!this.dirty) return;
    this.dirty = false;
    this.iPos.needsUpdate = true;
    this.iBox.needsUpdate = true;
    this.iMisc.needsUpdate = true;
  }
}
