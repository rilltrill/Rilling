import type { World } from '../../../gameplay/World';
import type { ShotHit } from '../../../gameplay/Entity';
import { Walker } from '../../enemies/zombies';
import { registerEnemy } from '../../registry';

/** Worlds that have already shown the riot-gear hint (once per stage run). */
const hinted = new WeakSet<World>();

/** Riot-vest plates (blued steel mid-tones, like the brute's: pure black crushes on the CRT). */
const PLATE = 0x343c4e;
const EDGE = 0x5c6882;
const STRAP = 0x1e1a18;

/**
 * Hospital security in riot gear (z2 only): a walker that jogs in — same reach
 * and 1.6 s windup ring, one heart — wearing a steel-plated vest and an armoured
 * belt. A small, brute-like threat: body shots spark off the plates (no damage,
 * no flinch) and it shrugs off arm hits and grazes (super armour, half damage);
 * a HEADSHOT knocks it out of its swing (every time — no cooldown) and two drop
 * it. The face is never covered, the ring sits on the chest as usual, and the
 * sparks + clank on the first body shot (and a one-off hint) say "aim higher".
 */
export class RiotWalker extends Walker {
  /** ART: SPRITES — its riot plates (armor hit zones) aren't painted yet: impostor bake until they are. */
  protected override pixelArt = false;

  protected override configure() {
    super.configure();
    this.name = 'riot';
    // (Hospital security: navy uniform under the vest unless a stage asks otherwise.)
    this.spawn.opts.variant ??= 'cop';
    this.superArmor = true;
    this.points = 300;
    // Two headshots (pistol 2.5 each) — the first one knocks it out of its swing.
    this.maxHp = 5;
    // (A heavy jog, not a shamble: it closes in while you deal with the rest.)
    this.speed = this.world.rng.range(1.9, 2.3);
  }

  /** Arms and grazes (assisted shots) only scuff it: the head is the way to stop it. */
  protected override damageMultiplier(hit: ShotHit): number {
    return hit.part === 'head' ? 1 : 0.5;
  }

  protected override onDamaged(hit: ShotHit, amount: number) {
    super.onDamaged(hit, amount);
    // Super armour shrugs off everything but a shot to the face.
    if (this.hp > 0 && hit.part === 'head') this.stagger();
  }

  override update(dt: number): void {
    super.update(dt);
    // First time one walks into view: tell the player where to aim.
    if (!hinted.has(this.world) && this.state === 'advance' && this.distToPlayer < 14 && this.inPlayArea(this.anchor, 0.8)) {
      hinted.add(this.world);
      const sp = this.screenPos(this.headAnchor ?? this.anchor);
      const vp = this.world.viewport;
      this.world.hud.popup('ARMORED! AIM FOR THE HEAD!', sp ? sp.x : vp.width * 0.5, Math.max(vp.height * 0.2, (sp ? sp.y : vp.height * 0.4) - 40), 'warning');
    }
  }

  protected override finishBody() {
    const b = this.b;
    const r = this.r;
    const sb = Math.sqrt(b.bulk);
    const w = b.chestW;
    const d = 0.22 * sb;
    // Vest wrapping the whole torso (front, back and sides), with a lighter rim.
    b.box(r.spine, w + 0.05, 0.4, d + 0.06, PLATE, 0, 0.27, 0, 0, 0, 0, 0.04, 'armor');
    b.box(r.spine, w + 0.07, 0.035, d + 0.075, EDGE, 0, 0.455, 0, 0, 0, 0, 0.08, 'armor');
    b.box(r.spine, w + 0.07, 0.035, d + 0.075, EDGE, 0, 0.085, 0, 0, 0, 0, 0.08, 'armor');
    // Chest plate and straps on the front.
    b.box(r.spine, w * 0.62, 0.2, 0.025, EDGE, 0, 0.3, d / 2 + 0.035, 0, 0, 0, 0.06, 'armor');
    b.box(r.spine, 0.04, 0.36, 0.02, STRAP, -w * 0.36, 0.27, d / 2 + 0.035, 0, 0, 0, 0, 'armor');
    b.box(r.spine, 0.04, 0.36, 0.02, STRAP, w * 0.36, 0.27, d / 2 + 0.035, 0, 0, 0, 0, 'armor');
    // Armoured belt + groin plate over the hips.
    b.box(r.hips, 0.4 * b.bulk + 0.04, 0.2, d + 0.06, PLATE, 0, -0.03, 0, 0, 0, 0, 0.04, 'armor');
    b.box(r.hips, 0.16 * b.bulk, 0.16, 0.025, EDGE, 0, -0.1, d / 2 + 0.035, 0, 0, 0, 0.06, 'armor');
    super.finishBody();
  }
}

registerEnemy('riot_z2', (w, s) => new RiotWalker(w, s));
