import { describe, expect, it } from 'vitest';
import { CAMPAIGNS, ALL_STAGES } from '../../src/content';
import { hasEnemy } from '../../src/content/registry';
import { RailRig } from '../../src/gameplay/RailRig';
import * as THREE from 'three';
import type { Beat, WaveDef } from '../../src/gameplay/StageTypes';
import { simulateStage } from './sim';

const PICKUPS = ['health', 'shotgun', 'smg', 'magnum', 'bomb', 'points'];

function wavesOf(b: Beat): WaveDef[] {
  if (b.kind === 'move' || b.kind === 'hold' || b.kind === 'boss') return b.waves ?? [];
  return [];
}

describe('campaign structure', () => {
  it('has two campaigns with three stages each, ordered by index', () => {
    expect(CAMPAIGNS.map((c) => c.id)).toEqual(['zombie', 'dino']);
    for (const c of CAMPAIGNS) {
      expect(c.stages).toHaveLength(3);
      c.stages.forEach((s, i) => {
        expect(s.index).toBe(i);
        expect(s.campaign).toBe(c.id);
      });
    }
  });

  it('stage ids are unique', () => {
    const ids = ALL_STAGES.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe.each(ALL_STAGES.map((s) => [s.id, s] as const))('stage %s', (_id, stage) => {
  const rig = new RailRig(new THREE.PerspectiveCamera());
  rig.setPath(stage.rail);

  it('has a sane rail', () => {
    expect(stage.rail.length).toBeGreaterThanOrEqual(2);
    expect(rig.length).toBeGreaterThan(30);
  });

  it('move targets are monotonic and within the rail', () => {
    let d = 0;
    for (const b of stage.beats) {
      const to = b.kind === 'move' ? b.to : b.kind === 'boss' ? b.moveTo : undefined;
      if (to === undefined) continue;
      expect(to, `beat ${b.label ?? b.kind} goes backwards`).toBeGreaterThanOrEqual(d);
      expect(to, `beat ${b.label ?? b.kind} beyond rail end ${rig.length.toFixed(1)}`).toBeLessThanOrEqual(rig.length + 0.01);
      d = to;
    }
  });

  it('only references registered enemies and valid pickups', () => {
    for (const b of stage.beats) {
      if (b.kind === 'boss') expect(hasEnemy(b.boss), `boss ${b.boss}`).toBe(true);
      for (const w of wavesOf(b)) for (const s of w.spawns) expect(hasEnemy(s.type), `enemy ${s.type}`).toBe(true);
      for (const p of b.pickups ?? []) expect(PICKUPS).toContain(p.kind);
    }
  });

  it('every hold beat spawns something and the stage ends with a boss', () => {
    for (const b of stage.beats) {
      if (b.kind === 'hold') expect(b.waves.reduce((n, w) => n + w.spawns.length, 0), b.label).toBeGreaterThan(0);
    }
    expect(stage.beats.some((b) => b.kind === 'boss')).toBe(true);
  });

  it('can be completed by the autoplayer (no soft-locks, boss killable)', { timeout: 120_000 }, () => {
    const r = simulateStage(stage);
    if (!r.completed || r.errors.length) console.log(stage.id, JSON.stringify(r, null, 2));
    expect(r.errors).toEqual([]);
    expect(r.completed, `stuck at beat ${r.beatLabel} after ${r.time.toFixed(0)}s`).toBe(true);
    expect(r.unframedPounces, 'crawler pounces whose ring never showed during the coil').toEqual([]);
    // Arcade pacing: a stage should take roughly 2–10 minutes.
    expect(r.time).toBeLessThan(600);
  });
});
