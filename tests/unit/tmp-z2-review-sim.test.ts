import { it } from 'vitest';
import * as THREE from 'three';
import { World } from '../../src/gameplay/World';
import { StageRunner } from '../../src/gameplay/StageRunner';
import { Shooter } from '../../src/gameplay/Shooting';
import { AudioSystem } from '../../src/audio/Audio';
import { AutoPlayer } from '../../src/debug/AutoPlayer';
import { DEFAULT_SETTINGS } from '../../src/core/types';
import { Kit } from '../../src/content/kit/ModelKit';
import { Enemy } from '../../src/gameplay/Enemy';
import { nullHud } from './sim';
import { ALL_STAGES } from '../../src/content';
const stage = ALL_STAGES.find((s) => s.id === 'z2')!;

const RATE = Number(process.env.Z2_RATE ?? 6);
const SEEDS = (process.env.Z2_SEEDS ?? '99').split(',').map(Number);

function run(seed: number) {
  const dt = 1 / 30;
  const camera = new THREE.PerspectiveCamera(60, 844 / 390, 0.05, 400);
  const world = new World(camera, new AudioSystem(), nullHud, { ...DEFAULT_SETTINGS, haptics: false }, seed);
  world.viewport = { width: 844, height: 390 };
  world.player.god = true;
  const runner = new StageRunner(world, stage);
  const shooter = new Shooter(world);
  const bot = new AutoPlayer(world, shooter, RATE);
  let cleared = false;
  world.events.on('stage-clear', () => (cleared = true));
  const dmgBy: Record<string, number> = {};
  const origHurt = world.hurtPlayer.bind(world);
  world.hurtPlayer = (a: number, s: string) => {
    dmgBy[s] = (dmgBy[s] ?? 0) + a;
    return origHurt(a, s);
  };
  runner.start();
  let t = 0;
  let lastIdx = -1;
  let beatStart = 0;
  const beatDur: string[] = [];
  let maxHostile = 0;
  const ray = new THREE.Raycaster();
  const occl = new Map<Enemy, { frames: number; windupFrames: number; where: string; type: string }>();
  const camPos = new THREE.Vector3();
  const anc = new THREE.Vector3();
  let sampleT = 0;
  let bossPhaseT: number[] = [];
  let lastPhase = 0;
  let bossStart = -1;
  const envMeshes = (): THREE.Object3D[] => {
    const out: THREE.Object3D[] = [];
    const root = world.env!.root;
    // Only top-level zone groups that are visible (baked meshes inside).
    root.traverseVisible((o) => {
      if ((o as THREE.Mesh).isMesh && !(o as THREE.Mesh).userData.shot) {
        const m = (o as THREE.Mesh).material as THREE.Material;
        if (m && (m as THREE.Material & { transparent?: boolean }).transparent) return;
        out.push(o);
      }
    });
    return out;
  };
  while (!cleared && t < 900) {
    bot.update(dt);
    const sdt = world.update(dt);
    runner.update(sdt);
    world.scene.updateMatrixWorld();
    if (runner.index !== lastIdx) {
      if (lastIdx >= 0) beatDur.push(`${lastIdx}:${(t - beatStart).toFixed(1)}`);
      lastIdx = runner.index;
      beatStart = t;
    }
    maxHostile = Math.max(maxHostile, world.hostileCount());
    if (world.boss) {
      if (bossStart < 0) bossStart = t;
      const b = world.boss as unknown as { phase: number };
      if (b.phase !== lastPhase) {
        bossPhaseT.push(+(t - bossStart).toFixed(1));
        lastPhase = b.phase;
      }
    }
    sampleT += dt;
    if (sampleT >= 0.2) {
      sampleT = 0;
      camera.getWorldPosition(camPos);
      let meshes: THREE.Object3D[] | null = null;
      for (const e of world.enemies()) {
        if (e.removed || e.state === 'dying' || e.isBoss || e.state === 'entry') continue;
        if (e.distToPlayer > 18) continue;
        e.anchor.getWorldPosition(anc);
        const d = anc.distanceTo(camPos);
        ray.set(camPos, anc.clone().sub(camPos).normalize());
        ray.far = d - 0.4;
        meshes ??= envMeshes();
        const hits = ray.intersectObjects(meshes, false);
        if (hits.length) {
          const rec = occl.get(e) ?? { frames: 0, windupFrames: 0, where: '', type: e.name };
          rec.frames++;
          if (e.state === 'windup') rec.windupFrames++;
          const h = hits[0];
          rec.where = `beat ${runner.label} enemy@(${anc.x.toFixed(1)},${anc.y.toFixed(1)},${anc.z.toFixed(1)}) state=${e.state} hit ${h.object.name || h.object.parent?.name || '?'} @${h.distance.toFixed(1)}m of ${d.toFixed(1)}`;
          occl.set(e, rec);
        }
      }
    }
    t += dt;
  }
  const occList = [...occl.values()].filter((r) => r.frames >= 5 || r.windupFrames > 0).map((r) => `${r.type} occluded ${(r.frames * 0.2).toFixed(1)}s (windup ${(r.windupFrames * 0.2).toFixed(1)}s) last: ${r.where}`);
  console.log(
    JSON.stringify(
      {
        seed,
        rate: RATE,
        cleared,
        t: t.toFixed(1),
        kills: world.score.kills,
        damage: world.player.damageTaken,
        dmgBy,
        maxHostile,
        bossPhaseT,
        bossTime: bossStart >= 0 ? (t - bossStart).toFixed(1) : null,
        beatDur: beatDur.join(' '),
        occluded: occList,
      },
      null,
      1,
    ),
  );
  world.dispose();
  Kit.disposeAll();
}

it('z2 review sim', { timeout: 600_000 }, () => {
  for (const s of SEEDS) run(s);
});
