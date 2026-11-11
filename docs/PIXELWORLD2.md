# PIXEL WORLD 2 — the art bible

The owner's brief, verbatim: *"take another shot at making this more like mid 2000s pixel art
… a good deal more detailed … I really don't want it to feel like a Roblox or Minecraft vibe.
I really want the background textures to look more pixel painted than constructed out of
blocks."*

This document is the art direction for the second pass over the PIXEL WORLD environments
(`content/pixelworld/`, `stages/*/pixel.ts`). It replaces the density, light and style rules of
the first pass (docs/ARCHITECTURE.md, *Art style: PIXEL WORLD*); the plumbing described there
(atlas, batches, re-texturing, backdrops, the store) still applies. **Gameplay never changes**
(rule 8 of the old guide stays word for word).

## 1. Why the first pass still reads as blocks (measured)

The game draws into a 288-line target (`RetroPass`, quality `medium`: the phone default; a
624 × 288 frame on a 19.5 : 9 phone) and upscales it. At a 58° vertical field of view one
frame pixel covers 0.385 cm per metre of distance, so:

    pixels per texel = 260 / (texels per metre × distance in metres)

The first pass painted everything at 32 texels a metre: one texel is one frame pixel only at
8 m. At 4 m every texel is a 2 × 2 block, at 2 m a 4 × 4 block. Look at the 3× art frames in
`/tmp/pw2/base/*.png` (same shots as `scripts/pixel-world.mjs`, see §8):

1. **Magnified texels.** The road, the pavement, corridor walls, car sides and counters near
   the camera are drawn with fat square texels, skewed by perspective. Square texels larger
   than a screen pixel, on a 3D plane, are *the* Minecraft signature. Pixel art has ONE pixel
   size: the screen's.
2. **Textured boxes.** Cars (z3's police car), counters (d2's kitchen), pillars, buildings: a
   box with a different flat texture on each face, straight silhouettes. d1 reads best exactly
   because most of what you see there is painted cut-outs (trees, ferns) and a painted backdrop.
3. **Real-time light on flat planes.** Lambert light multiplied over the paint, then ACES:
   smooth gradients (z2's corridor walls), muddy near-black shadows, colours that are not in
   any palette. Pixel art has no smooth gradients: light is steps of a ramp, with dither.
4. **Sparse paint.** Large planes of one or two colours with a few clusters; speckle as
   "texture"; the same tile repeated. Nothing is illustrated.

## 2. The target: mid-2000s arcade / handheld pixel art

Think of the backgrounds of Metal Slug 3–6, Street Fighter III: 3rd Strike, Garou, The King of
Fighters 2002/2003, Castlevania: Dawn of Sorrow / Portrait of Ruin, Mother 3, Advance Wars —
and, for how a 2D game does depth, Sega's sprite-scaler rail shooters (Rail Chase, the 1994
Jurassic Park cabinet). A frame of OVERRUN must pass for a frame of a 2D game of that era:

1. **One pixel size.** No texel is drawn larger than ~1.5 frame pixels where the player
   normally looks. No blur, no smooth gradient: tone changes are steps, softened only by
   deliberate dither (ordered or hand-shaped), and never as a screen-door over a whole wall.
2. **Illustrated surfaces.** A wall is a picture of a wall: each brick has a lit top edge and a
   shadowed bottom, some are chipped, mortar lines carry a shadow; sills drip stains; a
   drainpipe casts a shadow; there is a meter box, a vent, a taped notice, a cable. Rule of
   thumb: any 48 × 48-pixel window of the frame outside the sky shows at least three readable
   forms, and no 16 × 16 window is one flat colour (unless it is a deliberate rest: a clean
   sign face, a sky band).
3. **Form shading with ramps.** Every material is a 6-step hue-shifted ramp (the existing
   `k.ramp`): violet-blue shadows, warm pale highlights. Forms are modelled: highlight on the
   top / left edge, core shadow, a step of reflected light, a crisp cast shadow below-right.
   Curves are anti-aliased with the in-between tone. Outlines are selective and dark-coloured,
   not black (step 0 of the ramp).
4. **Light is painted.** Lamps, neon, fire, screens throw stepped pools on walls and ground
   (2–4 rings, dithered edges), neon tints what is near it, wet ground mirrors it in broken
   streaks. Night is deep blue-violet and readable, never crushed black. Depth is bands:
   each layer further away is a step lower in contrast and nearer the fog colour.
5. **Silhouettes.** No plain rectangle against the sky or the floor: rooflines carry tanks,
   aerials, parapets, signs; props are drawn shapes (cut-outs), vehicles have a real profile
   (sloped glass, arches, bumpers), heaps and foliage break straight edges.
6. **Lived-in and lively.** The story is in the set dressing (posters, graffiti, litter,
   barricades, abandoned things, blood where it makes sense), and something small moves in
   every scene: a flickering tube, a neon letter, steam, a swinging sign, papers, drips,
   embers, water. The arcade backgrounds of that era were full of small animation loops.
7. **The game reads first.** Enemies, civilians and telegraph rings must stay the brightest,
   most saturated, most contrasted things on screen. Backgrounds sit a step back: detail at
   mid contrast, the brightest tones reserved for small light sources, nothing ring-shaped
   and bright near a telegraph.

### What reads as Minecraft / Roblox (never ship these)

- a texel bigger than two frame pixels in the middle 80 % of a frame;
- a box whose faces are each one flat or evenly speckled texture; a straight box silhouette;
- uniform noise / speckle used as texture; checker dither made of fat texels;
- a visibly repeating tile grid with no variation over a large plane;
- a smooth light gradient across a flat wall; grey-black shadow; washed-out, desaturated mud;
- big empty planes (road, floor, wall, ceiling, lawn) with a few specks on them.

## 3. Density: choose it from the viewing distance

`tile.density` (texels a metre) is per tile; the batches already honour it. Pick it from the
nearest distance `d` at which the surface is normally on screen (not clipped at the very edge):

| nearest normal view | density | examples |
|---|---|---|
| ≥ 6 m | 32 | upper storeys, far side of a street, distant structures |
| 3–6 m | 64 | ground along the rail, ground-floor fronts, vehicles, big props |
| 1.8–3 m | 96 | corridor walls and floors, counters, doors you pass, anything in a hold beat up close |
| < 1.8 m | 128 | the player's vehicle (hood, cabin, gun), things brushing past the camera |

A surface seen both near and far is painted at its near density; the hand-made levels (below)
carry it into the distance. Every tile that is NOT repainted natively is stored at 2× by the
pipeline's pixel-art upscaler (the foundation work, §6), so nothing is left with 32-texel
blocks next to the camera; that is a safety net, not the art: an upscaled tile has smooth
shapes but no new detail, and at 2–4 m it is still a texel of 2–1 pixels. Paint natively
wherever the player looks. (`&pwdebug=mag` shows where: anything orange or red.)

Budget (per stage, all atlases, all levels): ≤ 48 MB of texture memory; paint ≤ 1.2 s on the
test box for a cold load (it runs in slices behind the intro card and is stored after the
first run). Spend texels where the rail camera is: unique paint near, tinted wrap tiles far.

## 4. Painting rules

1. **Paint in passes**, the way a pixel artist blocks in: (a) base tone; (b) large value
   structure — a dithered band darker toward the foot of a wall, lighter where a lamp hits,
   stains under sills and below anything that drips; (c) construction — courses, panels,
   boards, joints, with a lit edge and a shadow edge; (d) wear — chips, cracks, patches,
   rust, peeling, moss: shapes of 3–12 texels with their own light and shadow side;
   (e) dressing — things ON the surface (§2.2); (f) contact — an ambient-occlusion step
   where planes meet, a cast shadow under and beside everything that sticks out.
2. **No noise.** Never per-texel random tone. Texture is built from shaped clusters placed
   by rules (existing `CLUSTERS`, plus bigger hand shapes). Dither only inside a band between
   two neighbouring tones, and prefer shaped dither (broken horizontal dashes for wet ground,
   diagonal hatching for metal) over a plain checker.
3. **Big unique modules beat small tiles.** A ground-floor front is one painting 8–12 m wide,
   not a 2 m tile repeated; a corridor wall is a 6–8 m panel with its doors, boards and pipes.
   Where a wrap tile is right (asphalt, brick field), make it ≥ 4 m and break its repeat with
   decals and unique modules every few metres.
4. **Edges of geometry are drawn.** Where two faces of a box meet, the tiles carry it: a
   highlight line along the top edge of the lit face, a dark line under an overhang, a worn
   corner. A box must never show as two flat textures meeting at a knife edge.
5. **Kill boxes.** Ranked choices for a prop or a vehicle: a painted cut-out billboard (FLORA
   species, like d1's plants) when it is roundish or far; a cut-out card or crossed cards when
   it is thin; an extruded PROFILE (the painted side silhouette swept across the width, so the
   hood slopes, the roof curves, the arches are cut) for vehicles and furniture; a box only
   for things that are boxes (crates, lockers), and then with painted edge wear and something
   on top. Add silhouette pieces (cut-out cards) on rooflines, counters, shelves, heaps.
6. **Colour.** Use the stage's ramps; add ramps freely (the palette is not limited to the
   classic material colours any more) but keep each scene to a mood: one dominant hue family
   for the architecture, one accent for light, one for danger. Saturated mid-tones, coloured
   shadows. The darkest painted tone of a night stage is a deep blue-violet around #14122a,
   never below it.
7. **Animation.** Use `anim` strips (4–8 frames, 6–10 fps) for small loops: 3–6 per scene.
   Never animate large areas with high contrast (it fights the telegraphs).
8. **Text** is the pixel fonts, as before; signs are designed (a logo, a border, wear).

## 5. Light (the pipeline's job; painters paint for it)

World texels are stored as *(ramp, tone)*; the palette holds each ramp as 16 tones (the six
painted ones in the middle, five deeper toward a deep blue-violet, five brighter toward a warm
white). The material (`content/pixelworld/light.ts`; in full: docs/ARCHITECTURE.md, *PIXEL-ART
LIGHT*) does four things with the stage's lights:

1. **Steps.** The light on a texel becomes a WHOLE NUMBER OF TONES:
   `steps = round(mood.steps × log2(light / mood.pivot))`, and the texel is shown at painted
   tone + steps of its own ramp. At the stage's pivot light a texel shows exactly the colour
   you painted. A lamp's pool is 2–3 rings of whole tones; the edge of a ring is a few pixels
   of 2 × 2 ordered dither glued to the texels (it never crawls), and a facet in even light is
   never dithered at all.
2. **Tint and shade.** A ring takes ONE tint from the light that makes it (the sky's blue, a
   sodium lamp's orange, an emergency lamp's red), and everything below its painted tone
   leans to the stage's `shade` (half one step down, whole from two).
3. **Fog in bands** toward the stage's fog colour, their edges dithered on the frame's grid:
   a far wall sits a visible step back, like a layer of a 2D backdrop.
4. **Palette-true output.** The lit colour is written so that the arcade-monitor pass shows it
   unchanged and does not dither it. What you paint is what arrives on the screen (the first
   pass showed a pool painted #1c273d as #0d111e, under a screen-door).

### The mood of a stage

One `PwMood` per stage (`X_MOOD` in `stages/<id>/pixel.ts`; a stage may set another before it
builds a zone's materials):

| stage | pivot | steps / stop | lo … hi | tint | shade | torch | film | where the light sits (its level × paint) |
|---|---|---|---|---|---|---|---|---|
| z1 MAIN STREET | 0.55 | 0.75 | −2 … +2 | 0.8 | `0x9a90e8` blue-violet | 0 | 0 | moonlit road and pavement (0.41–0.47) 0; walls (0.17–0.29) −1; under awnings, away from the moon −2; beside a lamp, the fire, a neon 0 … +1 |
| z2 ST. MERCY | 0.45 | 0.75 | −2 … +2 | 0.8 | `0x90b8c8` teal | 0 | 0 | ward and bay ambient (0.11–0.22) −1; under a tube, in the emergency lamp's reach (0.3–0.45) 0; unlit ceilings and far rooms (0.03) −2 |
| z3 HIGHWAY | 0.5 | 0.75 | −2 … +1 | 1.5 | `0xd098d8` magenta-violet | 1 | 0 | sunlit road and fronts (0.50–0.54) 0; faces turned from the sun, under the bridge (0.11–0.36) −1; beside a fire (0.8) +1 |
| d1 JUNGLE RUN | 0.95 | 0.75 | −2 … +1 | 0.5 | `0xa8c0f0` sky blue | 1 | 1 | everything the sun reaches (0.97) 0; shaded sides −1 |
| d2 RESEARCH LABS | 0.65 | 0.75 | −2 … +2 | 0.7 | `0xa4b4ec` cold blue | 0 | 0 | floors under the room's light (0.65) 0; walls (0.29) −1; ceilings and unlit rooms (0.04–0.08) −2; the atrium's lit path +1 |
| d3 STORM | 0.45 | 0.75 | −2 … +2 | 0.8 | `0x8c98f0` deep blue | 1 | 0 | open ground, lamp pools, the jeep's headlights (0.3–0.65) 0; facets turned from the sky (0.11–0.28) −1; a lightning flash +1 … +2 |

- `pivot`: the light at which paint shows as painted. `node scripts/pixel-mood.mjs --shots
  "z1:5:150:street"` prints the light levels of a shot (percentiles of the first pass's
  paint multiplier) and the share of the frame at each step; choose the pivot at the light of
  the stage's open ground and lamp pools, so that walls and everything less lit sink one step
  into the shade and only unlit corners two. `--moods "a=pivot:0.4;b=pivot:0.6,tint:1"`
  re-shoots the same frozen frame under variants; `__pwMood({ pivot: 0.4 })` in the console
  changes the live mood; `&pwdebug=steps` shows the steps (green = as painted, cyan −1, blue
  −2, yellow +1, orange +2).
- `steps` (tones a stop of light; 0.75): more = more rings and harder contrast. `lo` / `hi`:
  how far down the unlit corners go and how far a lamp's core may bleach paint (−2 … +2;
  +1 where a stage has no lamps to speak of).
- `tint`: how far the light's colour leans the paint (0 … 1; above 1 exaggerates it: a
  sunset). `shade`: a PALE colour — its chroma is what counts; a saturated one drowns the
  paint. `white`: the light your paint is painted for, if not white.
- `torch`: how much of the spot lights counts for the painted world. The shoulder torch that
  follows the camera (z1, z2, d2) is for the cast; on paint it was a pale disc under the gun
  that travelled with the view, so those moods set 0. Headlights (d3) count.
- `film`: how much of the monitor's tone curve stays on lit paint. 0 = palette-true, the rule
  for anything painted from now on. d1's first-pass ground was tuned through the curve in
  full sun (it lifts and saturates mid tones) and keeps it (1) until it is repainted — set it
  back to 0 with the repaint and pick the bright ramps yourself.
- `fogBands` (6), `edge` / `fogEdge` (the dithered edges' width in frame pixels: 5 / 4).

### Painting for it

- **Paint as if evenly lit, at the pivot**: the picture you paint is what a lamp shows. The
  pipeline makes the night around it. Do not paint a tile dark because the stage is dark.
- **Tones for form**: base on 3, the lit top / left edge 4, small highlights 5, the shadow side
  and recesses 2, core shadows and cast shadows 1, outlines and the deepest cracks 0 only.
  Light moves the WHOLE tile: one step down your 4-3-2 reads as 3-2-1 (and leans to the shade),
  two steps down as 2-1-0. A surface painted mostly in tones 0–1 has nowhere to go at night
  (below tone 0 the ramp's steps part by hue more than by lightness), and one painted mostly
  in 4–5 bleaches to the pale end inside a pool. Keep the body of every form on 2–4.
- **Ramps**: night stages want ramps whose tone 0 is a deep colour, not black
  (`k.ramp(hex, { dark: 0.5 })`; the darkest painted tone around #14122a, §4.6). Hue-shift is
  in the ramp: a ramp made with a `shadowHue` shifts further as the light takes it down.
- **Fixed pools** (a lamp on a wall, a neon wash on a shopfront, a lit doorway's spill): paint
  them INTO the tile — one tone up inside the ring, two in the core, the ring's edge a seam of
  2–3 texels of dither (`PWF.DITHER` with a fractional tone, or a hand checker), in a warmer
  ramp where the lamp is coloured (the pipeline cannot tint a painted pool). Where a pool spans
  many tiles (a street lamp on the road) keep it as a stepped overlay made with
  `pwLightOverlay(material)` (z1's `LightPools`, `pwPoolTexture`: flat rings; the lit pixels
  stay on whole colours) — flat steps only, a soft gradient would band. Real stage lights are
  for light that MOVES or FLICKERS (a fire, a buzzing neon, headlights, lightning): each is a
  ring of whole tones that travels over your paint.
- **GLOW** (`PWF.GLOW`) is for the light sources themselves: the lit window, the tube, the lamp
  head, the screen, the flame. A glow texel ignores light and fog bands apply to it; it shows
  as painted in the darkest corner, so it is the brightest thing in a night frame — keep it
  small. The halo a source throws on the wall beside it is PAINT (tones up), not glow. A
  material's `glow` gain moves glow texels in whole steps (a dead tube: 0.1 = two tones down).
- **Vertex tints** (NEUTRAL tiles in a material's colour) multiply after the lookup: handy, but
  a tinted texel is not a palette colour and its shadows do not travel the ramp. Hero surfaces
  get their own ramps.
- **Dither**: band edges are the pipeline's 2 × 2 pattern on your texels. A large painted
  checker under a pool's edge beats against it; use painted dither for seams, not for fills.
- **Backdrops** (sky, skylines, ranges) are unlit and still go through the monitor's tone
  curve, like the fog colour and everything classic that fades into it: paint the horizon in
  the stage's fog hex as before; `pwFilmHex(hex)` (light.ts) is the colour a backdrop texel or
  the fog shows as, when lit paint must match it. They are no longer dithered by the monitor.
- **In motion**: `node scripts/pixel-motion.mjs --shots "z1:3:60:move"` compares consecutive
  1/60 s steps (painted-tone changes = what the camera's motion alone does; light-step and
  fog-band changes on top of it) and writes a strip of the frames. A light that flickers
  flips whole tones: keep fast flicker local and small, and give it a calm branch under
  `world.settings.reduceFlashes` as the stages do.

## 6. The pipeline (foundation)

Described in full in docs/ARCHITECTURE.md, *PIXEL WORLD 2 pipeline*. What exists:

- **Indexed atlases**: a stored texel is two bytes of index (ramp id, painted tone, glow), the
  colour comes from a palette texture per atlas — a row a ramp, 16 tones: the six painted ones
  (columns 5…10), five deeper steps toward a deep blue-violet and five brighter ones toward a
  warm white (`extendRamp`). Painters do not see any of it: they still draw (ramp, tone, flags)
  into a `PwCanvas`.
- **Density per tile**: `atlas.tile(key, w, h, paint, { density: PW_TPM_MID })` (64; `PW_TPM_NEAR`
  96, `PW_TPM_CLOSE` 128; `pwDensityFor(metres)`). Paint `w` × `h` at that density (a 3 m × 2 m
  front at 64 is 192 × 128 texels), lay it as before (wrap tiles at the tile's density, modules at
  `tile.w / tile.density` metres). Wrap tiles at 64 or more must be multiples of 32 texels.
- **The 2× fallback**: every tile still painted below 64 texels a metre is stored at twice its
  size by a pixel-art upscaler (EPX shapes on equal texels, in-between tones on one ramp,
  crisp cut-outs, dither redone at the new size) and shown only where a painted texel would be
  larger than √2 frame pixels. Opt a far-only tile out with `{ upscale: false }`; backdrops
  (one-level atlases) are never upscaled. It smooths, it adds no detail.
- **Per-axis level pick**: a plane seen at a grazing angle (the road ahead, a corridor wall)
  keeps its texels at pixel size across the view. Without it density would not help there at
  all. A material's level `bias` still applies: the first pass's biases of 1.0 / 1.5 on z2 / d2
  walls and floors draw texels of 1.4–2.8 pixels by design — set them back to the default (0.5)
  when those surfaces are repainted, or the audit's `lvl>2` column stays high. A fine regular
  pattern (a chequer floor, a grate) now shows much further out: paint it so that it may
  (cells of 4 texels or more, low contrast between them), or give that one material
  `{ axes: false }`.
- **Debug views and the audit** (§8).

- **Light** (§5): ramp-step light, the band's tint and the stage's shade, banded fog,
  palette-true output through the arcade-monitor pass; `&pwlight=0` lights paint as the first
  pass did (A/B).

## 7. Definition of done for a scene

1. The audit (§8) passes on every listed shot of the stage.
2. Side by side with the first pass (same shots), every shot is clearly richer, and nobody
   could point at a "block": no box prop with flat faces, no fat texel, no empty plane.
3. Telegraph rings, enemies and civilians read at a glance in every shot (compare with the
   first pass; check the hold beats with `--noauto --hud`).
4. `npx tsc --noEmit`, the stage's pixel-world test, the simulator identity test (PIXEL CAST
   builds byte-identically; occluders, ground and the world RNG are identical in both styles)
   and the stage's e2e smoke pass. Draw calls ≤ 250, no per-frame allocation, budgets of §3.

## 8. Tools

- **Art frames** (the view to judge pixel art in — every frame pixel exactly 3 × 3, no CRT):
  `node scripts/pixel-world.mjs --base http://localhost:<port> --out <dir> --modes pixel
  --retro pixel --vw 624 --vh 288 --dsf 3 --shots "z1:5:150:label,…"`. Phone view:
  `--vw 844 --vh 390 --dsf 2 --retro crt`. The first pass's frames: `/tmp/pw2/base/`.
  `--extra "&pwup=0&pwaniso=0&pwlight=0"` draws the first pass from the new formats (A/B).
- **Debug views**: add `&pwdebug=mag` (frame pixels across one stored texel: green ≤ 1.25,
  yellow ≤ 1.5, orange ≤ 2, red > 2 — the density check of §3), `lvl` (the same for the texel
  actually drawn), `tone` (painted tone, glow magenta), `ramp` (a hue per ramp), `steps` (the
  tones the light moves each texel: green as painted, cyan −1, blue −2, violet ≤ −3, yellow +1,
  orange +2, red ≥ +3, glow white), `light` (the light itself, dark red … yellow) or `fog` (the
  fog band) to any `retro=pixel|crt` URL; everything that is not painted world is black.
  `__pwDebug('mag')` in the console switches views on a frozen frame.
- **Mood and motion**: `scripts/pixel-mood.mjs` (a shot's light levels, the same frame under
  mood variants) and `scripts/pixel-motion.mjs` (consecutive frames: paint / light / fog
  changes, strips) — §5. `&pwlight=0` = the first pass's light, `&pwmood=key:value,…` = values
  over every stage's mood.
- **Audit**: `node scripts/pixel-audit.mjs --base http://localhost:<port> --out <dir>
  [--shots "z1:5:150:label,…"]` (default: three views a stage and its boss) — per shot, on the
  exact 624 × 288 frame: `>1.5` / `>2` share of world pixels whose texel is wider than 1.5 / 2
  frame pixels (`>2 mid`: in the middle 80 % of the frame), `lvl>2` the same for the texel
  drawn, `flat` share of 16 × 16 world blocks with no drawn form (≤ 2 colours, or under 12 of
  480 adjacent pairs more than two monitor steps apart; `<label>-flat.png` boxes them),
  `colours`, `tiny` share of adjacent world pairs exactly one step of the monitor's 15-bit
  colour apart (smooth gradients, screen-door dither). Pass marks, printed with the table:
  `>1.5` ≤ 5 %, `>2 mid` ≤ 1 %, `flat` ≤ 4 %, `tiny` ≤ 20 %. The first pass (24 shots, means):
  20.9 % / 6.3 % / flat 12.7 % / tiny 65.1 %, `lvl>2` 37.1 %, 1293 colours
  (`/tmp/pw2/audit-v1.json`).
- **Tile dumps**: `PW_DUMP=<dir> npx vitest run tests/unit/pixel-world-dump.test.ts`; with
  `PW_UP=1` also `<tile>_up.png`, the tile as painted beside the upscaler's 2× copy.

## 9. The cast (characters, creatures, pickups) — PIXEL CAST 2

The owner, after seeing the plan above: *"the people are still a bit out of place looking so
make sure their detail and appearance is commensurate with the background. Fine for them to
look more 2D and less contoured."*

### Why they look out of place (see `/tmp/pw2/cast/a-texels.png`: raw sprite texels × 4)

The figures are at the right pixel size (1 texel = 1 frame pixel until a figure is 240 tall).
What is wrong is that they read as 3D models passed through a pixel filter:

1. **Contour shading.** Tone follows the normal of the blended field, so every limb is a tube
   with a dithered gradient round it and every torso a soft lump. That is pre-rendered-sprite
   shading (and the thing the owner calls "contoured"), not drawn 2D shading.
2. **Melted silhouettes.** Shapes are smooth unions: no drawn corners — shoulders, lapels,
   collars, cuffs, hems, heels and hair all round off.
3. **Faces and hands are specks.** At mid range a face is three pixels of feature.
4. **Greyed colour.** A multiplied stage tint dulls costumes into the background.
5. **Thin, even detail.** A few speckled stains; nothing designed.

### The target

Sprites of the same era as the backgrounds: Metal Slug 3's zombies and soldiers, the crowds
and fighters of Street Fighter III / Garou, Castlevania DS enemies. A sprite is DRAWN:

1. **Flat cel shading.** At most three tones of a ramp per material on screen: the base as a
   flat field; ONE shadow tone laid as a designed shape (a clean band down the side away from
   the light, under the chin, under an arm, below a hem, in the crook of a joint); a small
   highlight accent only on what shines (hair, leather, metal, wet gore, eyes). The shadow
   edge is crisp and simple (it does not wobble with every bump), and there is no dither
   round limbs. Dither appears only where a material's texture calls for it.
2. **Line.** A 1-pixel dark, coloured ink line round the silhouette; lighter interior lines
   where one part overlaps another AND where two materials meet (collar, cuff, belt, hem,
   shoe on trouser); a few deliberate fold strokes at joints.
3. **Shape design.** Silhouettes with corners: square or dropped shoulders, pointed collars
   and lapels, flared cuffs, torn hems as triangles, boots with heels and soles, hair as a
   designed shape (spikes, locks, a parting) with a highlight band. Hands, feet and heads a
   little big, fingers readable — always within what the hitboxes cover (the alignment tests
   rule: `tests/unit/pixelcast.test.ts`, `scripts/pixel-aim.mjs`).
4. **Faces read at mid range.** Zombies: big dark sockets with a glowing pin, brow ridge,
   a mouth shape with teeth, a nose shadow, a jaw that drops. The living: whites, pupils,
   brows that show fear, an open mouth. Use bigger stamps for heads ≥ 12 pixels.
5. **Detail equal to the world's.** A costume tells who the person was: a name badge, a
   pocket with pens, a patterned tie, hi-vis bands with a reflective glint, a tool belt, an
   apron with a logo, a wristband, laces. 4–6 drawn details per figure; wounds are shapes
   with a dark rim and a wet bright centre, not speckle.
6. **Colour and light.** Saturated costume colours, a step brighter than the architecture
   behind (the game reads first). Shadows are the ramp's own violet end. Stage light moves the
   whole figure by whole tone steps, in keeping with the world's mood (§5) but never leaving a
   figure darker than its surroundings; a 1-pixel coloured rim on the side facing a strong
   light (fire, neon, lightning). No multiplied grey tint.
7. **Grounding.** A pixel contact shadow in the world's style under the feet.

The same goes for dinosaurs (hide as flat fields with designed markings: stripes, a pale
belly band, scutes drawn along the back — not a noise of scales), bosses, pickups and thrown
things. Animation timing (12 redraws a second), hitboxes, budgets and CLASSIC stay as they
are. PIXEL CAST (`art=sprites`) shares the new cast; the old look is kept as a saved version.
