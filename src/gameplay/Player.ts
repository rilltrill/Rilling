export interface PlayerHooks {
  hurt?(amount: number, hp: number, source: string): void;
  heal?(amount: number, hp: number): void;
  dead?(): void;
}

/** Player life (arcade "torches"), invulnerability frames and bombs. */
export class Player {
  maxHp = 5;
  hp = 5;
  /** Seconds of invulnerability remaining after being hit. */
  invuln = 0;
  bombs = 1;
  maxBombs = 3;
  god = false;
  damageTaken = 0;
  hooks: PlayerHooks = {};

  get dead() {
    return this.hp <= 0;
  }

  /** Apply damage. Returns true if it actually landed. */
  hurt(amount: number, source = 'enemy'): boolean {
    if (this.dead || this.invuln > 0 || amount <= 0) return false;
    this.damageTaken += amount;
    if (!this.god) this.hp = Math.max(0, this.hp - amount);
    this.invuln = 1.1;
    this.hooks.hurt?.(amount, this.hp, source);
    if (this.hp <= 0) this.hooks.dead?.();
    return true;
  }

  heal(amount = 1): boolean {
    if (this.hp >= this.maxHp) return false;
    this.hp = Math.min(this.maxHp, this.hp + amount);
    this.hooks.heal?.(amount, this.hp);
    return true;
  }

  revive() {
    this.hp = this.maxHp;
    this.invuln = 2.5;
  }

  addBomb(): boolean {
    if (this.bombs >= this.maxBombs) return false;
    this.bombs++;
    return true;
  }

  update(dt: number) {
    if (this.invuln > 0) this.invuln = Math.max(0, this.invuln - dt);
  }
}
