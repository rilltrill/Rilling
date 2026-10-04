/**
 * Review fix pass (core): turret vent on boss windups, bomb double-tap guard,
 * blinking pickups stay shootable, shared pickup geometry, cheap aim assist,
 * comfort settings (reduced flashing / screen shake), shader warm-up roster.
 */
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { World } from '../../src/gameplay/World';
import { StageRunner, LEFTOVER_PICKUP_TTL } from '../../src/gameplay/StageRunner';
import { Shooter } from '../../src/gameplay/Shooting';
import { Boss } from '../../src/gameplay/Boss';
import { Enemy, REDUCED_FLASH_COOLDOWN, flashMaterials } from '../../src/gameplay/Enemy';
import { Pickup, PICKUP_BLINK } from '../../src/gameplay/Pickup';
import { RailRig } from '../../src/gameplay/RailRig';
import { VENT_LEVEL, WeaponSystem } from '../../src/gameplay/Weapons';
import { AudioSystem } from '../../src/audio/Audio';
import { DEFAULT_SETTINGS, type Settings } from '../../src/core/types';
import { Kit } from '../../src/content/kit/ModelKit';
import { Fx } from '../../src/fx/Fx';
import type { StageDef } from '../../src/gameplay/StageTypes';
import { Save, comfortDefaults, prefersReducedMotion } from '../../src/core/Save';
import { nullHud } from './sim';

const DT = 1 / 60;
const W = 844;
const H = 390;

function makeWorld(settings: Partial<Settings> = {}, stage?: StageDef) {
  const cam = new THREE.PerspectiveCamera(58, W / H, 0.05, 400);
  const w = new World(cam, new AudioSystem(), nullHud, { ...DEFAULT_SETTINGS, haptics: false, ...settings }, 7);
  w.viewport = { width: W, height: H };
  const runner = new StageRunner(w, stage ?? miniStage([{ kind: 'wait', duration: 999 }]));
  runner.start();
  w.scene.updateMatrixWorld();
  return { w, runner };
}

function miniStage(beats: StageDef['beats'], occluders: THREE.Object3D[] = []): StageDef {
  return {
    id: 'test',
    campaign: 'zombie',
    index: 0,
    name: 'TEST',
    rail: [
      [0, 0, 0],
      [0, 0, -100],
    ],
    mode: 'walk',
    buildEnvironment: (world) => {
      const root = new THREE.Group();
      for (const o of occluders) root.add(o);
      world.scene.add(root);
      return { root, occluders };
    },
    beats,
  };
}

class Dummy extends Enemy {
  protected override build(): void {
    const m = Kit.mesh(Kit.box(0.8, 1.8, 0.5), Kit.mat(0x888888));
    m.position.y = 0.9;
    this.model.add(m);
    this.hitbox(m, 'torso');
    this.anchor = m;
  }
}

class TestBoss extends Boss {
  protected override build(): void {
    const m = Kit.mesh(Kit.box(2, 2, 2), Kit.mat(0x888888));
    m.position.y = 1;
    this.model.add(m);
    this.hitbox(m, 'weak');
    this.anchor = m;
  }
  protected override customUpdate(): void {}
}

function spawn(w: World, pos: THREE.Vector3) {
  return { pos, frame: 'world' as const, entry: 'walk' as const, hpMul: 1, speedMul: 1, opts: {} };
}

/** Client-pixel position of a world point. */
function screenOf(w: World, p: THREE.Vector3) {
  const v = p.clone().project(w.camera);
  return { x: (v.x * 0.5 + 0.5) * W, y: (-v.y * 0.5 + 0.5) * H };
}

describe('turret heat: vent on boss windups (dgame-8)', () => {
  it('vent() clears an overheat lockout and drops the heat to the re-arm level', () => {
    const ws = new WeaponSystem();
    ws.setOverride('turret');
    while (!ws.overheated) {
      ws.tryFire(true);
      ws.update(DT);
    }
    expect(ws.tryFire(true)).toEqual({ ok: false, reason: 'overheated' });
    expect(ws.vent()).toBe(true);
    expect(ws.overheated).toBe(false);
    expect(ws.heat).toBeLessThanOrEqual(VENT_LEVEL);
    expect(ws.venting).toBe(true);
    ws.update(0.2);
    expect(ws.tryFire(true)).toMatchObject({ ok: true });
    // Nothing to vent on a cool gun / a magazine weapon.
    const cool = new WeaponSystem();
    cool.setOverride('turret');
    expect(cool.vent()).toBe(false);
    expect(new WeaponSystem().vent()).toBe(false);
  });

  it('feathering pays: bursts with short pauses avoid the lockout that holding runs into', () => {
    const run = (pattern: (t: number) => boolean) => {
      const ws = new WeaponSystem();
      ws.setOverride('turret');
      let shots = 0;
      let locked = 0;
      for (let t = 0; t < 20; t += DT) {
        if (pattern(t) && ws.tryFire(true).ok) shots++;
        if (ws.overheated) locked += DT;
        ws.update(DT);
      }
      return { shots, locked };
    };
    const hold = run(() => true);
    const feather = run((t) => t % 0.9 < 0.6); // 0.6 s bursts, 0.3 s pauses
    expect(hold.locked).toBeGreaterThan(3);
    expect(feather.locked).toBeLessThan(hold.locked * 0.25);
    expect(feather.shots).toBeGreaterThan(hold.shots * 0.9);
  });

  it('a boss telegraph appearing vents an overheated mounted gun, once per telegraph', () => {
    const { w } = makeWorld();
    w.weapons.setOverride('turret');
    const boss = w.add(new TestBoss(w, spawn(w, w.rig.relToWorld([0, 0, 15]))));
    w.boss = boss;
    boss.state = 'hover'; // custom state: the test drives the telegraph by hand
    const overheat = () => {
      w.weapons.heat = 1;
      w.weapons.overheated = true;
    };
    overheat();
    w.update(DT);
    expect(w.weapons.overheated).toBe(true); // no telegraph, no vent
    boss.telegraph = { progress: 0, anchor: boss.anchor };
    w.update(DT);
    expect(w.weapons.overheated).toBe(false);
    expect(w.weapons.heat).toBeLessThanOrEqual(VENT_LEVEL);
    overheat();
    w.update(DT);
    expect(w.weapons.overheated).toBe(true); // same telegraph: no second vent
    boss.telegraph = null;
    w.update(DT);
    boss.telegraph = { progress: 0, anchor: boss.anchor };
    w.update(DT);
    expect(w.weapons.overheated).toBe(false); // next attack vents again
  });
});

describe('bomb guard (code-3)', () => {
  it('a double tap spends one bomb; nothing in reach spends none', () => {
    const { w } = makeWorld();
    w.player.bombs = 3;
    expect(w.useBomb()).toBe(false); // empty field
    expect(w.player.bombs).toBe(3);
    w.add(new Dummy(w, spawn(w, w.rig.relToWorld([0, 0, 8]))));
    w.add(new Dummy(w, spawn(w, w.rig.relToWorld([2, 0, 60])))); // out of reach
    w.update(0.3);
    expect(w.bombTargets()).toBe(1);
    expect(w.useBomb()).toBe(true);
    expect(w.player.bombs).toBe(2);
    w.add(new Dummy(w, spawn(w, w.rig.relToWorld([-1, 0, 8]))));
    w.update(0.09);
    expect(w.useBomb()).toBe(false); // 90 ms later: the double tap
    expect(w.player.bombs).toBe(2);
    for (let t = 0; t < 0.8; t += DT) w.update(DT);
    expect(w.useBomb()).toBe(true); // a deliberate second bomb
    expect(w.player.bombs).toBe(1);
  });
});

describe('pickups (code-6, code-7)', () => {
  it('a blinking pickup keeps its hitboxes shootable, and aimed shots collect it', () => {
    const { w } = makeWorld();
    const shooter = new Shooter(w);
    let collected = 0;
    let fired = 0;
    for (let trial = 0; trial < 30; trial++) {
      const p = w.add(new Pickup(w, 'health', w.rig.relToWorld([0.5, 1.4, 6]), 'world', PICKUP_BLINK * 0.9));
      // Step into the blink window, sampling a different blink phase each trial.
      const steps = 2 + (trial % 9);
      for (let i = 0; i < steps; i++) w.update(DT);
      w.scene.updateMatrixWorld();
      if (p.removed) continue;
      const hidden = !(p.root.children[0] as THREE.Object3D).visible;
      expect(w.shootables.active().some((o) => (o.userData.shot as { owner: unknown }).owner === p)).toBe(true);
      const at = screenOf(w, p.root.getWorldPosition(new THREE.Vector3()));
      w.weapons.update(1); // ready to fire
      if (shooter.fire(at.x, at.y)) fired++;
      w.update(DT);
      if (p.removed && p.age < p.ttl) collected++;
      if (hidden) expect(p.removed).toBe(true);
      p.removed = true;
      w.update(DT);
    }
    expect(fired).toBeGreaterThan(20);
    expect(collected).toBe(fired);
  });

  it('pickups left over when a beat ends stay up for a while before blinking out', () => {
    const stage = miniStage([
      { kind: 'wait', duration: 0.5, pickups: [{ kind: 'shotgun', pos: [1, 1.2, 7] }] },
      { kind: 'wait', duration: 30 },
    ]);
    const { w, runner } = makeWorld({}, stage);
    let t = 0;
    const p = () => w.entities.find((e) => e instanceof Pickup) as Pickup | undefined;
    for (; t < 0.4; t += DT) runner.update(w.update(DT));
    const pk = p()!;
    expect(pk).toBeTruthy();
    let blinkFrom = -1;
    let gone = -1;
    for (; t < 15 && gone < 0; t += DT) {
      runner.update(w.update(DT));
      const model = pk.root.children[0];
      if (blinkFrom < 0 && !model.visible) blinkFrom = t;
      if (pk.removed) gone = t;
    }
    expect(gone).toBeGreaterThan(0.5 + LEFTOVER_PICKUP_TTL - 0.2);
    expect(blinkFrom).toBeGreaterThan(gone - PICKUP_BLINK - 0.1);
  });

  it('pickup geometry is shared (never re-created / leaked per pickup)', () => {
    const { w } = makeWorld();
    const kinds = ['health', 'points', 'smg', 'bomb'] as const;
    const geos = new Map<string, THREE.BufferGeometry>();
    for (const k of kinds) {
      for (let i = 0; i < 2; i++) {
        const p = new Pickup(w, k, new THREE.Vector3(), 'world');
        p.root.traverse((o) => {
          const m = o as THREE.Mesh;
          if (!m.isMesh) return;
          expect(m.geometry.userData.shared).toBe(true);
          const key = `${k}:${m.name}:${m.geometry.type}`;
          if (m.name === 'halo' || m.geometry.type === 'OctahedronGeometry') {
            if (geos.has(key)) expect(geos.get(key)).toBe(m.geometry);
            geos.set(key, m.geometry);
          }
        });
      }
    }
  });
});

describe('aim assist (perf-2)', () => {
  /** An occluder whose raycasts are counted. */
  function countingWall(pos: THREE.Vector3, size: [number, number, number]) {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(...size), new THREE.MeshBasicMaterial());
    wall.position.copy(pos);
    let calls = 0;
    const orig = wall.raycast.bind(wall);
    wall.raycast = (rc, out) => {
      calls++;
      orig(rc, out);
    };
    return { wall, calls: () => calls, reset: () => (calls = 0) };
  }

  it('snaps a near miss onto a visible enemy with at most a few occluder raycasts', () => {
    // A wall off to the side (never between camera and enemy).
    const side = countingWall(new THREE.Vector3(12, 1.5, -10), [1, 3, 6]);
    const { w } = makeWorld({}, miniStage([{ kind: 'wait', duration: 999 }], [side.wall]));
    const e = w.add(new Dummy(w, spawn(w, w.rig.relToWorld([0, 0, 10]))));
    w.update(DT);
    w.scene.updateMatrixWorld();
    const shooter = new Shooter(w);
    const c = screenOf(w, e.anchor.getWorldPosition(new THREE.Vector3()));
    side.reset();
    const hp = e.hp;
    expect(shooter.fire(c.x + 34, c.y)).toBe(true);
    expect(e.hp).toBeLessThan(hp);
    // Old code: one recursive occluder raycast per probe ray (up to 25).
    expect(side.calls()).toBeLessThanOrEqual(4);
  });

  it('walls still block assist (and direct shots)', () => {
    const wall = countingWall(new THREE.Vector3(0, 1.5, -6), [6, 4, 0.3]);
    const { w } = makeWorld({}, miniStage([{ kind: 'wait', duration: 999 }], [wall.wall]));
    const e = w.add(new Dummy(w, spawn(w, w.rig.relToWorld([0, 0, 10]))));
    w.update(DT);
    w.scene.updateMatrixWorld();
    const shooter = new Shooter(w);
    const c = screenOf(w, e.anchor.getWorldPosition(new THREE.Vector3()));
    const hp = e.hp;
    shooter.fire(c.x, c.y);
    w.weapons.update(1);
    shooter.fire(c.x + 20, c.y);
    expect(e.hp).toBe(hp);
  });
});

describe('comfort settings (look-6)', () => {
  it('screenShake scales camera shake; 0 removes it', () => {
    const mk = (scale: number) => {
      const r = new RailRig(new THREE.PerspectiveCamera(60, 2, 0.05, 400));
      r.setPath([
        [0, 0, 0],
        [0, 0, -50],
      ]);
      r.shakeScale = scale;
      return r;
    };
    const still = mk(1);
    const off = mk(0);
    const half = mk(0.5);
    const full = mk(1);
    off.shake(1);
    half.shake(1);
    full.shake(1);
    let dOff = 0;
    let dHalf = 0;
    let dFull = 0;
    for (let i = 0; i < 20; i++) {
      for (const r of [still, off, half, full]) r.update(DT);
      const ref = still.camera.rotation;
      const diff = (r: RailRig) => Math.abs(r.camera.rotation.x - ref.x) + Math.abs(r.camera.rotation.y - ref.y) + Math.abs(r.camera.rotation.z - ref.z);
      dOff += diff(off);
      dHalf += diff(half);
      dFull += diff(full);
    }
    expect(dOff).toBeLessThan(1e-9);
    expect(dHalf).toBeGreaterThan(0);
    expect(dHalf).toBeLessThan(dFull);
  });

  it('World keeps the rig and FX in sync with the live settings object', () => {
    const { w } = makeWorld();
    w.settings.screenShake = 0.25;
    w.settings.reduceFlashes = true;
    w.update(DT);
    expect(w.rig.shakeScale).toBeCloseTo(0.25);
    expect(w.fx.reduceFlashes).toBe(true);
  });

  it('reduced flashing: dimmer explosion light that cannot re-strobe on a chain reaction', () => {
    const peak = (calm: boolean) => {
      const fx = new Fx();
      fx.reduceFlashes = calm;
      const light = (fx as unknown as { flashLight: THREE.PointLight }).flashLight;
      let max = 0;
      let restarts = 0;
      let prev = 0;
      for (let i = 0; i < 60; i++) {
        if (i % 19 === 0) fx.explosion(new THREE.Vector3(0, 0, -10), 1); // every ~0.32 s
        fx.update(1 / 60);
        if (light.intensity > prev + 1e-6) restarts++;
        prev = light.intensity;
        max = Math.max(max, light.intensity);
      }
      fx.dispose();
      return { max, restarts };
    };
    const normal = peak(false);
    const calm = peak(true);
    expect(calm.max).toBeLessThan(normal.max * 0.5);
    expect(calm.restarts).toBeLessThan(normal.restarts);
  });

  it('reduced flashing caps enemy hit flashes at ~3/s', () => {
    const count = (calm: boolean) => {
      const { w } = makeWorld({ reduceFlashes: calm });
      const e = w.add(new Dummy(w, spawn(w, w.rig.relToWorld([0, 0, 10]))));
      const priv = e as unknown as { lastFlashAge: number };
      let flashes = 0;
      for (let i = 0; i < 60; i++) {
        const before = priv.lastFlashAge;
        e.flash(); // autofire: a hit every frame for 1 s
        if (priv.lastFlashAge !== before) flashes++;
        e.age += 1 / 60;
      }
      expect(flashMaterials()).toHaveLength(2);
      return flashes;
    };
    expect(count(false)).toBeGreaterThan(5);
    expect(count(true)).toBeLessThanOrEqual(Math.ceil(1 / REDUCED_FLASH_COOLDOWN));
  });
});

describe('comfort defaults from the OS reduce-motion preference', () => {
  class MemStorage implements Storage {
    map = new Map<string, string>();
    get length() {
      return this.map.size;
    }
    clear() {
      this.map.clear();
    }
    getItem(k: string) {
      return this.map.get(k) ?? null;
    }
    key(i: number) {
      return [...this.map.keys()][i] ?? null;
    }
    removeItem(k: string) {
      this.map.delete(k);
    }
    setItem(k: string, v: string) {
      this.map.set(k, v);
    }
  }

  it('first run with reduced motion: calmer flashes, half shake; otherwise the defaults', () => {
    expect(new Save(new MemStorage(), true).settings).toMatchObject({ reduceFlashes: true, screenShake: 0.5 });
    expect(new Save(new MemStorage(), false).settings).toMatchObject({ reduceFlashes: false, screenShake: 1 });
    expect(comfortDefaults(false)).toEqual({});
  });

  it("a player's explicit choice wins; older saves get the OS default for the new keys; bad values are repaired", () => {
    const st = new MemStorage();
    st.setItem('overrun.save.v1', JSON.stringify({ settings: { reduceFlashes: false, screenShake: 1 } }));
    expect(new Save(st, true).settings).toMatchObject({ reduceFlashes: false, screenShake: 1 });
    const old = new MemStorage();
    old.setItem('overrun.save.v1', JSON.stringify({ settings: { sfxVolume: 0.2 } }));
    expect(new Save(old, true).settings).toMatchObject({ sfxVolume: 0.2, reduceFlashes: true, screenShake: 0.5 });
    const bad = new MemStorage();
    bad.setItem('overrun.save.v1', JSON.stringify({ settings: { screenShake: 'lots', reduceFlashes: 1 } }));
    expect(new Save(bad, false).settings).toMatchObject({ screenShake: 1, reduceFlashes: true });
    const big = new MemStorage();
    big.setItem('overrun.save.v1', JSON.stringify({ settings: { screenShake: 7 } }));
    expect(new Save(big, false).settings.screenShake).toBe(1);
  });

  it('detection is safe without matchMedia (node)', () => {
    expect(prefersReducedMotion()).toBe(false);
  });
});

describe('engine-wide soft-lock nets (Enemy)', () => {
  /** Root position that puts a Dummy's anchor (0.9 m up) at screen NDC (0, ndcY), standing on the floor. */
  function pinAt(w: World, ndcY: number) {
    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2(0, ndcY), w.camera);
    const { origin, direction } = ray.ray;
    const t = (0.9 - origin.y) / direction.y;
    return origin.clone().addScaledVector(direction, t).setY(0);
  }

  it('a walker left buried under the floor (a move that ignored a slope) climbs back out', () => {
    const { w } = makeWorld();
    const e = w.add(new Dummy(w, spawn(w, w.rig.relToWorld([0, 0, 9]))));
    for (let i = 0; i < 240 && e.state === 'entry'; i++) w.update(DT);
    expect(e.state).not.toBe('entry');
    e.root.position.y = -2;
    for (let i = 0; i < 6; i++) w.update(DT);
    expect(e.root.position.y).toBeLessThan(-1); // a moment's grace…
    for (let i = 0; i < 30; i++) w.update(DT);
    expect(e.root.position.y).toBeCloseTo(0, 3); // …then back on the floor, shootable
  });

  it('an old enemy loitering just outside the play area leaves; one in view stays', () => {
    const { w } = makeWorld();
    w.update(DT);
    const lost = w.add(new Dummy(w, spawn(w, pinAt(w, -1.1))));
    const seen = w.add(new Dummy(w, spawn(w, pinAt(w, -0.45))));
    for (let i = 0; i < 240 && (lost.state === 'entry' || seen.state === 'entry'); i++) w.update(DT);
    lost.age = seen.age = 46;
    const lostAt = pinAt(w, -1.1);
    const seenAt = pinAt(w, -0.45);
    for (let t = 0; t < 9 && !lost.removed; t += DT) {
      // Held in place (as if stuck) so only the net can end it.
      lost.root.position.copy(lostAt);
      seen.root.position.copy(seenAt);
      w.update(DT);
    }
    expect(lost.removed).toBe(true);
    expect(seen.removed).toBe(false);
  });
});
