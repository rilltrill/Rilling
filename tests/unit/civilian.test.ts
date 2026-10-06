import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import '../../src/content';
import { createEnemy } from '../../src/content/registry';
import { World } from '../../src/gameplay/World';
import { AudioSystem } from '../../src/audio/Audio';
import { DEFAULT_SETTINGS, type HitPart } from '../../src/core/types';
import { Civilian, GRAB_SEP, type CivAct } from '../../src/gameplay/Civilian';
import { Grabber } from '../../src/gameplay/civGrab';
import type { Enemy } from '../../src/gameplay/Enemy';
import type { ShotHit } from '../../src/gameplay/Entity';
import type { ShotTag } from '../../src/gameplay/Shootables';
import type { HumanoidRig } from '../../src/content/kit/humanoid';
import { CIV_STAMP } from '../../src/gameplay/pixel/stamps';
import { nullHud } from './sim';

/**
 * Civilian behaviour: the act repertoire (gameplay/Civilian.ts) — how they come
 * on (running in rather than popping up in plain sight), what each act does,
 * how they react to the zombies / dinos around them, and the gameplay rules
 * that stay as tuned: a hit costs a life (once); a rescue pays once — on the
 * spot when the player shoots the zombie holding them, otherwise with the rest
 * when the encounter is cleared (one who got away off screen too); a grabbed
 * civilian's attacker stays a clear shot and never attacks while it holds on;
 * running civilians only ever move outward on screen.
 */

const DT = 1 / 60;

function makeWorld(seed = 7) {
  const camera = new THREE.PerspectiveCamera(58, 844 / 390, 0.05, 400);
  const world = new World(camera, new AudioSystem(), nullHud, { ...DEFAULT_SETTINGS, haptics: false }, seed);
  world.viewport = { width: 844, height: 390 };
  world.player.god = true;
  // A straight rail: the camera stands at the origin looking down −Z.
  world.rig.setPath([
    [0, 0, 0],
    [0, 0, -80],
  ]);
  world.rig.update(0);
  world.scene.updateMatrixWorld(true);
  const events = { rescued: 0, shot: 0 };
  world.events.on('civilian-rescued', () => events.rescued++);
  world.events.on('civilian-shot', () => events.shot++);
  return { world, camera, events };
}

function step(world: World, seconds: number, each?: () => void) {
  for (let t = 0; t < seconds; t += DT) {
    world.update(DT);
    world.scene.updateMatrixWorld();
    each?.();
  }
}

function spawnCiv(world: World, x: number, z: number, act: CivAct, variant = 'worker', o: { to?: THREE.Vector3; from?: THREE.Vector3 } = {}): Civilian {
  return world.add(new Civilian(world, new THREE.Vector3(x, 0, z), 'world', variant, { act, ...o }));
}

/** Spawn and let them run in to their spot (in view, they arrive from the edge). */
function placeCiv(world: World, x: number, z: number, act: CivAct, variant = 'worker'): Civilian {
  const c = spawnCiv(world, x, z, act, variant);
  for (let i = 0; i < 240 && c.state === 'arrive'; i++) step(world, DT);
  return c;
}

function spawnEnemy(world: World, id: string, x: number, z: number, opts: Record<string, unknown> = {}): Enemy {
  return world.add(createEnemy(id, world, { pos: new THREE.Vector3(x, 0, z), frame: 'world', entry: 'walk', hpMul: 1, speedMul: 1, opts }));
}

function ndc(world: World, p: THREE.Vector3): THREE.Vector3 {
  return p.clone().project(world.camera);
}

function rigOf(c: Civilian): HumanoidRig {
  return (c as unknown as { rig: HumanoidRig }).rig;
}

function hitOn(e: Enemy | Civilian, obj: THREE.Object3D, part: HitPart, damage: number): ShotHit {
  const point = obj.getWorldPosition(new THREE.Vector3());
  const dir = point.clone().sub(new THREE.Vector3(0, 1.62, 0)).normalize();
  return { object: obj, part, point, normal: null, dir, distance: 5, damage, weapon: 'pistol', assisted: false, screenX: 400, screenY: 200 };
}

function hitboxes(world: World, owner: unknown): THREE.Object3D[] {
  return world.shootables.objects.filter((o) => (o.userData.shot as ShotTag | undefined)?.owner === owner);
}

/** The hand (box centre) of an arm, world. */
function handOf(arm: { elbow: THREE.Object3D }): THREE.Vector3 {
  return arm.elbow.localToWorld(new THREE.Vector3(0, -0.31, 0));
}

describe('coming on', () => {
  it('in plain view they run in from the nearer edge of the view (no popping up out of nowhere), calling for help', { timeout: 30_000 }, () => {
    for (const side of [1, -1]) {
      const { world } = makeWorld();
      const c = spawnCiv(world, side * 4, -7, 'cower');
      expect(c.state).toBe('arrive');
      // (A moment out of sight and no target while the camera is still: then on.)
      expect(c.root.visible).toBe(false);
      expect(world.shootables.objects.some((o) => (o.userData.shot as ShotTag).owner === c)).toBe(false);
      let wait = 0;
      while (!c.root.visible && wait++ < 30) step(world, DT);
      expect(wait / 60).toBeLessThan(0.2);
      expect(c.speech).toBe(CIV_STAMP.bubble.help);
      expect(world.shootables.objects.some((o) => (o.userData.shot as ShotTag).owner === c)).toBe(true);
      step(world, DT);
      // Starts out of view on its own side.
      expect(Math.abs(ndc(world, rigOf(c).chest.getWorldPosition(new THREE.Vector3())).x)).toBeGreaterThan(1);
      expect(Math.sign(ndc(world, c.root.position).x)).toBe(side);
      let frames = 0;
      while (c.state === 'arrive' && frames++ < 300) step(world, DT);
      expect(frames / 60, 'there within ~2.5 s').toBeLessThan(2.5);
      expect(c.root.position.distanceTo(new THREE.Vector3(side * 4, 0, -7))).toBeLessThan(0.3);
      expect(c.state).toBe('cower');
      // Already turned to the act's facing on arrival: no spin on the knees.
      const cam = Math.atan2(-c.root.position.x, -c.root.position.z);
      const yaw0 = c.root.rotation.y;
      step(world, 1);
      expect(Math.abs(Math.atan2(Math.sin(c.root.rotation.y - yaw0), Math.cos(c.root.rotation.y - yaw0))), 'turn after landing').toBeLessThan(0.3);
      void cam;
    }
  });

  it('they wait (out of sight, no target) for the camera to stop turning to the scene before running in — 1.2 s at most', { timeout: 30_000 }, () => {
    const { world, camera } = makeWorld();
    const c = spawnCiv(world, 4, -7, 'cower');
    // The camera swinging to and fro at 1 rad/s (it ends up where it was).
    let f = 0;
    const pan = () => {
      camera.rotation.y += (Math.floor(f++ / 15) % 2 ? -1 : 1) / 60;
      camera.updateMatrixWorld();
    };
    world.rig.update = () => {};
    for (let i = 0; i < 60; i++) {
      pan();
      step(world, DT);
    }
    expect(c.root.visible, 'still waiting while it turns').toBe(false);
    expect(world.shootables.objects.some((o) => (o.userData.shot as ShotTag).owner === c)).toBe(false);
    // It stops: on they come.
    let n = 0;
    while (!c.root.visible && n++ < 60) step(world, DT);
    expect(n / 60).toBeLessThan(0.4);
    expect(c.state).toBe('arrive');
    // Never more than 1.2 s, however long it turns.
    const d = spawnCiv(world, -4, -7, 'cower');
    let t = 0;
    while (!d.root.visible && t < 4) {
      pan();
      step(world, DT);
      t += DT;
    }
    expect(t).toBeLessThan(1.3);
  });

  it('from a doorway when the stage says so; out of view or far in, they are simply there', { timeout: 30_000 }, () => {
    const { world } = makeWorld();
    const door = new THREE.Vector3(-1, 0, -16);
    const c = spawnCiv(world, 1.5, -12, 'cower', 'scientist', { from: door });
    expect(c.state).toBe('arrive');
    while (!c.root.visible) step(world, DT);
    expect(c.root.position.distanceTo(door)).toBeLessThan(0.01);
    // Behind the camera: no run-in.
    const b = spawnCiv(world, 0, 6, 'cower');
    expect(b.state).toBe('cower');
    // Runners and the grabbed don't run in.
    expect(spawnCiv(world, 3, -9, 'flee').state).not.toBe('arrive');
    expect(spawnCiv(world, 3, -12, 'grabbed', 'nurse').state).toBe('grabbed');
  });
});

describe('civilian acts', () => {
  it('each act plays as the stage asked (HELP! from inside the act, or a short one first)', { timeout: 30_000 }, () => {
    const { world } = makeWorld();
    const expectOpen: [CivAct, string, string][] = [
      ['cower', 'cower', 'cower'],
      ['hide', 'hide', 'hide'],
      // (Nothing threatening around: waits, cowering, for the danger to be real.)
      ['flee', 'cower', 'cower'],
      ['backaway', 'backaway', 'backaway'],
      ['plead', 'plead', 'cower'],
      ['auto', 'plead', 'cower'],
    ];
    for (const [act, first, then] of expectOpen) {
      const c = placeCiv(world, -3, -9, act);
      expect(c.state, act).toBe(first);
      if (first === 'plead') expect(c.speech, `${act} says HELP!`).toBe(CIV_STAMP.bubble.help);
      step(world, 2.4);
      if (!c.removed && act !== 'backaway') expect(c.state, `${act} after its HELP!`).toBe(then);
      c.removed = true;
      step(world, DT);
    }
  });

  it('HELP! without hands up: calling, a hand at the mouth, waving from the elbow beside the head', { timeout: 30_000 }, () => {
    const { world } = makeWorld();
    const c = placeCiv(world, 3, -9, 'plead', 'nurse');
    const r = rigOf(c);
    let checks = 0;
    let nearTop = -Infinity;
    step(world, 2, () => {
      if (c.state !== 'plead') return;
      checks++;
      const head = r.head.localToWorld(new THREE.Vector3(0, 0.26, 0));
      // Neither hand over the top of the head (that's the old hands-up silhouette).
      for (const arm of [r.armL, r.armR]) {
        expect(handOf(arm).y).toBeLessThan(head.y + 0.05);
        nearTop = Math.max(nearTop, handOf(arm).y - head.y);
      }
      // One hand at the mouth.
      const mouth = r.head.localToWorld(new THREE.Vector3(0, 0.06, 0.13));
      expect(Math.min(handOf(r.armL).distanceTo(mouth), handOf(r.armR).distanceTo(mouth))).toBeLessThan(0.16);
    });
    expect(checks).toBeGreaterThan(30);
    expect(nearTop).toBeLessThan(0.05);
    // A far-off civilian (or one up on a truck) crouches lower and bounces on the
    // knees as they call — still no arm up over the head (no "dab").
    const far = placeCiv(world, -4, -22, 'plead', 'cop');
    let farTop = -Infinity;
    let hipLo = Infinity;
    let hipHi = -Infinity;
    step(world, 1.5, () => {
      const fr = rigOf(far);
      const top = fr.head.localToWorld(new THREE.Vector3(0, 0.26, 0)).y;
      if (far.state !== 'plead') return;
      farTop = Math.max(farTop, handOf(fr.armL).y - top, handOf(fr.armR).y - top);
      const y = fr.hips.getWorldPosition(new THREE.Vector3()).y;
      hipLo = Math.min(hipLo, y);
      hipHi = Math.max(hipHi, y);
    });
    expect(farTop).toBeLessThan(0.05);
    expect(hipHi - hipLo, 'bouncing').toBeGreaterThan(0.03);
  });

  it('cower: down on both knees, peeks up between ducks (HELP! the first times), shakes visibly, flinches at a shot close by', { timeout: 30_000 }, () => {
    const { world } = makeWorld();
    const c = placeCiv(world, 3.5, -8, 'cower');
    const head = rigOf(c).head;
    let lo = Infinity;
    let hi = -Infinity;
    let helps = 0;
    let was = -1;
    const hx: number[] = [];
    let k = 0;
    step(world, 8, () => {
      const p = head.getWorldPosition(new THREE.Vector3());
      if (c.state === 'cower') {
        lo = Math.min(lo, p.y);
        hi = Math.max(hi, p.y);
      }
      if (c.speech === CIV_STAMP.bubble.help && was !== CIV_STAMP.bubble.help) helps++;
      was = c.speech;
      // Head on screen at the 12 fps sprite cadence.
      if (k++ % 5 === 0) hx.push(ndc(world, head.localToWorld(new THREE.Vector3(0, 0.13, 0))).x * 422);
    });
    expect(c.state).toBe('cower');
    // Crouched low, and the head comes up to peek.
    expect(hi).toBeLessThan(1.3);
    expect(hi - lo, 'peeks up between ducks').toBeGreaterThan(0.08);
    expect(helps, 'calls HELP! out of the cower').toBeGreaterThanOrEqual(1);
    // The shiver shows on the sprite grid: the head jumps ≥ 1 px between most sprite frames.
    let moves = 0;
    for (let i = 1; i < hx.length; i++) if (Math.abs(hx[i] - hx[i - 1]) >= 1) moves++;
    expect(moves / hx.length).toBeGreaterThan(0.5);
    // A shot right by: a flinch (head down hard).
    step(world, 0.3);
    const y0 = head.getWorldPosition(new THREE.Vector3()).y;
    const sp = ndc(world, head.getWorldPosition(new THREE.Vector3()));
    world.events.emit('shot', { hit: false, x: (sp.x * 0.5 + 0.5) * 844 + 30, y: (-sp.y * 0.5 + 0.5) * 390 });
    let low = Infinity;
    step(world, 0.2, () => (low = Math.min(low, head.getWorldPosition(new THREE.Vector3()).y)));
    expect(low).toBeLessThanOrEqual(y0 + 0.01);
    // A walker close by: stays ducked (no peeking) and doesn't run (a stage's COWER holds its spot).
    const z = spawnEnemy(world, 'walker', 2.2, -9);
    const at = c.root.position.clone();
    let peakWhileNear = -Infinity;
    step(world, 3, () => {
      if (z.root.position.distanceTo(c.root.position) < 3.5) peakWhileNear = Math.max(peakWhileNear, head.getWorldPosition(new THREE.Vector3()).y);
    });
    expect(c.state).toBe('cower');
    expect(c.root.position.distanceTo(at)).toBeLessThan(0.01);
    if (peakWhileNear > -Infinity) expect(peakWhileNear).toBeLessThan(lo + 0.08);
  });

  it('flee: waits for real danger, then runs out across the view (outward only, on screen ~2–4 s), trips at most once and only on screen; safe off screen, paid at the clear', { timeout: 30_000 }, () => {
    for (const side of [1, -1]) {
      const { world, events } = makeWorld();
      const c = spawnCiv(world, side * 2.2, -10, 'flee', 'default');
      step(world, 1);
      expect(c.state, 'nothing near: waiting').toBe('cower');
      spawnEnemy(world, 'walker', -side * 0.5, -15);
      let lastX = -Infinity;
      let back = 0;
      let stumbles = 0;
      let offStumble = 0;
      let prev = c.state;
      let frames = 0;
      let onScreen = 0;
      while (!c.escaped && frames++ < 900) {
        step(world, DT);
        if (c.escaped) break;
        const p = ndc(world, c.root.position.clone().setY(1));
        if (c.state === 'flee' || c.state === 'stumble') {
          const x = p.x * side;
          if (x < lastX - 0.005) back++;
          lastX = Math.max(lastX, x);
          if (Math.abs(p.x) < 1) onScreen += DT;
        }
        if (c.state === 'stumble' && prev !== 'stumble') {
          stumbles++;
          if (Math.abs(p.x) > 0.85) offStumble++;
        }
        prev = c.state;
      }
      expect(c.escaped, 'got away').toBe(true);
      expect(back, 'never heads back toward the middle of the view').toBe(0);
      expect(stumbles).toBeLessThanOrEqual(1);
      expect(offStumble).toBe(0);
      expect(onScreen, 'the run reads: a few seconds on screen').toBeGreaterThan(1.8);
      expect(onScreen).toBeLessThan(4.5);
      // Out of play: no target, nothing paid yet…
      expect(hitboxes(world, c)).toEqual([]);
      expect(c.root.visible).toBe(false);
      expect(events.rescued).toBe(0);
      // …until the encounter is cleared (the stage runner rescues everyone left).
      c.rescue();
      c.rescue();
      expect(events.rescued).toBe(1);
      expect(c.removed).toBe(true);
    }
  });

  it('backaway: edges back, forearm over the face, kept three-quarters to the camera; then runs', { timeout: 30_000 }, () => {
    const { world, events } = makeWorld();
    const c = placeCiv(world, 3.2, -8, 'backaway', 'cop');
    expect(c.state).toBe('backaway');
    const z = spawnEnemy(world, 'walker', -1.5, -9.5);
    const p0 = c.root.position.clone();
    const seen = new Set<string>();
    let maxYaw = 0;
    step(world, 6, () => {
      seen.add(c.state);
      if (c.state === 'backaway') {
        const cam = Math.atan2(-c.root.position.x, -c.root.position.z);
        let d = c.root.rotation.y - cam;
        d = Math.atan2(Math.sin(d), Math.cos(d));
        maxYaw = Math.max(maxYaw, Math.abs(d));
      }
    });
    expect(maxYaw, 'never in profile').toBeLessThan(0.75);
    expect(seen.has('flee')).toBe(true);
    // Backed off away from the zombie (and outward), never toward it.
    expect(c.escaped || c.root.position.x > p0.x).toBe(true);
    // Escaped: paid at the clear, not before.
    expect(events.rescued).toBe(0);
    void z;
  });

  it('backaway: falls only when startled (a shot or kill close by, something lunging) — and only ever once; no trip at all left alone', { timeout: 60_000 }, () => {
    let falls = 0;
    for (let seed = 1; seed <= 10; seed++) {
      for (const shoot of [false, true]) {
        const { world } = makeWorld(seed);
        const c = placeCiv(world, 3.2, -8, 'backaway', 'cop');
        spawnEnemy(world, 'walker', -1.5, -14);
        const seq: string[] = [];
        let t = 0;
        step(world, 6, () => {
          t += DT;
          if (seq[seq.length - 1] !== c.state) seq.push(c.state);
          if (shoot && Math.abs(t - 0.8) < DT / 2 && c.state === 'backaway') {
            const sp = ndc(world, rigOf(c).head.getWorldPosition(new THREE.Vector3()));
            world.events.emit('shot', { hit: false, x: (sp.x * 0.5 + 0.5) * 844 + 40, y: (-sp.y * 0.5 + 0.5) * 390 });
          }
        });
        const downs = seq.filter((s) => s === 'fall' || s === 'stumble').length;
        expect(downs, `seed ${seed} ${shoot ? 'shot' : 'quiet'}: ${seq.join('>')}`).toBeLessThanOrEqual(1);
        if (!shoot) expect(seq.includes('fall'), `seed ${seed}: tripped over nothing`).toBe(false);
        if (seq.includes('fall')) falls++;
      }
    }
    // (Half of them are the kind who trip: some did, startled.)
    expect(falls).toBeGreaterThan(0);
  });

  it('plead: calls for help again and again, cowering in between', { timeout: 30_000 }, () => {
    const { world } = makeWorld();
    const c = placeCiv(world, -3.5, -9, 'plead', 'scientist');
    let helps = 0;
    let was = -1;
    step(world, 14, () => {
      if (c.speech === CIV_STAMP.bubble.help && was !== CIV_STAMP.bubble.help) helps++;
      was = c.speech;
    });
    expect(helps).toBeGreaterThanOrEqual(2);
  });

  it('auto: a zombie comes close — backs off and runs for it (outward)', { timeout: 30_000 }, () => {
    const { world } = makeWorld();
    const c = placeCiv(world, 2.5, -7, 'auto');
    step(world, 2.2);
    expect(c.state).toBe('cower');
    spawnEnemy(world, 'walker', 1.6, -9.0);
    const seen = new Set<string>();
    step(world, 8, () => seen.add(c.state));
    expect([...seen].some((s) => s === 'backaway' || s === 'flee')).toBe(true);
  });

  it('rescued: thanks the player (THANKS!, a thumbs-up or a wave — no hand over the head), then jogs off screen', { timeout: 30_000 }, () => {
    const { world, events } = makeWorld();
    const c = placeCiv(world, -3, -8, 'cower', 'nurse');
    step(world, 2);
    c.rescue();
    c.rescue();
    expect(events.rescued, 'pays once').toBe(1);
    expect(c.state).toBe('thanks');
    expect(c.speech).toBe(CIV_STAMP.bubble.thanks);
    expect(hitboxes(world, c)).toEqual([]);
    const r = rigOf(c);
    const seen = new Set<string>();
    let t = 0;
    step(world, 8, () => {
      t += DT;
      if (c.removed) return;
      seen.add(c.state);
      // (Past the blend out of the crouch.)
      if (c.state === 'thanks' && t > 0.35) {
        const top = r.head.localToWorld(new THREE.Vector3(0, 0.26, 0)).y;
        for (const arm of [r.armL, r.armR]) expect(handOf(arm).y).toBeLessThan(top);
      }
    });
    expect(seen.has('leave')).toBe(true);
    expect(c.removed).toBe(true);
  });

  it('shot: costs a life once (as ever), whatever they were doing', { timeout: 30_000 }, () => {
    const { world, events } = makeWorld();
    world.player.god = false;
    const hp = world.player.hp;
    const c = spawnCiv(world, 2, -7, 'flee', 'worker');
    step(world, 0.5);
    const body = hitboxes(world, c)[0];
    c.onShot(hitOn(c, body, 'torso', 1));
    c.onShot(hitOn(c, body, 'torso', 1));
    expect(events.shot).toBe(1);
    expect(world.player.hp).toBe(hp - 1);
    expect(hitboxes(world, c)).toEqual([]);
    step(world, 2.5);
    expect(c.removed).toBe(true);
  });

  it('perched (on a truck bed): calls for help, never runs off', { timeout: 30_000 }, () => {
    const { world } = makeWorld();
    const c = world.add(new Civilian(world, new THREE.Vector3(-3, 1.4, -9), 'world', 'worker', { act: 'flee' }));
    const p0 = c.root.position.clone();
    expect(c.state).toBe('plead');
    spawnEnemy(world, 'walker', -2.4, -10);
    step(world, 6);
    expect(c.act).toBe('plead');
    expect(c.root.position.distanceTo(p0)).toBeLessThan(1e-6);
  });

  it('one draw from the world RNG per civilian, as before (the stages keep their random streams)', { timeout: 30_000 }, () => {
    const { world } = makeWorld(3);
    const s0 = world.rng.state;
    world.rng.next();
    const s1 = world.rng.state;
    world.rng.state = s0;
    world.add(new Civilian(world, new THREE.Vector3(0, 0, -6), 'world', 'cop', { act: 'cower' }));
    expect(world.rng.state).toBe(s1);
    step(world, 3);
    expect(world.rng.state, 'and none after (the act runs on its own RNG)').toBe(s1);
  });
});

describe('grabbed', () => {
  function grabScene(seed = 7) {
    const w = makeWorld(seed);
    const c = spawnCiv(w.world, 2.6, -8, 'grabbed', 'nurse');
    const g = c.holder!;
    return { ...w, c, g };
  }

  it('a zombie holds on, level with them and toward the middle of the view; both their hands haul on the grip', { timeout: 30_000 }, () => {
    const { world, c, g } = grabScene();
    expect(g).toBeInstanceOf(Grabber);
    expect(g.hostile).toBe(true);
    step(world, 1.5);
    expect(c.state).toBe('grabbed');
    const cp = c.root.position;
    const gp = g.root.position;
    // ~GRAB_SEP apart (a yank pulls them in a little), the zombie nearer the middle of the screen.
    expect(Math.hypot(cp.x - gp.x, cp.z - gp.z)).toBeGreaterThan(GRAB_SEP - 0.2);
    expect(Math.abs(ndc(world, gp.clone().setY(1)).x)).toBeLessThan(Math.abs(ndc(world, cp.clone().setY(1)).x));
    // Its gripping hand and theirs meet; their other hand is on the held wrist.
    const gr = g.rig!;
    expect(handOf(g.gripSide > 0 ? gr.armL : gr.armR).distanceTo(c.grabHand)).toBeLessThan(0.25);
    const r = rigOf(c);
    const d = [handOf(r.armL).distanceTo(c.grabHand), handOf(r.armR).distanceTo(c.grabHand)].sort((a, b) => a - b);
    expect(d[0]).toBeLessThan(0.08);
    // (The free hand reaches across for the held forearm.)
    expect(d[1]).toBeLessThan(0.45);
  });

  it('the tug of war is keyed: it yanks them in (a lurch toward it) every 1.1–1.6 s, they drag back', { timeout: 30_000 }, () => {
    const { world, c, g } = grabScene();
    step(world, 0.3);
    const home = c.root.position.clone();
    const toward = g.root.position.clone().sub(home).setY(0).normalize();
    let yanks = 0;
    let max = 0;
    let wasOut = false;
    step(world, 6, () => {
      const lurch = c.root.position.clone().sub(home).dot(toward);
      max = Math.max(max, lurch);
      const out = lurch > 0.15;
      if (out && !wasOut) yanks++;
      wasOut = out;
    });
    expect(max).toBeGreaterThan(0.18);
    expect(max).toBeLessThan(0.3);
    expect(yanks).toBeGreaterThanOrEqual(4);
    expect(yanks).toBeLessThanOrEqual(6);
  });

  it('the attacker stays a clear shot: its head and chest are never behind the civilian, and it never attacks while holding on', { timeout: 30_000 }, () => {
    const { world, c, g } = grabScene();
    const ray = new THREE.Raycaster();
    let checks = 0;
    let blocked = 0;
    let minApart = Infinity;
    step(world, 6, () => {
      expect(g.telegraph).toBeNull();
      expect(g.holdsSlot).toBe(false);
      if (c.state !== 'grabbed') return;
      const eye = world.camera.getWorldPosition(new THREE.Vector3());
      const all = world.shootables.active();
      for (const o of hitboxes(world, g)) {
        const part = (o.userData.shot as ShotTag).part;
        if (part !== 'head' && part !== 'torso') continue;
        const m = o as THREE.Mesh;
        if (!m.geometry.boundingSphere) m.geometry.computeBoundingSphere();
        const ctr = m.geometry.boundingSphere!.center.clone().applyMatrix4(m.matrixWorld);
        ray.set(eye, ctr.sub(eye).normalize());
        const hit = ray.intersectObjects(all, false)[0];
        checks++;
        if ((hit?.object.userData.shot as ShotTag | undefined)?.owner === c) blocked++;
      }
      // And with a margin, on a yank too: the heads are far apart on screen.
      const gh = ndc(world, g.headAnchor!.getWorldPosition(new THREE.Vector3()));
      const ch = ndc(world, rigOf(c).head.getWorldPosition(new THREE.Vector3()));
      minApart = Math.min(minApart, Math.abs(gh.x - ch.x) * 422);
    });
    expect(checks).toBeGreaterThan(100);
    expect(blocked).toBe(0);
    expect(minApart, 'heads apart on screen (px)').toBeGreaterThan(40);
  });

  it('shoot the zombie and they are free on the spot: rescued (once), THANKS!, off they go', { timeout: 30_000 }, () => {
    const { world, events, c, g } = grabScene();
    step(world, 1);
    g.onShot(hitOn(g, g.headAnchor!, 'head', 9));
    step(world, 0.2);
    expect(events.rescued).toBe(1);
    expect(c.state).toBe('thanks');
    expect(c.speech).toBe(CIV_STAMP.bubble.thanks);
    step(world, 8);
    expect(c.removed).toBe(true);
    expect(events.rescued).toBe(1);
  });

  it('a body shot makes it flinch but not let go; shooting its gripping arm off saves them on the spot (they run, THANKS!)', { timeout: 30_000 }, () => {
    const { world, events, c, g } = grabScene();
    step(world, 1);
    const torso = hitboxes(world, g).find((o) => (o.userData.shot as ShotTag).part === 'torso')!;
    g.onShot(hitOn(g, torso, 'torso', 1));
    step(world, 0.5);
    expect(g.state).toBe('grab');
    expect(c.state).toBe('grabbed');
    const gr = g.rig!;
    const arm = g.gripSide > 0 ? gr.armL : gr.armR;
    // A 2-damage hit on the holding forearm always severs it (and leaves it standing).
    const fore = hitboxes(world, g).find((o) => {
      for (let n: THREE.Object3D | null = o; n; n = n.parent) if (n === arm.elbow) return true;
      return false;
    })!;
    expect(fore).toBeTruthy();
    g.onShot(hitOn(g, fore, 'limb', 2));
    step(world, 0.3);
    expect(g.state).not.toBe('grab');
    expect(events.rescued).toBe(1);
    expect(c.state).toBe('leave');
    expect(c.speech).toBe(CIV_STAMP.bubble.thanks);
  });

  it('left too long, they wrench free and run — no rescue on the spot (paid at the clear like anyone who got away); the zombie walks on', { timeout: 30_000 }, () => {
    const { world, events, c, g } = grabScene();
    step(world, 9.5);
    expect(['flee', 'stumble', 'escaped']).toContain(c.state);
    expect(g.state === 'grab').toBe(false);
    step(world, 6);
    expect(['advance', 'windup', 'recover']).toContain(g.state);
    expect(events.rescued).toBe(0);
  });

  it('a civilian hit while grabbed: the penalty as ever, and the zombie lets go', { timeout: 30_000 }, () => {
    const { world, events, c, g } = grabScene();
    step(world, 1);
    c.onShot(hitOn(c, hitboxes(world, c)[0], 'torso', 1));
    step(world, 0.2);
    expect(events.shot).toBe(1);
    expect(g.state).not.toBe('grab');
  });
});
