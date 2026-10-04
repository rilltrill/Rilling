import * as THREE from 'three';
import type { Frame, V3 } from '../core/types';
import type { World } from './World';
import type { Beat, BossBeat, StageDef, WaveDef, SpawnDef } from './StageTypes';
import { RailRig } from './RailRig';
import { createEnemy } from '../content/registry';
import type { Enemy } from './Enemy';
import { Boss } from './Boss';
import { Pickup } from './Pickup';
import { Civilian } from './Civilian';
import { Projectile } from './Projectile';

/** Seconds a pickup left on the field survives after its beat ends (incl. the blink). */
export const LEFTOVER_PICKUP_TTL = 6;

interface WaveRun {
  def: WaveDef;
  started: boolean;
  startTime: number;
  pending: number;
  enemies: Enemy[];
}

interface PendingSpawn {
  at: number;
  def: SpawnDef;
  pos: V3;
  wave: WaveRun;
}

interface PendingThing {
  at: number;
  run: () => void;
}


/** Plays a StageDef: environment, rail, beats, waves, boss and stage clear. */
export class StageRunner {
  index = -1;
  beat: Beat | null = null;
  beatTime = 0;
  done = false;
  private waves: WaveRun[] = [];
  private spawns: PendingSpawn[] = [];
  private things: PendingThing[] = [];
  private civilians: Civilian[] = [];
  private pickups: Pickup[] = [];
  private actionPending = false;
  private boss: Enemy | null = null;
  private offBossDead: (() => void) | null = null;
  private clearTimer = 0;

  constructor(readonly world: World, readonly stage: StageDef) {}

  start(startBeat = 0) {
    const w = this.world;
    w.stage = this.stage;
    w.rig.setPath(this.stage.rail);
    w.rig.setMode(this.stage.mode);
    w.env = this.stage.buildEnvironment(w, w.rig.curve!);
    if (w.env.root.parent !== w.scene) w.scene.add(w.env.root);
    w.weapons.setOverride(this.stage.weapon ?? null);
    this.stage.setup?.(w);
    if (startBeat > 0) this.fastForward(startBeat);
    this.next();
  }

  /** Debug: jump the rig to where beat `i` would start. */
  private fastForward(i: number) {
    let d = 0;
    for (let k = 0; k < i && k < this.stage.beats.length; k++) {
      const b = this.stage.beats[k];
      if (b.kind === 'move') d = b.to;
      if (b.kind === 'boss' && b.moveTo !== undefined) d = b.moveTo;
      if (b.mode) this.world.rig.setMode(b.mode);
      if (b.weapon !== undefined) this.world.weapons.setOverride(b.weapon);
    }
    this.world.rig.d = d;
    this.world.rig.moveTo(d, 1);
    this.world.rig.update(0);
    this.index = i - 1;
  }

  private next() {
    this.finishBeat();
    this.index++;
    if (this.index >= this.stage.beats.length) {
      this.done = true;
      this.world.events.emit('stage-clear', {});
      return;
    }
    this.beginBeat(this.stage.beats[this.index]);
  }

  private finishBeat() {
    const b = this.beat;
    if (!b) return;
    b.onEnd?.(this.world);
    for (const c of this.civilians) if (!c.removed) c.rescue();
    // Leftovers stay up a while after the fight (players go back for them) and
    // blink only for their last PICKUP_BLINK seconds.
    for (const p of this.pickups) if (!p.removed && p.ttl === Infinity) p.ttl = p.age + LEFTOVER_PICKUP_TTL;
    this.civilians = [];
    this.pickups = [];
    this.spawns = [];
    this.things = [];
    this.waves = [];
    this.boss = null;
    this.offBossDead?.();
    this.offBossDead = null;
    this.beat = null;
  }

  private beginBeat(b: Beat) {
    const w = this.world;
    this.beat = b;
    this.beatTime = 0;
    this.clearTimer = 0;
    if (b.mode) w.rig.setMode(b.mode);
    if (b.weapon !== undefined) w.weapons.setOverride(b.weapon);
    if (b.look) w.rig.look(b.look);
    else if (b.kind === 'move') w.rig.look('path');
    w.events.emit('beat', { index: this.index, beat: b });
    b.onStart?.(w);

    for (const p of b.pickups ?? []) {
      this.things.push({
        at: p.t ?? 0,
        run: () => {
          const frame: Frame = 'world';
          const pos = p.world ? new THREE.Vector3(...p.pos) : w.rig.relToWorld(p.pos);
          this.pickups.push(w.add(new Pickup(w, p.kind, pos, frame, p.ttl ?? Infinity)));
        },
      });
    }
    for (const c of b.civilians ?? []) {
      this.things.push({
        at: c.t ?? 0,
        run: () => {
          const pos = c.world ? new THREE.Vector3(...c.pos) : w.rig.relToWorld(c.pos);
          pos.y = w.groundAt(pos.x, pos.z);
          this.civilians.push(w.add(new Civilian(w, pos, 'world', c.variant)));
        },
      });
    }

    switch (b.kind) {
      case 'move':
        w.rig.moveTo(b.to, b.speed);
        this.setupWaves(b.waves ?? []);
        break;
      case 'hold':
        w.rig.halt();
        this.setupWaves(b.waves);
        break;
      case 'boss':
        this.beginBoss(b);
        this.setupWaves(b.waves ?? []);
        break;
      case 'banner':
        w.hud.banner(b.text, b.sub, b.duration);
        w.audio.play('banner');
        break;
      case 'wait':
        break;
      case 'action': {
        const r = b.run(w);
        if (r && typeof (r as Promise<void>).then === 'function') {
          this.actionPending = true;
          (r as Promise<void>).then(
            () => (this.actionPending = false),
            (err) => {
              console.error('[stage] action failed', err);
              this.actionPending = false;
            },
          );
        }
        break;
      }
    }
  }

  private beginBoss(b: BossBeat) {
    const w = this.world;
    if (b.moveTo !== undefined) w.rig.moveTo(b.moveTo, b.speed ?? 8);
    else w.rig.halt();
    const frame: Frame = b.frame ?? (b.moveTo !== undefined ? 'rig' : 'world');
    const pos = this.framePos(b.pos, !!b.world, frame);
    const boss = createEnemy(b.boss, w, { pos, frame, entry: 'walk', hpMul: 1, speedMul: 1, opts: b.opts ?? {} });
    w.add(boss);
    if (boss instanceof Boss) w.boss = boss;
    this.boss = boss;
    // The moment the boss falls: no more reinforcements, minions die with it.
    this.offBossDead?.();
    this.offBossDead = w.events.on('boss-dead', () => {
      this.spawns = [];
      for (const wr of this.waves) wr.started = true;
      for (const e of w.enemies()) if (!e.isBoss && e.state !== 'dying' && e.hostile) e.die(null);
      for (const e of w.entities) if (e instanceof Projectile && !e.removed) e.removed = true;
    });
    w.audio.play('boss_warning');
    w.audio.playMusic('boss');
  }

  private setupWaves(defs: WaveDef[]) {
    this.waves = defs.map((def) => ({ def, started: false, startTime: 0, pending: 0, enemies: [] }));
  }

  /** Convert a script position to coordinates in the target frame. */
  private framePos(pos: V3, world: boolean, frame: Frame): THREE.Vector3 {
    const rig = this.world.rig;
    if (frame === 'rig') {
      if (world) {
        rig.space.updateMatrixWorld();
        return rig.space.worldToLocal(new THREE.Vector3(...pos));
      }
      return RailRig.rel(pos, new THREE.Vector3());
    }
    return world ? new THREE.Vector3(...pos) : rig.relToWorld(pos, new THREE.Vector3());
  }

  private startWave(wr: WaveRun) {
    wr.started = true;
    wr.startTime = this.beatTime;
    for (const s of wr.def.spawns) {
      const count = Math.max(1, s.count ?? 1);
      for (let k = 0; k < count; k++) {
        const o = s.offset ?? [0, 0, 0];
        const pos: V3 = [s.pos[0] + o[0] * k, s.pos[1] + o[1] * k, s.pos[2] + o[2] * k];
        this.spawns.push({ at: this.beatTime + (s.t ?? 0) + k * (s.every ?? 0), def: s, pos, wave: wr });
        wr.pending++;
      }
    }
  }

  private doSpawn(p: PendingSpawn) {
    const w = this.world;
    const b = this.beat!;
    const moving = b.kind === 'move' || (b.kind === 'boss' && b.moveTo !== undefined);
    const frame: Frame = p.def.frame ?? (moving ? 'rig' : 'world');
    const pos = this.framePos(p.pos, !!p.def.world, frame);
    if (frame === 'world' && p.def.entry !== 'drop' && p.def.entry !== 'fly' && p.pos[1] === 0) {
      pos.y = w.groundAt(pos.x, pos.z);
    }
    try {
      const e = createEnemy(p.def.type, w, {
        pos,
        frame,
        entry: p.def.entry ?? 'walk',
        hpMul: p.def.hp ?? 1,
        speedMul: p.def.speed ?? 1,
        opts: p.def.opts ?? {},
      });
      w.add(e);
      p.wave.enemies.push(e);
    } catch (err) {
      console.error('[stage] spawn failed', p.def.type, err);
    }
    p.wave.pending--;
  }

  private waveCleared(wr: WaveRun): boolean {
    return wr.started && wr.pending === 0 && wr.enemies.every((e) => e.removed || !e.hostile);
  }

  private updateWaves() {
    for (let i = 0; i < this.waves.length; i++) {
      const wr = this.waves[i];
      if (wr.started) continue;
      const prev = this.waves[i - 1];
      if (prev && !prev.started) break;
      const st = wr.def.start;
      let go = false;
      if (st) {
        if (st.after !== undefined && this.beatTime >= st.after) go = true;
        if (st.remaining !== undefined && (!prev || prev.pending === 0) && this.world.hostileCount() <= st.remaining) go = true;
        if (st.atD !== undefined && this.world.rig.d >= st.atD) go = true;
      } else {
        go = !prev || this.waveCleared(prev);
      }
      if (go) this.startWave(wr);
      else break;
    }
    for (let i = this.spawns.length - 1; i >= 0; i--) {
      if (this.spawns[i].at <= this.beatTime) {
        const p = this.spawns[i];
        this.spawns.splice(i, 1);
        this.doSpawn(p);
      }
    }
  }

  private allWavesDone(): boolean {
    return this.waves.every((wr) => wr.started) && this.spawns.length === 0;
  }

  update(dt: number) {
    if (this.done || !this.beat) return;
    const w = this.world;
    this.beatTime += dt;

    for (let i = this.things.length - 1; i >= 0; i--) {
      if (this.things[i].at <= this.beatTime) {
        const t = this.things[i];
        this.things.splice(i, 1);
        t.run();
      }
    }
    this.updateWaves();

    const b = this.beat;
    let complete = false;
    switch (b.kind) {
      case 'move':
        complete = w.rig.arrived && (!b.waitClear || w.hostileCount() === 0);
        break;
      case 'hold': {
        const cleared = this.allWavesDone() && w.hostileCount() === 0;
        if (cleared) this.clearTimer += dt;
        complete = (cleared && this.beatTime >= (b.minTime ?? 0) && this.clearTimer > 0.6) || (b.timeout !== undefined && this.beatTime >= b.timeout);
        break;
      }
      case 'boss':
        complete = !!this.boss && this.boss.removed;
        if (complete) {
          // Minions flee when the boss falls.
          for (const e of w.enemies()) if (e !== this.boss && e.state !== 'dying') e.die(null);
        }
        break;
      case 'banner':
      case 'wait':
        complete = this.beatTime >= b.duration;
        break;
      case 'action':
        complete = !this.actionPending && this.beatTime >= (b.duration ?? 0) && (!b.until || b.until(w));
        break;
    }
    if (complete) this.next();
  }

  /** Progress through the stage 0..1 (for HUD). */
  get progress(): number {
    const n = this.stage.beats.length;
    return n === 0 ? 1 : Math.max(0, this.index) / n;
  }

  /** Current beat label for debug overlays. */
  get label(): string {
    const b = this.beat;
    if (!b) return this.done ? 'done' : '-';
    return `${this.index}:${b.kind}${b.label ? ` (${b.label})` : ''}`;
  }
}

