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

World texels are stored as *(ramp, tone)*. The material turns the light arriving at a texel
into a whole number of tone STEPS along that texel's own ramp (dithered in texel space at the
band edges), so lit and shaded paint is always a palette colour, shadows shift toward the
ramp's violet end and light toward its warm end. Ramps are extended beyond the six painted
tones (deeper night tones, brighter lit tones). Fog is bands, not a blend. Painters therefore:
paint as if evenly lit (tones 1–5 for form, 0 for outline), put GLOW only on light sources,
and paint fixed pools (lamp on a wall, neon on a shopfront) into the tile with tone shifts;
moving or flickering light comes from the stage lights through the material.

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

Still to come (the light part): ramp-step lighting through the extended palette (§5), banded
fog, palette-true output through the arcade-monitor pass. Until then the material lights paint
as the first pass did (palette colour × Lambert), so smooth gradients and the monitor's
ordered dither are still in every frame — the audit's `tiny` column measures exactly that and
cannot pass yet.

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
  `--extra "&pwup=0&pwaniso=0"` draws the first pass from the new formats (A/B).
- **Debug views**: add `&pwdebug=mag` (frame pixels across one stored texel: green ≤ 1.25,
  yellow ≤ 1.5, orange ≤ 2, red > 2 — the density check of §3), `lvl` (the same for the texel
  actually drawn), `tone` (painted tone, glow magenta) or `ramp` (a hue per ramp) to any
  `retro=pixel|crt` URL; everything that is not painted world is black. `__pwDebug('mag')`
  in the console switches views on a frozen frame.
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
