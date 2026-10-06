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
import { CIV_STAMP } from '../../src/gameplay/pixel/stamps';
import { nullHud } from './sim';

/**
 * Civilian behaviour: the act repertoire (gameplay/Civilian.ts) — what each act
 * does, how they react to the zombies / dinos around them, and the gameplay
 * rules that stay as tuned: a hit costs a life (once), a rescue pays once, a
 * grabbed civilian's attacker stays a clear shot and never attacks while it
 * holds on, and running civilians only ever move outward on screen.
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

function spawnCiv(world: World, x: number, z: number, act: CivAct, variant = 'worker', to?: THREE.Vector3): Civilian {
  return world.add(new Civilian(world, new THREE.Vector3(x, 0, z), 'world', variant, { act, to }));
}

function spawnEnemy(world: World, id: string, x: number, z: number, opts: Record<string, unknown> = {}): Enemy {
  return world.add(createEnemy(id, world, { pos: new THREE.Vector3(x, 0, z), frame: 'world', entry: 'walk', hpMul: 1, speedMul: 1, opts }));
}

function ndc(world: World, p: THREE.Vector3): THREE.Vector3 {
  return p.clone().project(world.camera);
}

function hitOn(e: Enemy | Civilian, obj: THREE.Object3D, part: HitPart, damage: number): ShotHit {
  const point = obj.getWorldPosition(new THREE.Vector3());
  const dir = point.clone().sub(new THREE.Vector3(0, 1.62, 0)).normalize();
  return { object: obj, part, point, normal: null, dir, distance: 5, damage, weapon: 'pistol', assisted: false, screenX: 400, screenY: 200 };
}

function hitboxes(world: World, owner: unknown): THREE.Object3D[] {
  return world.shootables.objects.filter((o) => (o.userData.shot as ShotTag | undefined)?.owner === owner);
}

describe('civilian acts', () => {
  it('each act opens as the stage asked (a HELP! first where it fits)', { timeout: 30_000 }, () => {
    const { world } = makeWorld();
    const expectOpen: [CivAct, string, string][] = [
      ['cower', 'plead', 'cower'],
      ['hide', 'hide', 'hide'],
      ['flee', 'flee', 'flee'],
      ['backaway', 'plead', 'backaway'],
      ['plead', 'plead', 'cower'],
      ['auto', 'plead', 'cower'],
    ];
    for (const [act, first, then] of expectOpen) {
      const c = spawnCiv(world, -3, -9, act);
      expect(c.state, act).toBe(first);
      if (first === 'plead') expect(c.speech, `${act} says HELP!`).toBe(CIV_STAMP.bubble.help);
      step(world, 2.4);
      if (!c.removed) expect(c.state, `${act} after its HELP!`).toBe(then);
      c.removed = true;
      step(world, DT);
    }
  });

  it('cower: ducks while anything attacks or comes close, peeks up in between; trembles', { timeout: 30_000 }, () => {
    const { world } = makeWorld();
    const c = spawnCiv(world, 3.5, -8, 'cower');
    const head = (c as unknown as { rig: { head: THREE.Object3D } }).rig.head;
    let lo = Infinity;
    let hi = -Infinity;
    // (Past the opening HELP! and the blend down into the crouch.)
    step(world, 2);
    step(world, 8, () => {
      const y = head.getWorldPosition(new THREE.Vector3()).y;
      if (c.state === 'cower') {
        lo = Math.min(lo, y);
        hi = Math.max(hi, y);
      }
    });
    expect(c.state).toBe('cower');
    // Crouched low (half a standing head height), and the head comes up to peek.
    expect(hi).toBeLessThan(1.35);
    expect(hi - lo, 'peeks up between ducks').toBeGreaterThan(0.12);
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

  it('flee: runs outward on screen and toward the camera, trips at most once, and is rescued once safe off screen', { timeout: 30_000 }, () => {
    for (const side of [1, -1]) {
      const { world, events } = makeWorld();
      const c = spawnCiv(world, side * 3, -10, 'flee', 'default');
      let lastX = ndc(world, c.root.position).x * side;
      let back = 0;
      let stumbles = 0;
      let prev = c.state;
      let frames = 0;
      while (!c.removed && frames++ < 600) {
        step(world, DT);
        if (c.removed) break;
        const x = ndc(world, c.root.position.clone().setY(1)).x * side;
        if (x < lastX - 0.005) back++;
        lastX = Math.max(lastX, x);
        if (c.state === 'stumble' && prev !== 'stumble') stumbles++;
        prev = c.state;
      }
      expect(c.removed, 'got away').toBe(true);
      expect(back, 'never heads back toward the middle of the view').toBe(0);
      expect(stumbles).toBeLessThanOrEqual(1);
      expect(events.rescued, 'rescued once, safe off screen').toBe(1);
      expect(frames / 60, 'gone within a few seconds').toBeLessThan(6);
    }
  });

  it('backaway: edges back with hands up facing the threat, then turns and runs', { timeout: 30_000 }, () => {
    const { world, events } = makeWorld();
    const c = spawnCiv(world, 3.2, -8, 'backaway', 'cop');
    step(world, 1.2);
    expect(c.state).toBe('backaway');
    const z = spawnEnemy(world, 'walker', 1.0, -11);
    const p0 = c.root.position.clone();
    const seen = new Set<string>();
    step(world, 9, () => seen.add(c.state));
    expect(seen.has('flee')).toBe(true);
    // Backed off away from the zombie (and outward), never toward it.
    expect(c.removed || c.root.position.x > p0.x).toBe(true);
    expect(events.rescued).toBe(1);
    void z;
  });

  it('plead: waves for help again and again, cowering in between', { timeout: 30_000 }, () => {
    const { world } = makeWorld();
    const c = spawnCiv(world, -3.5, -9, 'plead', 'scientist');
    let helps = 0;
    let was = -1;
    step(world, 14, () => {
      if (c.speech === CIV_STAMP.bubble.help && was !== CIV_STAMP.bubble.help) helps++;
      was = c.speech;
    });
    expect(helps).toBeGreaterThanOrEqual(2);
  });

  it('auto: a zombie comes close — backs off and runs for it (outward)', { timeout: 30_000 }, () => {
    const { world, events } = makeWorld();
    const c = spawnCiv(world, 2.5, -7, 'auto');
    step(world, 2);
    expect(c.state).toBe('cower');
    spawnEnemy(world, 'walker', 1.6, -9.0);
    const seen = new Set<string>();
    step(world, 8, () => seen.add(c.state));
    expect([...seen].some((s) => s === 'backaway' || s === 'flee')).toBe(true);
    expect(events.rescued).toBe(1);
  });

  it('rescued: thanks the player (THANKS!, a wave or thumbs-up), then jogs off screen', { timeout: 30_000 }, () => {
    const { world, events } = makeWorld();
    const c = spawnCiv(world, -3, -8, 'cower', 'nurse');
    step(world, 2);
    c.rescue();
    c.rescue();
    expect(events.rescued, 'pays once').toBe(1);
    expect(c.state).toBe('thanks');
    expect(c.speech).toBe(CIV_STAMP.bubble.thanks);
    expect(hitboxes(world, c)).toEqual([]);
    const seen = new Set<string>();
    step(world, 8, () => !c.removed && seen.add(c.state));
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

  it('perched (on a truck bed): waves for help, never runs off', { timeout: 30_000 }, () => {
    const { world } = makeWorld();
    const c = world.add(new Civilian(world, new THREE.Vector3(-3, 1.4, -9), 'world', 'worker', { act: 'flee' }));
    const p0 = c.root.position.clone();
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
    new Civilian(world, new THREE.Vector3(0, 0, -6), 'world', 'cop', { act: 'flee' });
    expect(world.rng.state).toBe(s1);
  });
});

describe('grabbed', () => {
  function grabScene(seed = 7) {
    const w = makeWorld(seed);
    const c = spawnCiv(w.world, 2.6, -8, 'grabbed', 'nurse');
    const g = c.holder!;
    return { ...w, c, g };
  }

  it('a zombie holds on, level with them and toward the middle of the view, hands meeting', { timeout: 30_000 }, () => {
    const { world, c, g } = grabScene();
    expect(g).toBeInstanceOf(Grabber);
    expect(g.hostile).toBe(true);
    step(world, 1.5);
    expect(c.state).toBe('grabbed');
    const cp = c.root.position;
    const gp = g.root.position;
    // ~GRAB_SEP apart, the zombie nearer the middle of the screen.
    expect(Math.hypot(cp.x - gp.x, cp.z - gp.z)).toBeGreaterThan(GRAB_SEP - 0.2);
    expect(Math.abs(ndc(world, gp.clone().setY(1)).x)).toBeLessThan(Math.abs(ndc(world, cp.clone().setY(1)).x));
    // Its gripping hand and the civilian's near hand meet.
    const gr = g.rig!;
    const hold = (g.gripSide > 0 ? gr.armL : gr.armR).elbow.localToWorld(new THREE.Vector3(0, -0.31, 0));
    expect(hold.distanceTo(c.grabHand)).toBeLessThan(0.25);
  });

  it('the attacker stays a clear shot: its head and chest are never behind the civilian, and it never attacks while holding on', { timeout: 30_000 }, () => {
    const { world, c, g } = grabScene();
    const ray = new THREE.Raycaster();
    let checks = 0;
    let blocked = 0;
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
      // And with a margin: the heads are far apart on screen.
      const gh = ndc(world, g.headAnchor!.getWorldPosition(new THREE.Vector3()));
      const ch = ndc(world, (c as unknown as { rig: { head: THREE.Object3D } }).rig.head.getWorldPosition(new THREE.Vector3()));
      expect(Math.abs(gh.x - ch.x) * 422, 'heads apart on screen (px)').toBeGreaterThan(40);
    });
    expect(checks).toBeGreaterThan(100);
    expect(blocked).toBe(0);
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

  it('a body shot makes it flinch but not let go; shooting its gripping arm off frees them', { timeout: 30_000 }, () => {
    const { world, c, g } = grabScene();
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
    expect(['flee', 'stumble']).toContain(c.state);
  });

  it('left too long, they wrench free and run; the zombie walks on at the player as a plain walker', { timeout: 30_000 }, () => {
    const { world, c, g } = grabScene();
    step(world, 9.5);
    expect(c.state === 'flee' || c.state === 'stumble' || c.removed).toBe(true);
    expect(g.state === 'grab').toBe(false);
    step(world, 6);
    expect(['advance', 'windup', 'recover']).toContain(g.state);
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
