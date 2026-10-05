import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import '../../src/content';
import { createEnemy } from '../../src/content/registry';
import { World } from '../../src/gameplay/World';
import { AudioSystem } from '../../src/audio/Audio';
import { Projectile } from '../../src/gameplay/Projectile';
import { DEFAULT_SETTINGS, type HitPart } from '../../src/core/types';
import type { Entity } from '../../src/gameplay/Entity';
import type { Enemy } from '../../src/gameplay/Enemy';
import { PixelFigure, PART, MAX_PRIMS, MAX_KPX, type FigureSample } from '../../src/gameplay/pixel/figure';
import { bossDDart } from '../../src/content/pixel/bossesDino';
import { keepLive } from '../../src/gameplay/SpriteArt';
import { nullHud } from './sim';

/**
 * PixelCast alignment for the PRIMAL ISLAND bosses painted in
 * content/pixel/bossesDino.ts (Specimen X, the Tyrant, the hybrid's quill
 * darts): in the sampled poses / attacks / knockdowns / deaths, every hitbox
 * centre shows the part a real raycast through that pixel hits (glowing eyes,
 * stripes, throat as WEAK; quills, brows, scutes as ARMOR), the silhouettes
 * overlap and the parts agree almost everywhere; the weak points are drawn as
 * weak where the rays hit them. Parts SpriteArt keeps as live 3D over the
 * sprite (the soft alpha-blended eye halos) are drawn by themselves: rays that
 * hit one first are left out of the comparison.
 */

const GH = 288;
const W = 844;
const H = 390;
const GW = Math.round((GH * W) / H);

const PART_NAME = ['none', 'head', 'torso', 'limb', 'tail', 'weak', 'armor'];
const PART_OF: Record<HitPart, number> = { head: PART.HEAD, torso: PART.TORSO, limb: PART.LIMB, tail: PART.TAIL, weak: PART.WEAK, armor: PART.ARMOR, body: PART.TORSO };

function makeWorld() {
  const camera = new THREE.PerspectiveCamera(58, W / H, 0.05, 400);
  const world = new World(camera, new AudioSystem(), nullHud, { ...DEFAULT_SETTINGS, haptics: false }, 7);
  world.viewport = { width: W, height: H };
  world.player.god = true;
  return { world, camera };
}

interface Check {
  centres: number;
  centreHits: number;
  centreMiss: string[];
  iou: number;
  partAgree: number;
  conf: string;
  prims: number;
  /** Sprite area / hitbox area (grid points). */
  area: number;
  /** Grid points where a ray hits a weak point / of those, the sprite shows WEAK. */
  weakRays: number;
  weakShown: number;
  /** Armour hitbox centres in view / of those, drawn as ARMOR. */
  armorCentres: number;
  armorShown: number;
}

const _v = new THREE.Vector3();
const _box = new THREE.Box3();
const ray = new THREE.Raycaster();
const sample: FigureSample = { layer: -1, prim: -1, part: 0, mat: 0, depth: 0 };

/**
 * Paint `e` seen from `eye` looking at `look`, compare sprite parts with raycasts.
 * `seeThroughLive`: rays pass through parts drawn live over the sprite (a soft halo
 * enclosing the whole thing, like the dart's) and are compared on what is inside.
 */
function check(world: World, camera: THREE.PerspectiveCamera, e: Entity, eye: THREE.Vector3, look: THREE.Vector3, seeThroughLive = false): Check {
  world.scene.updateMatrixWorld(true);
  camera.position.copy(eye);
  camera.lookAt(look);
  camera.updateMatrixWorld();
  const f = new PixelFigure();
  f.begin(camera, GW, GH);
  expect(e.paintPixels!(f)).toBe(true);
  expect(f.count).toBeLessThanOrEqual(MAX_PRIMS);
  expect(f.overflow).toBe(0);
  expect(f.layout(1, 24, 256)).toBe(true);
  expect(f.kpx).toBeLessThanOrEqual(MAX_KPX);
  const boxes = world.shootables.objects.filter((o) => (o.userData.shot as { owner: Entity } | undefined)?.owner === e);
  const toTexel = (p: THREE.Vector3) => {
    _v.copy(p).project(camera);
    const px = (_v.x * 0.5 + 0.5) * GW;
    const py = (_v.y * 0.5 + 0.5) * GH;
    return { tx: (px - f.ox) / f.kpx, ty: (py - f.oy) / f.kpx, ndc: new THREE.Vector2(_v.x, _v.y) };
  };
  let lastHit = null as THREE.Object3D | null;
  /** Part a shot through `ndc` hits (0 = none, -1 = a live 3D part drawn over the sprite). */
  const shoot = (ndc: THREE.Vector2): number => {
    ray.setFromCamera(ndc, camera);
    const hits = ray.intersectObjects(boxes, false);
    if (seeThroughLive) {
      // Through the live glow to what is inside it; a ray that only grazes the glow is left out.
      const solid = hits.find((h) => !keepLive(h.object));
      lastHit = solid?.object ?? null;
      if (!solid) return hits.length ? -1 : 0;
      return PART_OF[(solid.object.userData.shot as { part: HitPart }).part];
    }
    lastHit = hits[0]?.object ?? null;
    if (!hits.length) return 0;
    if (keepLive(hits[0].object)) return -1;
    return PART_OF[(hits[0].object.userData.shot as { part: HitPart }).part];
  };
  let centres = 0;
  let centreHits = 0;
  let armorCentres = 0;
  let armorShown = 0;
  const centreMiss: string[] = [];
  for (const b of boxes) {
    const m = b as THREE.Mesh;
    if (!m.geometry || !m.visible) continue;
    let vis = true;
    for (let o: THREE.Object3D | null = m; o; o = o.parent) if (!o.visible) vis = false;
    if (!vis) continue;
    const wantPart = (b.userData.shot as { part: HitPart }).part;
    m.geometry.computeBoundingBox();
    _box.copy(m.geometry.boundingBox!).applyMatrix4(m.matrixWorld);
    const t = toTexel(_box.getCenter(new THREE.Vector3()));
    const want = shoot(t.ndc);
    if (want <= 0) continue;
    centres++;
    f.sample(Math.floor(t.tx) + 0.5, Math.floor(t.ty) + 0.5, sample);
    if (want === PART.ARMOR) {
      armorCentres++;
      if (sample.part === PART.ARMOR) armorShown++;
    }
    if (sample.part === want) centreHits++;
    else {
      const label = `${PART_NAME[want]}(${wantPart}@${m.parent?.name || m.parent?.parent?.name || '?'})→${sample.layer < 0 ? 'empty' : PART_NAME[sample.part]}`;
      if (process.env.BOSSD_DEBUG) {
        // Debug aid: the 5×5 texel neighbourhood's parts around the centre.
        let nb = '';
        const tx = Math.floor(t.tx);
        const ty = Math.floor(t.ty);
        const R = Number(process.env.BOSSD_NB ?? 2);
        for (let dy = R; dy >= -R; dy--) {
          for (let dx = -R; dx <= R; dx++) nb += f.sample(tx + dx + 0.5, ty + dy + 0.5, sample).layer < 0 ? '.' : process.env.BOSSD_LAYERS ? sample.layer.toString(16) : String(sample.part);
          nb += '|';
        }
        ray.setFromCamera(t.ndc, camera);
        const hh = ray.intersectObjects(boxes, false)[0];
        const lp = hh ? hh.object.worldToLocal(hh.point.clone()) : null;
        const cl = m.worldToLocal(_box.getCenter(new THREE.Vector3()));
        console.log(`${label} [${tx},${ty} k${f.kpx} ${nb}] centre@box ${cl.toArray().map((v) => v.toFixed(3))} hit ${hh?.object === m ? 'self' : hh?.object.parent?.name} at ${lp?.toArray().map((v) => v.toFixed(3))}`);
      }
      centreMiss.push(label);
    }
  }
  let both = 0;
  let either = 0;
  let agree = 0;
  let weakRays = 0;
  let weakShown = 0;
  let spriteN = 0;
  let rayN = 0;
  const extra: Record<string, number> = {};
  const confusion: Record<string, number> = {};
  for (let y = 0.5; y < f.H; y += 2) {
    for (let x = 0.5; x < f.W; x += 2) {
      const px = f.ox + x * f.kpx;
      const py = f.oy + y * f.kpx;
      const ndc = new THREE.Vector2((px / GW) * 2 - 1, (py / GH) * 2 - 1);
      if (Math.abs(ndc.x) > 1 || Math.abs(ndc.y) > 1) continue;
      const want = shoot(ndc);
      if (want < 0) continue;
      f.sample(x, y, sample);
      const got = sample.layer >= 0 ? sample.part : 0;
      if (want === PART.WEAK) {
        weakRays++;
        if (got === PART.WEAK) weakShown++;
      }
      if (got) spriteN++;
      if (want) rayN++;
      if (got && !want && process.env.BOSSD_DEBUG) extra[`${PART_NAME[got]}#L${sample.layer}`] = (extra[`${PART_NAME[got]}#L${sample.layer}`] ?? 0) + 1;
      if (want > 0 && !got && process.env.BOSSD_DEBUG) extra[`miss:${PART_NAME[want]}`] = (extra[`miss:${PART_NAME[want]}`] ?? 0) + 1;
      if (want || got) either++;
      if (want && got) {
        both++;
        if (want === got) agree++;
        else {
          const k = process.env.BOSSD_DEBUG ? `${PART_NAME[want]}@${(lastHit as THREE.Object3D | null)?.parent?.name}→${PART_NAME[got]}#L${sample.layer}` : `${PART_NAME[want]}→${PART_NAME[got]}`;
          confusion[k] = (confusion[k] ?? 0) + 1;
        }
      }
    }
  }
  if (process.env.BOSSD_DEBUG) console.log(`area sprite/hitbox ${(spriteN / Math.max(1, rayN)).toFixed(3)} (${spriteN}/${rayN}) ${JSON.stringify(extra)}`);
  const conf = Object.entries(confusion)
    .sort((a, b) => b[1] - a[1])
    .slice(0, process.env.BOSSD_DEBUG ? 10 : 4)
    .map(([k, v]) => `${k}:${v}`)
    .join(' ');
  return { centres, centreHits, centreMiss, iou: both / Math.max(1, either), partAgree: agree / Math.max(1, both), conf, prims: f.count, weakRays, weakShown, area: spriteN / Math.max(1, rayN), armorCentres, armorShown };
}

function expectAligned(c: Check, label: string, o: { iou?: number; agree?: number } = {}) {
  const info = `${label} centres ${c.centreHits}/${c.centres} [${c.centreMiss.join(' ')}] iou ${c.iou.toFixed(2)} agree ${c.partAgree.toFixed(2)} (${c.conf}) prims ${c.prims} weak ${c.weakShown}/${c.weakRays} area ${c.area.toFixed(2)}`;
  if (process.env.BOSSD_REPORT) console.log(`BOSSD ${info}`);
  // Never a hitbox centre on an empty texel; a head centre always shows head.
  expect(c.centreMiss.filter((m) => m.endsWith('empty')), `${info}: hitbox centre on an empty texel`).toEqual([]);
  expect(c.centreMiss.filter((m) => m.includes('(head)')), `${info}: head hitbox centre not drawn as head`).toEqual([]);
  expect(c.centreHits / Math.max(1, c.centres), info).toBeGreaterThanOrEqual(0.75);
  expect(c.iou, `${info}: silhouette IoU`).toBeGreaterThan(o.iou ?? 0.72);
  expect(c.partAgree, `${info}: part agreement`).toBeGreaterThan(o.agree ?? 0.85);
  // Bosses stay inside their primitive budget (docs: ≈ 80–130 for a boss, ≤ 160).
  expect(c.prims, info).toBeLessThanOrEqual(140);
  // No bloat: the sprite covers about what the hitboxes cover.
  expect(c.area, `${info}: sprite / hitbox area`).toBeGreaterThan(0.85);
  expect(c.area, `${info}: sprite / hitbox area`).toBeLessThan(1.2);
}

function run(e: Entity, seconds: number, pin?: () => void) {
  for (let t = 0; t < seconds; t += 1 / 60) {
    e.update(1 / 60);
    pin?.();
  }
}

/** Boss internals the poses drive (private in TS, plain fields at run time). */
type Driven = Enemy & Record<string, unknown> & { go(s: string): void };

function spawnBoss(world: World, id: string, x: number, z: number): Driven {
  const e = createEnemy(id, world, { pos: new THREE.Vector3(x, 0, z), frame: 'world', entry: 'walk', hpMul: 1, speedMul: 1, opts: {} }) as unknown as Driven;
  world.add(e);
  return e;
}

/** Keep the boss where it was placed, facing `yaw` relative to the camera at the origin. */
function pinner(e: Driven, x: number, z: number, yaw: number) {
  return () => {
    e.root.position.x = x;
    e.root.position.z = z;
    e.root.rotation.y = Math.atan2(-x, -z) + yaw;
  };
}

const ORIGIN = new THREE.Vector3(0, 1.62, 0);

describe('PixelCast alignment: Specimen X (d2)', () => {
  function setup(x: number, z: number, yaw: number) {
    const { world, camera } = makeWorld();
    const e = spawnBoss(world, 'specimen_x', x, z);
    // (The zoo-free test arena: no hall to clamp to, no attack timer.)
    e.clampArena = (v: THREE.Vector3) => v;
    e.go('watch');
    e.cooldown = 99;
    e.cloak = 0;
    e.cloakTarget = 0;
    const pin = pinner(e, x, z, yaw);
    pin();
    return { world, camera, e, pin };
  }
  const chest = (e: Driven) => (e.anchor as THREE.Object3D).getWorldPosition(new THREE.Vector3());

  it('watching (3/4 view), uncloaked and cloaked', () => {
    const { world, camera, e, pin } = setup(0.6, -9, -1.0);
    run(e, 1.2, pin);
    const c = check(world, camera, e, ORIGIN, chest(e));
    expectAligned(c, 'x watch');
    expect(c.weakShown, 'glowing stripes / eyes drawn as weak').toBeGreaterThan(0.5 * c.weakRays);
    e.go('hide');
    e.hissT = 99;
    e.cloakTarget = 1;
    run(e, 1.0, pin);
    expectAligned(check(world, camera, e, ORIGIN, chest(e)), 'x cloaked');
  });

  it('fading into the dark (cloak 0.6): the dark quills still cover their hitboxes', () => {
    const { world, camera, e, pin } = setup(0.6, -9, -1.3);
    run(e, 0.6, pin);
    e.go('hide');
    e.hissT = 99;
    run(e, 0.6, pin);
    // (The hide state drives the cloak to 1; hold it mid-fade for the redraw.)
    e.cloak = 0.6;
    const c = check(world, camera, e, ORIGIN, chest(e));
    expectAligned(c, 'x cloak 0.6');
    expect(c.armorCentres, 'quill hitboxes in view').toBeGreaterThan(0);
    expect(c.armorShown, 'quill hitbox centres drawn as armour').toBeGreaterThanOrEqual(Math.ceil(c.armorCentres * 0.5));
  });

  it('worst case for the primitive budget: enraged, quills up, flinching, head-on maw', () => {
    const { world, camera, e, pin } = setup(0.3, -9, 0);
    e.enraged = true;
    run(e, 0.3, pin);
    e.go('pounceWind');
    run(e, 1.3, pin);
    e.quillRaise = 1;
    // (A hit's squash, part-way through: the warp moves the sprite off the hitboxes at its peak.)
    e.flinch = 0.3;
    const c = check(world, camera, e, ORIGIN, chest(e));
    expectAligned(c, 'x worst case');
    expect(c.prims, 'within the boss budget (docs: <= 130 with headroom under the 160 cap)').toBeLessThanOrEqual(130);
  });

  it('side-on tail whip wind-up (ring on the glowing tail base)', () => {
    const { world, camera, e, pin } = setup(0.4, -8.5, 1.45);
    run(e, 0.3, pin);
    e.sideSign = 1;
    e.go('tailWind');
    run(e, 1.0, pin);
    const c = check(world, camera, e, ORIGIN, chest(e));
    expectAligned(c, 'x tail wind');
    expect(c.weakShown).toBeGreaterThan(0.5 * c.weakRays);
  });

  it('pounce: crouched wind-up, then the head-on leap (the maw)', () => {
    const { world, camera, e, pin } = setup(0.3, -11, 0);
    run(e, 0.3, pin);
    e.go('pounceWind');
    run(e, 1.3, pin);
    expectAligned(check(world, camera, e, ORIGIN, chest(e)), 'x pounce wind');
    run(e, 0.45);
    expectAligned(check(world, camera, e, ORIGIN, chest(e)), 'x pounce leap');
  });

  it('roar (rearing, quills up) and knocked flat (stun)', () => {
    const { world, camera, e, pin } = setup(0.5, -10, -0.6);
    run(e, 0.3, pin);
    e.pendingRoar = 1;
    e.go('roar');
    run(e, 1.0, pin);
    expectAligned(check(world, camera, e, ORIGIN, chest(e)), 'x roar');
    e.go('stun');
    run(e, 1.0, pin);
    expectAligned(check(world, camera, e, ORIGIN, chest(e)), 'x stun');
  });

  it('a quill dart: bone quill + glowing tip cover the dart hitboxes', () => {
    const { world, camera, e } = setup(0.5, -10, 0);
    const mesh = (e as unknown as { quillDart(): THREE.Object3D }).quillDart();
    const dart = new Projectile(world, { from: new THREE.Vector3(0.6, 2.2, -5), mesh, flightTime: 1.6, arc: 0.85, damage: 1, hp: 1, points: 120, color: 0xe8e2d4, size: 0.32, spin: 0, source: 'x', sfxDestroy: 'hit_projectile', burst: 'debris' });
    dart.paintPixels = bossDDart(dart.root);
    world.add(dart);
    run(dart, 0.4);
    // (Its soft halo stays a live glow: compared on the quill and the glowing bead inside it.)
    expect(dart.root.children[0].children.some((o) => keepLive(o))).toBe(true);
    const c = check(world, camera, dart, ORIGIN, dart.root.getWorldPosition(new THREE.Vector3()), true);
    expectAligned(c, 'dart', { iou: 0.6 });
    expect(c.centres).toBeGreaterThan(0);
  });
});

describe('PixelCast alignment: the Tyrant (d3)', () => {
  function setup(x: number, z: number, yaw: number) {
    const { world, camera } = makeWorld();
    const e = spawnBoss(world, 'tyrant', x, z);
    e.driveRig = () => {};
    e.go('stalk');
    e.cooldown = 99;
    const pin = pinner(e, x, z, yaw);
    pin();
    return { world, camera, e, pin };
  }
  const look = (e: Driven, k: number) => {
    const a = (e.anchor as THREE.Object3D).getWorldPosition(new THREE.Vector3());
    const b = (e.headAnchor as THREE.Object3D).getWorldPosition(new THREE.Vector3());
    return a.lerp(b, k);
  };
  const JEEP = new THREE.Vector3(0, 2.4, 0);

  it('stalking, side view and 3/4', () => {
    const { world, camera, e, pin } = setup(1, -18, -1.2);
    run(e, 1.2, pin);
    expectAligned(check(world, camera, e, JEEP, look(e, 0.3)), 'rex side');
    const p2 = pinner(e, 1, -16, -0.5);
    run(e, 0.3, p2);
    expectAligned(check(world, camera, e, JEEP, look(e, 0.3)), 'rex 3/4');
  });

  it('bite wind-up head-on: the maw faces the lens, the throat is weak', () => {
    const { world, camera, e, pin } = setup(0.3, -11, 0);
    run(e, 0.5, pin);
    e.steer = () => {};
    e.go('biteWind');
    run(e, 1.0, pin);
    e.telegraph = null;
    const c = check(world, camera, e, JEEP, look(e, 0.7));
    expectAligned(c, 'rex bite');
    expect(c.weakRays, 'the gaping throat is in view').toBeGreaterThan(5);
    expect(c.weakShown, 'throat / eyes drawn as weak').toBeGreaterThan(0.5 * c.weakRays);
  });

  it('roar (3/4), knocked down, getting up', () => {
    const { world, camera, e, pin } = setup(1, -16, -0.6);
    run(e, 0.5, pin);
    e.steer = () => {};
    e.afterRoar = 'stalk';
    e.go('roar');
    run(e, 1.4, pin);
    expectAligned(check(world, camera, e, JEEP, look(e, 0.5)), 'rex roar');
    e.go('knockdown');
    run(e, 1.3, pin);
    e.go('down');
    run(e, 1.0, pin);
    expectAligned(check(world, camera, e, JEEP, look(e, 0.2)), 'rex down');
    e.go('getup');
    run(e, 0.6, pin);
    expectAligned(check(world, camera, e, JEEP, look(e, 0.4)), 'rex getup');
  });

  it('dying: crashes onto its side, still painted where the body is', () => {
    const { world, camera, e, pin } = setup(0.5, -16, -0.5);
    run(e, 0.5, pin);
    e.die(null);
    run(e, 1.6);
    world.scene.updateMatrixWorld(true);
    camera.position.copy(JEEP);
    camera.lookAt(look(e, 0.4));
    camera.updateMatrixWorld();
    const f = new PixelFigure();
    f.begin(camera, GW, GH);
    expect(e.paintPixels!(f)).toBe(true);
    expect(f.layout(1, 24, 256)).toBe(true);
    const h = (e.headAnchor as THREE.Object3D).localToWorld(new THREE.Vector3(0, 0.1, 0.6)).project(camera);
    const s2 = f.sample((((h.x * 0.5 + 0.5) * GW - f.ox) / f.kpx | 0) + 0.5, (((h.y * 0.5 + 0.5) * GH - f.oy) / f.kpx | 0) + 0.5);
    expect(s2.layer).toBeGreaterThanOrEqual(0);
  });
});
