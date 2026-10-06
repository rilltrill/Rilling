# OVERRUN — Architecture & Content Guide

OVERRUN is a mobile-first **arcade on-rails light-gun shooter** (think *House of
the Dead* / *Jurassic Park Arcade*): the camera travels along a rail, stops for
encounters, and the player taps the screen to shoot. Two campaigns — **DEAD
ZONE** (zombies) and **PRIMAL ISLAND** (dinosaurs) — of three stages each, every
stage ending in a boss.

Tech: TypeScript + Three.js + Vite. **All art and audio are procedural** (no
asset files): models are built from primitives at runtime, sounds are
synthesised with WebAudio. Ships as a web app/PWA and as native iOS/Android apps
via Capacitor.

```
src/
  main.ts                  entry: flags, Game boot
  core/                    engine-level, no gameplay knowledge
    Engine.ts              renderer, camera, frame loop, output-DPR policy, precompile, context loss
    Resolution.ts          dynamic-resolution governor (steps must prove they help: 30 Hz caps)
    Input.ts               pointer/touch/keyboard (tap = shoot, swipe-down = reload)
    Save.ts                localStorage: settings, unlocks, best scores
    types.ts               shared types (V3, WeaponId, HitPart, Settings…)
    EventBus.ts Rng.ts math.ts Haptics.ts
  gameplay/                the rail-shooter framework
    Game.ts                top-level state machine (menus ↔ loading ↔ stage ↔ results)
    Warmup.ts              shader warm-up: detached prototypes of everything a stage spawns
    World.ts               one stage session: scene, entities, systems, events
    StageRunner.ts         plays a StageDef's beats (move/hold/boss/banner/…)
    StageTypes.ts          ★ the stage scripting contract
    RailRig.ts             camera on the rail: movement, look, bob, shake
    Entity.ts              base for everything in a stage
    Enemy.ts               ★ base enemy: AI state machine, hits, death
    Boss.ts                ★ base boss: phases, weak points, death
    Projectile.ts          shootable thrown/spat objects aimed at the camera
    Pickup.ts Civilian.ts Props.ts (Destructible, explosiveBarrel)
    Shooting.ts            tap → raycast → damage, aim assist, pierce
    Weapons.ts Player.ts Scoring.ts Shootables.ts
  content/
    registry.ts            enemy id → factory registry
    kit/ModelKit.ts        ★ cached primitives/materials for procedural models
    kit/EnvKit.ts          ★ scenery helpers (scatter along rail, ribbons, sky, merge)
    kit/humanoid.ts        jointed human rig (zombies, civilians)
    enemies/zombies.ts     zombie roster
    enemies/dinos.ts       dinosaur roster
    stages/<id>/           one folder per stage (index.ts exports `stage`)
    stages/index.ts        CAMPAIGNS
  fx/Fx.ts                 pooled particles, gibs, explosions
  audio/                   names.ts (sfx/music ids), Audio.ts, Sfx.ts, Music.ts
  gameplay/SpriteArt.ts    ART: SPRITES — sprite scheduling, billboards, impostor bake
  gameplay/pixel/          PixelCast: figure builder, GPU paint/resolve passes, materials
  content/pixel/           PixelCast painters (humanoid, theropod)
  ui/                      Hud.ts, Overlay2D.ts, Menus.ts, dom.ts
  debug/AutoPlayer.ts      aimbot for ?autoplay=1 and the stage simulator
tests/unit/                vitest — includes the headless stage simulator
```

## Coordinate conventions

- Y is up, ground is y = 0 unless `Environment.groundAt` says otherwise. 1 unit = 1 metre.
- **Models face +Z** (Three's `Object3D.lookAt` convention). Character's LEFT is +X.
- The rail rig looks along the rail. In stage scripts, positions are
  **rig-relative `[right, up, forward]`** unless `world: true`.
  `[-3, 0, 12]` = 3 m left, on the ground, 12 m ahead (relative to the rail
  heading at the moment of spawning — not where the camera happens to look).
- `rig.space` is a group that follows the rig. Entities in the `'rig'` frame are
  parented to it (their local coords: +x right, +y up, **-z forward**) and keep
  pace with a moving vehicle. Use `RailRig.rel([r,u,f])` to convert.

## Stage scripting (see `gameplay/StageTypes.ts`)

A `StageDef` = rail points + `buildEnvironment()` + ordered `beats`:

| beat | what happens | ends when |
|---|---|---|
| `move` | rig travels to rail distance `to` at `speed` m/s; optional `waves` (chasers) | arrived (+ cleared if `waitClear`) |
| `hold` | rig stops; `waves` spawn | all waves spawned and every hostile dead (or `timeout`) |
| `boss` | spawns registered boss id; optional `moveTo`/`speed` for chases | boss removed (death anim done) |
| `banner` | title card | `duration` |
| `wait` | nothing | `duration` |
| `action` | run code (doors, explosions, scenery changes); may return a Promise | promise resolves |

Every beat may set `look` (camera target), `mode` ('walk' | 'drive'),
`weapon` ('turret' for vehicle mounted guns, null to clear), `pickups`,
`civilians` (with an `act`: cower, hide, flee, backaway, grabbed, plead — see
Civilians below), `onStart`, `onEnd`.

Waves: each starts when the previous wave is cleared, or by `start.after`
(seconds into the beat), `start.remaining` (≤ N hostiles left) or `start.atD`
(rig distance, move beats). Spawn entries support `t`, `count`, `every`,
`offset`, `entry` ('walk' | 'rise' | 'drop' | 'leap' | 'burst' | 'fly'),
`frame`, `hp`/`speed` multipliers and free-form `opts`.

**Pacing targets.** A stage should last ~3–5 minutes for a decent player:
6–10 encounters + a boss fight of 45–90 s. Rail length typically 250–600 m.
Walking speed 2.5–4 m/s; vehicles 8–18 m/s. Give the player breathing room
between encounters, a pickup every encounter or two, 1–3 civilian rescues per
stage, and at least one "surprise" moment (something bursting through a wall,
dropping from above, a vehicle crash).

## Enemies (see `gameplay/Enemy.ts`, reference: `content/enemies/zombies.ts` Walker)

Subclass `Enemy`:
1. `configure()` — stats: `maxHp`, `speed`, `attackRange`, `windup`, `damage`,
   `points`, sounds, `bloodColor`, `superArmor`, `telegraphRadius`.
2. `build()` — meshes under `this.model` (facing +Z, feet at y = 0); register
   hit zones with `this.hitbox(mesh, 'head' | 'torso' | 'limb' | 'tail' | 'weak' | 'armor' | 'body')`;
   set `this.anchor` (chest) and `this.headAnchor`.
3. `animate(dt)` — procedural animation from `state`, `stateTime`,
   `groundSpeed`, `age`. Don't move `root` here (AI does), animate joints.
4. Optional hooks: `onWindup`, `strike` (default melee; ranged enemies throw a
   `Projectile`), `onDamaged`, `onDeath`, `updateDeath`, `customUpdate` (for
   custom string states set via `setState('leap')`), `entryUpdate`,
   `advanceUpdate`, `damageMultiplier`.

`build()` must not touch anything outside `this.model` / `this.root` that
`dispose()` wouldn't undo: stage loading builds a detached copy of every enemy
type (`Enemy.buildDetached()`, no `onAdded`) to compile its shaders up front.
Do world wiring (camera focus, scene helpers, sounds) in `onAdded()`.

Default AI: entry → advance to `attackRange` → **windup** (a shrinking red
ring on screen; the player must kill/stagger it in `windup` seconds) → strike
(1 heart) → recover → repeat. Any hit during windup staggers (unless
`superArmor`). At most 3 regular enemies wind up at once (`World.attackSlots`).
Part multipliers: head ×2.5, torso ×1, limb ×0.7, tail ×0.5, weak ×2, armor ×0.

Damage numbers to design around: pistol 1/shot, shotgun 8×0.65, SMG 0.55,
magnum 4 (pierces), turret 0.8. A basic walker has 2.5 hp (one headshot).

Register: `registerEnemy('walker', (w, s) => new Walker(w, s))`. Ids used by
stages must exist (`content/registry.ts` lists the canonical roster).

## Bosses (see `gameplay/Boss.ts`)

Extend `Boss`: set `title` (health-bar name), `maxHp`, `phases`; register
small surface weak points (eyes) before large/inner ones (the AutoPlayer prefers
unobstructed weak parts in registration order); register
'weak' meshes (glowing) and 'armor' meshes; implement the fight in
`customUpdate` with custom states. Helpers: `telegraphAttack(duration, onLand)`,
`throwProjectile(fromWorldPos, opts)`, `phaseFor()`, `onPhase()`. Bosses must
be **killable by the autoplayer in < 120 s** (the simulator checks) and every
attack must be telegraphed (ring) and avoidable by shooting. When a boss's
`telegraph` appears (null → set), `World` vents an overheated mounted gun
(`WeaponSystem.vent()`: heat ≤ 35 %, lockout cleared) so a turret player can
always answer the windup. Register the boss
id from the stage folder (e.g. `registerEnemy('butcher', …)`).

## Civilians (see `gameplay/Civilian.ts`, `civPoses.ts`, `civGrab.ts`)

Innocent bystanders: shooting one costs a life (and 1000 points), a rescue pays
1500 (sometimes +1 life). They are rescued when the encounter is cleared, when
the zombie holding them is shot, or the moment they get away off screen.

**Acts.** A beat's `civilians` entry picks what they do with `act` (default
`auto`); the arcade light-gun games are the reference (House of the Dead,
Time Crisis, Virtua Cop, Operation Wolf, Jurassic Park):

| act | what they do |
|---|---|
| `cower` | squats low, hands clasped on the back of the head, trembling; between attacks the hands come down onto the knees and the head comes up to peek (toward the threat); ducks again whenever anything winds up an attack or comes within 4 m |
| `hide` | crouched with the back three-quarters to the camera, hands on the cover's edge, peeking up and out toward the middle of the view; glances back over the shoulder for help (HELP! the first times); drops down when a threat is near |
| `flee` | runs for it — toward the camera and out past the nearer side of the screen (or to `to`), looking back over the shoulder, tripping once (¾ of the time) onto hands and knees and scrambling up; safe off screen = rescued |
| `backaway` | edges back from the nearest threat, facing it with the palms up, then turns and runs (when it's within ~3 m, or after 4.5–6.5 s) |
| `grabbed` | spawns with a zombie (`attacker`: its outfit) holding their wrist — a tug of war; shoot the zombie and they're free on the spot (THANKS!, a rescue); left ~7–8.5 s they wrench free and run, and the zombie walks on at you; shooting its holding arm off frees them too |
| `plead` | waves for help (HELP!), pointing at the threat, then cowers, and waves again when it's calm |
| `auto` | a short HELP!, then cowers; a zombie within 2.6 m (a dino within 4.2 m) and they back off and run |

`help` (seconds) puts a HELP! wave before the act (defaults per act). Rescued
civilians give a relieved thumbs-up or wave (THANKS!) and jog off screen.
Civilians standing on something raised (the d3 truck bed: `PerchedCivilian`)
only plead or cower. Each civilian takes ONE draw from the world RNG (as
before) and seeds its own: adding acts never shifts a stage's random stream.

**Fairness (hard rules).** Civilians never stand in an enemy's attack lane:
they stay where the stage put them — out at the side of the frame, away from
where the attacks come in — or move only *outward* (a running civilian's screen
x only grows: away from the middle of the view, toward the near screen edge).
Which side is "outward" is tracked while they stand their ground, so a camera
still turning to the scene doesn't send them across it. A grabbing zombie
stands level with its victim, `GRAB_SEP` (1.55 m: both arms straight) toward
the middle of the view, turned to the camera and leaning back (dragging them
in): its head and chest are clear shots well away from the civilian on screen,
and while it holds on it never attacks (no ring, no attack slot); a hit makes
it flinch but not let go. Stage a grab near the camera (the z2 ER's is ~6 m
out): the bigger on screen, the less a near miss can land on the victim. `civilian-fairness.test.ts`
plays every stage and checks, every other frame, that a ray through the centre
of any hostile's head / torso / weak point never hits a civilian first;
`civilian.test.ts` covers each act (outward runs, the grab, rescues paying once,
the hit penalty once, perched civilians, the RNG draw). Measure changes with
the human-like bot (`humanbot.test.ts`: civilian shots and damage per stage).

**Poses.** Each act writes joint values into a flat pose buffer
(`civPoses.ts`: `poseCower`, `poseHide`, `poseFlee`, `poseStumble`,
`poseGrabbed`, `poseThanks`, …, plus `tremble`); the civilian blends from the
pose it is leaving over 0.1–0.3 s and `applyPose` writes it onto the rig, so
ART: 3D (baked meshes) and ART: SPRITES (PixelCast paints from the joints) show
the same thing. Crouches keep the shoes on the floor (`legsHeight`); the
cowering arms were fitted to the rig (hands on the back of the head / on the
knees). `aimArm` points an arm at a world point (the tug of war's meeting hands).
`Civilian.debugPose(phase, t, …)` holds a pose for tests and look-dev.

**Pixel art.** The human painter (`content/pixel/human.ts`) has three more
living expressions — `terror` (brows up, whites round a small pupil, a gasp),
`relief` (eyes shut in a smile, an open smile) and `strain` (eyes squeezed
shut, gritted teeth) — per-hand poses (`handL` / `handR`, the `HAND.THUMB`
thumbs-up), a swinging `ponytail` (`hairSwing` jolts it) and a pixel speech
bubble (`bubble`: `CIV_STAMP.bubble.help` / `.thanks`) — a solid stamp two retro
pixels a cell over the head, on a layer of its own, never a target. ART: 3D
shows the same bubble as a camera-facing sprite (`civBubble.ts`). Stamps may
now reach further than 8 cells from their anchor (`stampReach`; everything
older lays out exactly as before). `civilian-align.test.ts` checks every pose
(and the grabbing zombie) against the hitboxes in the views it is seen in.

## Model kit rules (see `content/kit/ModelKit.ts`)

- Use `Kit.mat/glow/std` and `Kit.box/sphere/cyl/cone/capsule/ico` — they're
  cached and shared. **Never mutate** a Kit geometry or material.
- Custom geometry/material/texture → wrap in `Kit.track()` so it's disposed.
- Per-instance colour changes: pick a different cached material instead.
- Static scenery: build into a Group then `EnvKit.mergeStatic(group)` to cut
  draw calls (keep shootables/occluders/animated things out of merged groups).
- Mobile budget per frame: aim for < 250 draw calls, < 150k triangles,
  ≤ 4 dynamic lights (hemisphere + directional + a couple of point lights),
  no shadow maps. Use fog to limit view distance.

## Retro look (textures + arcade monitor)

- `content/kit/Textures.ts` generates 26 tiny procedural pixel textures (brick,
  asphalt, metal, tiles, bark, leaves, scales, hide, skin, cloth, hazard…) as
  DataTextures: limited grey levels, ordered dithering, NEAREST magnification.
  They are detail maps multiplied with the material colour.
- Use them with `Kit.mat(color, { tex: 'brick', texScale: 1 })` or
  `Kit.tex('brick', color)`. Projection is object-space planar on the dominant
  normal axis, so **no UVs are needed** and texel density stays constant in world
  units (also inside `EnvKit.mergeStatic` groups). `texScale` > 1 = smaller texels
  (characters typically 2–4). `Kit.retro.grain` adds a subtle grit to every
  untextured `Kit.mat`.
- Texel density guidance (58° vertical FOV at 288 lines ≈ 0.385 cm per pixel per
  metre of distance): for chunky, readable texels use texScale ≈ 0.3–0.7 for
  environment surfaces (road 0.6, ground 0.3, cliffs 0.3, canopy 0.4–0.55), ≈ 0.9
  with strength ≈ 0.7 for close fast-moving foliage, 1.5–2 for big creatures and
  2–4 for human-sized characters. `Kit.mat` stores `userData.retroTex/retroScale/
  retroStrength` so bakers can carry them into merged vertex-coloured batches.
- Screenshots of the CRT look: `node scripts/snap.mjs --url "…&retro=crt" --retroScale 1`.
- `core/RetroPass.ts` renders the scene into a ~288-line target (by quality:
  224/288/360) and upscales it with 15-bit-style dithered colour quantisation and,
  in 'crt' mode, scanlines, curvature, convergence error, phosphor bloom and
  vignette. Settings → DISPLAY: CRT / PIXEL / OFF (`Settings.retro`).

## Art style: PIXEL CAST — PixelCast pixel art (`gameplay/pixel/`, `content/pixel/`)

Settings → ART: **CLASSIC | PIXEL CAST | PIXEL WORLD** (`Settings.art` = `'3d' | 'sprites' |
'pixel'`, default **PIXEL CAST** (`'sprites'`); `artV` migrates saves that only stored the old
'3d' default; URL `&art=3d|sprites|pixel` overrides it until the player changes ART; the
characters switch live mid-stage via the pause screen's ART chip). CLASSIC (`'3d'`) is the
procedural-model look, unchanged. PIXEL WORLD adds painted environments — see *Art style:
PIXEL WORLD* below. Below, "SPRITES" means either pixel-art style (`artCast(art)`).

In SPRITES, characters that have a **painter** are drawn as hand-made pixel art by
**PixelCast**; so are every pickup, everything thrown at the camera, the gibs and the
title-screen cast (see *Props, pickups, gibs and the title screen* below), and every stage's
plants are pixel billboards (**FLORA**, below). A sprite entity without a painter falls back
to the older live **impostor bake** (its 3D model re-rendered into pixels) — today that is
only a safety net: every character, boss, pickup and thrown thing of all six stages paints
(a headless audit of every stage finds no on-screen sprite entity that declines; in game the
SpriteArt stats count `impostors` per frame, and `bench-art` reports them).
Painted — every roster of both campaigns:
- humanoid painter (`content/pixel/human.ts`): **walker** (every outfit), **straggler**,
  **runner** (+ z3 truck/pack/tail runners), **crawler** (torn waist + guts, or broken
  legs), **brute** (+ z2 hospital / z3 riot brute with its glowing skull crack: thick limbs,
  fists, riot plates as `PART.ARMOR`, back spikes, the mutant arm), **spitter** (glowing
  throat sac = weak, chest veins), **bloater** (belly + glowing pustules = weak),
  **riot walker** (z2 vest + belt as armour), **civilians** — special parts in
  `content/pixel/zombieParts.ts`;
- theropod painter (`content/pixel/theropod.ts`): **raptor** (all palettes, d1/d2/d3
  subclasses), **compy**, **dilo** (crests, dapples, the frill = weak);
- `content/pixel/beasts.ts`: **pteranodon** (triangle wing membranes), **triceratops**;
- `content/pixel/bosses.ts`: **Butcher** (z1) and **Carnotaur** (d1);
- `content/pixel/bossesZombie.ts`: **Patient Zero** (z2: matte meat with `PAT.MEAT`
  blotches, `PF.PLANAR` frames, eyes seated in flesh, tapering ribs, latched hit flashes, the
  wide paint class through its roars; its pool, bubbles, pool veins and IV bags stay live 3D)
  and **the Behemoth** (z3: hard hat, slit eyes, heat-banded enraged core, smears only on
  swings);
- `content/pixel/bossesDino.ts`: **Specimen X** (d2: cloak as a palette fade in five steps,
  head-on fanged maw, quill darts) and **the Tyrant** (d3: head-on rex face, eye halos painted
  as glow-lit skin; its carcass is held by a non-hostile, unshootable entity so SPRITES keeps
  painting it after the death);
- stage-local subclasses (z2 riot walker / hospital brute, z3 finale / truck / pack / tail
  runners, deck spitter, riot brute, d1 / d2 / d3 raptor packs and hybrids, d3 perched
  civilians) use the painters above.
Boss figures run 110–145 primitives (cap 160); Patient Zero emits gameplay parts first and
cosmetics last (`layerIndex` / `reopen`), so an overflow would drop a vein, never an eye.

### How it works
- The invisible 3D rig keeps animating and stays the hitbox (raycasts, aim assist,
  AutoPlayer, simulator see exactly what they saw before; the model is only hidden for
  the main camera's draw).
- About **12×/s** per character (`SPRITE_FPS`, round-robin, ≤ 6 redraws per frame, first
  frames first) SpriteArt calls `entity.paintPixels(figure)`. The painter reads the rig's
  joint matrices and adds **2D primitives in world space** to a `PixelFigure`: tapered round
  cones (`cone`), elliptical-section cones (`coneE`: the half-width across the screen is the
  projected ellipse, so torsos/tails are wide from the front and slim from the side),
  projected `ellipsoid`s (skulls, hips, hats), `ball`s and `decal`s. The figure projects
  them through the main camera onto the retro pixel grid — radii in metres become texels
  at their depth — so every shape lands exactly where the rig's joints (and hitboxes) are.
- **Layers**: primitives in one layer melt together (polynomial smooth-min, blend radius
  `k`), giving one continuous silhouette whose shading normal is the gradient of the
  blended field (shoulders flow into arms, snout into neck into tail). Layers composite by
  per-texel depth. Inside a layer the front-most covering primitive picks the material
  (`zBias` nudges it: a hair cap wins over the forehead it sits on). **Decals** paint
  material (or just shade, `PF.SHADE_ONLY`) onto their own layer where it is covered —
  faces, ties, badges, wounds — and never change the silhouette.
- Two GPU passes per redraw, no readbacks (`PixelCast.ts`): **paint** (G-buffer: walk the
  primitives — a float data texture uploaded per redraw — union, shade, run the material's
  pattern; writes material id, tone, packed depth, layer/flags) and **resolve** (the pixel-art
  pass: ramps, dither, outline, contours, cast shadows, stage tint, night rim, fog; writes the
  same display-space sprite + depth-in-alpha format as the impostor bake). Billboards,
  per-texel depth occlusion, hit flashes and blob shadows are shared with the impostor path.
- `PixelFigure.sample()` is a CPU reference of the paint pass's coverage (node-safe), used by
  the alignment tests.
- Core additions for big creatures (opt-in, additive): **`PF.PLANAR`** keeps a pattern's
  frame planar through round caps (no bullseye rings on a 6 m blob); **`PAT.MEAT`** = ROT's
  blotches, bruises, creases and veins at the material's own scale; **`PixelFigure.maxWide`**
  opts a figure into the wide paint class (up to `MAX_WIDE` = 512 × 256 texels, a lazily made
  wide G-buffer: a boss whose tentacles spread keeps 1 texel per pixel); **`layerIndex` /
  `reopen(i)`** return to an earlier layer to add cosmetics after the gameplay parts.
- Primitives besides cones / ellipsoids: **`tri(a, b, c, mat, round)`** — a flat triangle
  between projected world points (it shears with the view like the real surface: wing
  membranes, frill fans, blades); **`stamp(p, cellM, id, m0..m3, mirror, solid)`** — a
  hand-pixelled bitmap from `gameplay/pixel/stamps.ts` (eyes, mouths by jaw opening, hands
  as claw / open / fist in 8 directions, theropod eyes), anchored on a rig point, scaled
  by WHOLE texels, picked per size class (`stampSize`); decal stamps paint the layer
  (faces), solid ones add coverage (hands). Stamp cell codes: `a–x` = slot 0–3 ramp step
  0–5, `1 2 3` darken, `+` lighten, `A–D` glow.
- **Near clip**: primitives reaching closer than `NEAR_CLIP` (0.3 m) are cut there (radius
  interpolated) or dropped, and the texel size comes from the on-screen extent when the
  figure reaches far past the screen, clamped to `MAX_KPX` (3) — a tail sweeping past the
  lens never turns the sprite into giant blocks.
- **Depth**: each layer bulges toward the viewer by its blended screen radius × a per-
  primitive **depth ratio** (`coneE` / `ellipsoid` compute it from their cross-section;
  `PF.FLAT` shapes don't bulge), so broad flat plates, discs and torsos composite right.
- **Paint-pass cost**: per-layer texel bounding boxes (a texel outside a layer skips it
  with one compare) and a per-primitive bounding box texel fetched first (a primitive out
  of reach costs one fetch). SpriteArt also caps repaints per frame by texel area
  (`TEXEL_BUDGET` ≈ 52 k texels) besides the ≤ 6 redraws.
- **Pixel FX** (SPRITES): soft particles get solid cores with a wet highlight speck and
  2×2-pixel ordered-dither cells only at their edges (a 1-px checker turns into a screen
  door on the CRT). **Foliage** ('leaves' materials, Kit and the d1 / z1 texture-array
  bakes): `RETRO_FOLIAGE` turns faceted blobs into leaf clumps — a ragged leafy outline
  where a face turns away (never on flat ground), dark gaps between clumps, lit tips.

### Adding pixel art for a character
1. Expose what the painter needs (a look record + per-frame pose values) **without new
   `world.rng` draws** — gameplay must be identical in both ART modes (see how `zombieKit`
   records outfit/gore choices into `ZBody.look`).
2. Implement `override paintPixels(f: PixelFigure): boolean` (and `paintPart` for flung
   limbs) on the entity; call a painter from `content/pixel/` (`paintHuman`,
   `paintTheropod`) or write a new one with the same building blocks. Return false to fall
   back to the impostor bake. Subclasses that add meshes the painter doesn't know about
   (armour, glowing weak spots) must paint them or set `pixelArt = false`.
   Painter API (allocation-free — painters run ~12×/s per character):
   ```ts
   f.layer(0.04 * s, PART.LIMB, farSide ? -0.1 : 0);          // blend k (m), hit part, tone
   f.cone(f.at(elbow, 0, 0, 0), f.at(elbow, 0, -0.25, 0), 0.05 * s, 0.036 * s, M.sleeve)
     .mat2(M.skin, 0.93)                                      // bare wrist below the cuff
     .k(0.02 * s).rag(0.008 * s, PF.SPIKY).z(-0.02).tone(-0.1).u(0.4).seed(3).min(0.5).part(PART.LIMB);
   f.coneE(a, b, axisX, axisY, rxA, ryA, rxB, ryB, mat);       // elliptical section
   f.ellipsoid(joint, cx, cy, cz, rx, ry, rz, mat);            // projected ellipsoid
   f.decal(a, b, ra, rb, mat).flag(PF.FLAT | PF.SHADE_ONLY).tone(-0.4);
   f.facing(point, normal) > 0.1                               // only paint what faces the camera
   f.tri(a, b, c, mat, round);                                 // flat triangle (membranes, fans)
   f.stamp(eye, cellM, STAMP.zeye[size], M.eyeGlow, 0, 0, 0, mirror);   // hand-pixelled bitmap
   ```
   Extras on a humanoid without a new painter: `HumanPose.torso` (shapes melted into the
   trunk: bellies, vests), `HumanPose.extra` (own layers: armour, sacs, pustules),
   `armW / legW / neckW` (match scaled 3D limbs), `pelvis: false`, `hand` (`HAND.*`),
   `smear` + `mem` (motion smears). Theropods: `TheroPose.extra`, `dorsal`, `mem`.
   `f.at / f.dir / f.vec / f.mix` return pooled vectors; resolve materials once per look
   (`Mat.*` builds key strings — cache the ids, see `human.ts` `mats()`); use index loops,
   not `for (… of [1, -1])`; never allocate option objects per redraw.
3. Look-dev: `node scripts/pixel-look.mjs --place "walker@office:-1:3.5,raptor@red:1.5:7:-30:windup=0.8,civ@worker:0:5"`
   (actions: `windup= stagger= sever=L|R|l|r pop die= pounce= walk= hit`; `--stage "zoo&zooEnv=night"`).
   It writes `-3d.png`, `-sprites.png`, a 3D|SPRITES `-montage.png` of zoomed crops and
   `-texels.png` (each sprite's raw texels ×4 — judge the pixels there).
4. Add the type to `tests/unit/pixelcast.test.ts` (alignment: sprite parts vs real
   raycasts), check `node scripts/pixel-aim.mjs --place "…"` (shoots the game's hitboxes
   where the sprite draws each head / torso) and `node scripts/bench-art.mjs`.

### Style guide (keep new characters consistent)
- **Pixel density**: 1 texel = 1 retro pixel (≈ 288 lines) until the figure is
  `maxTexels` tall (240 for every painter — a human at ≈ 1.9 m; a mid-range human is
  ~90–130 texels); closer than that texels grow by whole pixels (arcade sprite scaling,
  wide hysteresis, never more than `MAX_KPX` = 3). Never mix texel sizes inside a sprite
  (stamps scale by whole texels and are picked per size class instead).
- **Anatomy, not tubes** (the owner's brief: "not boxes or rounded geometric shapes
  stacked together"): limbs swell and taper — deltoid cap, biceps tapering into a bony
  elbow knob, forearm swelling below it and narrowing to a thin wrist; thigh → knee knob →
  calf behind → ankle. Trunks are horizontal SLICES (hips, waist, ribs, chest) melted
  together, never one vertical capsule (its round caps bulge past the hips). Clothes break
  the silhouette: flared ragged sleeve hems and cuffs that hang over the wrist, untucked
  hems over the waistband, trouser cuffs breaking over the shoe. Zombies hunch (each its
  own amount), drop a shoulder and loll their heads. Classic chunkiness: heads, hands
  and feet slightly big; radii ≈ the hitbox boxes' half-widths, a little inside.
- **Faces and hands are stamps** (`stamps.ts`) whenever they are big enough (heads ≥ 9
  texels, hands 3–11 texels): hand-pixelled eyes (zombie socket + glowing pin, living
  white + pupil + brow, screaming), mouths by jaw opening, claw / open / fist hands in 8
  directions. Theropod eyes too. Never a blob of ellipse decals.
- **Palette**: every surface is a material (`Mat.*`, `materials.ts`) with a 6-step
  hand-built ramp: base colour on step 3, shadows darker, richer and hue-shifted toward
  violet, highlights paler and toward warm yellow; step 0 is the outline shade. Pick base
  colours from the character's 3D palette so both ART modes match. No gradients, no
  anti-aliasing, no per-texel noise: texture comes from designed patterns (cloth grime,
  denim fade, buffalo check, rot patches + veins, hair strands, reptile scale seams,
  stripes along `u`, gown print, camo, ribs) and drawn details (folds near joints, seams,
  stains, wounds as decals).
- **Light**: a fixed sprite-artist light from the upper left and front (screen space
  (−0.55, 0.62, 0.56)), hard terminator, flattened profile (broad lit planes, not
  pillow shading); far-side limbs one notch darker (`layer({ tone: -0.1 })`). Stages only
  tint (night ≈ 0.68 brightness + a faint sky tint) and add a cool rim on the back-lit edge.
- **Outlines**: 1 texel on the silhouette's own edge texels (no bloat — the sprite covers
  what the hitboxes cover): a near-black INK (the local darkest shade × 0.42, pushed
  violet) on the exterior, step 0 of the local ramp on a lit top/left edge (selective
  outline); 1-texel runs (fingers, claws, quills) are never outlined. Inner contour (step 0) where a
  nearer layer overlaps one > 7 cm behind; one step of cast shadow below/right of
  overlaps and under hems, cuffs and collars. Dither (Bayer 4×4) only in the narrow band
  between two steps (`dither` per material).
- **Readability**: figures under ~45 texels collapse each ramp to three bold steps with
  the base a notch lighter and a stronger night rim; painted sprites get half the fog the
  scenery gets.
- **Drawn detail**: 1-texel crease strokes (Z folds at the inner elbow scaled by the bend,
  knee and crotch pulls, belly folds on a hunch, armpit pulls with a lit ridge, shoulder
  blades from behind), seams and pocket slits, sole lines and toe caps — `SHADE_ONLY`
  decals so they take the local cloth colour.
- **Animation**: redraws at 12 fps of game time (positions stay smooth at 60). Secondary
  motion is drawn by the painter from `time`/state: jaws (groan with chatter, gape in the
  windup, snap on the bite), head loll / roll per character, claws twitching, rags/hair/
  quills swaying, drips creeping down, squash & stretch on hits (`f.warp`, ≤ 7 %), motion
  SMEARS (a flat streak behind a head / hand / raptor body that jumped > 5 px since the
  last redraw: lunges, swipes, pounces), the sprite flashes white/red on hits.
- **Gore**: `Mat.blood / gore / bone / ribs`; wounds and stains are decals only drawn while
  that side faces the camera; stumps are a ragged gore ball + a bone knob; a popped head
  leaves a neck stump; severed limbs are painted on their own (`paintPart`). In SPRITES the
  FX go pixel too: chunks are gib sprites, and soft particles (blood spray, mist, dust,
  smoke) get solid cores with a wet speck and 2×2-pixel dither cells only at the edges.
- **Budgets**: ≤ 160 primitives per figure (humans ≈ 100–125, bosses ≈ 110–145), 2 draws +
  one 15 KB upload per redraw, ≤ 6 redraws and ≈ 52 k repainted texels per frame; painters
  allocate nothing per redraw. Measured
  (`bench-art`, SwiftShader desktop): ~2 paints/frame in a 9-zombie horde, figure building
  ≈ 0.1 ms/frame avg (≤ 0.6 ms), paints incl. GL submission ≈ 0.35 ms/frame; z1 horde 193 →
  64 draw calls, d3 raptor pack 261 → 68. Memory: a 256² RGBA8 G-buffer + per-sprite RGBA8
  targets pooled by power-of-two size (≈ 3.5 MB total with the impostor scratch; +0.75 MB from
  Patient Zero's first roar: the wide class's 512 × 256 G-buffer + its own target).
- **GRAPHICS LOW** (`spriteSchedule`): characters redraw at 10 fps of game time instead of 12,
  at most 4 redraws and ≈ 36 k texels a frame (≈ 30 % less paint-pass work) — the quality
  fallback for older iPhones / Low Power Mode. SpriteArt stats: `paints`, `texels` (repainted
  this frame), `impostors`, `prims`, `rtBytes`.

### Props, pickups, gibs and the title screen (`content/pixel/cast*.ts`)
- **Prop kit** (`castKit.ts`): hard objects drawn the way sprite artists draw them, from the
  prop's own (tumbling) mesh frame: `box` = the visible faces as flat triangles, each a ramp
  step by how it faces the light (`faceTone`), one outline round the lot (`BOX.facing` /
  `faceShown`: details only on faces turned to the camera — a grazing face's decals would smear
  across its neighbours); `cylinder` = the exact silhouette (side quad + the two end ellipses)
  with a highlight band down the lit side and a shadow band; `hoop`, `sparkle`, `line` /
  `paint` (SHADE_ONLY / material decals). `castWorldLight` blends the scene's key light (world
  space, plus sky above / ground bounce below) into the face tones of a redraw — the thrown car
  shows its belly lit by the sunset when it turns it to the sun; `castView` resets to the
  sprite artist's fixed light. Prop materials come from `castMat` (keys `cast-…`) and are made
  the first time a kind / colour is painted (the 255-entry table is shared by the whole cast).
  The table FILLS in a long session (a headless z1 run: full at ~180 s of 215, every walker's
  random skin / cloth shades add ~4 rows): from then on `material()` maps a new key to the
  closest existing material (OKLab base colour, glow only for glow, pattern preferred) — the
  documented behaviour — instead of id 1.
- **Pickups** (`castPickups.ts`, hooked in `Pickup.paintPixels`): a scuffed first-aid kit
  (lid seam, latches, end straps, grime, dent, square-cut cross), plank crates with a muted
  band of the weapon's colour and the gun on the lid, a bomb with a fizzing fuse star, a
  brilliant-cut gem (table / crown / pavilion facets in five unlit steps, alternating light /
  dark, turning with the spin; a pale rim on the lit edge and a dark-gold one on the shadow
  side; inner fire, star glint). All: a 1–2 px halo ring (front arc bright, back arc dim and
  behind the item, travelling beads, opened a touch at eye level so it never reads as a stripe
  through the item) and every ~1.7 s a short glint running along the top edge into a twinkle.
- **Thrown things** (`castThrown.ts`, `Projectile.paintPixels`): goo globs (spitter acid, dilo
  venom, Patient Zero's bile) are UNLIT ramps built from the thrower's glow colour (glow texels
  skip the night tint and fog: the warning is the brightest thing in frame day and night) — a
  lobed wobbling mass, a dark-olive edge on the shadow side only, a pale-lime crescent, a
  yellow-white hot core, bubbles; flying at the camera a ragged splash rim and drips, side-on
  three fading strands. Rocks are drawn from the mesh's REAL facets (four hard tone steps,
  lit ridges, cracks along facet edges, grit, moss clumps, grass blades from a crack). The
  Behemoth's car: scene-lit, beat-up paint (dirt, scratches, rust in the material), belly
  (rails, axles, exhaust + muffler, tank, sump, oil stains, floor-pan ribs), chrome bumpers,
  lamps, grille, arches with the paint's lip, wipers, a cracked windscreen. The Tyrant's palm:
  comb fronds in FLORA's d3 palette, chevron leaf scars, a flat splintered foot; its panel a
  rusted park-jeep door; the storm branch: ragged layered fire inside the glow sphere. The
  kind comes from `ProjectileOptions.pixel` when a thrower sets it (the d3 storm does), else it
  is recognised once from the options + mesh (`thrownKind`); the "every real thrower" table in
  `pixel-cast.test.ts` drives each actual throw (boss methods included) and pins its look. Shot
  down in SPRITES, a prop breaks into debris of its painted material (`thrownDebrisColor`).
- **Gibs** (`fx/Gibs.ts`, SPRITES only): flesh (bloody chunks) = lobed meat chunks, wet
  specks, bone flecks; hard debris (not bloody) takes its material from its colour — grey
  concrete / stone as chipped polygons in three facet tones with grit and rust rebar flecks,
  red painted metal with a bare-steel lit edge, browns as grained splinters, greens as leafy
  scraps. A per-instance `aHard` attribute (sprite geometry only) carries flesh vs hard.
- **Title screen** (`castMenu.ts` + `ui/MenuBackdrop.ts`): the attract horde, the crag raptor
  and the pterosaurs are joint-only rigs posed like the 3D ones and painted by the same
  painters through a stand-alone `MenuCast` (PixelCast + pixel-snapped billboards writing
  per-texel depth). Painting runs in `MenuCast.prepare`, right after the shot is posed and
  before it is rendered (the scene's `onBeforeRender` only records the target, sets uniforms
  and paints itself on the first frame / a resize), capped at 4 repaints and 52 k texels per
  frame. Both shots light the cast as backlit silhouettes (`MenuLight`: a near-black sky-tinted
  tint, a warm 1-px rim on the top / right outline, unlit eye glints); far pterosaurs get their
  wing outline stroked ≥ 2 texels. ART follows the link override, then the saved setting —
  polled every 0.25 s, so a change on the menus shows at once (and then wins over the link).
  Title-screen cost must be measured DRAINED (a 1-px `readPixels` per frame): `gl.finish`
  doesn't wait in Chrome, and an undrained loop bills the GPU backlog to whichever later GL
  call syncs — the PixelCast upload — which made SPRITES look ~100× slower than 3D.
- Tests: `tests/unit/pixel-cast.test.ts` (every pickup and thrown kind: painted, every hitbox
  centre on a painted texel, ≥ 85 % of the hitbox silhouette covered (≥ 80 % hook / branch,
  ≥ 72 % the palm's comb fronds; the pickups' halo tube is left out of the grid — drawn 1–2 px
  by design, its hitbox stays shootable), sprite area ≤ 1.6× the hitbox's (≤ 2.4× where goo,
  flames, smoke or the hook's chain stream past it); and the real-thrower → kind table).

### FLORA — pixel plants (`content/pixel/flora*.ts`)
In ART: SPRITES every stage's vegetation is hand-pixelled billboards instead of the faceted 3D
plants (ART: 3D keeps the 3D plants, the same meshes and materials, moved into groups of their
own). `floraField.ts`: each stage paints its species once at load (CPU, node-safe, cached for
restarts) into a PALETTISED atlas (R8 indices + a 256-colour palette) with four HAND-PAINTED
mip levels, and draws all its plants as ONE instanced draw of upright, camera-facing (yaw-only)
billboards: `texelFetch` of whole texels, alpha-tested and depth-writing, Lambert-lit with the
plant rules (sky light on the top, local lamps / headlights / flashlight on a view-facing card,
half desaturated and capped by `localCap`, a per-stage `gain` matching the stage's 3D plants),
a cool rim on the back-lit edge at night, wind as whole-texel row shifts. The mip level is
never minified (bias 1.0) and strand plants (`balance`) are repainted thinner at the coarser
levels so nothing crawls or pops as the rail camera moves.
- Species (`floraSpecies.ts`, `floraProps.ts`): jungle giants (6 silhouettes), canopy crowns,
  palms, ferns (+ wide), bushes (+ wide), grass, cycads, elephant ears, street trees, cliff-top
  tangles, hanging vines, the z1 street props (hydrant, trash can, cone), dead trees, bedding
  flowers, a fallen giant's root plate. Biomes (`floraBiomes.ts`) give each stage its colours,
  taken from its own 3D plants (night biomes cap their ramps: never pale or mint).
- Wiring: a builder tags a plant group `userData.flora = '<species>'` (or records it), the
  stage measures its reach (`floraReach`) and height and calls `FloraField.fit` (picks a variant
  by aspect, never taller than 1.15× the 3D plant), and `floraArtToggle(scene, [billboards],
  [3D groups])` shows one or the other, live with the ART setting (checked once per render).
  d1 (jungle, cliff tops, vines; the fallen tree's crown and root plate ride along with its
  halves when it is blasted), d2 (greenhouse beds, lobby palms, the jungle beyond the glass),
  d3 (storm jungle), z1 (street trees + props), z2 (car-park dead trees, potted plants — the
  pots stay 3D), z3 (dusk verge scrub and dead trees).
- Plants are scenery only: never raycast, never occluders; gameplay is identical in both modes.
- Cost: one draw per stage (d1: + 2 small ones for the fallen tree), ≈ 1.4 MB (d1, + 0.13 MB) / 0.7 MB (d2, d3) / ≤ 0.17 MB (z1–z3) of R8 atlas with
  mips, 0.02–0.35 s of CPU painting at load (behind the loading card). Tests:
  `tests/unit/pixel-flora.test.ts` (atlas levels / palette / rim / caps / crawl; per stage:
  a billboard where every plant stands, heights, live ART swap, no occluders).
- Still 3D in both modes (environment, not cast): terrain, rocks and cliffs, buildings, the
  d1 fallen tree's trunk log, the volcano / skyline backdrops, street furniture and cars,
  shootable props (barrels, drums, gas cylinders, the d3 fuel tank, glass panes).

### Impostor bake (characters without a painter)
`SpriteArt.bakeNow` re-renders the source's 3D model with the main camera's projection
cropped to its on-screen bounds into a 512² HDR scratch target (2× supersampled, mirrored
stage lights + a cool back light in dark stages, `RETRO_DETAIL` ×1.25), then `BAKE_FRAG`
turns it into pixel art (median subsample, selective outline, inner contours, top light,
dithered bands, hue-shifted shading, the campaign's 64-colour palette from
`spritePalette.ts`). Alpha-blended / very thin parts (`keepLive`, `userData.spriteKeep3D`)
stay live 3D meshes over the sprite (blood pools too). Tuning: `&spriteLook=pal:0,k:2,…`;
captures: `scripts/snap-art.mjs`, `scripts/look-art.mjs`; numbers: `scripts/bench-art.mjs`
(draw calls, redraws, paint ms, primitives, sprite vs model silhouette area, style pops).

## Art style: PIXEL WORLD — PixelWorld environments (`content/pixelworld/`)

The ART setting has three values (`Settings.art`, `core/art.ts` is the ONE place that
answers "what do I draw"):

| ART (`Settings.art`) | characters, pickups, gibs, plants | environments |
|---|---|---|
| CLASSIC (`'3d'`) | 3D models | 3D, Kit retro textures |
| PIXEL CAST (`'sprites'`, default) | PixelCast pixel art | 3D, Kit retro textures (the saved "pixel cast v3" look) |
| PIXEL WORLD (`'pixel'`) | PixelCast pixel art | painted PixelWorld pixel art |

- Characters follow the live setting (`artCast`). Environments are built with the stage, so
  a stage keeps the environment style it was LOADED with: `World.art` is fixed at stage
  load and stage builders branch on `pixelWorld(world)` — never on the setting. A change
  that differs in environment (`envPending(loaded, wanted)`) shows from the next stage load
  (RETRY / RESTART / next stage); the settings row and the pause chip say so
  ("SCENERY CHANGES ON THE NEXT STAGE LOAD").
- Settings → ART is a three-way row; the pause screen's ART chip is ONE button that cycles
  CLASSIC → PIXEL CAST → PIXEL WORLD (`nextArt`). `&art=3d|sprites|pixel` overrides the
  setting until the player changes ART. Saves holding anything else migrate to the default
  (`Save`: `isArtStyle`).
- CLASSIC and PIXEL CAST build byte-identically to before: the classic builders only RECORD
  what PixelWorld needs (`userData.pwBuilding`, `pwSign`, `pwFacade` tags) and never draw
  from the RNG differently. `pixel-world.test.ts` checks per converted stage that PIXEL CAST
  has no PixelWorld meshes, that occluders / ground / the world RNG are identical in both
  styles, and the simulator plays z1 identically in both.

### How it works

- **Canvas** (`canvas.ts`): painters draw in RAMP space — every texel is a ramp id (a
  6-step hue-shifted ramp from the same `makeRamp` as PixelCast and FLORA: base on step 3,
  violet shadows, warm pale highlights, step 0 = outline shade), a tone 0…5 and flags
  (`PWF.GLOW` unlit, `PWF.DITHER` ordered dither between two steps; without it a fractional
  tone ROUNDS). Primitives: `set / rect / hline / vline / line / ellipse / poly / scatter`
  (hand-shaped clusters, `CLUSTERS`), `PwRng` seeded by the tile key. Pure CPU, node-safe.
- **Atlas** (`atlas.ts`): tiles are REGISTERED while the stage builds (`atlas.tile(key, w,
  h, paint, { wrap })` → a handle; the same key returns the same tile), PAINTED once in
  `build()` (deterministic, cached per key for the session), packed into one RGBA8 texture
  with 5 hand-made levels. Mips are palette-faithful: each texel of a level is a real texel
  of the four below it (the one nearest their average, within the class most of them
  share) — never a blend; glow wins ties and survives over cut-out, so neon, stars and lit
  windows keep reading at a distance. Alpha classes: 0 = cut out (discarded), 160
  (`PW_GLOW_A`) = unlit glow, 255 = lit. Rects are 16-texel aligned (`PW_ALIGN`); wrap tiles
  must be multiples of 16. `PW_STATS` holds bytes / paint ms per atlas.
- **Material** (`material.ts`): flat-shaded Lambert (stage lights, flashlight, fog, tone
  mapping exactly like the 3D scenery) whose colour is fetched texel by texel
  (`texelFetch`, level = log2(texels per pixel) + bias): hard texels, the hand-made levels
  take over before anything crawls. Per vertex: the tile rect (w < 0 = module, clamped;
  w > 0 = tileable, wrapped inside its rect), texel UV (or PLANAR: projected world
  position, 24 B a vertex for big bakes), vertex colour (tint / painted AO). `gain` matches
  the stage's scenery brightness; `anim` plays vertical strip tiles (water, flicker).
- **Batch** (`batch.ts`): `PwBatch` collects quads into ONE mesh per batch (one draw):
  `rect` (wrap tiles map at `PW_TPM` from `u0/v0`, modules stretch, `sub` / `flipU`,
  `tintRGB` for NEUTRAL tiles), `box`, `ribbon` (a strip along points with v running along
  it: roads), `geometry` (re-texture any Kit geometry by planar projection in its own
  scaled frame or in world space), `setMatrix` (lay in a group's frame).
- **Re-texturing** (`retexture.ts`): `retexture(group, batch, rule)` moves every static
  opaque Kit-textured mesh into the batch with a painted tile picked by `rule` (default
  `kitTileRule`: Kit texture name → PixelWorld tile; `overrides` per material) and removes
  it from the group. Skips glows, transparent, double-sided, instanced, `noMerge` and
  already-PixelWorld meshes. NEUTRAL tiles (`neutral(tile)`: painted round a grey) are
  tinted per material by vertex colour — one tile for every brick colour of a stage.
- **Backdrop** (`backdrop.ts`, `sky.ts`): a camera-following panorama: a sky band and up
  to 3 cut-out layers (skylines, ranges, a volcano panel with `span`), each with a
  `follow` factor (< 1: a little parallax), 2048 texels round (≈ 1 texel a retro pixel),
  one level, unlit, fogless. Painters: `nightSkyTile` (stars, moon, cloud banks),
  `skylineTile` (lit windows, rooftop clutter, a moon-lit rim), `daySkyTile` (haze band to
  `haze`°, cumulus lit from `sunAz`), `rangeTile` (normalised ridges, jungle canopy line,
  light / shadow divides that wander down the faces, foot haze), `volcanoTile`,
  `stormSkyTile`, `duskSkyTile`.
- **Painters**: `surfaces.ts` (brick in bond with mortar and spalls, plaster, panels,
  siding, corrugated, stone, roofs, asphalt with patches / cracks / wet glints, sidewalk,
  curb, lane paint, dirt road with ruts, grass, rock faces, metal, planks, fabric, grate,
  hazard stripes, tiles, water), `facade.ts` (window / door / shopfront modules with goods,
  cornice, awning, valance, wall foot / head bands, posters, graffiti, drainpipes, AC units,
  fire escapes, soot), `signs.ts` (neon boards, blades and their neon edge, lightboxes,
  marquees, painted signs, road signs, movie posters), `font.ts` (5×7, 3×5, bold, tall,
  neon script; `neonText` draws tubes on the glyph skeleton), `interior.ts` (painted walls,
  lab panels, ceilings, terrazzo, carpet, blood trails, pipes, vents, doors, notices),
  `props.ts` (prop billboards as FLORA species, cut-out fences / railings / guard rails).
- **Look-dev**: `lookdev.ts` registers every painter; `PW_DUMP=/tmp/pw npx vitest run
  tests/unit/pixel-world-dump.test.ts` writes each tile ×3 (wrap tiles 2×2 to check seams)
  and the packed atlas; `PW_STAGE_SKY=d1|z1` dumps a stage's panorama; `PW_BENCH=1` /
  `PW_PROF=z1` time painting. In game: `node scripts/pixel-world.mjs --base <dev url> --out
  <dir> --modes sprites,pixel --sheet --shots "z1:2:200:label,…"` captures the same frozen
  instant in each ART (deterministic) with draw calls / triangles / atlas stats.

### Style guide (keep stages consistent)

1. **Density**: world surfaces are painted at `PW_TPM` = 32 texels a metre (≈ 1 texel a
   retro pixel at 8 m); signs and modules at the same density; backdrops 2048 texels round.
   Never scale a tile to fit: lay wrap tiles at density, size modules in whole texels.
2. **Palette**: colours come from the stage's existing material colours through
   `k.ramp(hex, …)` (6-step hue-shifted ramps) — the environment shares the cast's palette
   discipline. No free RGB, no gradients except dithered bands (sky, light falloff), no
   per-texel noise: texture is CLUSTERS (bricks, spalls, pebbles, tufts, stains of 2–6
   texels), placed by hand-written rules.
3. **Light** from the upper left and front, as PixelCast: raised features lit top / left,
   dark bottom / right, one step of cast shadow below-right; recesses the other way round.
   Outlines are selective (step 0 only where a form needs separating), never black boxes.
4. **Wear tells the story**: weathered feet (splash-back, damp), drip-stained heads under
   cornices, rust runs below metal, soot over fires, cracks / patches on roads — a few
   readable clusters, not a uniform dirt overlay.
5. **Text is always pixel font**: neon = tubes on the regular glyph skeleton with a glow
   core and a halo ring; painted signs on boards. Size signs like the classic ones
   (`pwSign.bw/bh`: the classic board; letters `size` m tall caps).
6. **Glow** (`PWF.GLOW`) only for light sources: lit windows, neon, lamps, screens, lava.
   Light ON surfaces is the stage's lights, plus pixel light pools (stepped rings with
   Bayer-dithered step edges, screened over the surface: `pwPoolTexture`).
7. **Horizons match the fog**: a backdrop's horizon band is the stage fog colour up to
   the elevation the fogged scenery reaches (fogged trees must sit on haze, not on blue).
8. **Gameplay never changes**: no new occluders, colliders, raycast targets or RNG draws.
   PixelWorld meshes are `noMerge`, `userData.pixelWorld`, `raycast` disabled.

### Budgets (per stage, measured)

| budget | limit | z1 MAIN STREET | d1 JUNGLE RUN |
|---|---|---|---|
| atlas memory (all levels) | ≤ 24 MB | 11.4 MB (world 2048×768 8.0 MB + sky 2048×432 3.4 MB) | 9.0 MB (world 1024×816 4.2 MB + sky 2048×592 4.6 MB + jeep 256×160 0.2 MB; FLORA stone / herd sprites 2 × 512×256 R8) |
| paint at stage load | ≤ 300 ms on a phone | 170–210 ms (node on a shared 4-core dev box; sky 36–41 ms) | ≈ 100 ms warm (min of 5: world ≈ 60, sky ≈ 35, jeep ≈ 3) + FLORA stones 14 / herd 7 ms |
| draw calls (same frame) | ≤ 250 | 45–51 (PIXEL CAST 53–60) | 23–52 (PIXEL CAST 34–71) |
| triangles (same frame) | — | 49 k (PIXEL CAST 73 k) | 18–20 k (PIXEL CAST 23–31 k) |
| per-frame work | no allocations | backdrop follow (a position set per layer) | same |

Keep tiles few: a NEUTRAL tile tinted per material beats a tile per colour; wrap shop
bays (`uScale`) beat one module per shopfront; generic tiles at 32–64 texels square.
Paint time grows with texels painted: reuse keys, keep variants ≤ 2, prefer clamp
modules sized to what they show. The phone budget is NOT met with margin yet (a phone
is ~2–3× slower than the dev box: expect ~400–600 ms at a cold stage load). Next steps, in
order of payoff: paint in a Worker during the intro card (painters are DOM-free and
node-safe already), cache painted atlases in IndexedDB by their tile-key list (a repeat
load skips painting), paint the one-level sky atlas after the first frame.

### How to convert a stage

1. **Record, don't change**, in the classic builders: put `userData.pwBuilding` /
   `pwSign` / `pwFacade` (or your own records) on what painting replaces. No RNG draws
   move: CLASSIC / PIXEL CAST must build byte-identically (run the stage's simulator test
   in both and compare).
2. Make `stages/<id>/pixel.ts`: a class owning `PwAtlas('<id>')` (+ a one-level sky
   atlas), its batches and a `TileRule` mapping the stage's materials to painted tiles
   (start from `kitTileRule`; add `overrides` for the stage's signature surfaces).
3. In the env builder: `const pw = pixelWorld(world) ? new XPixelWorld() : null`. Convert
   each zone / chunk BEFORE the stage's baker runs (z1: before `bakeMerge`; d1: before
   `merged()`), so the bake only sees what stays classic. Lay new painted geometry (ground,
   road ribbons, facades, signs) into batches; `retexture` the rest.
4. `pw.atlas.build()` once everything is registered, then build each batch and add its mesh
   to the zone / chunk group it belongs to (it culls with it). Register NOTHING after
   `build()` (it throws).
5. Backdrop: `PwBackdrop` from the stage's sky colours; call `backdrop.update(camPos)`
   where the classic sky followed the camera.
6. Big baked scenery (d3's packed 20–24 B bakes): use PLANAR batches (`pwMaterial(atlas,
   { planar: true })`) — no UVs, the tile per vertex.
7. Small round props → FLORA species (`props.ts` pattern) in the stage's FloraField; thin
   flat structures → cut-out tiles on single quads (two-sided material).
8. Check: `pixel-world.test.ts` style test (budgets, no occluder / ground / RNG change),
   the simulator in both styles, `scripts/pixel-world.mjs` captures of 2 beats + the boss
   (PIXEL CAST vs PIXEL WORLD), judged at 844×390 with the CRT on.

### Stage work-lists

- **z1 MAIN STREET** (converted): facades, shopfronts, signs, marquee, posters, roads,
  sidewalks, curbs, lane paint, roofs, trims, street furniture re-painted; night panorama.
  Still classic: cars (re-painted Kit boxes — give them painted body / glass / grille
  modules), street lamps and their heads, the diner's chrome body and window glass, the
  fire effects, the river / alley interiors past beat 10, the boss arena dressing
  (butcher shop interior), the title-screen backdrop. Facade variety: 5 wall kinds; add
  storefront goods per shop name and a second window set.
- **d1 JUNGLE RUN** (converted end to end; `stages/d1/pixel.ts`, `jeepPixel.ts`,
  `herdPixel.ts`, `pwShapes.ts`; painters `pixelworld/d1*.ts`): the road (`d1RoadTile`: ruts
  with worn tread prints, damp hollows, pebbles, crown tufts, a raptor track, ragged verges),
  the meadow (`d1MeadowTile`), moss / litter / earth patch decals with ragged edges, puddles
  mirroring the sky, the stampede's churned band; the gate (bark logs wrapped round by
  `pwCylinder`, iron bands, hewn points, the palisade as one cut-out wall tile, braced plank
  doors with strap hinges and claw gouges, the carved PRIMAL ISLAND sign with the park emblem,
  flickering pixel torch flames), the ticket kiosk, flags; the electric fence (galvanised
  posts, hazard collars, insulators, sagging cut-out wire spans — vines, the cut wire at the
  old breach — DANGER plates; the breakable section in its pivot's frame); the fallen tree
  (bark, moss drapes, splintered break, limbs; both halves still fly apart), ranger supplies;
  the tour car (body / cabin / front / back / underside / tread / wheel modules) following
  its flip; banks, animated river / white water / waterfall / splash (`d1Water.ts`, one
  animated material); boulders and cliff pillars as FLORA stone billboards (`d1Species.ts`);
  the herd as run / walk-cycle sprites (`d1Herd.ts`, posed by the herd's own gait);
  stippled sun shafts (`d1Shafts.ts`); the jeep view model on its own atlas at 48 texels a
  metre; the ROAD CLOSED barricade; boss-stretch dressing (river-tours landing, raft, NO
  SWIMMING, driftwood, an upturned tour car); the panorama painted straight into the canvas
  (`d1Sky.ts`: range feet melt into the fog). The gate pillars and the car stay the classic
  (hidden) occluders. Still classic: the fuel drums (destructibles: every mesh is a hit
  box), the jeep's windscreen glass / lamps / hot barrel, FX. Checks:
  `tests/unit/pixel-world-d1.test.ts` (occluders, raycasts, budget, full-stage simulator),
  `D1_SIG=1 … d1-sig.test.ts` (CLASSIC / PIXEL CAST scene signature), `d1-lab.test.ts`
  (tile / stone / herd dumps, paint benches).
- **z2 HOSPITAL** (interior, z2/bake.ts colour baker, zones in zonesUpper/Lower.ts):
  `paintedWallTile` / `labPanelTile` walls with wainscot and scuffs, `ceilingTile` with
  light panels as glow modules, `terrazzoTile` / sheet-vinyl floors, `bloodTrailDecal`,
  `noticeModule` (WARD signs, room numbers in 3×5), curtains as `fabricTile`, the
  ambulance bay exterior (night: reuse z1's asphalt, night sky + skyline backdrop),
  morgue drawers as metal modules, OR lamps as glow. Convert per zone before `bake(g)`;
  keep curtains / drawers / vents (animated set pieces) classic or re-paint them in place.
- **z3 HIGHWAY** (dusk exterior, z3/bake.ts per-50 m chunk baker): `duskSkyTile` panorama
  + burning-city skyline layer (`skylineTile` with fire glow) + hills; `asphaltTile` road
  with lane paint, `guardRailTile`, jersey barriers as concrete, billboards
  (`paintedSign`), overpass concrete + soot, tanker / burnt cars re-painted (metal, rust,
  soot), houses (`sidingTile`, `roofTile`), utility poles + wires. Convert per chunk
  before `bake(b)`; road strips are long — use planar batches.
- **d2 RESEARCH LABS** (interior, d2/bake.ts recipes): lobby (terrazzo, reception desk,
  park logo signage as `paintedSign`), shop (shelves of goods modules), kitchen
  (`tilesTile` walls, steel counters), server room (rack modules with glow LEDs),
  greenhouse (glass roof grid, planters), hatchery, containment wing (hazard stripes,
  `grateTile` floors, warning signs), tunnels (`pipesTile`, concrete, steam vents
  classic). Convert per room before `bake()`.
- **d3 TYRANT CHASE** (storm exterior, d3/bake.ts Baker with packed vertices and sway):
  `stormSkyTile` panorama with rain curtains; terrain (grass / mud) and road strips as
  PLANAR batches (24 B a vertex — d3 is ≈ 1 M vertices, keep it packed), paddock fences
  (`chainFenceTile`, cut-out), roadblock (`hazardTile`, drums as prop species), visitor
  centre (`plasterTile`, `windowModule`), bridge planks / cables, helipad paint. Swaying
  vegetation is already FLORA in PIXEL CAST — leave it.

## Audio

`audio/`: `Audio.ts` (buses, voice pool, pre-render cache, ducking, iOS unlock,
background sample bake), `Sfx.ts` (recipes) + `sfxMeta.ts` (per-sound limits /
caching / trim), `Music.ts` + `tracks.ts` (sequencer + compositions; chord
notation, `validateTracks()`; layers follow `setIntensity`), `drums.ts` /
`dsp.ts` / `bake.ts` (time-sliced sample synthesis + DSP helpers). New sounds:
add the name to `names.ts`, a recipe to `Sfx.ts` and a row to `sfxMeta.ts`. Use
`pitch < 1` for bigger creatures; sounds are loudness-matched, so use `volume`
only for distance/emphasis. Enemy sounds are panned by screen position.

## FX

`fx/`: pooled particles with a generated sprite atlas, instanced gibs with blood
trails, ground decals (blood, scorch, bullet marks) that fade, explosions with
fireball/shockwave/smoke, `muzzleFlash()` (wired in `Shooter.fire`). Occluders may
set `userData.surface = 'metal' | 'wood' | 'concrete' | 'dirt' | 'grass' | 'water'`
to pick impact effects per object.

## Weapons, pickups, bombs

- Turret heat: +3 % per shot; a pause of > 0.12 s bleeds heat at 1/s (feathering
  never locks you out); holding flat out overheats in ~2.8 s and locks the gun
  until it cools to 35 % (~1.1 s) — unless a boss windup vents it (see Bosses).
- Pickups blink for their last 2 s by hiding the model only: `Entity.shootableWhenHidden`
  keeps the hitboxes in `Shootables.active()`, so a shot on a flashing item still
  collects it. Pickups left when a beat ends live 6 s more (`LEFTOVER_PICKUP_TTL`).
  Pickup halo/gem geometry is shared (`userData.shared`).
- `World.useBomb()` ignores a second bomb within 0.75 s (`bombCooldown()` for the
  HUD) and spends nothing when no hostile is in reach (`bombTargets()`; it pops
  NO TARGETS).
- Aim assist probes only the shootable meshes (25 rays) and checks walls with one
  occluder ray per candidate; the occluder raycast is skipped for clean misses of
  extra shotgun pellets. Still: keep occluders low-poly proxies (12-triangle boxes
  with `userData.surface`) — never pass detailed baked shells.

## Comfort & accessibility settings

`world.settings` is the live Settings object (the settings screen edits it mid-stage).
- `reduceFlashes`: Fx explosion light flashes are dimmer (30 %) and can't re-fire
  within 0.4 s, the blast core sprite and muzzle-flash light are toned down, enemy
  hit flashes are capped at ~3/s, pickups blink slower. **Stage code with its own
  flashes (lightning, strobing alarms, flickering lights) must check
  `world.settings.reduceFlashes`** and tone them down (no full-screen brightening).
- `screenShake` 0..1: scales `RailRig.shake()` (and walk-bob / vehicle rumble by half).
- First run: when the OS asks for reduced motion (`prefers-reduced-motion`),
  `Save` defaults to `reduceFlashes: true, screenShake: 0.5`.

## Stage loading

`Game.startStage` shows the intro card (or keeps the pressed RETRY/RESTART
screen) first and builds the stage two frames later, so the UI paints before the
0.4–1 s build. Then `Warmup.buildWarmupSet` builds throwaway copies of every
enemy type in the beats (plus the campaign roster), each pickup kind and civilian
variant, and `Engine.precompile` compiles their programs (and the scenery's) with
the retro target bound; play starts when both the card and the load are done.
State `'loading'` covers loads without a card. Stage set pieces that add **lights**
or new material types mid-stage still compile then: add such lights at build time
(intensity 0) and keep set-piece meshes in the scene (hidden) from the start.

## Renderer policy

- Output DPR: one rule (`Engine.outputDpr`): CRT/PIXEL LOW 1.5 / MEDIUM 2 / HIGH 2,
  clean mode = the quality preset's max; always capped by the device. MSAA only
  in clean mode HIGH (decided at boot).
- Dynamic resolution (`core/Resolution.ts`): slow windows start a probe that steps
  down (retro: scene lines 1 → 0.7, then output DPR → 1); if 3 steps don't make
  frames faster it's a refresh cap (Low Power Mode), so it reverts and holds.
- WebGL context loss: the game pauses ("GRAPHICS RESET"), RESUME is refused until
  the context is restored; frozen frames (pause/results/continue/intro) are only
  re-rendered when the canvas was resized or cleared.

## Performance & feel checklist

- Telegraph everything that can hurt the player.
- Hit feedback: flash, blood/sparks, knockback, sounds — base classes do most of it.
- Use `world.rig.shake()`, `world.hud.banner()`, `world.audio.play()`,
  `world.fx.*`, `world.explode()` and `world.later(sec, fn)` (game-time timers).
- Never use `setTimeout`/`setInterval` in gameplay code (breaks pause / the simulator).
- Never use `Math.random()` in gameplay code: use `world.rng` (seeded).

## Debug URL flags

`?stage=z1` jump into a stage · `&art=3d|sprites|pixel` ART: CLASSIC / PIXEL CAST (default) / PIXEL WORLD ·
`&spriteLook=pal:0,dirs:8` sprite look tuning · `&beat=5` start at beat 5 · `&autoplay=1`
aimbot · `&god=1` invulnerable · `&speed=2` time scale · `&debug=1` beat
overlay · `&seed=42` · `&mute=1` · `&retro=crt|pixel|off` force the arcade-monitor
mode (`?stage`/`?autoplay` deep links render with retro OFF unless `retro` is
given, so tooling gets clean captures) · `?stage=zoo&zoo=walker,raptor` dev arena.
`window.__game` exposes the game for tests; `Menus.current` names the top screen.

## Arcade front-end

- Boot POST screen once per session → title (`PRESS START`, `FREE PLAY`, 1P/HI row).
- Attract cycle: title idle 15 s → HI-SCORES 6 s → `Game` state `'demo'` for 25 s
  (AutoPlayer + god, a stage fast-forwarded to the next fight; never records
  scores/unlocks, no tutorial/intro). Any tap → main menu.
- Hi-scores: per-campaign top-10 tables in `Save` (`hiScores`, `hiScoreRank`,
  `qualifies`, `addHiScore`, `topHiScore`, `lastInitials`). An ARCADE run that
  ends (campaign clear, game over, quit) with a qualifying total goes to 3-letter
  NAME ENTRY. RETRY/RESTART replace that stage's score; continues are recorded.
- The 2D overlay follows `engine.retro.targetSize` (`Overlay2D.setPixelGrid`) so
  rings/crosshairs are drawn on the same chunky pixel grid as the 3D.

## Verifying changes

```
npx tsc --noEmit                         # typecheck
npx vitest run                           # unit tests + headless stage simulator
npx vitest run tests/unit/stages.test.ts -t "stage z1"   # one stage
npx vite --port 5173                     # dev server
node scripts/snap.mjs --url "http://localhost:5173/?stage=z1&autoplay=1&god=1&debug=1" \
     --out /tmp/shots/z1 --count 4 --interval 3000      # screenshots (then view the PNGs)
```

The stage simulator (`tests/unit/sim.ts`) plays every stage headlessly with the
real World, raycast shooting and the AutoPlayer in god mode, and fails on
exceptions, soft-locks, unreachable enemies or unkillable bosses.
