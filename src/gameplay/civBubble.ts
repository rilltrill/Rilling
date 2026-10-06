import * as THREE from 'three';
import { stampCell, stampInfo } from './pixel/stamps';

/**
 * ART: 3D speech bubbles ("HELP!", "THANKS!"): the same hand-pixelled bitmaps
 * the PixelCast painter stamps over a civilian's head in ART: SPRITES (stamps.ts
 * `CIV_STAMP.bubble`), as a camera-facing THREE.Sprite with a nearest-filtered
 * texture, sized every frame to a fixed share of the screen (two retro pixels a
 * cell, like the stamp) and tagged so the sprite art modes hide it (PixelCast
 * draws its own). One texture / material per bubble, shared; one Sprite per
 * civilian, made the first time it speaks. No canvas (node tests): no bubble.
 */

const FILL = '#f8f4e6';
const INK = '#16121c';
/** Retro grid height the cell size is measured in (the retro pass's 288 lines). */
const RETRO_LINES = 288;

const mats = new Map<number, THREE.SpriteMaterial>();

function material(id: number): THREE.SpriteMaterial | null {
  let m = mats.get(id);
  if (m) return m;
  if (typeof document === 'undefined') return null;
  const st = stampInfo(id);
  const c = document.createElement('canvas');
  c.width = st.w;
  c.height = st.h;
  const x = c.getContext('2d');
  if (!x) return null;
  for (let j = 0; j < st.h; j++) {
    for (let i = 0; i < st.w; i++) {
      const code = stampCell(id, i, j);
      if (code === 0) continue;
      // a–f: fill slot (pale), g–l: ink slot (dark).
      x.fillStyle = code >= 7 ? INK : FILL;
      x.fillRect(i, st.h - 1 - j, 1, 1);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.colorSpace = THREE.SRGBColorSpace;
  m = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, fog: false, toneMapped: false });
  mats.set(id, m);
  return m;
}

const _p = new THREE.Vector3();

/** A civilian's 3D speech bubble. */
export class Bubble3D {
  private sprite: THREE.Sprite | null = null;
  private id = -1;

  constructor(private readonly parent: THREE.Object3D) {}

  /**
   * Show bubble `id` (−1 hides it) with its tail tip at world point `tip`, sized
   * for `camera`.
   */
  update(id: number, tip: THREE.Vector3, camera: THREE.PerspectiveCamera) {
    if (id < 0) {
      if (this.sprite) this.sprite.visible = false;
      return;
    }
    if (id !== this.id || !this.sprite) {
      const m = material(id);
      if (!m) return;
      if (!this.sprite) {
        this.sprite = new THREE.Sprite(m);
        // Drawn by PixelCast in the sprite art modes: never baked / kept live there.
        this.sprite.userData.spriteKeep3D = false;
        this.sprite.renderOrder = 5;
        this.parent.add(this.sprite);
      } else this.sprite.material = m;
      this.id = id;
      const st = stampInfo(id);
      // Anchor on the tail's tip (bottom-up anchor cell).
      this.sprite.center.set((st.ax + 0.5) / st.w, (st.ay + 0.5) / st.h);
    }
    const s = this.sprite;
    s.visible = true;
    const st = stampInfo(id);
    // Two retro lines a cell at the bubble's distance.
    const d = Math.max(0.5, _p.copy(tip).sub(camera.getWorldPosition(_cp)).dot(camera.getWorldDirection(_dir)));
    const cell = (2 / RETRO_LINES) * 2 * d * Math.tan((camera.fov * Math.PI) / 360);
    this.parent.updateWorldMatrix(true, false);
    s.position.copy(tip);
    this.parent.worldToLocal(s.position);
    // (Undo the parent's own scale: the size is meant in world metres.)
    const ps = this.parent.getWorldScale(_sc);
    s.scale.set((cell * st.w) / ps.x, (cell * st.h) / ps.y, 1);
  }

  hide() {
    if (this.sprite) this.sprite.visible = false;
  }
}

const _dir = new THREE.Vector3();
const _cp = new THREE.Vector3();
const _sc = new THREE.Vector3();
