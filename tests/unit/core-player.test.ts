import { describe, expect, it, vi } from 'vitest';
import { Player } from '../../src/gameplay/Player';

describe('Player — damage & invulnerability', () => {
  it('a hit costs a life and grants invulnerability frames', () => {
    const p = new Player();
    const hurt = vi.fn();
    p.hooks.hurt = hurt;
    expect(p.hurt(1, 'walker')).toBe(true);
    expect(p.hp).toBe(p.maxHp - 1);
    expect(p.invuln).toBeGreaterThan(0.5);
    expect(hurt).toHaveBeenCalledWith(1, p.maxHp - 1, 'walker');
    // Further hits during i-frames are ignored.
    expect(p.hurt(1)).toBe(false);
    expect(p.hp).toBe(p.maxHp - 1);
  });

  it('invulnerability wears off with time', () => {
    const p = new Player();
    p.hurt(1);
    const t = p.invuln;
    p.update(t / 2);
    expect(p.hurt(1)).toBe(false);
    p.update(t / 2 + 0.01);
    expect(p.invuln).toBe(0);
    expect(p.hurt(1)).toBe(true);
    expect(p.hp).toBe(p.maxHp - 2);
    expect(p.damageTaken).toBe(2);
  });

  it('ignores zero / negative damage', () => {
    const p = new Player();
    expect(p.hurt(0)).toBe(false);
    expect(p.hurt(-2)).toBe(false);
    expect(p.hp).toBe(p.maxHp);
  });

  it('dies at zero hp exactly once', () => {
    const p = new Player();
    const dead = vi.fn();
    p.hooks.dead = dead;
    for (let i = 0; i < p.maxHp + 3; i++) {
      p.hurt(1);
      p.update(10);
    }
    expect(p.hp).toBe(0);
    expect(p.dead).toBe(true);
    expect(dead).toHaveBeenCalledOnce();
    expect(p.hurt(1)).toBe(false);
  });

  it('god mode records damage (for grading) but never loses hp', () => {
    const p = new Player();
    p.god = true;
    for (let i = 0; i < 20; i++) {
      expect(p.hurt(1)).toBe(true);
      p.update(10);
    }
    expect(p.hp).toBe(p.maxHp);
    expect(p.dead).toBe(false);
    expect(p.damageTaken).toBe(20);
  });

  it('revive restores full health with extra protection', () => {
    const p = new Player();
    p.hp = 0;
    p.revive();
    expect(p.hp).toBe(p.maxHp);
    expect(p.invuln).toBeGreaterThan(1);
  });
});

describe('Player — healing & bombs', () => {
  it('heal is capped at maxHp', () => {
    const p = new Player();
    const heal = vi.fn();
    p.hooks.heal = heal;
    expect(p.heal()).toBe(false);
    p.hp = 2;
    expect(p.heal(1)).toBe(true);
    expect(p.hp).toBe(3);
    expect(heal).toHaveBeenCalledWith(1, 3);
    p.heal(100);
    expect(p.hp).toBe(p.maxHp);
  });

  it('bombs stack up to maxBombs', () => {
    const p = new Player();
    const start = p.bombs;
    let added = 0;
    while (p.addBomb()) added++;
    expect(p.bombs).toBe(p.maxBombs);
    expect(added).toBe(p.maxBombs - start);
    expect(p.addBomb()).toBe(false);
  });
});
