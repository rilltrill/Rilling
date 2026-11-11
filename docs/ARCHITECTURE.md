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

### PIXEL CAST 2 — the cel look (`castlook=b`, `gameplay/pixel/look.ts`)

The cast brief of docs/PIXELWORLD2.md §9: characters DRAWN flat and 2D so they sit in front
of painted pixel backgrounds. It REPLACES the style guide's *Light*, *Outlines*, *Palette
steps* and *Anatomy* wording above (contour shading from the blended field's normal, dither
bands, a multiplied stage tint); alignment, budgets, allocation and animation rules stay word
for word. Two looks exist, switchable live on the same frozen instant:

| `castlook` | |
|---|---|
| `0` CONTOUR | the first PIXEL CAST look: the legacy shaders and painters, pixel-identical (raw texels) to before this work — the saved version |
| `b` CEL | the look under work (round one's presets A and C are retired; their grafts are in B) |

Select: URL `&castlook=`, `window.__castLook('b')` (SpriteArt repaints every sprite), node
tests `CASTLOOK=b npx vitest run …` (read once in `look.ts`); `DEFAULT_CAST_LOOK` is what
runs with no flag (today `'0'`: flip it when every painter is redrawn). `PixelFigure.cel`
(`> 0` in the cel look) tells a painter which look a frame is painted for.

**The rules of the look** (what a painter must do; the humanoid, `content/pixel/humanCel.ts`,
is the worked example):

1. **Anatomy as silhouette, filled flat.** Shapes are the drawn outline of the form, never a
   jointed mannequin of boxes and constant-width strips: shoulders slope from the neck, a trunk
   is ONE shape chest → waist → hip (elliptical `coneE` segments with `PF.CUT_*` at the
   shoulder line and the hem, small blend `k` ≈ 1 cm), limbs swell and taper (deltoid → elbow
   corner → forearm swell → thin wrist; thigh → knee corner → calf behind → ankle). Corners
   only where cloth has them (collars, lapels, cuffs, hems, heels, hair: `tri`, `triDecal`,
   `PF.CUT_A / CUT_B`). A cut end seen end-on keeps its round cap (`layout` stores the
   foreshortening; `coneE` stores the end section's own share), so a sleeve or a trunk
   pointing at the camera still covers its hitbox.
2. **Three tones, as designed shapes.** A material shows its base (ramp step 3), ONE shadow
   step (2) and small light shapes (4); step 1 only in deep recesses, step 5 only as a
   highlight on what shines. Nothing follows a surface normal, nothing is dithered.
   - Switch the automatic band off for what you draw: `f.autoBand = false` (every primitive
     added then carries `PF.NO_BAND`; restore it round callbacks of painters not yet redrawn).
     The band — a strip on the side away from the light, ONE width along a primitive
     (`style.band` × its mean radius, none under 2.5 texels) — remains for big simple forms.
   - Far-side limbs are a whole step down: `f.layer(k, part, -0.1)`.
   - Shadow shapes are painter-drawn decals: `.flag(PF.SHADE_ONLY).tone(-1)` (a shadow shape:
     it JOINS the cast shadows, never stacks on them), `.tone(-1.2)` (a deep recess), on
     `decal` or `triDecal`. Build them on the joints so they are stable from redraw to redraw:
     `f.sideOf(a, b, r)` is the offset from the axis a → b to the silhouette on the side AWAY
     from the sprite light (right of an upright limb, the underside of one that juts out;
     `f.shadeDir` is that direction in world space). The humanoid's vocabulary: the trunk's
     away side from armpit to hem with a diagonal inner edge, a V under the chin, the hem's
     shadow on the hips; on limbs a wedge that is WIDE AT A JOINT and runs out along the limb
     (out of the armpit, the elbow's fold, the crotch, the knee) — never a stripe of one width
     — and the limb on the body's away side takes the bigger wedge; the cheek and jaw away
     from the light; the away side of the hair.
   - Cast shadows come from the resolve pass: a nearer layer between a texel and the light
     shades it (reach 1–4 texels by figure size): the chin on the neck, an arm on the chest, a
     coat on the thighs. Put parts that should cast on their own layer.
   - Light shapes: `.flag(PF.SHADE_ONLY).tone(0.2)` — one step up in the material's OWN ramp,
     on planes that face the light (shoulder top, chest plane, the lit side of the forward
     thigh and forearm, a jagged shine on hair, the crown of a hat). A light shape never
     survives inside a shadow; small figures drop them.
   - Tone biases are whole steps and never ladders: |tone| < 0.5 is ONE step, ≥ 0.5 two.
     Shade-only decals are kept apart from material decals, so a shadow shape lies OVER a tie
     or a badge; of two shade decals on a texel the later one wins, except that a drawn shadow
     shape is never erased (a later crease deepens it).
3. **Ramps** (`materials.ts` `celRamp`, the cel table `materialTableCel`): every `Mat.*`
   material carries a cel family (`cel:`) and gets its cel ramp from its base colour: shadows
   shift toward violet on EVERY ramp (oranges through crimson, yellows and greens through
   teal — never to orange-brown), lights toward warm; `dead` skin is pulled to a dull
   grey-green so no dead face shares a living hue; `cloth` / `hair` / `leather` darker than
   OKLab L 0.38 are lifted to a blue-grey (L ≈ 0.33) with a clear light step, and flagged
   DARK: their interior lines are drawn LIGHTER than the fill. Chroma gain is baked in
   (cloth × 1.15); materials with no family keep their legacy ramp, a step more saturated.
   Look `0` reads the legacy table: its colours never change.
4. **Line.** Dark coloured ink (ramp step 0 × `style.ink` 0.5, pushed violet) on the WHOLE
   silhouette of every material, pale ones included — no selective outline. Interior lines a
   step from the local tone (lighter than the fill on dark materials): seams where two
   materials meet on a part, part lines between layers at the same depth, inner contours
   where a layer overlaps a farther one — full ink there on figures ≥ 110 px tall. Full ink
   round every glowing texel (weak points, eye pins). 1-texel runs are never inked; of a
   2-texel run only the texel away from the light is ink. A decal flagged `NO_OUTLINE` (a
   face stamp, a button) still takes the silhouette's ink at the figure's edge.
5. **Stage light** (`CAST_STAGE_LIGHT[stageId]`, a small named table per stage, fallback DAY /
   NIGHT by fog darkness — to be matched to the PIXEL WORLD 2 light model): `step` (whole
   tone steps for the whole figure: −1 at night), `floor` (a material whose base is under this
   display luma does not step down: dark clothes never sink below the road), `accent` /
   `accentAmount` / `accentDir` (short light strokes one texel inside the top edges of the
   figure's OUTER HULL that face a strong coloured source — head, shoulders, a raised arm;
   0 = none; never a rim down a limb), `ground` / `groundAlpha` / `skirt` (contact shadow),
   `fog`. No multiplied tint.
6. **Faces, hands, gore are drawn.** Faces are stamps in four size classes (`CEL_STAMP`,
   `celSize`), one texel per cell, in front / three-quarter view (the far eye is dropped
   before it reaches the cheek's edge), in PROFILE (one eye set back on the cheek, the mouth
   a dark wedge in the face's edge, an ear, a jaw line) and from behind (hair with a shape,
   ears, a nape, lock lines). The dead: sockets, a glowing pin, teeth, a jaw that drops, an
   edged rot patch. The living: brows and dark pupils; eye whites only from size M (a lone
   white pixel on a small face reads as a glowing pin). Hands are stamps at EVERY size
   (`STAMP.hand` 5 and 7 cells, `CEL_HAND` ≈ 10 / 12 / 16 cells; the dead's 10 % bigger).
   Gore is designed two-tone shapes seeded from the look (never the world RNG), a few per
   zombie, placed beside the costume's reads: `stain` (a dark-rimmed blob, a wet body, a
   run and a bead), `wound` (a dark gash, wet meat, a glint, torn points), `rot` (a lobed
   patch in the skin's own ramp with a darker edge). Never noise, never the same mark on both
   legs.
7. **A costume tells who they were, from the front AND from behind**: 4–6 drawn details per
   outfit (`costume()`: office, doctor / lab coat, worker, nurse, flannel, ranger, cop,
   patient, soldier, biker, casual), plus what shows from the side (shoulder patches, belt
   pouches, a tool pouch, a wristband).
8. **Size tiers** (`lod` from the figure's height in texels): under ~70 px two tones, the big
   reads only, no interior seam lines, a lighter ink, no spikes; from ~150 px fold strokes,
   stitching and small marks. Order optional detail last and stay under 160 primitives.
9. **Shaped, not boxed**: armour, aprons and plates get curved edges, rivets, straps and
   dents; no pattern may read as dither (the cel paint pass draws WEAVE / DENIM / ROT /
   SCALES / GOWN / PLATE as flat fields; PLAID, CAMO, STRIPES, SPOTS, RIBS and MEAT stay as
   designed marks).

**Engine** (`PixelCast.ts`; look `0` runs the untouched legacy passes):
- **Paint pass** (`PAINT_FRAG` compiled with `CEL`): no light. Writes the material, a
  whole-step tone offset and the automatic band's width. Tone byte = `[band:3][absolute:1]
  [value:3]` (band 7 = a drawn shadow shape; stamps keep their authored absolute steps, a
  shadow shape lowers them by one). Flag nibble: 1 glow, 2 never outlined, 4 pattern mark,
  8 painted by a decal.
- **Resolve pass** (`RESOLVE_CEL_FRAG`): shadow = drawn shape ∪ cast shadow ∪ band probe (all
  one tone, one hard edge), lines as rule 4, highlight accent one texel inside the lit edge
  of a material with `spec > 0.45`, stage step and floor, light accents, fog. ≤ 14 texel
  fetches a texel, as before. Still 2 draws per redraw.
- **Figure API** (additive; unused by the legacy painters): `PF.CUT_A / CUT_B`, `PF.NO_BAND`,
  `autoBand`, `shadeDir`, `sideOf(a, b, r)`, `triDecal(a, b, c, mat)`, `.bulge(m)`.
- **Contact shadow** (`SHADOW_FRAG`): a flat hard-edged ellipse in the stage's deepest shadow
  colour that SHRINKS as the figure leaves the ground or dies (it never pops or fades as a
  translucent disc; a dying body keeps the shadow it stood on); on wet-ground stages
  (`skirt`) a standing figure's shadow ends in a skirt of broken horizontal dashes.

**Adopting the look in another painter** (specials, dinosaurs, bosses, props): (1) give its
materials a cel family if they are built outside `Mat.*`; (2) `f.autoBand = false` and draw
the shadow shapes with `sideOf` + `SHADE_ONLY` `tone(-1)` wedges, far limbs at layer tone
−0.1, 2–4 light shapes; (3) cut the melt radius `k`, add corners; (4) replace noise marks
with designed shapes, ring weak points with nothing — the resolve pass inks them; (5) check
`CASTLOOK=b` on the nine pixel / sprite / civilian test files, `scripts/pixel-aim.mjs
--extra "&castlook=b"`, a `scripts/cast-look.mjs` sheet in four views and three sizes, and
an in-scene art frame by night.

- **Tools**: `scripts/cast-look.mjs` (raw-texel sheets, rows = subjects, columns = looks, from
  `--place` on the zoo or `--shot stage:beat:frames`; `--looks b --cols 4` lays the subjects
  out four to a row: one outfit per row, front / three-quarter / side / back; `--frames`
  saves the frame per look; civilians take `pose=cower|plead|flee|hide|backaway`),
  `scripts/cast-probe.mjs` (who is on screen when), `scripts/cast-scenes.sh` +
  `cast-sheet.py` (in-scene comparisons, art frame and phone view), `scripts/pixel-aim.mjs
  --extra "&castlook=b"`, `scripts/bench-art.mjs --extra`.

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
  `index()` gives the canvas as STORED TEXELS (16 bits: ramp, tone step, glow — never a
  colour; see *PIXEL WORLD 2 pipeline*), `resolve(pal)` the same through the palette as RGBA
  (look-dev, tests).
- **Atlas** (`atlas.ts`): tiles are REGISTERED while the stage builds (`atlas.tile(key, w,
  h, paint, { wrap })` → a handle; the same key returns the same tile), LAID OUT in `build()`
  (rects known at once: meshes can be built) and PAINTED — at once (tests, tools), or, when
  Game builds a stage behind its intro card (`pwDeferPaint(true)`), as a job of steps (one
  tile, or one tile's mip chain) that `pwPaintStep(ms)` runs a slice a frame; a texture made
  before the paint ends uploads once it does. Passes that re-make painted levels (d2 / z2 / d3
  calm levels, z3 ink levels, z1 flame coverage) register with `atlas.post(fn)` right after
  `build()`: they run when the paint ends. Deterministic either way, cached by tile list for
  the session (`pwCacheKeep` drops other stages' copies: one stage's worth of CPU data) and
  persisted (`store.ts`, below), packed into one INDEXED texture (two bytes a texel) with
  hand-made levels, beside a small palette texture (*PIXEL WORLD 2 pipeline*, below). Mips
  are palette-faithful: each texel of a level is a real texel of the four below it (the one
  nearest their average colour, within the class most of them share) — never a blend; glow
  wins ties and survives over cut-out, so neon, stars and lit windows keep reading at a
  distance. Texel classes: cut out (discarded), glow (unlit), lit. Rects are aligned so every
  level stays inside its own rect (`PW_ALIGN` = 16 painted texels); wrap tiles must be
  multiples of 16. `PW_STATS` holds size / bytes / paint ms / tiles stored at 2× / levels /
  ramps / cached / stored per atlas (`window.__pixelWorld`), `PW_PAINT_STATS` the longest
  single paint step.
- **Store** (`store.ts`): painted atlases persist in IndexedDB (`overrun-pixelworld`), one
  record per atlas NAME under `<version>|<name>` — `version` a hash of every source file
  (`__PW_VERSION__`, injected by vite.config.ts: any code change repaints once; other
  versions' records are deleted by key range when the store opens). A record holds the tile
  list it was painted for (checked on use), every indexed level after its `post()` passes,
  the palette, the rects and the texel format (`PW_FORMAT`: a record in another format is
  not used). Game opens the store at boot, `pwStorePrefetch(stageId)` reads a stage's records
  while its intro card paints (the build waits ≤ 1.5 s for it), and `pwStoreFlush(1)` hands
  freshly painted atlases over one a frame, still behind the card (the data is cloned at the
  call; the disk write runs in the background). No IndexedDB (node, a sandboxed frame), a
  blocked / slow open, a failed read or a full disk (QuotaExceededError: the store is cleared,
  writes stop for the session) — the game simply paints. The dev server keeps it off (its
  `define` would not follow edits): `&pwstore=<tag>` turns it on for benchmarks.
- **Material** (`material.ts`, `light.ts`): flat-shaded, lit by the stage's own lights (hemisphere,
  sun / moon, flashlight, lamps, muzzle flash: three.js's Lambert sum) — but the light does not
  multiply the paint: it moves each texel a whole number of tones along its palette row, tints
  it, fog comes in bands and the pixel reaches the screen as the palette colour it is (*PIXEL-ART
  LIGHT*, below; a `PwMood` per stage). The texel is fetched whole (`texelFetch` of the index;
  level = log2(texels per pixel) + bias, picked per texel axis): hard texels, the hand-made
  levels take over before anything crawls. Per vertex: the tile rect (`pwRect(tile)`: w < 0 =
  module, clamped; w > 0 = tileable, wrapped inside its rect; h < 0 = stored at 2×),
  PAINTED-texel UV (or PLANAR: projected world position, 24 B a vertex for big bakes), vertex
  colour (the tint of a NEUTRAL tile, multiplied after the palette lookup). `gain` scales the
  light a material gets (a brighter room); `anim` plays vertical strip tiles (water, flicker).
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

1. **Density**: the first pass painted world surfaces at `PW_TPM` = 32 texels a metre (≈ 1
   texel a retro pixel at 8 m), signs and modules at the same density; backdrops 2048 texels
   round. The second pass picks a tile's density from its nearest normal view (64 / 96 / 128:
   docs/PIXELWORLD2.md §3; what is still at 32 is stored at 2× by the upscaler, below).
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
   Light ON surfaces is the stage's lights through the ramp-step material (*PIXEL-ART LIGHT*:
   rings of whole tones, dithered edges), or painted into the tile as tone shifts; the first
   pass's pixel light pools (stepped rings blended over the surface: `pwPoolTexture`) keep
   working as `pwLightOverlay` materials (the lit pixels stay on whole colours).
7. **Horizons match the fog**: a backdrop's horizon band is the stage fog colour up to
   the elevation the fogged scenery reaches (fogged trees must sit on haze, not on blue).
   Backdrop paint and the fog colour both go through the monitor's tone curve (`pwFilmHex(hex)`
   is what either shows as); lit paint does not — it shows as painted.
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

| stage | PIXEL WORLD cold (build / paint in frames / total) | PIXEL WORLD warm total | PIXEL CAST cold / warm total |
|---|---|---|---|
| z1 | 553 / 496 ms in 30 / 2693 ms | 2124 ms | 2159 / 1795 ms |
| z2 | 550 / 332 in 16 / 2082 | 1819 | 1553 / 1429 |
| z3 | 681 / 348 in 19 / 2265 | 1843 | 1750 / 1215 |
| d1 | 1149 / 327 in 16 / 2542 | 2056 | 2497 / 1958 |
| d2 | 821 / 317 in 18 / 2098 | 1673 | 1515 / 1372 |
| d3 | 848 / 278 in 16 / 2195 | 1916 | 1861 / 1646 |

(Round 5. Totals include the new GPU settle — 0.4–1.0 s on SwiftShader, every ART — which
runs while the 2.8 s card is still up: every load above is ready before the card ends.)
With the CPU throttled 3× (a phone proxy, measured at 18e2190, before the settle step): z1 cold
3.4 s / warm 1.8 s, z3 3.8 / 2.0, d1 4.9 / 3.4 (d1's world build alone 2.7–2.9 s) — a
first-ever load may hold the card on LOADING... for up to ~2 s; later loads fit inside the card
except d1, whose build is the cost. Writes to the store cost 50–75 ms (one atlas a frame); reads
30–65 ms (≈ 15–25 MB, during the card). Longest single paint step 40–75 ms (a 2048-wide sky
band). The long task left under the card is the world build itself (as in PIXEL CAST).

**In play: no long task in either ART** (round 5, `load-bench.mjs --intro --warm 1 --play 6`,
all six stages, both ARTs, cold and warm: `playLong` empty in all 24 loads; the longest frame
gap in play 283 ms in PIXEL WORLD, i.e. ordinary SwiftShader frames). The reviewer's 0.2–0.55 s
frame a few seconds in, 50 % longer in PIXEL WORLD, had three parts, all now paid behind the card:
the first use of programs compiled at warm-up but never linked (`linkSlice`: 25–260 ms over a
few frames; a CPU profile of the old frame had `getProgramInfoLog` / `getUniforms` under
`onFirstUse` as 250 of its 300 ms), the character painter's first draw (`PixelCast.precompile`
now draws once), and the GPU's first pass over the new stage — every material and multi-MB atlas
sampled for the first time — which landed as a 0.4–0.7 s frame gap about a second after the
first render, on the first frames of play whenever the load finished late (the settle step
below now waits for it on a fence). Next steps: a Worker for the cold paint (painters are
DOM-free and node-safe), and splitting the world build itself (d1's 0.9–1.2 s, shared with
PIXEL CAST) over frames.

### PIXEL WORLD 2 pipeline (formats, density, the 2× fallback, tools)

The second pass over the environments (art direction: `docs/PIXELWORLD2.md`) needs every
texel drawn at about one frame pixel and light that moves paint along its own ramp. This is
the plumbing for it; everything above (registering, painting, batches, re-texturing,
backdrops, the store, deferred paint) works as described, on new formats.

- **Stored texel = an index** (`PWI`, canvas.ts), 16 bits: bits 0–11 the ramp id (0 = cut
  out, 4095 ramps an atlas), 12–14 the painted tone (0…5), 15 glow. `PwCanvas.index()`
  resolves a canvas to it (tone rounded, or ordered-dithered where `PWF.DITHER`). The atlas
  texture is RG8 (low byte, high byte; `NoColorSpace`, nearest, the hand-made levels as
  mips), two bytes a texel. On the CPU a level is `{ data: Uint8Array, idx: Uint16Array }`
  over the same memory (`data` is what is uploaded and stored; little-endian hosts).
- **Palette texture** per atlas (`atlas.palette()`): RGBA8 sRGB, `PW_PAL_W` = 16 texels a
  row, row = ramp id. A row is the ramp EXTENDED (`extendRamp`): the six painted tones in
  columns 5…10 (`PW_PAL_DEEP` + tone), five deeper steps before them and five brighter
  after, by `makeRamp`'s recipe from the ramp's own colours — the deep end turns to
  blue-violet in even steps while its lightness sinks only to a deep indigo (0.10–0.17
  OKLab L: lighter for a light material; where a dark ramp has no lightness left the steps
  part by hue, never grey-black); the bright end climbs straight through the colour space
  to a warm white (#fdf6e3-ish, never #ffffff), gently where a capped ramp's top steps are
  small. A palette texture made while its atlas is still being painted (deferred loads) has
  all 4096 rows and is filled when the paint ends; otherwise it has exactly its rows.
- **Shader** (`PW_FETCH` in material.ts, shared by the lit material, the backdrop material,
  z2's billboards and z3's sprites): `pwTexel(ip, lv)` fetches the two bytes, rebuilds ramp /
  tone / glow (samplers declared `highp`), and looks the colour up at column 5 + tone —
  rgb = the painted colour, a = the class (0 cut, 0.5 glow, 1 lit) — leaving `pwRT` = (ramp,
  tone) for the lit materials, which look the colour up again at column 5 + tone + the light's
  steps (*PIXEL-ART LIGHT*, below: the extended columns are what light moves a texel through).
  Backdrops and sprites show the painted colour itself. Vertex tints multiply after the lookup.
- **Levels and the passes that re-make them** work on texels: `reduceRect` picks, per 2 × 2,
  the texel nearest the block's mean COLOUR (through the palette) within its majority class —
  the same choice as the RGBA version made. `pwTileLevel(d, tile, k)` gives level `k` of a
  tile at its PAINTED scale wherever the atlas keeps it (the calm / ink / flame passes of
  d2 · z2 · d3 / z3 / z1 use it: unchanged results); `pwLevelRgba(d, l)` a level as RGBA for
  dumps; `pwPalAt(texel)` the palette offset of a texel's painted colour.
- **Density** is per tile (`atlas.tile(key, w, h, paint, { density })`, PAINTED texels a
  metre; batches lay wrap tiles at it, modules are sized `tile.w / tile.density`). Tiers
  (docs/PIXELWORLD2.md §3): `PW_TPM_FAR` 32 (nearest normal view ≥ 6 m), `PW_TPM_MID` 64
  (3–6 m), `PW_TPM_NEAR` 96 (1.8–3 m), `PW_TPM_CLOSE` 128 (< 1.8 m); `pwDensityFor(metres)`.
  A tile registered at 64 or more is stored as painted; its wrap sizes must be multiples of
  32. An atlas holding any dense tile (native, or stored at 2×) carries one level more than
  its painted ones (6 for the default 5): rects are then aligned to 32 stored texels.
- **The 2× fallback**: a tile painted below 64 texels a metre is STORED AT 2× (`tile.scale`
  2) — level 0 is the pixel-art upscaler's copy, level 1 the texels exactly as painted, the
  rest the usual reduction of those. Nothing else changes: UVs, tile sizes and densities stay
  in painted texels; `pwRect(tile)` marks such a tile by a negative height and the shader
  doubles the coords at the fetch and picks the level for the stored texels (so the copy
  shows only where a painted texel would be drawn larger than √2 pixels; further away the
  frame is the first pass's, texel for texel — `pixel-world.test.ts` checks every painted
  level of every stage tile against a build without the fallback). Opt out per tile
  (`{ upscale: false }`: far-only tiles) or per atlas (`new PwAtlas(name, { upscale:
  false })`); one-level atlases (backdrops) are never upscaled. Animated strips pass
  `{ frames }` so each frame is smoothed on its own. Hand-built `pwRect` attributes must
  come from `pwRect(tile, wrap?)`.
- **The upscaler** (`upscale.ts`, on the painted canvas — ramp, fractional tone, flags —
  before it is resolved): shapes smoothed as EPX / Scale2x (a corner goes to its two
  neighbours when they are the same stored texel and the opposite ones differ); where such
  a corner lies between two tones of ONE ramp two or more steps apart it takes the tone in
  between (anti-aliasing; never across ramps, never on glow); cut-out corners are cut or
  filled whole; `PWF.DITHER` bands keep their fractional tone (carried a quarter of the way
  toward same-band neighbours) and are re-dithered on the 2× grid; a hand-made one-texel
  checker becomes the same checker at 2×. ≈ 65 ms for z1's 1.79 M painted texels.
- **Per-axis level pick** (`pwFetchAxes`, lit material only): the level is chosen for u and
  for v separately instead of once for the squeezed axis. On a plane seen at a grazing
  angle (a road, a corridor wall) the fetch is the finer of the two levels (at most two
  apart) and the 2 or 4 texels of the block the coarser one would have made of them along
  the squeezed axis are reduced in the shader the way levels are made (majority class,
  glow wins ties, the texel nearest their mean): texels stay at pixel size ACROSS the view
  instead of being drawn two to six pixels wide, and the pick is the same anywhere inside
  the block: it does not slide with the sample. Measured on a moving rail, the share of
  world pixels whose painted tone changes from one 1/60 s step to the next: z1 13.9 → 15.1 %,
  z2 12.5 → 11.8 %; d2's chequer floors 13.6 → 15.5–16.9 % — a fine regular pattern now
  shows further out instead of melting into its calm far level as soon as the view
  foreshortens it (`pwMaterial(atlas, { axes: false })` gives a material the old rule back).
  Costs up to 3 more texel fetches (and palette lookups) on such pixels, none elsewhere.
  Without it neither the 2× copy nor a natively dense tile shows on foreshortened planes at
  all. A material's `bias` still applies per axis: z2 / d2 keep their first-pass biases of
  1.0 (walls) and 1.5 (floors), i.e. texels of 1.4–2.8 pixels — lower them when those
  stages are repainted.
- **Flags**: `&pwup=0` (no 2× storage), `&pwaniso=0` (one level for both texel axes) and
  `&pwlight=0` (the first pass's light: palette colour × Lambert, smooth fog, the monitor's
  tone curve and dither) together give the first pass's frames from the new formats (the parity
  check: 7 of the 9 reference shots identical to the pixel, the other two within the run-to-run
  flicker of a lamp and a fire); `pwUpscale(on)` / `pwAxisLevels(on)` / `pwLight(on)` are read
  when tiles are registered / materials made. `&pwmood=pivot:0.4,shade:0x9a90e8` lays values
  over every stage's mood; `&pwrt=8` forces the 8-bit scene target (the fallback's test).
- **Debug views** (`core/debugView.ts`; `&pwdebug=mag|lvl|tone|ramp|steps|light|fog` compiles
  them in, `window.__pwDebug(view)` switches on the same frame): `mag` = frame pixels across the
  widest side of one stored texel (green ≤ 1.25, yellow ≤ 1.5, orange ≤ 2, red > 2), `lvl`
  = the same for the texel actually drawn (its level per axis), `tone` = the painted tone
  (0 blue … 5 orange, glow magenta), `ramp` = a hue per ramp id, `steps` = the tones the light
  moves each texel (violet ≤ −3, blue −2, cyan −1, green 0 = as painted, yellow +1, orange +2,
  red ≥ +3, glow white), `light` = the light before it is cut into steps (stops, −8 … +4 on the
  green channel: `scripts/pixel-mood.mjs` reads a stage's light levels back from it), `fog` =
  the fog band (magenta clear … blue all fog). View colours are written × 4096 into the float
  scene target and the monitor pass keeps only those pixels, at their own hue: the cast, classic
  scenery and backdrops are black, rain and light pools do not tint the view. FLORA billboards
  take part in `mag` / `lvl` only.
- **Audit** (`node scripts/pixel-audit.mjs --base <dev url> --out <dir> [--shots …]`; 24
  default shots: three views a stage and its boss): the exact 624 × 288 art frame, as drawn
  and in `mag` / `lvl`, on one frozen frame. Per shot: share of world pixels with a texel
  wider than 1.5 / 2 pixels (and > 2 in the middle 80 % of the frame), the same for the
  drawn texel, share of 16 × 16 world blocks that are flat (≤ 2 colours, or fewer than 12
  of 480 adjacent pairs more than two monitor steps apart), distinct colours, share of
  adjacent world pairs exactly one step of the monitor's 15-bit colour apart (smooth
  gradients, screen-door dither). Pass marks: > 1.5 ≤ 5 %, > 2 mid ≤ 1 %, flat ≤ 4 %, one-step
  pairs ≤ 20 %. Writes 3× PNGs (frame, views, flat blocks boxed) and a JSON. The first
  pass's numbers (`/tmp/pw2/audit-v1.json` when it was measured): > 1.5: 20.9 %, > 2 mid:
  6.3 %, drawn > 2: 37.1 %, flat 12.7 %, one-step pairs 65.1 %, 1293 colours (means of the
  24 shots). With the foundation alone (the same paint: the 2× fallback and the per-axis pick): > 1.5:
  6.4 %, > 2 mid: 1.0 %, drawn > 2: 7.0 %, flat 10.1 %, one-step pairs 63.9 %, 1325 colours
  (`/tmp/pw2/audit-found.json`); 12 of the 24 shots are inside both density marks (none
  were). What is left over the marks: z2 / d2's first-pass level biases, tiles painted
  below 32 on purpose (d1's river at 16), FLORA plants close to the camera (their own atlas,
  not upscaled) — and everything `flat` and `tiny` measure, which is paint and light.
- **Budgets** (per stage, all atlases, all levels; the bytes are the same on the GPU and in
  the CPU copy): ≤ 48 MiB, every atlas ≤ 4096 on a side, cold paint ≤ 1.2 s on the test box (z1 with drawn flats: about 2 s, the figure the PIXELWORLD3 brief allows; it still needs the owner's sign-off).

  | stage | atlases as stored (MB) | total | paint, JIT-warm (node, min of 4) | cold load: build / paint in frames / total | warm total |
  |---|---|---|---|---|---|
  | z1 | z1 4096×2272 23.7 · sky 2048×368 1.4 · fire 512×896 1.2 | 26.3 MB | 262 ms (196 without the fallback) | 691 / 439 ms in 25 / 3541 ms | 2494 ms |
  | z2 | z2 4096×1376 14.4 · sky 1024×416 0.8 | 15.2 MB | 167 (119) | 665 / 418 in 20 / 2506 | 2467 |
  | z3 | z3 4096×1856 19.4 · sky 2048×464 1.8 · fx 512×896 1.2 · truck 512×416 0.5 | 22.9 MB | 187 (195) | 642 / 294 in 18 / 2193 | 1836 |
  | d1 | d1 2048×1696 8.8 · sky 2048×576 2.3 · jeep 512×480 0.6 | 11.7 MB | 203 (185) | 1261 / 425 in 20 / 3752 | 2316 |
  | d2 | d2 4096×1440 15.0 · sky 256×272 0.1 | 15.2 MB | 218 (82) | 1032 / 354 in 20 / 2600 | 2473 |
  | d3 | d3 2048×2112 11.0 · sky 2048×352 1.4 · jeep 512×512 0.7 | 13.1 MB | 152 (123) | 1042 / 353 in 17 / 3818 | 2132 |
  | title | city 2048×1216 6.3 · fire 1.2 · sky 2.0 — jungle 1024×768 2.0 · fx 0.3 · sky 2.4 | 9.5 + 4.6 MB | | | |

  (Every first-pass tile at 2×, nothing repainted yet, nothing opted out but the backdrops:
  an atlas at 4096 wide is 2.0 MB per 256 rows with its levels, so the 48 MB budget is about
  one atlas 4096 × 4096 plus backdrops — a stage that outgrows it opts far-only tiles out or
  splits an atlas, at one draw call more for each mesh that then spans two. Without the
  fallback the indexed atlases are 3.9–7.7 MB a stage, half the first pass's RGBA.) Loads:
  production build, `scripts/load-bench.mjs --intro --warm 1 --play 6`, SwiftShader on the
  shared 4-core box; the same build with `&pwup=0&pwaniso=0` measured 2.6–4.7 s cold and
  2.2–2.9 s warm in the next run, i.e. the two are inside the box's run-to-run spread. Store
  reads are 21–36 MB in 86–147 ms (title included), writes 33–70 ms, the longest paint step
  43–85 ms (a sky band), no long task in play in any of the 12 loads; draw calls and
  triangles are exactly the first pass's (same meshes; 2–4 more textures: the palettes).

  The CPU copy is kept after the upload: a restored WebGL context re-uploads every texture
  from it (three.js; checked with `WEBGL_lose_context`), and a RETRY / RESTART rebuilds the
  stage's textures from the session cache without touching IndexedDB; dropping it would
  make both an asynchronous 15–35 MB store read (or, where there is no store, a repaint).
  It is two bytes a texel instead of four.

### PIXEL-ART LIGHT (ramp-step light, banded fog, palette-true output)

`content/pixelworld/light.ts` is the model (the per-stage `PwMood`, the GLSL every lit
PixelWorld material shares, and its arithmetic again in TypeScript for
`tests/unit/pixel-world-light.test.ts`); `material.ts` and `z2billboard.ts` call it,
`core/RetroPass.ts` exports what a palette-true pixel must know of the monitor (`MONITOR`).
The first pass multiplied the paint by a smooth Lambert term, blended fog in and left the
result to the monitor pass: smooth gradients over walls, grey-black shadows, an ordered-dither
screen-door over every painted colour, and no colour on screen that anyone had painted.

- **Steps.** three.js's Lambert sum runs over a WHITE surface (`diffuseColor` is left alone:
  `pwLightPatch`), which gives the light as the factor the first pass multiplied the paint by:
  irradiance / π × the material's `gain`. Its luminance `Y` becomes whole tones:
  `steps = round(mood.steps × log2(Y / mood.pivot))`, kept inside `mood.lo … mood.hi`, and the
  colour is the texel's palette row at column 5 + painted tone + steps (clamped to the 16
  columns). Light at the pivot shows paint exactly as painted. A painted tone is 1.2–1.8 stops
  of luminance from the next, so `steps` ≈ 0.75 a stop keeps a lamp's falloff about as
  contrasty as it was and gives its pool 2–3 rings.
- **Band edges** are ordered-dithered in TEXEL space: the threshold is the 2 × 2 pattern (a
  quarter of the texels, a checker, three quarters: `pwBayer`) on the texel's coordinates at
  the level drawn (per axis: `pwQ`), so the pattern is glued to the surface, one frame pixel
  coarse where texels are 1:1, and cannot crawl. Its width is `mood.edge` FRAME PIXELS, taken
  from the screen-space slope of the light (`fwidth`), at most 0.75 of a step: a pool's edge is
  a few pixels of hand dither, and an evenly lit facet (no slope) is never dithered at all —
  no screen-door over a wall that happens to sit near a band's edge.
- **Tint.** The lights are split in two groups: what is the same all over a facet (sky /
  ground hemisphere and the sun or moon, taken back out of three.js's direct sum) and what
  falls off across it (lamps, fire, muzzle flash, and as much of the spot lights as
  `mood.torch` counts: they are evaluated again and the rest subtracted). A band's tint is the chroma
  (luminance 1) of the even light plus as much of the local light as makes the band's own
  light — one colour for the whole ring, wherever the lamp's falloff puts a texel inside it —
  raised to `mood.tint` and divided by `mood.white` (the light the paint was painted for).
  Below the painted tone the stage's `mood.shade` comes in (half of its chroma one step
  down, all of it from two): the night's blue-violet, a ward's teal.
- **Glow texels** take no light: their painted colour, moved by the material's glow gain in
  whole steps (`pwGlowSteps`: `uPwGlow` 1 = as painted; d3's flash, z2's dead tubes). **Vertex
  colours** (NEUTRAL tints) multiply after the lookup, whole.
- **Fog** is `mood.fogBands` bands (three.js's own fog factor, rounded) toward the colour
  everything else fades to — the scene fog as the monitor shows it (`pwFilmHex`) — mixed in
  display space, the edge between two bands dithered on the FRAME grid over `mood.fogEdge`
  pixels (same slope rule): a band's edge is a line at a fixed depth, it sits still on the
  screen while the camera travels and scenery passes through it like through a layer of a 2D
  backdrop.
- **Palette-true output.** The display colour is snapped to the monitor's lattice (31 steps a
  channel; at most level 30: `MONITOR_TOP` — the top level needs a scene value of 6.9, which
  the CRT bloom would smear) and written as the scene value the pass's tone curve maps there
  (`pwToScene`: the fitted ACES has a closed-form inverse), with alpha `128 / 255` as a flag.
  The pass rounds flagged pixels instead of dithering them. In the half-float target the value
  survives exactly enough that the dither would do nothing anyway (unit-tested through
  half-float rounding); an 8-bit target (`&pwrt=8` forces it) holds dark values coarsely, so
  there the flag is what keeps the screen-door off, and darks land within a level or two.
  Anything transparent drawn over a world pixel changes its alpha with its colour (normal and
  additive blending both do): rain, smoke, glass, glows are dithered over the world as ever.
  A stepped light overlay that is itself paint (z1's `LightPools`, z2's pools) is made with
  `pwLightOverlay(material)` — it leaves alpha alone, so the lit pixels stay flagged and land
  on whole colours. Without a monitor pass (DISPLAY OFF) the display colour is written
  straight to the canvas.
- **Backdrops and painted sprites** (`pwBackdropMaterial`, `pwSpriteMaterial`) are unlit and
  keep going THROUGH the tone curve (stages scale them in scene space: lightning, d3's live
  fog ratio; and the horizon must meet the fog, which the classic materials, FLORA and the
  cast also fade to through the curve) — but land on the lattice colour nearest what the pass
  would show (`pwFilmSnap`): the same picture without the dither over the painted sky.
- **Moods** (`pwMood(X_MOOD)` in each stage's `pixel.ts`, before any material is made; the
  title vignettes in `ui/menuPixel.ts`; materials are cached per mood, `pwMaterial(atlas,
  { mood })` names one):

  | stage | pivot | steps / stop | lo … hi | tint | shade | torch | film | fog bands | where the light sits (its level × paint) |
  |---|---|---|---|---|---|---|---|---|---|
  | z1 MAIN STREET | 0.55 | 0.75 | −2 … +2 | 0.8 | `0x9a90e8` blue-violet | 0 | 0 | 6 | moonlit road and pavement (0.41–0.47) 0; walls (0.17–0.29) −1; under awnings, away from the moon −2; beside a lamp, the fire, a neon 0 … +1 |
  | z2 ST. MERCY | 0.45 | 0.75 | −2 … +2 | 0.8 | `0x90b8c8` teal | 0 | 0 | 6 | ward and bay ambient (0.11–0.22) −1; under a tube, in the emergency lamp's reach (0.3–0.45) 0; unlit ceilings and far rooms (0.03) −2 |
  | z3 HIGHWAY | 0.5 | 0.75 | −2 … +1 | 1.5 | `0xd098d8` magenta-violet | 1 | 0 | 6 | sunlit road and fronts (0.50–0.54) 0; faces turned from the sun, under the bridge (0.11–0.36) −1; beside a fire (0.8) +1 |
  | d1 JUNGLE RUN | 0.95 | 0.75 | −2 … +1 | 0.5 | `0xa8c0f0` sky blue | 1 | 1 | 6 | everything the sun reaches (0.97) 0; shaded sides −1 |
  | d2 RESEARCH LABS | 0.65 | 0.75 | −2 … +2 | 0.7 | `0xa4b4ec` cold blue | 0 | 0 | 6 | floors under the room's light (0.65) 0; walls (0.29) −1; ceilings and unlit rooms (0.04–0.08) −2; the atrium's lit path +1 |
  | d3 STORM | 0.45 | 0.75 | −2 … +2 | 0.8 | `0x8c98f0` deep blue | 1 | 0 | 6 | open ground, lamp pools, the jeep's headlights (0.3–0.65) 0; facets turned from the sky (0.11–0.28) −1; a lightning flash +1 … +2 |
  | title: night street | 0.5 | 0.75 | −2 … +2 | 0.8 | `0x9a90e8` | 1 | 0 | 6 | as z1 (no torch there) |
  | title: sunset jungle | 0.9 | 0.75 | −2 … +1 | 1.5 | `0xd098d8` | 1 | 1 | 6 | z3's sunset over d1's paint |

  `pivot` is chosen from the stage's light levels (`node scripts/pixel-mood.mjs --shots …`
  prints percentiles of the light on the painted world and the share of pixels at each step,
  and re-shoots the same frozen frame under `--moods "a=pivot:0.4;b=pivot:0.6,tint:1"`;
  `__pwMood({ pivot: 0.4 })` changes the live mood from the console). The night stages sit
  their open ground at the painted tone and everything the moon or the room's light reaches
  less one step down, in the stage's shade; two steps only where no light reaches (ceilings,
  undersides); what a lamp, a fire or a neon lights comes back up a step or two.
  `torch` is how much of the SPOT lights counts: z1, z2 and d2 carry a shoulder torch on the
  camera so that whoever stands in the middle of the frame reads — on painted ground it was a
  pale disc under the gun, travelling with the view (the tell of a lit 3D scene), so their
  moods leave it out of the world (the cast keeps it: its own pipeline); d3's are the jeep's
  headlights and count. `film` is how much of the monitor's tone curve stays on lit paint
  (0: what is painted is what is shown): d1's paint was tuned through the curve in full sun,
  which lifts and saturates mid tones — without it the ground sat duller than its plants
  (which keep the curve), so d1 keeps all of it; still whole colours, never dithered.
- **Flicker.** Light that changes over time moves whole tones: a neon's buzz, a surge, the
  lightning. The stage code that drives those lights already calms them under
  `reduceFlashes`, and the materials add nothing of their own. Measured (`node
  scripts/pixel-motion.mjs`: consecutive 1/60 s steps of a shot, in the `tone`, `steps` and
  `fog` views): MOTIONTEXT

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
  `d3MudRoadTile`), animated puddles / pools / river (`d3PuddleDecal`: a wet lit rim round
  water that mirrors the storm sky — unlit, a shade under the mud — with broken reflection
  streaks and rain rings one step brighter, the glow following the lightning flash),
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

### Drawn flats (PIXEL WORLD 3: buildings as 2D cards)

Where a stage has them (round 1: z1 Main Street beats 0–5 and the boss square) buildings are drawn flats instead of painted boxes (the diner's front and the Rialto's marquee included: `pixelworld/z1dinerflat.ts`), staged per building (parallel / raked / facing, the two corners past the crossing with an `end` flat square to the crossing) with their hidden occluders untouched: `pixelworld/elevation.ts` is the illustration kit, `pixelworld/z1flats.ts` the pictures, `stages/z1/pwFlats.ts` the staging (`&pwflats=parallel|<degrees>` for look-dev). `docs/PIXELWORLD3.md` describes it as built.

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
- **d2 kitchen** (it read as flat-shaded boxes: white slab tops, an evenly lit chequer, a
  wall-to-wall white end wall): stainless counter tops in mid steel with two reflected light
  strips and brushed grain running ALONG the run (a pattern across a counter collapses into
  one flat value at the grazing view), a lit edge over a dark lip; stepped 2×2-dithered contact
  shadows on the floor along every island and wall-counter base (`floorShadowTile`); the light
  pools moved to where the troffers actually throw them — a hot pool on each island top under
  its light, dimmer ones spilling into the aisles (the failing troffer's stay dark); grimy grout
  and grease spatter on the splash-back, fallen tiles showing the adhesive comb; utensil rails
  and shelves of stores over the ovens / sinks; the end wall dressed either side of the
  server-room door (shelves, canteen notices, a stopped clock, an extinguisher, a rail); more
  clutter cards (mixer and plates, mugs) on the islands and wall counters; floor drains, grease
  trodden out from the ranges.
- **d3 puddles**: water that mirrors the storm sky, two tones only: the body UNLIT at the sky
  ramp's tone 1 (≈ the fog colour) — lit water went near-black under the storm's light and
  read as holes in the road (measured (8, 7, 11) on screen against mud at (70, 43, 31)) —
  reflection dashes 2 rows in 12 and ≤ 3 rain rings (2-texel arcs on the near half) one step
  brighter; a lit muddy rim. Their own material with levels a step early (`bias 1`) and a glow
  gain `PUDDLE_GLOW` 1.8 × (1 + 1.6 × flash): between the mud and the fog on screen (≈ (19, 26,
  44)), flaring with each strike (a mild swell with reduced flashing). Brighter (tone 2) read
  as a pale patch at the Tyrant's feet, pulling the eye off telegraphs. Half the road puddles
  (by hash: the classic draws unchanged), five of the nine mud-stretch pools. The rain splash
  rings dim to storm blue (opacity 0.26) so the telegraph rings stay the only bright ellipses.
- **d3 mud-hold truck**: a sun visor, an amber beacon, mirrors out on arms, rubber fender arches
  over every wheel, mud flaps, rounded front corners in the cab front module.
- **Single-file budget** (`scripts/inline-build.mjs`): 3.5 MB is a deliberate raise from 3 MB
  (PIXEL WORLD's art is painted by code, so it lives in the script; ≈ 1 MB gzipped), and every
  `build:single` now compares `overrun.html` with the committed baseline
  (`scripts/single-size.json`, the size at HEAD): growth over 64 KB fails the build until it is
  accepted with `SINGLE_SIZE_UPDATE=1 npm run build:single`. Round 5 itself: 3271 KB (+27 KB for
  the skull, bus-interior, wall-chunk and kitchen painters).
- **Every ART**: the first-draw hitch fixed behind the card — the warmed-up programs are linked
  (`linkSlice`), the character painter (`PixelCast.precompile`) draws once into a 1 × 1
  corner, so its tables upload and its framebuffers exist before play, and play waits on a GPU
  fence for the stage's first frame to finish (see *Stage loading*);
  rescued civilians never walk into the lens (see *Civilians*). Gameplay identical: humanbot
  60 fps, seeds 1–12, σ 0.03 / 0.05, six stages — PIXEL WORLD = PIXEL CAST = 18e2190 per seed.

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
   atlas never uploads the first time it comes into view. The character painter
   (`PixelCast.precompile`) also draws each of its two passes once into a 1 × 1 corner, so its
   prim / material tables upload and its G-buffer framebuffer exists before the first figure.
6. `linkSlice` (every ART): `compile()` only CREATES the programs; the driver finishes one
   (SwiftShader / ANGLE: the link) the first time it is queried, which three.js does on its
   first draw — that was the 0.2–0.5 s freeze when the first character painted a few seconds
   into a stage. Each never-used program is queried here (`getUniforms()`), a slice a frame
   (14 / 45 ms like the paint); with KHR_parallel_shader_compile a program still compiling in
   the background waits for a later frame (up to 1.5 s, then it is forced).
7. Settle (every ART): the first frame is drawn behind the card, then a WebGL 2 fence
   (`gpuFence`, polled once a frame — nothing blocks) holds play until the GPU has finished it,
   at most 2 s (`LOAD_GPU_WAIT_MS`); without WebGL 2 there is no wait. That first pass over every
   material and atlas was the 0.4–0.7 s stall (SwiftShader) that otherwise hit the first frames
   of play when the card had already run out.
8. `finishLoading`: play (or the rest of the card).
A world still loading is never drawn before step 7 (in every ART): the card stays over the last
frame on the canvas (the title's), so no half-painted scenery shows through it and the build's frame does
not also compile every shader. If the card's 2.8 s run out (or it is tapped) before the load is
done, it stays up saying LOADING... until play can begin (`showStageIntro`'s `onDone` returns
false). The title's painted scenery is freed when a stage builds (`MenuBackdrop.release`). The
attract demo builds at once (the store was read before it started: `startDemo` waits for it;
the title's atlases stay cached beside the demo stage's) and paints during its opening black
cut. `Game.lastLoad` records build / paint (+ frames) / store / warm-up / link (+ frames) /
render / settle / total ms (`scripts/load-bench.mjs`).

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
`&spriteLook=pal:0,dirs:8` sprite look tuning · `&castlook=0|b` cast look (`0` = the first PIXEL CAST look, `b` = the PIXEL CAST 2 cel look) · `&beat=5` start at beat 5 · `&autoplay=1`
`&pwdebug=mag|lvl|tone|ramp|steps|light|fog` PixelWorld debug views (`1` = compiled in, off
until `__pwDebug(view)`) · `&pwup=0` no 2× fallback · `&pwaniso=0` one level for both texel
axes · `&pwlight=0` the first pass's light (all three off = the first pass's frames) ·
`&pwmood=pivot:0.4,tint:1` values over every stage's mood (`__pwMood({…})` changes the live
one) · `&pwrt=8` an 8-bit scene target (the fallback of the palette-true output) ·
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
