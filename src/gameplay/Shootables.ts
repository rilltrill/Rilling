import type * as THREE from 'three';
import type { HitPart } from '../core/types';
import type { Entity } from './Entity';

export interface ShotTag {
  owner: Entity;
  part: HitPart;
}

/** Registry of every mesh bullets can hit, tagged with its owner + hit part. */
export class Shootables {
  readonly objects: THREE.Object3D[] = [];

  add(obj: THREE.Object3D, owner: Entity, part: HitPart) {
    obj.userData.shot = { owner, part } satisfies ShotTag;
    if (!this.objects.includes(obj)) this.objects.push(obj);
  }

  remove(obj: THREE.Object3D) {
    const i = this.objects.indexOf(obj);
    if (i >= 0) this.objects.splice(i, 1);
    delete obj.userData.shot;
  }

  removeOwner(owner: Entity) {
    for (let i = this.objects.length - 1; i >= 0; i--) {
      const tag = this.objects[i].userData.shot as ShotTag | undefined;
      if (!tag || tag.owner === owner) {
        delete this.objects[i].userData.shot;
        this.objects.splice(i, 1);
      }
    }
  }

  /** Objects currently eligible for raycasting (visible + owner alive). */
  active(): THREE.Object3D[] {
    return this.objects.filter((o) => {
      const tag = o.userData.shot as ShotTag | undefined;
      if (!tag || tag.owner.removed) return false;
      let n: THREE.Object3D | null = o;
      while (n) {
        if (!n.visible) return false;
        n = n.parent;
      }
      return true;
    });
  }

  clear() {
    for (const o of this.objects) delete o.userData.shot;
    this.objects.length = 0;
  }
}
