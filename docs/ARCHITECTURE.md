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
1500 (sometimes +1 life). Everyone still on the field (and anyone who got away
off screen) is rescued when the encounter is cleared, as ever; the only
instant rescue is a save the player makes — shooting the zombie holding them,
or its holding arm off. A civilian who runs off screen is out of play (hidden,
no target) and paid with the rest at the clear, at the edge they ran out of
(`escaped`): no mid-fight bonus or +1 life for doing nothing.

**Coming on.** A civilian the stage spawns in plain view doesn't pop up out of
nowhere: they run in from just past the nearer edge of the view, level with
their spot (the run stays in the outer part of the screen on their side),
calling HELP! (`arrive`, up to 7.5 m), or in from where the stage says
(`from`: the d2 gift-shop tech along the right-hand aisle, the z3 pile-up's
worker from among the wrecks ahead, the z3 tunnel's nurse in past the camera
along the wall). They wait for it out of sight — not drawn, no target — until
the rail camera has stopped turning to the scene (< 0.3 rad/s, 1.2 s at most),
so the run is seen, and seen whole (a sprite whose view turns every frame is
re-baked every frame: see `SpriteArt.nextBake`). The last 1.4 m of the run turn
them to the act's facing and slow the stride, so they drop straight into it (no
spin on the knees). A run-in can't see walls: where the edge of the view is
behind scenery (a tunnel wall, a wreck, a shop's shelving), give the stage a
`from` — `civilian-fairness.test.ts` catches a run that passes behind
something. Spots too far in, runners and the grabbed are simply there; each is
already turned the way its act faces.

**Acts.** A beat's `civilians` entry picks what they do with `act` (default
`auto`); the arcade light-gun games are the reference (House of the Dead,
Time Crisis, Virtua Cop, Operation Wolf, Jurassic Park). Gestures are keyed —
each extreme held for a few sprite frames — so they read at 12 fps, and they
are posed for the SILHOUETTE at phone scale (8–16 m, 40-odd texels tall): no
hand ever goes over a head, no arm is ever held out sideways.

| act | what they do |
|---|---|
| `cower` | down on both knees, folded over them, turned 0.3 rad toward the screen edge, hands clasped over the back of the head, elbows in front of the face, shaking (a body hop of about a retro pixel every ~0.1 s, off the 12 fps beat); while ducked, every 1.25 s the head turns to look out under an arm and the weight shifts (held, never rising); every couple of seconds the head alone comes up for 0.4–0.8 s to look out over the arms (hips stay down) — every other peek at the player, the near hand coming down to the mouth, elbow by the ribs (HELP! the first times) — and ducks back in 0.1 s; never peeks while anything is within 4 m or winding up; flinches (0.2 s harder tuck, head jerk) at a shot landing near them on screen, a kill within 4 m or an attack starting within 6 m |
| `hide` | only where the stage puts cover right in front: crouched with the back to the camera, hands on the cover, peeking up and out, glancing back over the shoulder for help — never in the open (no stage uses it at the moment: the d1 ranger in the ferns now flees) |
| `flee` | cowers until the danger is real (a threat within 7 m — 12 m for dinos — an attack winding up, or 8 s; one who has just run in ducks 1.5 s first unless it's right on them), then runs out across the view at 2.8 m/s on the heading (from straight across to a little toward or away from the camera) that keeps them on screen ~3 s, Operation Wolf style — or to the stage's `to` (the z1 cop, kept off the shopfronts; the d2 hatchery tech, back out past the camera) — looking back over the shoulder; may trip once (0.9 s: pitch forward, ~0.3 s on all fours, scramble on), 0.35–0.6 s in and only well inside the view; off screen they have escaped |
| `backaway` | HELP! over the shoulder, then 1.5–2.5 s edging back from the nearest threat on bent knees (kept within 0.7 rad of facing the camera: in profile with arms out it would read as a zombie), recoiling — leaning back, chin tucked, the face turned away — one hand up in front of the face at nose height, palm out at it, elbow down, the other hand reaching back; steps sized to the ground covered (no skating); then turns and runs. Startled while edging back (a shot or a kill close by, with the threat still over 6 m off and nothing winding up), half of them trip over their own heels onto the seat, scoot back, roll over and scramble off (`fall`) — never over nothing, and one fall per civilian (no stumble on the run after it) |
| `grabbed` | spawns with a zombie (`attacker`: its outfit) holding their arm — a tug of war, keyed: every 1.1–1.6 s it yanks, throwing its weight back with a step back of the rear foot, and they're dragged two stumbling steps toward it (the near foot, then the other; 0.22 m), the head snapping; they step back twice as they haul themselves away again, weight dropped low, leaning hard away, both hands on the held wrist. Between yanks the zombie leans back off the arm, stooped over it, its head darting at it (a bite). Shoot the zombie (or its holding arm off) and they're free on the spot (THANKS!, a rescue); left ~7–8.5 s they wrench free and run (paid at the clear), the zombie walks on at you |
| `plead` | calls HELP! — turned 0.42 rad toward the screen edge so the knee bend and the lean show, a short stance, the hand nearer the camera cupped at the mouth (elbow down by the ribs), the far one waving beside the head from an elbow held below the shoulder (two held positions, 2.5 a second) — then cowers (after a startled jolt), and calls again when it's calm. Far off (> 15 m) or perched up on something (the d3 truck bed): a deeper crouch bouncing on the knees and a bigger swing of the forearm — never the arm overhead |
| `auto` | a short HELP!, then cowers; a zombie within 2.6 m (a dino within 4.2 m) and they back off and run |

`help` (seconds) puts a HELP! before the act (by default only `plead` and `auto`
open with one; cowering and backing off call from inside the act). Rescued
civilians sigh, then give a thumbs-up at chest height with two nods or a wave
of the forearm beside the head (elbow down; THANKS!), and jog off screen — always to the
nearer side of the view and a little away from the camera (re-aimed every 0.5 s while the rail
camera moves: `pickDest` never picks a heading toward the lens for `leave`). If the camera
still closes on them (a beat that pushes forward), within 4 m (`LEAVE_NEAR`) they blink out
the arcade way — on / off every 0.06 s for 0.42 s — instead of walking into the lens.
Civilians standing on something raised (the d3 truck bed: `PerchedCivilian`)
only plead or cower. Each civilian takes ONE draw from the world RNG (as
before) and seeds its own: adding acts never shifts a stage's random stream.
Looks (`VARIANTS`): bright, clean, saturated, never a zombie's outfit for the
same job; `tech` (the d2 lab staff) wears the lab coat open over a
safety-orange polo — a white coat alone vanished against the pale shop and lab (PIXEL WORLD
also stands two dark-slate equipment cabinets on the hatchery wall behind where she takes cover).

**Fairness (hard rules).** Civilians never stand in an enemy's attack lane:
they stay where the stage put them — out at the side of the frame, away from
where the attacks come in — or run only *outward* (a running civilian's screen
x only grows, also on deeper headings: those stay under the angle that would
turn them back in). Which side is "outward" is tracked while they stand their
ground, so a camera still turning to the scene doesn't send them across it. A
grabbing zombie stands level with its victim, `GRAB_SEP` (1.45 m: arm's
length, the hands still meeting) toward the middle of the view, turned to the
camera: with both leaning away from each other, it further on a yank, its head
and chest keep ≥ 25 px of clear aim from her on screen at the z2 ER (≥ 38 px
measured: stooped in closer, 28 px, a human-like-bot miss at its chest hit her
arm), on a yank too; while it holds on it never attacks (no ring, no attack
slot); a hit makes it flinch but not let go. Never put a civilian behind visible scenery that
doesn't stop bullets (a shot at the counter would carry on into someone you
can't see): in the open, or behind a registered occluder.

`civilian-fairness.test.ts` checks it three ways. (1) It plays every stage
with a slow AutoPlayer and checks, every other frame, that a ray through the centre of
any hostile's head / torso / weak point — and rings 8, 12 and 16 px round it —
never hits a civilian first (hostiles out past 120 m are left out), and that no
civilian's head or chest sits behind solid non-occluder scenery (a leg behind a
display table or a toy on the floor, head and chest in plain view, is fine;
foliage, ground layers and the d3 truck's perched driver — whose truck belongs
to the environment — aside). (2) HOLD FIRE: each civilian beat on its own (as
?beat= jumps there), seeds 1–6, 12 s without a shot while the hostiles prowl,
pace and wind up: no hostile's head / torso / weak-point box comes within 16 px
of a civilian's hitboxes on screen while it attacks, nor for more than 0.3 s at
a stretch (a dino prowling across them is a moment's wait; one pacing in front
of them is not), and a grabbing zombie keeps 25 px of clear aim. Holding fire,
a beat's later waves (most start once the first is down to a hostile or two)
never come, so (3) the same beat is played again CLEARING THE ROOM slowly: from
3 s on, every 1.2 s the hostile furthest from the civilians on screen drops
dead and the waves come on, over 20 s, with the same rules for the ones still
standing. Those passes changed the d1 fallen-tree ranger (left hiding in the
ferns, a dilo's prowl took it right across her: now she cowers there until the
dilos step out of the bushes, then bolts out of the view to the left) and the
d1 river-ford scientist (the red raptor's ambush from the right ran in at the
camera straight across her: now out of the view to the right as the compys
leap in), and moved the d2 lab staff: the vents' compys pounced across the
gift-shop tech at the back of the shop, so she comes in along the right-hand
aisle to duck between the display tables and goes back out as they drop (the
last wave's raptor leaps in right there); the hatchery tech runs in from
beside the camera to the near benches on the right and bolts back out once the
raptors are out (further down that aisle she was on the line the right-hand
door's raptor runs at the camera along — a human-like-bot miss at it hit her).
`civilian.test.ts` covers each act (the run-in and its wait, outward runs,
the grab and its yank, the one startled fall, rescues paying once and when,
the hit penalty once, perched civilians, the RNG draw). Measure changes with
the human-like bot (`humanbot.test.ts`: civilian shots and damage per stage).

**Poses.** Each act writes joint values into a flat pose buffer
(`civPoses.ts`: `posePlead`, `poseCower`, `poseStartle`, `poseHide`,
`poseBackAway`, `poseFall`, `poseFlee`, `poseStumble`, `poseGrabbed`,
`poseThanks`, …, plus `shiver`, `tremble` and `fidget`); the civilian blends
from the pose it is leaving over 0.1–0.45 s and `applyPose` writes it onto the
rig, so ART: 3D (baked meshes) and ART: SPRITES (PixelCast paints from the
joints) show the same thing. `ikArm` is a two-bone IK that puts a hand on a
point of the body (`headPoint`, `rootToChest`: the mouth, the face, the chest,
the floor) or on the zombie's grip, with a pole for the elbow; it writes into
the pose buffer, so whatever comes next blends from exactly what was drawn.
`armFK` reads where a pose has a hand, so a hand can travel from a fitted pose
to a target on a straight line (`handTo`: the cowering hands coming down from
the head to the mouth) instead of blending joint angles through the air.
`ikLimb` is the same IK in world space straight onto a rig's arm (the zombie's
two hands on the held arm). Calling hands keep the elbow DOWN (`elbowIn` clamps
how far an arm is raised sideways): an elbow lifted to shoulder height with the
forearm folded back at the face paints, at 40 texels, as an arm held straight
out. The cowering arms are fitted (forward-kinematics values that keep painted
arms and hitboxes agreeing from every view they're seen in); the HELP! waving
hand is the one turned away from the camera, the calling hand the near one.
Crouches keep the shoes on the floor (`legsHeight`; a kneeling knee:
`kneelY`). `Civilian.debugPose(phase, t, …)` holds a pose for tests and
look-dev.

**Pixel art.** The human painter (`content/pixel/human.ts`) has three more
living expressions — `terror` (brows up, whites round a small pupil, a gasp),
`relief` (eyes shut in a smile, an open smile) and `strain` (eyes squeezed
shut, gritted teeth) — per-hand poses (`handL` / `handR`, the `HAND.THUMB`
thumbs-up), a swinging `ponytail` (`hairSwing` jolts it), `innerW` (how wide an
open jacket shows the top under it) and a pixel speech bubble (`bubble`:
`CIV_STAMP.bubble.help` / `.thanks`) — a solid stamp two retro pixels a cell
over the head, on a layer of its own, never a target. ART: 3D shows the same
bubble as a camera-facing sprite (`civBubble.ts`) but keeps the baked screaming
face. Stamps may reach further than 8 cells from their anchor (`stampReach`;
everything older lays out exactly as before). `civilian-align.test.ts` checks
every pose (and the grabbing zombie, mid-tug and on a yank) against the
hitboxes in the views it is seen in; `civilian-silhouette.test.ts` checks what
the calling-for-help poses READ as at 8, 12 and 16 m in the front and
three-quarter views — the widest painted row between shoulders and head at most
2.2 shoulder widths (no T-pose), no hand over the head, the calling hand at the
mouth, the sprite's silhouette matching the 3D body's.

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
'pixel'`, default **PIXEL WORLD** (`'pixel'`, default generation `artV` 3 — see *Art style:
PIXEL WORLD* for the migration); URL `&art=3d|sprites|pixel` overrides it until the player
changes ART; the characters switch live mid-stage via the pause screen's ART chip). CLASSIC (`'3d'`) is the
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
| PIXEL CAST (`'sprites'`) | PixelCast pixel art | 3D, Kit retro textures (the saved "pixel cast v3" look) |
| PIXEL WORLD (`'pixel'`, **default**) | PixelCast pixel art | painted PixelWorld pixel art (all six stages and the title screen) |

**Default and migration** (`Save.migrateArt`, used by `Save` and by the title backdrop reading
the raw save): ART default generations are `artV` 1 (no `artV`: CLASSIC was simply the stored
default), 2 (PIXEL CAST) and 3 (PIXEL WORLD). A save stored under an older generation moves to
PIXEL WORLD once unless the player chose: from generation 3 on a change of ART records
`artPicked` (kept through any later default change); before that, anything other than its
generation's default counts as a choice (CLASSIC or PIXEL WORLD under the PIXEL CAST default
stay; a PIXEL CAST that was the default — indistinguishable from one picked under it — moves).
Junk falls back to the default.

- Characters follow the live setting (`artCast`). Environments are built with the stage, so
  a stage keeps the environment style it was LOADED with: `World.art` is fixed at stage
  load and stage builders branch on `pixelWorld(world)` — never on the setting. A change
  that differs in environment (`envPending(loaded, wanted)`) shows from the next stage load
  (RETRY / RESTART / next stage); the settings row and the pause chip say so
  ("SCENERY CHANGES ON THE NEXT STAGE LOAD").
- Settings → ART is a three-way row; the pause screen's ART chip is ONE button that cycles
  CLASSIC → PIXEL CAST → PIXEL WORLD (`nextArt`). `&art=3d|sprites|pixel` overrides the
  setting until the player changes ART. Saves holding anything else fall back to the default
  (`Save`: `isArtStyle`, `migrateArt`).
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
  h, paint, { wrap })` → a handle; the same key returns the same tile), LAID OUT in `build()`
  (rects known at once: meshes can be built) and PAINTED — at once (tests, tools), or, when
  Game builds a stage behind its intro card (`pwDeferPaint(true)`), as a job of steps (one
  tile, or one tile's mip chain) that `pwPaintStep(ms)` runs a slice a frame; a texture made
  before the paint ends uploads once it does. Passes that re-make painted levels (d2 / z2 / d3
  calm levels, z3 ink levels, z1 flame coverage) register with `atlas.post(fn)` right after
  `build()`: they run when the paint ends. Deterministic either way, cached by tile list for
  the session (`pwCacheKeep` drops other stages' copies: one stage's worth of CPU data) and
  persisted (`store.ts`, below), packed into one RGBA8 texture with 5 hand-made levels. Mips are palette-faithful: each texel of a level is a real texel
  of the four below it (the one nearest their average, within the class most of them
  share) — never a blend; glow wins ties and survives over cut-out, so neon, stars and lit
  windows keep reading at a distance. Alpha classes: 0 = cut out (discarded), 160
  (`PW_GLOW_A`) = unlit glow, 255 = lit. Rects are 16-texel aligned (`PW_ALIGN`); wrap tiles
  must be multiples of 16. `PW_STATS` holds bytes / paint ms / cached / stored per atlas
  (`window.__pixelWorld`), `PW_PAINT_STATS` the longest single paint step.
- **Store** (`store.ts`): painted atlases persist in IndexedDB (`overrun-pixelworld`), one
  record per atlas NAME under `<version>|<name>` — `version` a hash of every source file
  (`__PW_VERSION__`, injected by vite.config.ts: any code change repaints once; other
  versions' records are deleted by key range when the store opens). A record holds the tile
  list it was painted for (checked on use), every level after its `post()` passes, and the
  rects. Game opens the store at boot, `pwStorePrefetch(stageId)` reads a stage's records
  while its intro card paints (the build waits ≤ 1.5 s for it), and `pwStoreFlush(1)` hands
  freshly painted atlases over one a frame, still behind the card (the data is cloned at the
  call; the disk write runs in the background). No IndexedDB (node, a sandboxed frame), a
  blocked / slow open, a failed read or a full disk (QuotaExceededError: the store is cleared,
  writes stop for the session) — the game simply paints. The dev server keeps it off (its
  `define` would not follow edits): `&pwstore=<tag>` turns it on for benchmarks.
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
| atlas memory (all levels) | ≤ 24 MB | 15.3 MB (world 2048×1136 11.8 MB + sky 2048×368 2.9 MB + fire strips 256×448 0.6 MB) | 9.7 MB (world 1024×848 4.6 MB + sky 2048×576 4.7 MB, one level + jeep 256×240 0.3 MB; FLORA stone / herd sprites R8) |
| paint at stage load | ≤ 300 ms on a phone | ≈ 230 ms warm, min of 10 at load avg 8–16 (world ≈ 190, sky ≈ 28, fire ≈ 10 incl. its coverage-built levels; the z1 tile painters ≈ 50 ms of it, the rest the shared resolve / pack / mip pass over 1.79 M texels in 352 tiles) | R2: 102 ms CPU, min of 12 at load avg 25 (world 67, sky 32, jeep 3; 129–146 ms in runs beside a full test suite); per-tile minima: world tiles 35 + resolve 5, sky tiles 24–43 + resolve 8 — + FLORA stones 16 (7 species) / herd 7 ms |
| draw calls (same frame) | ≤ 250 | 20–64 over 26 beats (PIXEL CAST 21–91) | 26–48 over 18 shots, boss included (PIXEL CAST 35–77) |
| triangles (same frame) | — | 15–38 k (PIXEL CAST 19–75 k) | 20–22 k (PIXEL CAST 23–33 k) |
| per-frame work | no allocations | backdrop follow (a position set per layer) | same |

Keep tiles few: a NEUTRAL tile tinted per material beats a tile per colour; wrap shop
bays (`uScale`) beat one module per shopfront; generic tiles at 32–64 texels square.
Paint time grows with texels painted: reuse keys, keep variants ≤ 2, prefer clamp
modules sized to what they show. Painting no longer blocks: it runs in slices behind the
intro card and the result is persisted (see *Stage loading* and *Store*), so only the
first-ever load of a stage on a device paints at all.

Stage loads, production build, real flow (title → intro card), `scripts/load-bench.mjs
--intro --warm 1 --play 6`, SwiftShader on a shared 4-core box (a phone is ~2–3× slower;
the card runs 2.8 s). Total = card start → ready to play; *cold* = first load on the device
(paints, then stores), *warm* = every later load (atlases from IndexedDB, nothing painted):

| stage | PIXEL WORLD cold (build / paint in frames / total) | PIXEL WORLD warm total | PIXEL CAST total |
|---|---|---|---|
| z1 | 401 / 443 ms in 27 / 1610 ms | 979 ms | 1070 ms |
| z2 | 380 / 320 in 17 / 1208 | 855 | 956 |
| z3 | 520 / 306 in 18 / 1290 | 1116 | 918 |
| d1 | 1042 / 316 in 17 / 1803 | 1319 | 1789 |
| d2 | 622 / 316 in 17 / 1437 | 1357 | 1279 |
| d3 | 706 / 289 in 15 / 1520 | 1403 | 1285 |

With the CPU throttled 3× (a phone proxy): z1 cold 3.4 s / warm 1.8 s, z3 3.8 / 2.0, d1
4.9 / 3.4 (d1's world build alone 2.7–2.9 s) — a first-ever load may hold the card on
LOADING... for up to ~2 s; later loads fit inside the card except d1, whose build is the cost.
Writes to the store cost 50–75 ms (one atlas a frame); reads 30–65 ms (≈ 15–25 MB, during
the card). Longest single paint step 40–75 ms (a 2048-wide sky band). The long task left
under the card is the world build itself (as in PIXEL CAST). **In play: no long task in either
ART** (round 5): the 0.2–0.55 s frame a few seconds in (the first character's paint, 50 %
longer in PIXEL WORLD) was the first use of programs compiled at warm-up but never linked —
they are now linked behind the card (`linkSlice`, step 6 of the load: 200–250 ms over 6–7
frames in PIXEL WORLD, 45–80 ms in PIXEL CAST, inside the card); measured with
`scripts/load-bench.mjs --intro --play 6` (z1, d3: `playLong` empty in both ARTs) and a CPU
profile of the frame (`getProgramInfoLog` / `getUniforms` under `onFirstUse` was 250 of its
300 ms). Next steps: a Worker for the cold paint (painters are DOM-free and node-safe), and
splitting the world build itself (d1's 0.9–1.0 s, shared with PIXEL CAST) over frames.

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

- **z1 MAIN STREET** (converted end to end; `stages/z1/pixel.ts` + `pw*.ts`; painters
  `pixelworld/z1*.ts`): wet asphalt with patches / tar snakes / alligator cracks and a
  decal sheet (skids, blood, manholes, puddles); granite flags with a soldier course, wear
  clusters, a sunken flag holding water and drain grates in the square (`z1PavingTile`);
  calm walls (`z1walls.ts`: render with a few re-rendered patches, concrete panels with
  joints and form ties — every render / concrete wall in town uses them) whose wear is
  PLACED: rain streaks under about half the sills, render come away to the brick near
  corners and feet, a damp foot and a drip-stained head as 48-row bands cut from the base
  pattern; facades with string courses, copings, pediments, chimney pots, aerials, fire
  escapes, one ghost sign per tall side wall (three different), a billboard; shop bays by
  shop (lit cinema / hotel lobby / pharmacy / liquor / bar / pawn interiors, dark bank /
  cafe / barber / to-let / closed bays, shutters and boarded fronts sprayed with four
  different pieces — neighbours never match — the police lobby boarded once, clear
  elsewhere); spray-can graffiti (`z1graffiti.ts`: tags, throw-ups and stencils from a word
  list, never the same piece twice running); the RIALTO's changeable-letter marquee in
  2-texel slotted letters (`z1signs.ts`); painted cars with contact shadows, mirrors,
  aerials, mud flaps; the diner (stainless flutes with reflected bands, seams and a dent,
  checker, menu, roof fans); the overturned bus; the gas station (canopy, roofing membrane,
  pillars with a notice, store bay); the alley's cold-storage warehouse (calm corrugated
  cladding, COLD STORAGE sign, roller door, bulkhead lamp, conduit); PRIME MEATS (calm
  cold-room windows: carcass silhouettes, condensation, oxblood tiles), kiosks each with
  their own bill sheet, the bandstand, the courthouse with a real gable pediment; the
  furniture as painted cut-outs (`pwProps.ts` on `userData.pwProp` tags: benches,
  sawhorses, crates, the square's lamp posts with glowing globe cards, the fountain, the
  plinth, the floodlight lens, the bandstand base); hand-drawn three-tongue flames on their
  own atlas with coverage-built levels (`z1FlameLevels`: still flames at a distance, never
  rectangles); lamp shafts as soft ray fans (camera-facing cards: halo, four rays, Bayer
  steps, far fade); light pools lifted onto the ground and screened onto walls in sodium /
  warm colours; wet reflections under fires, lamps and lit pools (dash rows, flickering with
  their source); the night panorama (violet gradient, stepped moon halo with earthshine,
  warm cloud bellies over the fires, the MILLBROOK townline). Zone / dynamic batches at
  gain 1.3 (as bright as PIXEL CAST). Still classic: trees (FLORA), the extra glass panes,
  the title-screen backdrop.
- **d1 JUNGLE RUN** (converted end to end; `stages/d1/pixel.ts`, `jeepPixel.ts`,
  `herdPixel.ts`, `pwShapes.ts`; painters `pixelworld/d1*.ts`): the road (`d1RoadTile`: ruts
  with worn tread prints, damp hollows, pebbles, dry-grass crown tufts, brown leaf litter by
  the verges, a raptor track, ragged verges), the meadow (`d1MeadowTile`), moss / litter / earth
  patch decals with ragged edges, low-contrast lobed puddles (blue-grey a step under the road,
  a soft wet rim, one glint: never read as a pickup), the stampede's churned band
  (`d1TrampleTile`: furrows along the herd's way, beaten grass combed flat, clods, three-toed
  hadrosaur prints); the gate (bark logs wrapped round by `pwCylinder`, iron bands, hewn
  points, the palisade as one cut-out wall tile, braced plank doors with strap hinges and claw
  gouges, PRIMAL ISLAND in one line of tall gilded caps across the sign — 2-texel strokes, a
  carved groove — the park emblem on iron plaques on both pillars, torch flames as narrow lit
  teardrops round a small glow core), the ticket kiosk (log corner posts, thatch roof with a
  fringe hanging off every eave, a deep ticket window — lamp-lit booth, counter, rolled shutter
  — with a TICKETS board facing the approach, the park map, a crate, a hanging lantern), flags
  a third bigger; the electric fence (galvanised posts, hazard collars, insulators, sagging
  cut-out wire spans — vines, the cut wire at the old breach — DANGER plates; the breakable
  section in its pivot's frame); the fallen tree (`d1LogBarkTile` painted once round the whole
  log: a lit top third, a dark underside and contact line, long tapered fissures, peeled pale
  patches, knots, lichen; moss drapes, splintered break, limbs; both halves still fly apart),
  ranger supplies (an opaque canvas kit bag with webbing and a patch); the fuel drums (red
  oxide, rolled ribs, FLAMMABLE diamonds, rust runs, lids with bungs: one shared painted mesh
  ridden on each destructible, whose classic meshes stay its hit boxes with an undrawn material
  of the same `side`); the tour car (body / cabin / front / back / underside / tread / wheel
  modules) following its flip; banks, the river as ONE tile across the whole channel
  (`d1RiverTile` at 16 texels a metre: olive shallows over still pebbles, the bank trees'
  broken reflection, a teal body with sky wisps, a darker channel, current streaks on a fast
  layer, ripples on a slow one, glint crosses in GLOW so the far river still sparkles), white
  water at the banks and round every rock standing in the river (`d1EddyDecal`: bow wave and
  wake), the waterfall (strands falling at two speeds with wet rock between, a dark overflow lip
  with a bright curl, frayed edges) and its splash (`d1Water.ts`, one animated material:
  animated MODULES map one frame onto their quad — `pwPanel` / `pwDecal` `frames`); boulders and
  crags as FLORA stone billboards (`d1Species.ts`: boulders in three aspects picked by the classic
  rock's proportions so the footprint matches, darker faceted mid-tones, cracks, lichen, moss on
  some; river boulders with a wet band and a foam ring; crags with a jagged stepped silhouette,
  overhangs, slanted fracture facets, short pinching strata, violet shadow steps, moss tongues,
  root / vine curtains and an overhanging canopy crown; the wide crag two or three pillars at
  different depths; d3 paints the shared four, `D1_STONES`, in its own biome, d1 all seven,
  `D1_STONES_ALL`); the herd as run / walk-cycle sprites (`d1Herd.ts`, posed by the herd's own
  gait); hard-edged sun-shaft rays in stepped strengths (`d1Shafts.ts`); fog starting at 38 m
  and coloured `D1_PX_FOG` (a light blue-green haze = the sky's horizon band) in PIXEL WORLD
  only; the jeep view model on its own atlas at 48 texels a metre (every long tube — roll
  hoops, roll bar, bull bars — painted round as a tube: a highlight along the top, chips at
  irregular spacing, rust at the welds; a worn hood stripe); the ROAD CLOSED barricade;
  boss-stretch dressing (river-tours landing, raft, NO SWIMMING, driftwood, an upturned tour
  car). The panorama (`d1Sky.ts`, `d1Volcano.ts`, painted straight into the canvas arrays): the
  sky in hard bands from the fog colour to the zenith whose edges swell gently (no dither rows),
  stratus wisps, cumulus piled from lobes (overall form light + lobe accents: warm crowns, cool
  violet flanks, flat bellies); two keyframed ranges crowned and covered with scalloped canopy
  in staggered rows, gullies splitting light and shade, lobed mist pockets, stepped haze feet
  following the treetops; a continuous far treeline in the fog band; the jungle escarpment the
  boss chase looks back at (az ≈ 178: buttressed cliffs, ledges, vine curtains, waterfall
  threads); the volcano (notched crater, a collapsed scarred side with glowing lava seams, a
  shoulder vent, erosion ribs, scree fans, the jungle creeping up its foot, a billowing plume
  lit toward the sun with a violet shadow side and an ash-dark core, thinning in dither at the
  top). The gate pillars and the car stay the classic (hidden) occluders. Still classic: the
  jeep's windscreen glass / lamps / hot barrel, FX. Checks: `tests/unit/pixel-world-d1.test.ts`
  (occluders, raycasts, destructibles and hit proxies identical in all three ARTs — rays at
  every drum, across the fence section and the tree halves —, budget, full-stage simulator),
  `D1_SIG=1 … d1-sig.test.ts` (CLASSIC / PIXEL CAST scene signature), `d1-lab.test.ts`
  (tile / stone / herd dumps — `D1_SET=2|3` for the prop / water and round-2 tiles — paint
  benches).
- **z2 ST. MERCY HOSPITAL** (converted end to end; `stages/z2/pixel.ts` = `Z2PixelWorld`;
  painters `pixelworld/z2surfaces.ts`, `z2decals.ts`, `z2signs.ts`, `z2modules.ts`,
  `z2props.ts`, `z2billboard.ts`, `z2furniture.ts`, `z2vehicles.ts`, `z2atrium.ts`,
  `z2sky.ts`, `z2bay.ts`, `z2objects.ts`). Every zone is converted before its `bake(g)`
  (`convertZone`, called from env.ts `addZone`) and every `bakeInto` set piece before its bake
  (`setBakeHook` → `convertInto`); the builders only RECORD what painting replaces (`pwTag`:
  kind + data in `userData.pw`), so CLASSIC and PIXEL CAST are byte-identical (scene hash).
  Levels: the tileable surfaces get calm far levels (`d2CalmLevels`) and each zone mesh draws
  in up to three groups — modules (bias 0.5), tileable surfaces (bias 1.0: grout, chequer and
  brick collapse into their mid-tone instead of crawling into dashes), small signs (bias −0.25);
  big signs (EMERGENCY, ST MERCY HOSPITAL, OUTPATIENTS, ER, the atrium's ST MERCY) are painted
  on a 4-texel grid (`z2BigSign`: whole letters at every level; EMERGENCY as a 2-texel neon tube
  with a hot core, halo and spill). The bay: a storm panorama on a sphere band up to 50° with the
  overcast deck's top row capping the dome (`z2SkyDome`): billow heads lit from the upper left,
  moon-lit rims, fire-lit undersides over the fires, mammatus, rain curtains, smoke columns from
  the burning city (`Z2_FIRES` shared by sky and city), two city layers (towers with setbacks,
  spires, cranes, water towers, burning tops; a nearer roof layer with parallax); wet asphalt
  with no big shapes in the repeat (grit, sealed cracks, cut patches) and the history placed by
  rule (patches, oil, manholes, a skid, drains), animated puddles mirroring the nearest light
  (`z2PuddleTile`, one anim material), neon shimmer on the wet ground, additive stepped light
  pools (all of a zone in one mesh: the canopy's red neon, every lit troffer's pool on the floor
  below, the atrium pool's red glow, moonlight under the shafts); facade string courses,
  downpipes, dead creeper, window reveals / dark-room interiors / shards; the tall worn
  AMBULANCE road stencil. Walls by material preset and colour (glazed wainscots, the OR's calm
  glaze, painted plaster in low-contrast clusters with the grime placed by rule: ceiling-line
  dribbles, mop splash, stains, ghosts…), floors (VCT, sheet vinyl, 50 cm quarry tile with a
  one-step grout, soft-veined marble, terrazzo with dark strips, concrete), ceilings with
  troffers, holes with insulation and cables hanging out; side rooms show a moonlit window.
  Painted over unchanged geometry: the hub's fire doors, the gas / oxygen cylinders (on their own
  triangles: same hit boxes), the boiler wall's blocks (wall face + broken core) and boards
  nailed over its KEEP OUT, autopsy pedestals, canopy pillars / hazard collars / bollards / lamp
  posts (cylinder tiles wrapped round the turn), the fountain's coping (torus u/v) with flesh
  spilling over it. The atrium: bold glowing veins (0.6–1 m ribbons, pustule clusters), glass
  balustrade bays (mostly clean; cracks, smears, a missing pane), elevator bank, directory,
  stopped clock, café front, anniversary banners, sconces on every level, lit doorways, office
  windows, its paint a step brighter (×1.3). Moon shafts as stepped rays (`d1ShaftMaterial`).
  Breakable doors are re-painted in place (same triangles: same hit boxes). Still classic
  (re-textured only): gurney / bed / table frames, the surgical lamp, pipes and cable trays,
  benches, pendant lamps, the cocoon, glass, light bars, FX. Budgets: world atlas 2048×688
  (7.2 MB with mips) + sky 1024×416 (1.6 MB); paint ≈ 96 ms world (incl. 2.5 ms calm levels) +
  25 ms sky ≈ 121 ms (node, min of 12, load ≈ 10; the storm painter is ≈ 20 ms of it); ≤ 109
  draw calls at the heaviest beat (the bay; PIXEL CAST 162). Checks: `tests/unit/pixel-world-z2.test.ts` (budget, occluders, ground, set
  pieces, destructibles' hit rays, the boiler wall's blocks, RNG, full-stage simulator in both
  styles).
- **z3 HIGHWAY TO HELL** (converted end to end; `stages/z3/pixel.ts` = `Z3PixelWorld`, the
  painted parts `stages/z3/pwRoad.ts`, `pwRoadside.ts`, `pwVehicles.ts`, `pwTrucks.ts`,
  `pwStructures.ts`, `pwBuildings.ts`, `pwShapes.ts`, `pwRock.ts`; painters `pixelworld/z3road.ts`,
  `z3roadside.ts`, `z3cars.ts`, `z3trucks.ts`, `z3structures.ts`, `z3buildings.ts`,
  `z3bay.ts`, `z3sky.ts`, `z3fx.ts`, `z3truck.ts`, `z3kit.ts`, `z3levels.ts`, `z3beam.ts`). The builders only RECORD
  (`userData.pw` = kind + data; `addText` glyphs `pwText`), so CLASSIC and PIXEL CAST are
  byte-identical (scene signature); every chunk / landmark is converted before its `bake(g)`
  and the dynamic set pieces (blocker, overpass car, burnt cars, tanker, tanker halves, gate)
  are painted by env.ts hooks (`pw?.dyn…`). Road: per-strip ribbons along the rail (one
  256 × 256 lane tile, two variants side by side, the oncoming lanes on the other half;
  shoulders with rumble grooves and blown sand, the median), cut-out line ribbons, decals by
  rule per stretch (skids, oil, potholes, debris) and at the wrecks (scorch, blood, glass,
  the wet fuel slick). Jersey barriers as their real profile, W-beam rails, cobra-head light
  poles, utility poles with crossarms and transformers, road flares (stick, flame cap, glow
  pool), cars (a neutral paint layer tinted per car, its darkest paints lifted to a readable
  value, on a profiled body: chamfered nose / tail per kind, wheel arches, a cut-out
  greenhouse, door mirrors; + a detail layer: screens, grille, lamps, wheels, open doors,
  police livery; burnt wrecks in mid-value ash / rust / primer with see-through window holes,
  seat backs and springs, never a black slab), the semi (deflector, marker lamps, visor,
  mirrors) / reefer / bus / tanker (FLAMMABLE band, placards) / army truck (sagging canvas
  with rope ties and a unit stencil) / tank, the overpass (fascia, soffit, piers, riprap,
  railing), highway signs, the gantry and bridge trusses as open cut-out lattices, sound walls
  with graffiti, houses (siding, gables, shingles, chimneys, burning windows with soot plumes,
  corner boards, gutters, porches, antennas, picket fences), the gas station, warehouses
  (grime runs, company names, open bays), the motel (walkway, railing, neon MOTEL /
  VACANCY), billboard posters (REPENT, BURGER BARN, motel), the tunnel (enamel panels, SOS
  markers, fans, painted light strips, the ROUTE 9 portal), the red suspension bridge
  (fluted, riveted tower cells banded by grime at the foot and the deck, caged ladders,
  A / B stencils; cables with band clamps; lamps), the bay (animated water fogging to its own
  dusk violet, a freighter), the barricade (pillow sandbags with ties, chain-link gate with
  KEEP OUT, hazard posts, floodlights). Rock: the ridge the tunnel bores through and the
  shore rocks are re-shaped (`craggyLump`: visual only, the classic lump says where) as
  stepped buttes — 2–3.6 m beds with ledges wandering in and out, gullies through every bed,
  a broken boulder crown, lit ledge tops / mid faces / dark undersides and a damp toe; scrub
  and dead trees on the ledges as flora billboards; the crown over the bore keeps a rounded
  underside. From the bridge (camera past the barricade) a painted mesa ridge layer
  (`z3RidgeTile`: hoodoos, beds, buttresses, varnish, a mast with a red beacon, the ROUTE 9
  portal) replaces the far portal geometry, which hides. Signs: sign painters mark their ink
  (`z3Ink`); `z3InkLevels` re-makes those tiles' levels so a 2×2 with two ink texels stays
  ink (a real letter colour), glyph origins snap to the level grid (`z3SnapGlyph`), and sign
  tiles draw on their own material group with a level bias of `Z3_SIGN_BIAS` = 0.25 (sign-fit
  check). Haze: buildings and rock fog to their own capped dusk colours (`hazeMaterial`), so
  far warehouses / motel wash out instead of going pink. Fires are animated pixel flame strips
  (their own detached-tongue tile) and pixel smoke puffs (`Z3FxAtlas`, six variants: dense
  cores low, holed wisps and sheared tops high, soot → grey-brown → lilac by height, only the
  seven nearest fires smoke); the sky plumes the same puffs. Searchlights: `z3BeamGeometry` /
  `z3BeamMaterial`, one strip per beam turned round its axis in the vertex shader, four
  stepped bands Bayer-dithered in screen space, stepped fade along, gone when the camera is in
  its foot. Sky: `PwBackdrop` dusk panorama painted into the canvas (dithered bands warming
  toward the sun and reddening over the burning city, continuous 2-row cloud dashes, cloud
  banks with lit bellies, towering cumulus with a glowing flank, smoke columns spreading into
  a pall, the sun setting into a saddle of the hills, moon, crows) + dry hills with masts /
  water towers + the burning skyline panel at the city's azimuth (a dark shoreline, separate
  fires with halos, lamps, reflections). The pickup view model on its own atlas at 48 texels a
  metre. The tanker keeps its classic hit meshes (material hidden, object visible: still
  shootable) under the painted tank, whose meshes are detached while the destructible
  registers. Budgets: world atlas 2048×928 (9.7 MB with mips) + sky 2048×464 (3.6 MB, one
  level) + fx 0.6 MB + pickup 0.3 MB = ≈ 14.1 MB; paint ≈ 100 ms world (+ ≈ 2 ms warm for the ink
  levels) + ≈ 20 ms sky (warm atlas rebuild, node, best of 5; 97–142 ms world over three runs
  on a shared, loaded 4-core box, where the pre-R2 HEAD measured 101–116 ms); draw calls 34–65
  a beat (PIXEL CAST 39–88). Checks: `tests/unit/pixel-world-z3.test.ts` (budget, PW meshes never occluders /
  raycast, occluders, ground, set pieces, tanker hit boxes and shootables, RNG, sign fit,
  full-stage simulator in both styles), `D1_SIG=1 D1_SIG_STAGE=z3 … d1-sig.test.ts`,
  `z3-lab.test.ts` (atlas dumps, paint benches). Still classic: wires, police light-bar
  glows, generic FX particles (`fx/Particles.ts`: the dithered smoke over burning
  destructibles).
- **d2 RESEARCH LABS** (interior, d2/bake.ts recipes): lobby (terrazzo, reception desk,
  park logo signage as `paintedSign`), shop (shelves of goods modules), kitchen
  (`tilesTile` walls, steel counters), server room (rack modules with glow LEDs),
  greenhouse (glass roof grid, planters), hatchery, containment wing (hazard stripes,
  `grateTile` floors, warning signs), tunnels (`pipesTile`, concrete, steam vents
  classic). Convert per room before `bake()`.
- **d3 TYRANT CHASE** (converted end to end, R2; `stages/d3/pixel.ts` = `D3PixelWorld`, the
  jeep `stages/d3/jeepPixel.ts`; painters `pixelworld/d3Ground.ts`, `d3Sky.ts`, `d3Park.ts`,
  `d3Visitor.ts`, `d3Vehicles.ts`, `d3Bridge.ts`, `d3Jeep.ts`). env.ts hooks (`this.pw?.…`)
  paint each piece before its `Baker.bake` and strip the classic meshes they replace; the
  Baker keeps its packed 20 B vertices (`baker.pixel` only tells the jeep to paint). Ground:
  terrain as ONE planar batch (floor sward / mud / gorge strata `d3RockTile` / river bed,
  tinted per vertex from the classic colours), the road per 60 m chunk (`d3RoadTile` 8 × 10 m:
  wear patches with lobed outlines, tar snakes, pothole, chipped dashes; `d3VergeTile`;
  `d3MudRoadTile`), animated puddles / pools / river (`d3PuddleDecal`: deep water darker than
  the ground, a wet rim, the sky caught in broken unlit reflection streaks, rain rings),
  footprints, skids; boulders as FLORA-style billboards (`stones`). Panorama (`d3Sky.ts`): the
  sky band is the FOG colour up to 7° then the classic dome's darker steps, every seam a Bayer
  transition; storm heaps built from overlapping lobes + cauliflower bumps (each texel owned
  by its front-most part), shaded as a whole heap (lit up and toward the moon, shadowed below)
  with lobe crests and a shadow step above each, thick moonlit rims only on exposed tops,
  rain-fed ragged bases, rain shafts, torn scud; heaps above 10° stay mid-toned (no dark
  contours: pteros keep their silhouette). Two jungle ridges (`d3RangeTile`: back row of big
  crowns a haze step lighter, the hill, a front row of ragged crowns, palms with drooping
  feathered fronds; ramps capped so nothing is lighter than the fog, the foot dithered into
  it). Flash: the ranges' material colour = live fog / base fog per channel, the sky band's
  material (`d3SkyMaterial`) blends that ratio (below 7°) to the clouds' flash gain (above
  15°) — the horizon brightens exactly as the fogged scenery does. Bolts: painted glow forks
  (`Storm.usePixelSky`). Pylons (rust-streaked faces, insulators, hazard feet, vines); snapped
  stumps (`d3StumpFaceModule`: darker concrete, jagged cut-out break with rebar, cracks, spall,
  the hazard band square on the foot, scorch, rubble billboards); wire spans as cut-outs,
  DANGER boards, utility poles, lamp posts. Signs (`d3SignBoardModule`, `d3DangerBoardModule`)
  are painted at the CLASSIC letter size with 4-texel strokes on a 4-texel grid from the tile's
  bottom (whole letters at levels 1–2), cream on calmed grain with a drop shadow, on their own
  per-chunk batches with the sign material (level bias −0.25); `D3_SIGN_FITS` records every
  layout (the identity test checks the fit). The visitor centre: stucco with rain-stain bands
  under the cornices and a damp splashed foot, lit windows as rooms (half-drawn blind,
  lamp-lit back wall in dithered steps, shelf / toppled stand / hanging sign in silhouette, a
  warm sill and a dim pool on the floor), the atrium's gallery seen through two panes (small
  dim lamp pools, balustrade, GIFTS board), the park map and an EVACUATION notice, claw
  gouges, ragged 1 m thatch fringe, fronds over the eaves, the bulb marquee (dead bulbs only
  inside words, on wide letters; it stays on the default level bias: its bulbs merge into
  strokes at level 1), floodheads with lens glow, the kiosk's recessed lit booth under a
  2-texel TICKETS board; plaza pavers and the bridge deck get calm far levels (`d2CalmLevels`).
  Roadblock (tour car, sawhorses, palm log, drums), flame cards (`d3FireModule`, two variants
  alternating so neighbouring tongues never match: teardrop tongues varying per frame, yellow
  tips, an ember foot). Mud truck (windscreen with a sky band, wiper fans and rain beads, mud
  fanned over the arch, a bent bumper card). Bridge: wide single-tone planks with soft 2-texel
  seams on the calm-level material (bias 1.5, deck faces split into their own batch). Helipad,
  helicopter (clean livery `d3LiveryTile` with oil runs — no rust confetti —, the nose in
  profile `d3HeliNoseModule`, exhaust soot, a rotor blur disc shown above a spin rate), fuel
  tank. Jeep: tubes (roll hoop, bull bars) painted round as tubes (`d3TubeTile`), the cabin's
  door frame / struts as bevelled bars (`d3BarTile`, laid 16 texels across each face), the
  sill's 8-texel hazard bands, the hood's one marking RANGER 12 in 2- / 4-texel strokes (no
  emblem on the hood; the emblem is on the doors). Boss road: crossing print trails, skids,
  four flares in the verges (a stick, an upright plume, a 2-step dim pool; one dying orange),
  the old paddock fence along both treelines (`d3TornFenceModule`, torn spans), an
  overturned tour car in the verge, a fallen lamp, a leaning pole with sagging wires, EVACUATE
  boards facing the reverse camera. Occluders (visitor-centre shell, roadblock car) stay the
  classic meshes, hidden and out of the fog-cull list; drums and the tank keep their classic
  hit meshes with an invisible material under the painted ones. Budgets: world atlas 1024×1056
  (5.5 MB with mips) + sky 2048×352 (2.75 MB, one level) + jeep 256×256 (0.33 MB), 8.6 MB in
  all; paint ≈ 76–90 ms world + ≈ 29–37 ms sky + ≈ 4 ms jeep (node CPU time, best of 5, the
  minimum over runs on a shared 4-core box at load 5–10: ≈ 109–120 ms all three; single runs
  beside other agents' captures 138–226 ms; the world's tile painters ≈ 55 ms of it, the rest
  the shared resolve / pack / mip pass); draw calls 31–79 a beat (PIXEL CAST 31–73). Checks:
  `tests/unit/pixel-world-d3.test.ts` (occluders, hit proxies, entities, ground, RNG, painted
  props not hit boxes, sign fits, budget, full-stage simulator), `D1_SIG=1 D1_SIG_STAGE=d3 …
  d1-sig.test.ts` (CLASSIC / PIXEL CAST scene signature), `d3-lab.test.ts` (atlas dumps,
  `D3_CPU=1` CPU time of all three atlases best of 5, `D3_BENCH=1` per tile). Still classic:
  swaying vegetation (the FLORA billboards of PIXEL CAST), the helipad edge lights, the jeep's
  glass / lamps, FX.

### Round 5 (review fixes, PIXEL WORLD only unless noted)

- **z1 painted smoke** (`FirePlume` puffs): a smoke particle's FIRST life is a stagger (`life`
  0…4 s against `max` 1, unmoving at the origin) — `k = life / max` up to 4 made negative ages:
  40–176 m red-orange squares in the sky at the stage start and a full-screen orange wall at
  the gas-station inferno. Billows are now drawn only from spawned particles; before its first
  spawn a billow is hidden (a fire ignited in play: the column builds up) or, for a fire burning
  since the stage began (`active` never cleared before the first update), drawn as a pre-rolled
  billow of a standing column (hashed position, no RNG). Age / fade clamped. The classic points
  are untouched (`tests/unit/z1-smoke.test.ts`: scale ≤ 3.1 × the fire, colours in [0, 1],
  classic arrays identical with and without the billows).
- **z1 overturned bus**: the rear's emergency-door opening shows the inside once the door is
  blown (one-point perspective: seat backs in rows down the aisle, window bays — moonlit on the
  side to the sky, dark on the road side — ceiling ribs, ribbed flooring, the windscreen at the
  far end lit orange by the engine fire), round it a rubber seal, hinge strip, tail lamps,
  rust runs and a dented bumper (`z1bus.ts` `paintRear`).
- **z2 boiler-wall burst**: each block flies as broken masonry — `burstWall` swaps in a chunk
  painted at load (`Z2PixelWorld.wallChunk`: two convex halves either side of a slanted crack,
  corners chipped at uneven depths, the wall's painted face front and back, the rubble core on
  every break). Flyer RNG, velocities and floor rest untouched.
- **d2 skeleton collapse**: the skull falls as three crossed painted cut-outs in its own frame
  (profile with the hanging jaw, top, back: `d2skull.ts`) — openings cut out, tooth rows,
  fossil-cast bone lit upper left — instead of its box stack (`SkeletonDisplay.skullHolder`).
- **d2 kitchen**: stainless counter tops (a stepped diagonal sheen band, brushed streaks, food
  stains, knife scratches) with a lit edge over a dark lip; grimy grout and grease spatter on
  the splash-back, fallen tiles showing the adhesive comb; utensil rails and shelves of stores
  over the ovens / sinks; more clutter cards (mixer and plates, mugs) on the islands and wall
  counters; floor drains, grease trodden out from the ranges; stepped additive light pools
  under the troffers (the failing one dark).
- **d3 puddles**: calm dark water (two lit tones, no unlit texels), reflection dashes 2 rows in
  12 lit at tone ≤ 2.2 (they brighten with the lightning), ≤ 3 rain rings as 2-texel arcs on
  the near half; their own material with levels a step early (`bias 1`); half the road puddles
  (by hash: the classic draws unchanged), five of the nine mud-stretch pools. The rain splash
  rings dim to storm blue (opacity 0.26) so the telegraph rings stay the only bright ellipses.
- **d3 mud-hold truck**: a sun visor, an amber beacon, mirrors out on arms, rubber fender arches
  over every wheel, mud flaps, rounded front corners in the cab front module.
- **Every ART**: the first-draw hitch fixed by linking programs behind the card (see *Stage
  loading*); rescued civilians never walk into the lens (see *Civilians*).

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

PIXEL WORLD loads (`Game.loadingTick`, one step a frame, all behind the intro card or the
pressed RETRY / RESTART screen — never in play):
1. `pwStorePrefetch(stage.id)` (started with the card) brings the stage's stored atlases in;
   the build waits for it (≤ 1.5 s, `LOAD_STORE_WAIT_MS`).
2. The world builds with `pwDeferPaint(true)`: atlases are laid out, meshes built, painting
   queued (a cached / stored atlas queues nothing).
3. `pwPaintStep` paints a slice a frame — 14 ms while the card animates, 45 ms once it has
   run out (`LOAD_PAINT_SLICE_MS` / `LOAD_PAINT_RUSH_MS`); a step is one tile (the biggest,
   a 2048-wide sky band, ≈ 60–140 ms on this box cold).
4. `pwStoreFlush(1)` hands each freshly painted atlas to the store, one a frame.
5. Shader warm-up (`warmUp`, its own frame): every program the stage will need is compiled
   and every live PixelWorld texture is uploaded (`renderer.initTexture`) — a set piece's
   atlas never uploads the first time it comes into view.
6. `linkSlice` (every ART): `compile()` only CREATES the programs; the driver finishes one
   (SwiftShader / ANGLE: the link) the first time it is queried, which three.js does on its
   first draw — that was the 0.2–0.5 s freeze when the first character painted a few seconds
   into a stage. Each never-used program is queried here (`getUniforms()`), a slice a frame
   (14 / 45 ms like the paint); with KHR_parallel_shader_compile a program still compiling in
   the background waits for a later frame (up to 1.5 s, then it is forced).
7. `finishLoading`: the first render, then play (or the card).
A world still loading is never drawn (in every ART): the card stays over the last frame on the
canvas (the title's), so no half-painted scenery shows through it and the build's frame does
not also compile every shader. If the card's 2.8 s run out (or it is tapped) before the load is
done, it stays up saying LOADING... until play can begin (`showStageIntro`'s `onDone` returns
false). The title's painted scenery is freed when a stage builds (`MenuBackdrop.release`). The
attract demo builds at once (the store was read before it started: `startDemo` waits for it;
the title's atlases stay cached beside the demo stage's) and paints during its opening black
cut. `Game.lastLoad` records build / paint (+ frames) / store / warm-up / link (+ frames) /
render / total ms (`scripts/load-bench.mjs`).

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

`?stage=z1` jump into a stage · `&art=3d|sprites|pixel` ART: CLASSIC / PIXEL CAST / PIXEL WORLD (default) ·
`&pwstore=<tag>` persist painted atlases on the dev server (version `dev-<tag>`; `0` = off) ·
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
- Title backdrop (`ui/MenuBackdrop.ts`): two vignettes, the rainy night street and the
  sunset jungle road, cut every 10 s. In PIXEL WORLD they are built from the PixelWorld
  toolkit (`ui/menuPixel.ts`: `MenuPwCity`, `MenuPwJungle`) from the SAME layout calls (the
  classic batches are still filled with the same draws, just not shown): brick / plaster
  facades with painted windows (the classic window draw picks the kind: lit rooms, dark
  panes, blinds, a broken or boarded one), shopfront bays, cornices, awnings, the neon BAR
  sign, wet asphalt with worn lane paint, slab sidewalks and curbs, the cars in z1's painted
  car modules, painted night sky and skyline; a painted dusk sky, jungle ranges and the
  smoking volcano panel, jungle floor, dirt track, the plants as FLORA billboards (d1 species),
  the crag in painted rock; fire as z1's flame strips and smoke as z3's painted billows; soft
  glows / mist re-stepped (`steppedTexture`: 3–4 alpha steps, ordered dither, nearest). The
  scenery follows ART at cuts only. Atlases `menu-…` (≈ 6–8 MB per vignette) are read from
  the store at boot (the opening black waits ≤ 1.2 s), painted in slices while the shot holds
  black (10 ms a frame), the other vignette built under the same black and painted behind the
  first (3 ms a frame); their resources belong to the backdrop (`Kit.untrack`), so stage
  teardowns don't dispose them, and stage loads never cancel their paint (`pwMenuAtlas`).
  A stage build frees them (`release()`: GPU textures and CPU copies, ≈ 14 MB); back on the
  menus they come back from the store under the opening black (≈ 0.1 s).

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
