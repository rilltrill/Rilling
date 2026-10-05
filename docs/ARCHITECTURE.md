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
`civilians`, `onStart`, `onEnd`.

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

## Art style: SPRITES — PixelCast pixel art (`gameplay/pixel/`, `content/pixel/`)

Settings → ART: **SPRITES | 3D** (`Settings.art`, default **SPRITES** on this branch; `artV`
migrates saves that only stored the old '3d' default; URL `&art=sprites|3d` overrides it
until the player changes ART; live mid-stage via the pause screen's ART chip). ART: 3D is
the procedural-model look, unchanged.

In SPRITES, characters that have a **painter** are drawn as hand-made pixel art by
**PixelCast**; every other sprite entity (bosses, runners, crawlers, brutes, spitters,
bloaters, compys, dilos, pteros, trikes, projectiles, pickups) still uses the older live
**impostor bake** (its 3D model re-rendered into pixels) until someone paints it.
Pilots painted today: **walker** (every outfit; office / worker / nurse are the reference),
**runner** (same humanoid painter), **civilian** (all variants; the z1 worker is the
reference) and **raptor** (all palettes incl. the red alpha; d1/d2/d3 subclasses inherit
it). `RiotWalker` opts out (its armour plates aren't painted yet). Next up for the
humanoid painter: crawler (legless halves: `HumanPose.legless` + a waist stump), brute
(riot plates as `PART.ARMOR` prims), spitter (glowing throat sac as a `PF.GLOW` weak part),
bloater (belly ellipsoid + pustule glows), the bosses; for the theropod painter: compy
(compact spec), dilo (frill fans as their own layer).

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
   ```
   `f.at / f.dir / f.vec / f.mix` return pooled vectors; resolve materials once per look
   (`Mat.*` builds key strings — cache the ids, see `human.ts` `mats()`); use index loops,
   not `for (… of [1, -1])`; never allocate option objects per redraw.
3. Look-dev: `node scripts/pixel-look.mjs --place "walker@office:-1:3.5,raptor@red:1.5:7:-30:windup=0.8,civ@worker:0:5"`
   (actions: `windup= stagger= sever=L|R|l|r pop die= pounce= walk= hit`; `--stage "zoo&zooEnv=night"`).
   It writes `-3d.png`, `-sprites.png`, a 3D|SPRITES `-montage.png` of zoomed crops and
   `-texels.png` (each sprite's raw texels ×4 — judge the pixels there).
4. Add the type to `tests/unit/pixelcast.test.ts` (alignment) and check
   `node scripts/bench-art.mjs`.

### Style guide (keep new characters consistent)
- **Pixel density**: 1 texel = 1 retro pixel (≈ 288 lines) until the figure is
  `maxTexels` tall (humans 190, theropods 200 — a mid-range human is ~90–130 texels);
  closer than that texels grow by whole pixels (arcade sprite scaling). Never mix texel
  sizes inside a sprite.
- **Proportions**: classic sprite chunkiness — heads, hands and feet slightly big, limbs
  about as thick as their hitbox boxes (radii ≈ the boxes' half-widths, a little inside),
  hands fanned out on screen (spread axis ⟂ arm and view) so they read as hands.
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
  what the hitboxes cover): step 0 of the local ramp, step 1 on a lit top/left edge;
  1-texel runs (fingers, claws, quills) are never outlined. Inner contour (step 0) where a
  nearer layer overlaps one > 7 cm behind; one step of cast shadow below/right of
  overlaps and under hems, cuffs and collars. Dither (Bayer 4×4) only in the narrow band
  between two steps (`dither` per material).
- **Animation**: redraws at 12 fps of game time (positions stay smooth at 60). Secondary
  motion is drawn by the painter from `time`/state: jaws (groan, gape in the windup, snap
  on the bite), claws twitching, rags/hair/quills swaying, squash & stretch on hits
  (`f.warp`, ≤ 7 %), the impostor/painted sprite flashes white/red on hits.
- **Gore**: `Mat.blood / gore / bone / ribs`; wounds and stains are decals only drawn while
  that side faces the camera; stumps are a ragged gore ball + a bone knob; a popped head
  leaves a neck stump; severed limbs are painted on their own (`paintPart`). Blood squirts
  and chunks are FX pixel particles (gib sprites).
- **Budgets**: ≤ 160 primitives per figure (pilots use 60–90), 2 draws + one 12 KB upload
  per redraw, ≤ 6 redraws per frame, painter CPU ~0.1–0.4 ms per redraw on desktop.
  Memory: a 256² RGBA8 G-buffer + per-sprite RGBA8 targets pooled by power-of-two size.

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

`?stage=z1` jump into a stage · `&art=sprites|3d` character art (Settings ART, default SPRITES) ·
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
