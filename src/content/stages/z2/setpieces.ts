import * as THREE from 'three';
import type { World } from '../../../gameplay/World';
import { Destructible } from '../../../gameplay/Props';
import { B } from './layout';
import { doorPanel, gasModel, oxygenModel } from './props';
import { bake, bakeInto } from './bake';
import { type DoorSlot, z2Scene } from './scene';
import { GAS_CYL, OR_TANKS } from './zonesLower';

const _v = new THREE.Vector3();

/** Spawn the breakable doors and explosive cylinders (called from stage.setup). */
export function spawnProps(world: World) {
  const sc = z2Scene(world);
  if (!sc) return;
  for (const slot of sc.doorSlots) sc.doors.push(spawnDoor(world, slot));
  for (const [x, z] of OR_TANKS) spawnTank(world, new THREE.Vector3(x, B, z), 'oxygen');
  for (const [x, z] of GAS_CYL) spawnTank(world, new THREE.Vector3(x, B, z), 'gas');
}

function spawnDoor(world: World, slot: DoorSlot): Destructible {
  const sc = z2Scene(world)!;
  const model = doorPanel(slot.w, slot.h, slot.color);
  bake(model);
  // PIXEL WORLD: the same triangles (same hit boxes), a painted door leaf projected through them.
  sc.pw?.paintDoor(model, slot.w, slot.h, slot.color);
  model.rotation.y = slot.ry;
  const d = new Destructible(world, {
    model,
    pos: slot.hinge.clone(),
    hp: 3,
    debrisColor: slot.color,
    sfx: 'wood_break',
    onDestroy: (w) => {
      // The slab flies into the corridor and clatters to the floor.
      w.audio.play('door', { volume: 0.9, pitch: 0.8 });
      w.rig.shake(0.18);
      const slab = new THREE.Group();
      bakeInto(slab, (g) => {
        const p = doorPanel(slot.w, slot.h, slot.color);
        p.position.set(-slot.w / 2, -slot.h / 2, 0);
        g.add(p);
      });
      sc.pw?.paintDoor(slab, slot.w, slot.h, slot.color, -slot.w / 2, -slot.h / 2);
      slab.position.copy(slot.centre).setY(slot.centre.y + slot.h / 2);
      slab.rotation.y = slot.ry;
      sc.root.add(slab);
      const r = w.rng;
      sc.flyers.push({
        obj: slab,
        vel: new THREE.Vector3(slot.out.x * 4.5 + r.spread(0.8), 2.2, slot.out.z * 4.5 + r.spread(0.8)),
        spin: new THREE.Vector3(slot.out.z * -3.5, r.spread(2), slot.out.x * 3.5),
        // (Slots sit on their floor: corridor A at 0, the basement service corridor at B.)
        floor: slot.centre.y,
        rest: false,
        half: 0.04,
      });
      w.fx.dust(_v.copy(slot.centre).setY(slot.centre.y + 1), 1, 0x8a8478);
    },
  });
  d.root.userData.slot = slot;
  world.add(d);
  sc.cullables.push({ obj: d.root, pos: slot.centre.clone() });
  return d;
}

function spawnTank(world: World, pos: THREE.Vector3, kind: 'oxygen' | 'gas') {
  const sc = z2Scene(world)!;
  const model = kind === 'oxygen' ? oxygenModel() : gasModel();
  bake(model);
  // PIXEL WORLD: the same triangles (same hit boxes), painted.
  sc.pw?.paintTank(model, kind);
  const d = new Destructible(world, {
    model,
    pos,
    hp: 1,
    points: 150,
    explode: { radius: 4.8, damage: 9 },
  });
  world.add(d);
  sc.tanks.push({ pos: pos.clone(), kind });
  sc.cullables.push({ obj: d.root, pos: pos.clone() });
}

/** Ambulance swerves in and crashes into the canopy pillar (~1.4 s; the doors burst ~0.3 s later). */
export function crashAmbulance(world: World) {
  const sc = z2Scene(world);
  const ar = sc?.ambulance;
  if (!ar || ar.state !== 'idle') return;
  ar.state = 'driving';
  ar.t = 0;
  world.audio.play('engine_rev', { volume: 0.9, pitch: 0.85 });
  world.audio.play('alarm', { volume: 0.35, pitch: 1.3 });
  world.later(0.6, () => world.audio.play('engine_rev', { volume: 1, pitch: 1.1 }));
}

/** Put the ambulance in its crashed pose if the crash was skipped (debug starts). */
export function ensureAmbulanceCrashed(world: World) {
  const ar = z2Scene(world)?.ambulance;
  if (ar && ar.state === 'idle') snapAmbulanceCrashed(ar);
}

export function snapAmbulanceCrashed(ar: NonNullable<ReturnType<typeof z2Scene>>['ambulance']) {
  if (!ar) return;
  const a = ar.amb;
  ar.state = 'crashed';
  ar.t = 1;
  ar.doorsT = 1;
  a.root.visible = true;
  a.root.position.copy(ar.to);
  a.root.rotation.y = ar.yawTo;
  a.doorL.rotation.y = -1.9;
  a.doorR.rotation.y = 1.9;
  for (const f of ar.flames) f.obj.visible = true;
}

/**
 * Something scrabbles inside the ceiling vent nearest (x, z): clanks, dust and
 * the grate jumps — the warning before a crawler drops out of it.
 */
export function ventRattle(world: World, x: number, z: number, times: number[] = [0, 0.3, 0.55]) {
  const sc = z2Scene(world);
  if (!sc) return;
  let vent: (typeof sc.vents)[number] | null = null;
  let best = 3;
  for (const v of sc.vents) {
    if (v.dropped) continue;
    const d = Math.hypot(v.pos.x - x, v.pos.z - z);
    if (d < best) {
      best = d;
      vent = v;
    }
  }
  if (!vent) return;
  const v = vent;
  const y0 = v.grate.position.y;
  times.forEach((t, i) => {
    world.later(t, () => {
      if (v.dropped) return;
      world.audio.play('metal_clang', { volume: 0.45, vary: 0.25, pitch: 1.45 + i * 0.12 });
      v.grate.position.y = y0 - 0.04;
      v.grate.rotation.z = (i % 2 ? -1 : 1) * 0.08;
      world.fx.dust(_v.copy(v.pos).setY(v.pos.y - 0.15), 0.3, 0x8a8a80);
      world.later(0.1, () => {
        if (v.dropped) return;
        v.grate.position.y = y0;
        v.grate.rotation.z = 0;
      });
    });
  });
}

/** Something big pounds on the boiler-room wall. */
export function wallThuds(world: World, times: number[]) {
  const sc = z2Scene(world);
  for (const t of times) {
    world.later(t, () => {
      world.audio.play('door', { volume: 1, pitch: 0.45 });
      world.audio.play('hit_world', { volume: 0.9, pitch: 0.5 });
      world.rig.shake(0.22);
      if (sc?.wall && !sc.wall.broken) {
        sc.wall.shake = 1;
        world.fx.dust(_v.copy(sc.wall.centre).setZ(sc.wall.centre.z + 0.3), 0.6, 0x8a8478);
      }
      // Lights cut out on the first thud and stay out until the wall gives.
      if (sc) sc.surge = Math.max(sc.surge, 0.8);
    });
  }
}

/** The wall bursts into the corridor. */
export function burstWall(world: World) {
  const sc = z2Scene(world);
  const bw = sc?.wall;
  if (!sc || !bw || bw.broken) return;
  bw.broken = true;
  const r = world.rng;
  world.audio.play('crash', { volume: 1, pitch: 0.7 });
  world.audio.play('wood_break', { volume: 0.8, pitch: 0.6 });
  world.audio.play('brute_roar', { volume: 0.9 });
  world.rig.shake(0.8);
  world.haptic(150);
  world.fx.dust(_v.copy(bw.centre).setY(B + 0.4), 2.2, 0x8a8478);
  world.fx.debris(_v.copy(bw.centre).setZ(bw.centre.z + 0.6), 0x6a6c66);
  for (const p of bw.pieces) {
    sc.root.attach(p);
    sc.flyers.push({
      obj: p,
      vel: new THREE.Vector3(r.spread(2.5), r.range(1.5, 4), bw.out.z * r.range(4, 8)),
      spin: new THREE.Vector3(r.spread(6), r.spread(4), r.spread(6)),
      floor: B,
      rest: false,
      half: 0.15,
    });
  }
  // Stencil + cracks overlay goes with it.
  for (const c of [...bw.holder.children]) c.visible = false;
}
