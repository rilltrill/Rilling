# d1 JUNGLE RUN — PIXEL WORLD 2 repaint work-list (scout report)

Scouted read-only against the reference build at http://localhost:5791 (first-pass look). Nothing
in the repository was changed. Everything below lives under `/tmp/pw2/scout/d1/`:

- `frames/*.png` — 37 art frames (624 × 288, every frame pixel 3 × 3, no CRT). `bNN…` = autoplay,
  `hNN…` = `--noauto --hud` (rings / HUD visible). `stats-1…5.json` = capture stats per run.
- `sheet.png` — one art frame per beat (18 beats, labelled, 1 : 1 art pixels).
  `sheet-extra.png` — the second instants of the move beats, the boss at 5 instants, the HUD frames.
- `crops/*.png` — the enlargements quoted below. `tools/crop.py <frame> x y w h out [scale]` makes more.
- `probe.json` (`tools/probe.mjs`) — every FLORA / stone billboard of the running stage with its
  sprite rect, world size and distance to the rail; every mesh with its triangle count.

**Crop boxes** are `(x, y, w, h)` in ART pixels (624 × 288; multiply by 3 for the PNG).
**Magnification**: px per texel = 260 / (texels per metre × distance in metres). Eye height 2.05 m
(drive), vertical FOV 58°, horizontal half-angle 50.2°: the ground at the bottom edge of the frame is
3.7–4.2 m away; a thing `L` metres to the side of the rail leaves the frame at 1.30 × L.

## 0. The verdict in eight lines

The bible says d1 "reads best". That is true at thumbnail size only. Zoomed to art pixels, d1 says
Minecraft / Roblox in eight ways, all measured:

1. **Every plant and every rock is drawn at 1–2 px per texel by design** (`FLORA_MIP_BIAS = 1.0`,
   `content/pixel/floraField.ts`: "a level is shown at 1–2 pixels per texel, never minified"), and the
   plants on the verge at 2.5–5 px (120 low plants overhang the road ribbon, 15 reach within 2.5 m
   of the camera path, the nearest 1.1 m). Plants are half of every frame. The world material uses
   bias 0.5; FLORA is a whole step coarser than everything else, at every distance.
2. `fit()` **stretches sprites**: a 40-texel fern is drawn 1.1–3.4 m tall (12–35 texels a metre), a
   48-texel bush up to 2.8 m. There is no such thing as a density for a plant today.
3. **The jungle floor is a mowed lawn**: ONE 8 m tile (256²) over a 1600 m plane, flat mid-green
   with dash strokes, 1.9–2.2 px texels at the frame bottom, no shade, no litter, and it meets the
   fog in a ruled horizontal line. You can see the horizon between every pair of trunks.
4. **The road is ONE 8 m tile over 700 m**: flat tan, 170 random pebbles, a fat-texel Bayer checker
   in every pale drift, the same pale patch every 8 m all the way to the vanishing point.
5. **The river is painted at 16 texels a metre** and the jeep parks IN it: 4–6 px skewed dashes
   over the lower half of the frame in a hold beat, exactly where the telegraph rings appear.
6. **Props are boxes and cylinders**: the tour car is a white refrigerator, the kiosk / hut /
   watchtower are plank boxes under slabs, fence posts are speckled grey boxes, the crate and the
   duffel are boxes, the fallen tree is a 19 m ruled cylinder, boulders are PAINTED to look low-poly.
7. **Landmarks are rectangles**: the waterfall is an 8 × 22 m blue curtain between two crags that
   read as mossy cobblestone; the palisade is one 2 m tile repeated 28 times.
8. **No painted light at all**: noon in a jungle and nothing casts a shadow — no shade under any
   tree, no canopy shade on the road, no contact shadow under any prop; sun shafts are ruled pale
   lines drawn across open sky.

The density budget is not the problem (§3: ≈ 33 of 48 MB; paint time is the tight one). Illustration, silhouettes, painted light
and the FLORA level rule are.

---

## 1. BEATS

18 beats (`src/content/stages/d1/index.ts`). Screen positions are computed from the spawn script
(eye 2.05 m, the beat's `look`) and checked on the HUD frames. HUD cover (all beats): score 0–150 ×
0–50, progress bar 230–370 × 15–30 (boss beat: name + bar 175–450 × 9–51), pause 570–615 × 8–50, hearts 10–130 × 255–275, bomb
145–195 × 230–278, weapon panel 420–612 × 222–278. Rings are yellow → orange → red circles 50–60 px
across with tick marks and a `!` above.

| # | kind · label | rail d | the scene | best shot | enemies / civilians / telegraphs on screen → keep calm |
|---|---|---|---|---|---|
| 0 | banner · title | 0 | Park gate 30 m ahead: palisade wall across the frame, kiosk left, flags, lawn, road; JUNGLE RUN card over it | `d1:0:120:b00` | none. The banner text sits over the gate (centre, y 90–190): gate + sign are the picture behind the stage title |
| 1 | action · gate opens | 0 | same; doors start to swing | `d1:1:60:b01` | none |
| 2 | wait · gate swings | 0 | same, 0.7 s; hood enters the frame | `d1:2:30:b02` | none |
| 3 | move · through the gate | 0 → 64 @11 | drive under the gate (pillars at 5.7 m, kiosk at 10 m, signpost right), then the first jungle road | `d1:3:90:b03a`, `d1:3:300:b03b` | 2 compys leap from the ferns at d 32: x 230 and 400, y 150–165; gem pickup right of centre y 95–120. Calm: road + inner verges x 180–450, y 130–200 |
| 4 | hold · compy ambush | 64 | jungle road, straight ahead, look 4° down | `d1:4:120:b04`, hud `d1:4:260:h04` | compys on the road and both verges: feet x 160–460, y 150–180; heads to y 135; near ones run to the hood (ring seen at 345–405 × 135–200). Gem 400 × 95–120. **Calm: the road surface and the first 2 m of both verges** |
| 5 | move · raptor chase | 64 → 138 @13 | jungle road; electric fence starts on the left at d 98; old breach (sparks) at d 124 | `d1:5:90:b05a`, `d1:5:300:b05b` | 2 raptors burst from the RIGHT ferns at d 76 (x 440–624, y 120–230, two rings at once); 3 compys centre road at d 100; 2 raptors from the LEFT at d 116 (x 0–200, y 120–220). **Calm: both verge fern belts where they burst out — no warm flowers, no bright speckle** |
| 6 | move · fence breach | 138 → 233 @12, yaw 14° left | fence section falls toward the road at d 154, 3 raptors through the gap; fallen tree comes into view | `d1:6:150:b06a`, `d1:6:330:b06b` | raptors at x 150–260, y 120–200 (in front of the fence + far trees); 4 compys right-centre at d 196. Calm: fence run and what is behind the gap |
| 7 | hold · fallen tree | 233 | the log across the road 14 m ahead, root plate left, crown right, 3 fuel drums, supplies, volcano behind | `d1:7:120:b07`, hud `d1:7:300:h07` | dilos at 215 × 154–177 and 440–475 × 154–180 (in front of the log's face); spit blobs + ring fly through x 170–500, y 45–140 (the sky, the volcano, both crowns); raptors 335–390 × 148–165 and from the right edge; compys 312 × 151–170; **ranger (civilian) 119 × 176–230** fleeing left through the left ferns; health 286 × 108–130; drums 347–364 × 149–180. **Calm: the log face, the sky over it, the bottom-left fern the ranger runs through** |
| 8 | action · blast the tree | 233 | explosion, halves fly | `d1:8:20:b08` | FX only |
| 9 | wait · debris settles | 233 | 0.9 s | `d1:9:30:b09` | none |
| 10 | move · to the meadow | 233 → 296 @12 | past the two log halves (3–5 m), crate + duffel at 3 m, puddle; meadow opens, sauropods, watchtower | `d1:10:90:b10a`, `d1:10:270:b10b` | 2 compys far left-centre (240–265 × 150–160) at d 270 |
| 11 | hold · stampede | 296 | open meadow, herd crosses left → right 25 m ahead on the churned band; volcano | `d1:11:150:b11`, `d1:11:60:b11a` | herd band y 150–185 full width (spectacle); 2 compys 200 × 167–196. Prompt STAMPEDE! |
| 12 | move · into the meadow | 296 → 329 @9 | drive over the churned band | `d1:12:120:b12` | none |
| 13 | hold · trike charge | 329 | meadow road; tour car 27 m ahead-right is flung; cycads, first crag left | `d1:13:120:b13`, `d1:13:330:b13b`, hud `d1:13:280:h13` | trike bursts at 332 × 150–162 and charges down the road centre: ring 275–385 × 95–210 (yellow, closing to red); compys 231 × 159–184; raptors 207 × 152–167 and 440 × 155–172; **civilian 84 × 170–209** fleeing left; bomb 215 × 112–139. **Calm: road centre and the pale distance right behind the trike** |
| 14 | move · cliff road | 329 → 497 @12, yaw 10° left, pitch 3° | car wreck right (12 m), then cliffs left (17–45 m), waterfall (45–60 m), river comes in from the left | `d1:14:120:b14a`, `d1:14:330:b14b`, `d1:14:560:b14c`, `d1:14:700:b14d` | pteros in the SKY x 200–450, y 40–110, diving at the jeep (d 370 and d 430); 4 compys centre road at d 408; raptor from the right edge at d 430. **Calm: the sky, the cliff tops / canopy line the pteros dive in front of** |
| 15 | hold · river ford | 497 | the jeep stands in the river; water fills the lower half; ford boulders, road climbing out, volcano | `d1:15:120:b15`, `d1:15:420:b15b`, hud `d1:15:260:h15` | compys ON THE WATER and the banks: 146 × 154–190, 394 × 148–176, 183 × 144–166, 411 × 141–159, 312 × 141–159; rings on the water 280–350 × 165–235 and 365–425 × 175–235; dilo 406 × 141–159; raptors 97 × 146–172 and right edge; **scientist (civilian) 579 × 163–212** fleeing right; health 229 × 86–115. **Calm: the whole water surface x 100–480, y 140–240** |
| 16 | move · riverbank | 497 → 512 @8 | out of the ford, river now on the right | `d1:16:60:b16` | bomb pickup right of centre |
| 17 | boss · HORNED DEVIL | 512 → 697 (tracks boss health, ≥ 37 s) | camera looks BACK over the jeep's roll bar and spare tyre: the road receding, river on the frame's left, treeline on its right, escarpment backdrop; side views when it flanks | `d1:17:600:b17b`, `d1:17:150:b17a`, `d1:17:1800:b17d`, `d1:17:2200:b17e`, hud `d1:17:520:h17` | boss on the road centre x 250–400, y 80–220; rings on its head (y 80–140) and tail; raptor pack beside it; flung rocks through the upper middle; red drums at the verges (x ≈ 150 / 470, y 190–240); boss name + bar 175–450 × 9–51; prompts across y 135–160. **Calm: road, both inner verges, the pale escarpment band behind its head (y 95–135)** |

---

## 2. OFFENDERS (ranked: how loudly each says "Minecraft / Roblox")

Each: **what** · where (beat, frame, crop) · anti-pattern · code · TREATMENT · effort.

### 1. River water at the ford — 4–6 px skewed dashes over half the frame
- b15 `frames/b15-ford-pixel.png` (0,150,624,138); `crops/b15-water.png`; h15 (rings on it); b16.
- Fat texels at **4.1 px** (16 tpm at 4 m), visible repeat (2 m period: 32-texel frames), dash
  noise as texture, high-contrast white dashes under pale compys and orange rings.
- `stages/d1/pixel.ts:D1PixelWorld.river` → `pixelworld/d1Water.ts:d1RiverTile` (208 × 32 × 8
  frames, `density: 16`), `d1FoamEdgeTile` (16 × 32 × 8), `d1EddyDecal` (32 × 48 × 8).
- TREATMENT — split the water into a painted STILL layer and small MOVING overlays:
  1. *Still layer, ford module* (river arc s = ford ± 12 m, i.e. rail d 487–515): unique module at
     **64 tpm**, 13 m across × 24 m along = 832 × 1536, registered as three 832 × 512 tiles laid end
     to end on the ribbon (so no paint step is a 1.3 M-texel tile). Painted across the channel: olive shallows
     where the gravel bed shows through (pebbles 4–9 texels, each lit top-left with a cast shadow,
     a submerged tyre rut where the road crosses, two stepping-stone slabs just under the surface),
     a sand bar with ripple marks, the broken mirrored silhouettes of the bank trees (dark teal,
     cut by 1-texel ripple lines), a teal body in three flat tones with lobed (not dashed) edges,
     the darker channel off-centre, weed streamers pointing downstream. Tones 2–4 only between
     x 100–480 of the hold view: the enemies' lane is the calm teal body.
  2. *Still layer, rest of the river* (upstream to the pool, downstream along the boss road, seen
     at ≥ 16 m): the same painting as a 16 m wrap at **32 tpm** (416 × 512).
  3. *Moving overlays* (cut-out strips, 8 frames to match the one animated material): current
     lines `128 × 64 × 8` at 64 tpm (broken horizontal dashes 1 texel high, two tones, sparse:
     ≤ 6 % coverage), glint crosses `64 × 64 × 8` in GLOW (≤ 12 on screen), bank foam `64 × 64 × 8`
     (scalloped lace, replaces the ruled white line), ring ripples round each ford boulder
     (`96 × 96 × 8`, low contrast, never under the enemies' lane: only on boulders at |lat| > 5).
  4. Where the road enters and leaves the water: a churned, muddier patch painted into the still
     layer (wheel splashes stay the existing FX).
- Effort **L**.

### 2. Verge plants brushing the camera — Minecraft leaves at 2.5–5 px
- b05a `frames/b05a-chase-pixel.png` (420,140,204,130) → 4.7 px blocks (`crops/b05a-fern.png`);
  b02 (440,170,184,118) (`crops/b02-roadnear.png`); b07 (0,120,150,168) fern at 2.5 px in front of
  the fleeing ranger whose own pixels are 1 px (`crops/b07-left.png`); b17b both bottom corners;
  b14b (60,150,200,100).
- Fat texels; mixed pixel sizes beside 1-px characters.
- `stages/d1/env.ts:JungleEnv.buildVegetation` (`layer('verge', 2.7, [4.4, 8.5] …)`, `'near'`,
  `'fill'`) → `floraSplit` → `FloraField.fit` (`content/pixel/floraField.ts`) → species
  `content/pixel/floraSpecies.ts`: `FERN` 112 × 64 / 1.7 m, `FERN_WIDE` 176 × 56 / 1.2 m, `BUSH`
  80 × 56 / 1.35 m, `BUSH_WIDE`, `GRASS` 48 × 48, `CYCAD` 96 × 88. Probe: 818 low plants, 417 within
  8 m of the rail, stretched to 9.6–63 tpm (median 24); 116 exceed 1.5 px at level 0; the b05a fern
  is a 112 × 32 sprite drawn 8.3 m wide and 2.4 m tall (13 tpm) with its foot 5.3 m from the rail.
- TREATMENT:
  1. New d1-only HERO species in a new file `pixelworld/d1Flora.ts`, painted natively at **64 tpm**
     and placed at their native size (± 10 %), three size classes instead of stretching:
     fern S 144 × 80 (2.2 × 1.2 m), M 216 × 120 (3.3 × 1.8 m), L 320 × 184 (5 × 2.8 m, a tree-fern
     crown on a short scaly trunk); bush 192 × 136 and wide 288 × 136; grass / reed tuft 96 × 96;
     cycad 256 × 232; elephant-ear clump 208 × 144 (the `EAR` species exists, unused in d1);
     4 variants each. Chosen in `floraSplit` when `this.pw` and the foot is within 8.5 m of the
     rail (417 plants); the rest keep today's sprites but placed at ≥ 20 tpm (clamp the stretch).
  2. In PIXEL WORLD only, slide any billboard whose inner edge is within 3.2 m of the rail outward
     along the rail normal until it is not (45 plants; deterministic from the position, no RNG).
     Nothing then comes nearer than ≈ 4 m in the forward views: 64 tpm = 1 px.
  3. What is drawn (a fern, M): 9–11 fronds; each a blade 6–8 texels wide with a pale midrib, pinnae
     3–5 texels long alternately lit (top) and in the ramp's violet-green shadow (underside), tips
     curling; back fronds two steps darker and cooler; a dark heart with two fiddleheads; one dead
     brown frond; three insect holes; 1-texel dew highlights on two fronds; a cast-shadow skirt of
     dark texels on its own lower fronds. No speckle anywhere.
- Effort **L**.

### 3. The FLORA level rule: all vegetation and rocks at 1–2 px per texel, everywhere
- Every frame; e.g. b05b (0,60,250,130) (`crops/b05b-fence.png`: trunk texels 2 px at 15–20 m),
  b17c both treelines, b14c (0,20,200,160).
- Fat texels by rule (a second, coarser pixel grid over half the frame).
- `content/pixel/floraField.ts`: `FLORA_MIP_BIAS = 1.0`, `FRAG_MAP`, `floraLevelFor`.
- TREATMENT: a per-field `mipBias` option; PIXEL WORLD fields (plants, stones, crown, roots, herd)
  use **0.5** like `pwMaterial` (a level is shown at 0.71–1.41 px per texel). The strand species
  already repaint each level to equal coverage (`balance`), so the mild minification does not thin
  them; check ferns and palms for crawl in `d1:5:90` and `d1:17:600` videos. Shared file: agree it
  with the foundation owner; PIXEL CAST keeps 1.0.
- Effort **S** (plus the check).

### 4. The jungle floor is a lawn
- All frames; worst b17e `frames/b17e-boss-pixel.png` (230,130,300,158) (`crops/b17e-lawn.png`),
  b03b (0,150,200,138), b05b, b10b (0,140,624,148).
- Flat empty plane; visible tile; fat texels (1.9–2.2 px at the frame bottom); speckle (1100
  random tufts); wrong colour (saturated lawn green under a rainforest); no painted light.
- `pixel.ts:D1PixelWorld.ground` (one `rect` 1600 × 1600 m) → `d1Tiles.ts:d1MeadowTile` (256²).
- TREATMENT — cut the ground into biome strips (rects in the rail frame, ± 64 m, joined under
  ragged decals), each its own 512 × 512 wrap tile at **64 tpm** (8 m), the far field one shared
  32-tpm tile:
  - **JUNGLE FLOOR** (d 34–262, 376–500 right of the road, 505–700 left of the road): base =
    leaf-litter umber / deep olive, two ramp steps UNDER the road so the road is the lit corridor;
    (b) value: canopy shade with sun dapples (stepped pools 20–60 texels, three rings, warm ramp);
    (c) construction: surface roots snaking 60–200 texels (lit top edge, shadow under), root
    buttress toes; (d) wear: drifts of fallen leaves as shaped 3–6 texel leaves in three hues
    (ochre, rust, pale underside), twigs, seed pods, a rotten branch with bracket fungus; (e)
    dressing: fern sprouts, moss cushions, a column of leaf-cutter ants (1-texel dots carrying
    green flecks), mushrooms in a ring, a puddle in a root hollow; (f) contact: dark step along
    the road's shoulder.
  - **GATE LAWN** (d −40…34): mown visitor lawn in two-tone mowing stripes, a gravel car-park
    apron with painted kerb stones, tyre arcs, flower beds ringed with whitewashed stones in front
    of the kiosk and the wall, litter of the evacuation (ticket stubs, a dropped park map, a
    child's cap, a tipped litter bin) — unique decals, not in the wrap tile.
  - **MEADOW** (d 262–376): grass in wind-combed drifts (shaped strokes 6–10 texels, three greens
    + a straw ramp), darker swales, bare game trails crossing the road, flower drifts in clusters
    (not single pixels), sauropod prints (1.2 m, a chain from the left giants across to the right),
    dung, a bleached rib cage far left as a cut-out card.
  - **RIVER FLATS** (river ± 10 m): shingle, sand, drift lines of twigs, reeds (cards, §23).
  - **Tree shadows** (the painted light of this stage): a dithered-edge dark ellipse decal under
    every tree and palm within 40 m of the rail (279), every bush and hero fern within 8 m, offset
    away from the sun (`sunDir [0.45, 1, 0.3]`: shadows fall toward −x −z, length ≈ 0.5 × height);
    two decal tiles 192 × 96 and 96 × 48 (ragged, with leaf-gap holes), tinted by vertex colour.
- Effort **L**.

### 5. The road: one 8 m tile, fat-texel checker, pebble speckle
- b05b (200,200,230,88) (`crops/b05b-road.png`: Bayer checker of 2 px texels, 2-px tuft dashes);
  b03b / b10b (road to the horizon: the same pale patch six times); b04.
- Fat texels (1.9–2.2 px), "checker dither made of fat texels", speckle, visible repeat, flat.
- `pixel.ts:D1PixelWorld.road` (one ribbon, 8 m) → `d1Props.ts:paintRoad` / `d1RoadTile` (256²).
- TREATMENT — **64 tpm**, three 512 × 512 segment variants (A dry crown, B shaded + leaf litter,
  C puddled) laid as 8 m ribbon segments in a fixed non-repeating order (hash of the segment
  index), still one batch; plus unique set-piece modules (512 × 512 each): gate threshold (cobble
  apron, cattle grid, painted STOP line, drag marks of the doors), the breach (claw skids, a
  dropped insulator), the blast site (scorch star, splinters — shown after beat 8 only if cheap;
  else a static scorch under the log), the herd crossing (§17), the two ford ramps (wet, rutted,
  gravel fans into the water), the boss road (three long claw gouges, a crushed sign).
  Passes: (a) base in three tones of packed laterite, no dither field; (b) value: sun-bleached
  crown, damp shoulders, canopy shade bands in B (≤ 1 ramp step: this is the enemies' lane);
  (c) construction: two ruts drawn as depressions (shadow lip on the sun side, lit lip opposite),
  tread chevrons 3 texels thick every 12, breaking up; a third faint motorbike track; (d) wear:
  washboard ripples before the holds, erosion rills running to the verges, mud-crack plates
  8–14 texels with lit edges in the hollows, stones 6–14 texels with a top-left light, core shadow
  and cast shadow, gravel in DRIFTS along the rut edges (never uniform), one root across the road;
  (e) dressing: leaf litter in the verge gutters, a crushed drink can, a ranger's cap, shell
  casings near the holds, raptor tracks crossing where they burst out (d 76, 116, 154);
  (f) contact: 2-texel shadow where the verge grass overhangs.
  The verge fringe becomes its own cut-out strip (grass blades 6–10 texels tall, drawn, irregular
  clumps, a few dry seed heads) overlapping the road edge: no ruled brown outline.
  Colour discipline: no saturated yellow-green on the road (compys), no orange / red.
- Effort **L**.

### 6. The waterfall: a blue rectangle between cobblestone
- b14c `frames/b14c-cliff-pixel.png` (0,20,200,160) (`crops/b14c-fall.png`); b17a / b17b (far).
- Straight box silhouette (8 × 22 m ruled quad), flat plane, blocky crags (texels 1.3–2 px by the
  level rule × 2–3 texel clusters = 3–5 px blocks).
- `pixel.ts:D1PixelWorld.waterfall` → `d1Water.ts:d1FallTile` (128 × 32 × 8, density 16),
  `d1FallLipModule`, `d1SplashModule`; crags `d1Species.ts:CLIFF_SPIRE(_WIDE)` scaled to 23.5 /
  33 m (3.9–7.5 tpm).
- TREATMENT — one painted cut-out MATTE of the whole falls, a fixed card facing the road:
  40 m wide × 34 m tall at **12 tpm** (480 × 408; seen from 45–60 m → 0.4–0.5 px per texel: the
  hand-made levels carry it; do not go lower, the boss chase looks back at it too). Drawn: a cliff
  amphitheatre in strata with drawn ledges and vertical joints, dark wet rock either side of the
  water, the river spilling from a V notch under an overhanging canopy crown with two emergent
  trees and a dead snag against the sky; the water in three leaps (a narrow chute, a ledge break
  at 2/3 height that fans into two veils, a last curtain into the pool), ferns and a fig rooted on
  the ledges, hanging vines across one veil, a rock tooth splitting the lower curtain.
  Animated overlays (8-frame strips, masked to the painted water by their own cut-out shapes — 3
  quads following the leaps, none rectangular): falling strands at two speeds, the lip curl, the
  plunge boil, two mist puffs drifting up (cards), a faint rainbow arc (static, five dithered hue
  bands, tones 4–5 only). Pool: foam rings (overlay), three boulders, a fallen trunk.
- Effort **L**.

### 7. The tour car: a white refrigerator
- b14a `frames/b14a-cliff-pixel.png` (380,140,150,80) (`crops/b14a-car.png`); b13 (365,125,55,40)
  mid-flip; the upturned copy b17e (15,150,80,35).
- Textured box, straight box silhouette (density is fine: it rests ≈ 12 m away → 0.65 px at 32).
- `pixel.ts:D1PixelWorld.tourCar` / `paintCar` → `d1Props.ts:d1CarSideModule` (148 × 32),
  `d1CarCabinModule` (96 × 28), `d1CarFrontModule`, `d1CarBackModule`, `d1CarPaintTile`,
  `d1CarUnderModule`, `d1TreadTile`, `d1WheelModule`, on the 2 × 1 × 4.6 body box + cabin box.
- TREATMENT — an extruded PROFILE (bible §4.5): the side silhouette of a park tour 4 × 4 (4.6 ×
  2.45 m: sloped bonnet, raked screen, long roof with rack and light bar, tailgate with the spare,
  wheel arches CUT OUT, bull bar and bumpers) swept across 2 m with a chamfered shoulder; painted
  side 224 × 120 at 48 tpm, two states (toppled / burnt-out for the boss-road copy). Livery in the
  park colours (cream with a red-yellow jungle stripe and the emblem), smashed side glass with the
  seats and a dangling belt behind, three parallel claw gouges through the stripe, a caved-in door
  with a lit dent rim, mud to the sills, a torn roof-rack tarp (cut-out card), one wheel bent
  outward, the underside drawn (chassis rails, exhaust, diff, prop shaft) since the flip shows it,
  a cast-shadow decal that follows it (dark dithered ellipse in the car batch at y 0).
  The profile must stay inside the hidden occluder box (§6): cut-aways ≤ 0.25 m.
- Effort **M**.

### 8. The fallen tree: a 19 m ruled cylinder
- b07 `frames/b07-tree-pixel.png` (150,130,330,60) (`crops/b07-log.png`): a brown bar with a ruled
  top edge across 53 % of the frame for a whole hold; b10a (0,130,220,158) (`crops/b10a-log-crate.png`):
  the halves at 3–5 m as smooth-banded cylinders, 3 px texels, the break a flat disc.
- Straight silhouette; smooth light bands; fat texels when passed.
- `pixel.ts:D1PixelWorld.tree` → `pwShapes.ts:pwCylinder` + `d1Tiles.ts:d1LogBarkTile` (192 × 64),
  `d1MossDrapeModule`, `d1LogEndModule`, `d1BarkTile`; crown / root plate FLORA (`BUSH`,
  `ROOT_PLATE` 104 × 112).
- TREATMENT: keep the cylinders (they fly apart) and
  1. break the top line with cut-out cards parented to each half: five snapped branch stubs of
     different lengths (two with leafy twigs), standing bark flakes, three bracket-fungus shelves,
     a strangler vine looping over and trailing to the ground, a fern and a bromeliad growing on
     top, moss cushions that overhang the edge; splinter cards (jagged, pale sapwood) round both
     faces of the break instead of the flat disc;
  2. repaint the bark at **64 tpm** as a 448 × 320 wrap (round × 5 m), form-shaded in the paint
     in five steps (lit top third, core shadow, a step of reflected green light near the ground):
     plated bark (plates 10–24 texels, lit left / top edges, fissure shadows), a long split showing
     pale wood near the break, three parallel claw gouges (pale, fresh — the story), woodpecker
     holes, lichen rosettes in three colours, a beetle column, moss drapes with hanging rootlets;
  3. root plate as a hero sprite 256 × 272 at 56 tpm (torn roots as drawn tapering shapes, clods,
     stones gripped in the roots, a hole of dark earth behind);
  4. a contact-shadow decal under the whole log and crushed ferns (decal cards) where it fell.
  Calm: the face of the log between x 200–230 and 430–480 of the hold view stays plain mid-brown
  (dilos stand in front of it): fungi and pale wood only between and above.
- Effort **M**.

### 9. Electric fence: speckled grey boxes
- b06b `frames/b06b-fence-pixel.png` (30,40,200,170); b05b (0,60,250,130); b06a (0,120,50,100) the
  falling section's DANGER plate at 3 px.
- Textured box (0.38 × 4.8 × 0.38 m `box` + box cap + box collar), speckle rust, wire spans at 16
  tpm (80 × 72 for 5 × 4.5 m).
- `pixel.ts:D1PixelWorld.fence` (`post`, `span`, `sign`) → `d1Props.ts:d1GalvTile` (32 × 64),
  `d1WireSpanModule`, `d1DangerSignModule` (36 × 29), `surfaces.ts:hazardTile`, `d1SmallTile`.
- TREATMENT: each post = two crossed cut-out cards 0.9 × 5.4 m at 48 tpm (44 × 260): a precast
  concrete / steel pylon with a tapered top and rain cap, five ceramic insulator stacks standing
  OUT on brackets (silhouette), a caged amber warning lamp (2 frames of GLOW, one of the loops),
  a conduit with clips, rust streaks below every bolt, chipped hazard chevrons at the foot, a
  creeper up one post in three, a concrete footing in the grass. Spans: 160 × 144 at 32 tpm, four
  variants: five wires 1 texel thick with sag and tension springs, a readable DANGER 10 000 VOLTS
  plate (pixel font, lightning glyph), a snagged palm frond, a scorched vine; at the old breach
  (d 124) torn wires curling down with a sparking tip (4-frame GLOW). The breakable section uses
  the same art in its pivot frame.
- Effort **M**.

### 10. Supply crate and duffel: two boxes at 3 m
- b10a `frames/b10a-tomeadow-pixel.png` (95,165,125,123) (`crops/b10a-log-crate.png`).
- Textured boxes; fat texels (32 tpm at 2.5–3.5 m = 2.3–3.2 px; the crate face is 32 × 24 texels).
- `pixel.ts:D1PixelWorld.tree` (supplies) → `d1Props.ts:d1CrateModule` (32 × 24), `d1CanvasTile`,
  `d1KitFrontModule` (32 × 20).
- TREATMENT — tier **96**. Duffel → a cut-out billboard (it is roundish): a slumped canvas kit
  bag 96 × 64 with a rolled mat strapped on, a canteen, a machete handle, the ranger patch.
  Crate stays a box (it IS a box) with 68 × 48 faces: drawn boards with lit top edges and worn
  corners, rope handles as cut-out loops, the lid ajar with straw and three flare tubes standing
  out (something on top), stencil RANGER STN 4, a ranger's hat on the corner, a dropped radio with
  a blinking LED (2-frame GLOW), a spent flare on the ground. Contact shadow decal.
- Effort **S**.

### 11. Kiosk, river hut, watchtower: plank boxes under slabs
- b02 `frames/b02-gateswings-pixel.png` (100,90,140,80) (`crops/b02-kiosk.png`: TICKETS is 21 × 5
  px of mush); b17d (60,140,130,100) (`crops/b17d-hut-drum.png`); b10a (432,95,22,60).
- Textured box + flat slab roof with ruled eaves; signs designed for no viewing distance.
- `pixel.ts:D1PixelWorld.kiosk` (`b.box` walls, roof `box` 3.8 × 0.3 × 3.2, `d1KioskWindowDeepModule`
  64 × 48, `d1TicketsBoardModule` 48 × 12, `d1MapBoardModule` 48 × 32, `d1ThatchTile`,
  `d1ThatchFringeTile`), `bossDressing` (hut, jetty), watchtower by `rule` → `planksTile`.
- TREATMENT: the kiosk is seen at 18 m for the title and at 10–12 m when passed → 32–48 tpm is
  enough; it needs a drawn SHAPE. Front elevation as one module 5.2 × 4.2 m at 48 tpm (250 × 202)
  standing proud of the box as a cut-out: a hipped palm-thatch roof with ragged eaves, crossed
  ridge poles with lashings and a carved raptor-head finial, the shutter propped open on a stick,
  the counter with a ticket roll, a cash tin, a bell, a postcard rack, the price board; side
  elevation 4.4 × 4.2 m the same way (park map under a little roof, a fire bucket, a leaning
  bicycle). TICKETS board 2.4 × 0.6 m with 0.45 m caps (7 px at 18 m). Around it: queue posts
  with a sagging rope (cut-out cards), a CLOSED board swinging on one hook (2-frame), brochures
  on the lawn. Watchtower: one cut-out card 4 × 10.5 m at 24 tpm (96 × 252): braced stilts,
  ladder, thatch, a rifle rack, a torn flag. River landing: §32.
- Effort **M**.

### 12. The palisade: one 2 m tile, 28 times
- b00 `frames/b00-title-pixel.png` (0,110,624,60); b03a (0,80,240,90).
- Visible tile repeat (64 × 224 = 2 × 7 m, 14 per side, both faces), ruled foot line on the lawn,
  ruled rail lines; it is the background of the stage's title card.
- `pixel.ts:D1PixelWorld.gate` → `d1Tiles.ts:d1PalisadeTile`.
- TREATMENT: one unique module per side, 28.4 × 7.5 m at 32 tpm (912 × 240; back faces reuse it
  flipped): stakes of differing height, width and lean, three pale replacement stakes, a section
  patched with corrugated sheet, a charred, claw-raked section, rope lashings, vines; on it: a
  hand-painted WELCOME TO PRIMAL ISLAND mural with a cartoon raptor (left wall), a row of faded
  pennant strings from the gate to the flagpoles (cut-out cards), a floodlight on a pole and a
  loudspeaker horn above the stake tips, a lookout parasol behind the wall (silhouette pieces);
  the foot hidden by a cut-out weeds-and-stones card and a cast-shadow decal strip on the lawn.
- Effort **M**.

### 13. Gate: the stage's name is unreadable on its own title card
- b00 (285,100,60,12): PRIMAL ISLAND is gold mush at 30 m (2-texel strokes at 0.27 px per texel);
  readable only at d 8 (b03a). Pillars / beams: 8-sided cylinders with a 64² bark tile (1.4 px when
  passed at 5.7 m), no carved shapes, torches with no bracket shadow or smoke.
- Sparse paint, unreadable sign, cylinder silhouettes.
- `pixel.ts:D1PixelWorld.gate` → `d1Tiles.ts:d1GateSignModule` (198 × 61), `d1BarkTile`,
  `d1HewnTile`, `d1IronTile`, `d1GateDoorModule` (136 × 256), `d1EmblemPlaqueModule`,
  `d1Water.ts:d1FlameModule`.
- TREATMENT: sign letters 1.0 m bold caps with 0.16 m strokes and a dark carved drop edge
  (9 px tall at 30 m), board 400 × 128 at 64 tpm with a carved border, bolt heads, a bullet-pocked
  corner and a hand-daubed CLOSED slash; pillar bark at 64 tpm with form shading in the paint;
  silhouette pieces: carved raptor-skull totems on both pillar caps, horn-and-bone charms hanging
  from the cross beam (2-frame sway), rope lashings with frayed ends, iron torch brackets, thatch
  ridge with a ragged edge on the roof board; doors 272 × 512 at 64 tpm (they stand at 5.7 m when
  passed): adze marks, iron straps with rust runs, a bar bracket, claw gouges at raptor height,
  posters (FEEDING 3 PM, a hand-written EVACUATE). Torch smoke wisps (cards, 4-frame).
- Effort **M**.

### 14. Cliffs: mossy cobblestone pillars
- b14b `frames/b14b-cliff-pixel.png` (0,40,260,170); b14c (0,20,105,160); b17a (250,60,130,130);
  b13 (110,60,190,85).
- Blocks of 3–5 px (2–3 texel clusters at 1.3–2 px), green squares for moss, 44 separate pillar
  billboards that all turn to face the camera (a cliff that swivels), flat tops.
- `env.ts:JungleEnv.buildCliffs` → `pixel.ts:D1PixelWorld.stone` → `stones.fit('cliffSpire' …)` →
  `d1Species.ts:paintSpire` / `paintSpireWide` (64 × 176 for 16 m, 112 × 128 for 12 m; drawn at
  3.9–12.5 tpm).
- TREATMENT: a painted CLIFF WALL of fixed cut-out cards (PwBatch quads, not billboards) in two
  staggered planes along lateral −21 and −33, d 384–440 and behind the falls: four unique panels
  28 × 22 m at **16 tpm** (448 × 352), each used twice (flipped, re-tinted), yawed ± 12° so the
  wall has depth. Drawn like the backdrop escarpment but a contrast step higher: strata bands
  with ledges that catch light, vertical joints, overhang shadows in the violet ramp, talus fans
  with boulders at the foot, a dark cave mouth low on one panel, **pterosaur nests on the ledges**
  (stick piles, pale eggs, white guano streaks below — the pteros of this beat dive from here),
  hanging gardens, root curtains, crowns of jungle overhanging the rim with sky holes. Keep ten
  crag billboards (repainted at 16 tpm, 144 × 256) as loose foreground stacks.
  Upper band calm: behind the ptero paths (y 40–130 of b14) the wall is light, low-contrast rock.
- Effort **L**.

### 15. Boulders painted as low-poly rocks
- b16 `frames/b16-riverbank-pixel.png` (50,130,200,100) (`crops/b16-rocks.png`); b17d (65,170,60,45)
  and the black blobs at (435,190,50,35); b07 (0,220,50,60).
- Flat facets with hard black outlines (a Roblox rock, in pixels); 2–3 px texels within 8 m.
- `d1Species.ts:paintBoulder` (`BOULDER` 48 × 40 / 1.2 m, `BOULDER_MID`, `BOULDER_WIDE`,
  `BOULDER_RIVER`, `BOULDER_RIVER_WIDE`); probe: 214 boulders, 66 within 8 m.
- TREATMENT: repaint at **64 tpm** (96 × 80, 112 × 64, 128 × 48) as water-worn, rounded stone:
  form shading in five ramp steps with a reflected-light step at the base, outline only on the
  shadow side and in the ramp's dark tone, bedding cracks that follow the form, lichen rosettes,
  a moss cap with a drooping fern, a wet band + lace of foam for the river family; add two GROUP
  sprites (3–5 stones with ferns between, 256 × 128) for the ford and the landslide; lift the dark
  variant's base to tone 2 (never a black blob). Native size, no stretching.
- Effort **M**.

### 16. Bushes are speckle balls
- `crops/b17d-hut-drum.png` (the bush behind the drum), b05b (155,165,60,45), b17e (230,200,100,60),
  b06a (25,175,160,50).
- Even speckle used as texture.
- `content/pixel/floraSpecies.ts:BUSH`, `BUSH_WIDE`.
- TREATMENT (with §2, in `d1Flora.ts`): leaf CLUSTERS — clumps of 6–10 drawn leaves (4–7 texel
  ovals with a midrib highlight) in three depth layers (dark interior holes, mid, lit top-left
  clumps), a twig structure showing in the gaps; variants: broad-leaf shrub, heliconia with small
  bracts (dull coral, never ring-orange), fan-palm seedling, a flowering shrub (pale lilac).
- Effort **M** (part of the hero FLORA slice).

### 17. The stampede band: camouflage mosaic with ruled edges
- b12 `frames/b12-intomeadow-pixel.png` (0,140,250,148) (`crops/b12-trample.png`); b11 (0,160,624,30).
- Visible tile repeat (a 4 m tile 33 × along, 4 × across), fat texels when driven over, muddy
  brown / lime blotches, straight band edges.
- `pixel.ts:D1PixelWorld.trample` → `d1Tiles.ts:d1TrampleTile` (128²).
- TREATMENT: the crossing itself (12 × 12 m on the road) a unique module at **64 tpm** (768 × 768,
  three 768 × 256 tiles): churned mud with dozens of overlapping three-toed prints (0.6 m: toes,
  heel pad, lit rim, water standing in the deepest), slide marks, the road's ruts smashed, a
  flattened park sign, an uprooted cycad (card), dung; the wings a 16 m wrap at 32 tpm (512²)
  painted WITH a direction (grass combed flat along the run, torn turf, prints thinning outward),
  its edges broken by cut-out clod-and-tuft cards: no ruled edge.
- Effort **M**.

### 18. The horizon: a ruled pale band and ghost cut-outs
- b10b `frames/b10b-tomeadow-pixel.png` (0,125,624,20); b16 (280,90,220,70) (`crops/b16-horizon.png`:
  fully fogged canopy crowns = flat pale rectangles over the painted range); b07 (230,100,200,70).
- Ruled line where the flat ground meets the fog; fogged plants as flat one-colour shapes; smooth
  fog blend on the billboards.
- `env.ts` fog (near 38, far 140), `FloraField` `far: 150`, `pixel.ts:buildBackdrop`
  (`d1TreelineTile`, el −1.5…3.5°, radius 220).
- TREATMENT: (a) a new UNFOGGED mid-treeline backdrop layer at radius ≈ 165, `follow` 0.97,
  el −1…6° (2048 × 80): a jungle wall in three value bands (dark understory with trunk gaps, mid
  canopy, lit emergent crowns) with a lobed, stepped mist line at its foot that covers the
  ground / fog join; (b) cull the plant field at 115 m with a 3-step ordered dissolve so nothing is
  drawn above ≈ 80 % fog; (c) FLORA takes the foundation's banded fog (never a flat ghost: the
  last band keeps two tones).
- Effort **M**.

### 19. A jungle you can see straight through
- b03b `frames/b03b-gate-pixel.png` (0,60,624,110); b05a; b17c; b14d.
- Sparse stickers on a plane: no understory mass, no depth layers, the same umbrella tree
  (`CANOPY_TREE`, 5 variants) both sides for 700 m; it reads as savanna.
- `env.ts:JungleEnv.buildVegetation` (`'mid'` every ≈ 10 m at 10–24 m, `'far'` every 6.5 m at
  22–48 m); `floraSpecies.ts:CANOPY_TREE`, `JUNGLE_TREE`, `PALM`.
- TREATMENT: JUNGLE WALL cards (fixed cut-out quads in the `veg` batch, no RNG: placed by rail
  distance): three panels 24 × 12 m at **24 tpm** (576 × 288), every 22 m on both sides at
  lateral ± 19 (yaw ± 12° alternating) and a second plane at ± 31 tinted a fog step paler:
  a wall of trunks, lianas, strangler figs, tree ferns, giant leaves, dark violet-green gaps, lit
  leaf masses along the top with sky holes cut out. Where: d 36–258 both sides (behind the fence
  on the left), d 378–500 right side at ≤ 8 m tall (pteros must stay against the sky), d 512–697
  left side at −24 (beyond the boss's lane). Not in the meadow (herd and giants cross there).
- Effort **L**.

### 20. No painted light
- Every frame: e.g. b03b (60,130,100,40) trees standing on the lawn with no shadow; b00 the gate
  and wall cast nothing; b14a the wreck floats.
- Flat, sticker look (the "Roblox noon").
- Absent: nothing builds shadows (`pixel.ts`).
- TREATMENT: tree / bush shadow decals (§4), canopy shade bands in road variant B and the jungle
  floor, the gate's and palisade's cast shadow across the approach lawn and road threshold (one
  decal 20 × 6 m, stake-tooth edge), contact shadows under log, wreck, crate, drums, kiosk,
  posts; sun DAPPLES as warm stepped pools on the road shoulders and trunks in the jungle
  sections. All as ramp-shift decals / painted into the tiles (bible §5), ≤ 1 step on the road.
- Effort **M**.

### 21. Sun shafts: ruled pale lines across the sky
- b03b (370,10,30,90); b05a (460,0,40,70); b06b (250,15,30,60); b07 (470,0,40,130); b04 (420,25,20,60).
- Straight-edged translucent planes, visible against open sky where no canopy exists.
- `env.ts:buildVegetation` (shafts) → `pixelworld/d1Shafts.ts:d1ShaftMaterial`, `mergeShafts`.
- TREATMENT: drop every shaft that has no jungle-wall card behind it; redraw the rest as painted
  cut-out ray cards (96 × 352: three to five tapering rays with broken, dithered edges, a
  4-frame mote sparkle) seen against the dark wall only, with a matching dapple pool on the
  ground where each lands.
- Effort **S**.

### 22. The jeep: 2.4–5.4 px texels along the bottom of every frame
- b04 (170,240,280,48) (`crops/b04-hood.png`: the hood stripe is camo blocks, the emblem a 32²
  decal); b17d (90,230,440,58) (`crops/b17d-rollbar.png`).
- Fat texels (48 tpm at 1–2.3 m); also the hood EMBLEM is a red disc in a yellow ring — the
  telegraph colours and shape — beside the lane where near enemies get their rings.
- `stages/d1/jeepPixel.ts:D1JeepPixel.paintBody` → `pixelworld/d1Jeep.ts` (`JEEP_TPM = 48`,
  `d1JeepPaintTile` 64², `d1HoodStripeDecal` 12 × 48, `d1EmblemDecal` 32², `d1TubeTile` 16 × 128).
- TREATMENT: `JEEP_TPM` **128**. Hood as one unique module (1.5 × 1.2 m = 192 × 154): panel seams,
  louvres with shadow slots, latches, the stripe with chipped edges, mud flung in arcs from the
  wheels, a dent with a lit rim, heat-blued paint by the gun mount, stencil PI-07, dead leaves in
  the scuttle; windscreen frame with wiper stubs and a hinge; roll bar with foam padding and zip
  ties; spare tyre tread and rim; ammo box with a belt. The emblem repainted worn and half under
  mud, tones 2–3 of its ramp, the yellow ring chipped to primer.
- Effort **M**.

### 23. River banks: three ruled stripes
- b16 (0,170,330,60); b14d (0,165,330,25); b15 (0,165,300,40).
- Parallel ruled bands (brown line, tan line, white line); the river is coplanar with the lawn,
  no bank at all.
- `pixel.ts:D1PixelWorld.river` → `d1Water.ts:d1BankTile` (80 × 128 = 2.5 × 4 m), `d1FoamEdgeTile`.
- TREATMENT: bank ribbon 4 m wide, 64 tpm in the ford arc (256 × 512, two mirrored) and 32 tpm
  elsewhere: scalloped bays, sand spits, cobble bars, exposed roots, animal slides and prints to
  the water, a dark undercut line with a reflection band on the still-water layer. Standing
  cut-out cards along the waterline: reed beds (4-frame sway), arum leaves, grass overhang,
  driftwood snags, a half-sunk tour canoe with its number.
- Effort **M**.

### 24. Trees: thin ringed poles, 2 px texels, one silhouette
- b05b (0,60,250,130); b17c (0,80,200,110) and (420,40,204,150); b14d (0,60,260,110).
- Fat texels on the trunks (jungle tree 216 texels for 17 m = 12.7 tpm; 81 tall plants within
  14 m of the rail: 2–2.5 px), ring-banded straight trunks, crown repetition.
- `content/pixel/floraSpecies.ts:JUNGLE_TREE` (256 × 216 × 6), `CANOPY_TREE` (184 × 136 × 5),
  `PALM` (144 × 184 × 4).
- TREATMENT (in `d1Flora.ts`, PIXEL WORLD only): split near trees (foot within 25 m: 162) into a
  TRUNK sprite (0–7 m at **32 tpm**, 160 × 224, five kinds: kapok with plank buttresses, strangler
  fig lattice, liana-wrapped bole, palm bole with boot scars, tree fern) and a CROWN sprite
  (≈ 12 × 9 m at 20 tpm, 240 × 180, eight kinds, at most a third flat umbrellas) stacked at the
  same foot (`add(key, x, y + 6, z, …)`), trunk sway 0. Epiphytes, bromeliads, hanging lianas with
  leaf pairs, sky holes in every crown.
- Effort **L**.

### 25. The herd: flat grey shapes
- b10a (0,60,110,90) and (540,80,84,70); b11 (0,135,60,35).
- 6.4 tpm sauropods and 14 tpm hadrosaurs shown at 1.4–1.8 px, two flat tones, ghosts in the fog.
- `pixelworld/d1Herd.ts:SAURO_WALK` (112 × 96 / 15 m), `HADRO_RUN` (96 × 56 / 3.9 m);
  `stages/d1/herdPixel.ts`.
- TREATMENT: 2 × canvases (224 × 192, 192 × 112), five-step form shading, counter-shaded belly,
  skin folds at the joints, a dorsal pattern, dust at the feet, bias 0.5.
- Effort **M**.

### 26. Puddles: a grey ellipse
- b10a (300,205,50,35); b11 (305,195,40,12).
- Flat, stair-stepped edge, 2 px texels.
- `pixel.ts:D1PixelWorld.puddle` → `d1Tiles.ts:d1PuddleDecal` (64 × 40).
- TREATMENT: 160 × 96 at 64 tpm, three variants: sky in two bands with a reflected canopy edge,
  a drying mud rim with cracks, a floating leaf, a tyre track through one. No animation and no
  bright ring on the road (rings mean danger).
- Effort **S**.

### 27. Signposts: a ruled bar with boards
- b03a (500,115,80,110); b10b (415,120,50,75).
- Box post (`b.box 0.16 × 2.6 × 0.16`).
- `pixel.ts:D1PixelWorld.signpost` → `d1Props.ts:d1ArrowSignModule` (48 × 12), `planksTile`.
- TREATMENT: one cut-out card per signpost (post + boards as a drawn shape, 96 × 132 at 48 tpm):
  a leaning hewn post with a carved top and moss, boards with chipped paint, distance numerals,
  a bullet hole, one board hanging by a nail (2-frame swing), a lizard on the post.
- Effort **S**.

### 28. Fuel drums at 32 tpm
- b17d (145,195,35,50) (`crops/b17d-hut-drum.png`); b07 (345,140,40,45).
- 1.6–1.8 px when a boss drum is at the verge; flat lid.
- `pixel.ts:D1PixelWorld.drum` → `d1Props.ts:d1DrumTile` (80 × 32), `d1DrumLidModule`.
- TREATMENT: 160 × 64 at 64 tpm, AVGAS stencil, two dents with highlights, drips; the hazard
  diamond stays the brightest thing on it (it is a target); same cylinder (§6).
- Effort **S**.

### 29. Flags hang like boards
- b03a (148,37,70,50) and (440,40,40,45).
- Static rectangles (48 × 32).
- `pixel.ts:D1PixelWorld.kiosk` → `d1Tiles.ts:d1FlagModule`.
- TREATMENT: an 8-frame flutter strip (72 × 48 × 8) with a torn fly edge and the emblem folding.
- Effort **S**.

### 30. The end barricade and landslide
- (seen only at the end of the boss chase, behind the camera for most of it.)
- Boards module fine in density; the landslide is the low-poly boulders.
- `pixel.ts:D1PixelWorld.barricade` → `d1Props.ts:d1BarricadeModule` (176 × 32).
- TREATMENT: the boulder group sprites of §15; two amber lamps blinking (2-frame GLOW), hazard
  tape torn and trailing, ROAD CLOSED — LANDSLIDE in 0.4 m caps.
- Effort **S**.

### 31. The backdrop escarpment and volcano (keep, small fixes)
- b17b (240,95,170,35) the escarpment as pale tan organ pipes; b11 the volcano's broad grey
  stripes.
- Mild: the best painted things in the stage. The escarpment's buttresses are evenly spaced.
- `pixelworld/d1Sky.ts:d1EscarpTile`, `pixelworld/d1Volcano.ts:d1VolcanoTile`.
- TREATMENT: vary the buttress rhythm and add two waterfall threads + a mist bank at its foot;
  the volcano gets a lava tongue with a GLOW core and an animated plume top (8-frame card) —
  one of the stage's loops, visible in nine beats.
- Effort **S**.

### 32. The river-tours landing: a box, a slab, a plank
- b17d (95,150,45,25); b16 (410,132,20,12).
- Box hut + box deck on six cylinders at 25–32 m.
- `pixel.ts:D1PixelWorld.bossDressing`.
- TREATMENT: one matte card 14 × 6 m at 24 tpm (336 × 144) on the far bank: the hut's front with
  a tin roof and a RIVER TOURS board (0.5 m caps), the jetty on posts with their reflections, two
  moored canoes, a life ring, a fuel pump, a lamp post; a pennant flapping (overlay strip).
- Effort **S**.

**Top of the list for a viewer's eye:** 1, 2, 3, 4, 5, 6, 7 — fix those and the stage stops saying
"blocks"; 8–20 make it say "painted".

---

## 3. DENSITY MAP

Tiers per the bible (§3): ≥ 6 m → 32, 3–6 m → 64, 1.8–3 m → 96, < 1.8 m → 128. "Nearest" is the
nearest distance the thing is on screen and not clipped at the edge. World texels cost 2 bytes ×
1.33 (levels) = 2.67 B; FLORA atlases are 1 byte × 1.33; the backdrop has one level (2 B).

### World atlas (`PwAtlas('d1')`: today 99 tiles, 573 138 texels, 1024 × 848)

| surface / prop class | nearest normal view | tier | today (tile, texels) | new native paint (texels) |
|---|---|---|---|---|
| Road ribbon, 8 m × 699 m | 3.7–4.2 m (frame bottom) | **64** | `d1RoadTile` 256², 65 536 | 3 × 512² + 6 set-piece modules 512² = 2 359 296 |
| Verge fringe (new cut-out strip) | 4.5 m | 64 | inside the road tile | 2 × 64 × 512 = 65 536 |
| Jungle floor / lawn / meadow / river flats (within ± 12 m of the rail) | 4.5–5.6 m (frame bottom corners) | **64** | `d1MeadowTile` 256², 65 536 (one tile for 1600 × 1600 m) | 4 × 512² = 1 048 576 |
| Ground beyond ± 12 m | ≥ 12 m | 32 | same tile | 1 × 256² (reuse of the meadow level) = 65 536 |
| Ground decals: patches, puddles, litter, tree shadows, cast shadows | 4–6 m | 64 | `d1PatchDecal` 96 × 64 × 3, `d1PuddleDecal` 64 × 40 × 2 = 23 552 | ≈ 220 000 |
| Stampede crossing on the road | 4.2 m (driven over) | 64 | `d1TrampleTile` 128², 16 384 | 768² = 589 824 |
| Stampede band wings | ≥ 10 m | 32 | same | 512² = 262 144 |
| River, ford arc (d 487–515) | 3.7–4.2 m | **64** | `d1RiverTile` 208 × 256 @16 tpm, 53 248 | 3 × 832 × 512 = 1 277 952 |
| River elsewhere | ≥ 16 m | 32 | same | 416 × 512 = 212 992 |
| Water overlays (current, glints, foam, rings; 8 frames) | 4 m | 64 | `d1FoamEdgeTile`, `d1EddyDecal` = 20 480 | ≈ 200 000 |
| Bank, ford arc | 4–6 m | 64 | `d1BankTile` 80 × 128 × 2 = 20 480 | 2 × 256 × 512 = 262 144 |
| Bank elsewhere + waterline cards (reeds, snags, canoe) | ≥ 13 m | 32 | same | ≈ 130 000 |
| Waterfall matte + its overlays, pool | 45–60 m | 12 (matte) | `d1FallTile` 128 × 256, lip, splash = 65 536 | 480 × 408 + ≈ 110 000 = 305 840 |
| Cliff wall cards (4 panels) + crag stacks | 20–45 m | 16 | (FLORA stones today) | 4 × 448 × 352 = 630 784 |
| Jungle wall cards (3 panels) | 19–31 m | 24 | — | 3 × 576 × 288 = 497 664 |
| Palisade (2 sides) | 7 m passing, 30 m for the title | 32 | `d1PalisadeTile` 64 × 224, 14 336 | 2 × 912 × 240 = 437 760 |
| Gate pillars / beams (bark, hewn, iron, totems, charms) | 5.7 m | 64 | `d1BarkTile` 64² etc. ≈ 12 000 | ≈ 90 000 |
| Gate doors | 5.7 m | 64 | `d1GateDoorModule` 136 × 256, 34 816 | 272 × 512 = 139 264 |
| Gate sign, plaques | 8 m (read at 30 m) | 64 | 198 × 61 + 48², 14 382 | 400 × 128 + 96² = 60 416 |
| Kiosk elevations, boards, queue cards, crate | 10–18 m | 48 | ≈ 16 000 | ≈ 110 000 |
| Flags (8-frame flutter) | 8 m | 32 | 48 × 32 × 4 = 6 144 | 2 × 72 × 384 = 55 296 |
| Fence posts (crossed cards), spans, plates | 11–13 m (breach section 5 m) | 48 / 32 | `d1GalvTile`, `d1WireSpanModule` 80 × 72 × 3 ≈ 30 000 | ≈ 125 000 |
| Fallen tree bark, cards, splinters | 14 m in the hold, 3–5 m passing | 64 | `d1LogBarkTile` 192 × 64 etc. ≈ 30 000 | ≈ 215 000 |
| Supplies (crate box, duffel card, radio, hat) | 2.5–3.5 m | **96** | ≈ 2 500 | ≈ 30 000 |
| Fuel drums | 5.7 m (boss road), 12 m (tree) | 64 | 80 × 32 + 32², 3 584 | 160 × 64 + 64² = 14 336 |
| Tour car (2 states) | 12 m at rest, 27 m in the hold | 48 | ≈ 35 000 | ≈ 110 000 |
| Signposts, watchtower, barricade, river landing matte | ≥ 6 m / 28 m / 25 m | 48 / 24 / 24 | ≈ 15 000 | ≈ 140 000 |
| Generic leftovers (rock face, planks, hazard, grate via `rule`) | ≥ 10 m | 32 | ≈ 40 000 | **stay at the 2 × upscaled fallback** (≈ 160 000) |
| **World total** | | | **573 138** | **≈ 9.8 M texels → 25.0 MB** |

### Other atlases

| atlas | nearest | tier | today | new |
|---|---|---|---|---|
| Sky / backdrop (`d1-sky`, one level) | ∞ (≈ 0.87 px per texel) | 2048 round | 952 064 texels | + mid treeline 2048 × 80 and plume strip ≈ 1.15 M → 2.3 MB |
| Jeep view model (`d1-jeep`) | 1.0–2.3 m | **128** | 38 976 texels @48 | ≈ 330 000 → 0.9 MB |
| FLORA plants (`d1`, R8) | far set: ≥ 8.5 m, drawn at ≥ 20 tpm | — | ≈ 760 000 (11 species) | unchanged ≈ 760 000 → 1.0 MB |
| FLORA hero low plants (new, R8) | 4 m after the slide-out | **64** | — | ferns 46k + 104k + 236k, bushes 104k + 157k, grass 28k, cycad 178k, ear 120k ≈ 975 000 → 1.3 MB |
| FLORA trunks + crowns (new, R8) | 8.7 m (lat 6.7) | 32 / 20 | — | 5 × 4 × 160 × 224 + 8 × 240 × 180 ≈ 1 060 000 → 1.4 MB |
| Stones (`d1-stones`, R8) | 4.5 m | 64 | ≈ 45 000 | boulders 4 × 96 × 80 + 3 × 112 × 64 + 2 × 128 × 48 + river 4 + groups 2 × 256 × 128 + 10 crags 144 × 256 ≈ 520 000 → 0.7 MB |
| Herd (R8) | 25 m / 46 m | 28 / 13 | ≈ 64 000 | ≈ 260 000 → 0.35 MB |

### Does it fit?

- **Memory: yes.** 25.0 (world) + 2.2 (sky) + 0.85 (jeep) + 4.55 (all FLORA) ≈ **32.6 MB of 48 MB**
  with levels. Headroom ≈ 15 MB: enough to take the river outside the ford to 64 tpm or the
  jungle walls to 32 if the audit asks.
- **Paint time is the real limit** (≤ 1.2 s cold on the test box). Today 573 k world texels paint
  in 35–67 ms (0.06–0.12 µs a texel; 264 ms under this box's load). 9.8 M texels at that rate is
  0.6–1.2 s, plus FLORA (four hand-painted levels each: ≈ 2.6 M new texels × 1.33 ≈ 0.2–0.4 s) and
  the sky (≈ 40 ms): **0.9–1.6 s — borderline.** Measure after the ground slice; if over, drop to
  the 2 × upscaled fallback in this order (least seen first): the stampede wings, the far river
  (keep 16 → 32 by upscaling), palisade back faces, the far-set FLORA, jungle wall plane 2 (reuse
  plane 1 tinted), set-piece road modules for the breach and the boss road (use variant A + decals).
  Nothing within 6 m of the rail may fall back.
- **Atlas size**: 9.8 M texels do not fit one 4096 × 2048 page comfortably. Split the world atlas
  into three (ground + road, water + mattes, props + structures): + 2 materials, + 2–4 draw calls.
- No single tile wider than 912 or taller than 512; big modules are registered as 512-tall
  pieces so the longest paint step stays ≤ 75 ms behind the intro card.

---

## 4. SCENE BY SCENE — what a Metal Slug / Third Strike background artist would paint here

Light for the whole stage: a high sun from the front-right (az 124), so everything has a lit
top / right and a violet-green shadow side; the accent light is warm dapple; the danger accents
(orange, red) belong to rings, drums and blood — the scenery keeps them to tiny sources (torch
flames, the kiosk lantern, fence lamps, the lava seam).

### S1 — The gate plaza (beats 0–3, title card)
- **Story**: an evacuated park entrance. A tipped ticket barrier arm; a turnstile jammed with a
  pushchair; a souvenir cart on its side with plush raptors and sun hats spilled on the lawn; a
  tour-bus stop pole with a timetable; a hand-painted EVACUATE → arrow nailed across the kiosk;
  suitcases left in a row; claw gouges on the right door at raptor height; one stake of the
  palisade pushed outward with tufts of hide on it; a muddy raptor print trail from the wall
  across the lawn to the road; a ranger's rifle leaning on the kiosk; the park radio mast behind
  the wall.
- **Light**: the gate's and wall's cast shadow lies across the near lawn and road threshold (the
  title's base); torch flames throw a small warm 2-ring pool on each pillar (daylight: one tone
  step only); the kiosk interior is a dark cave with one lit lantern pool on the counter.
- **Silhouette against the sky**: skull totems on the pillar caps, pennant strings, the
  floodlight and loudspeaker, the lookout parasol, the radio mast, two tall palms leaning over
  the wall, a row of perched pterosaurs on the wall that lift off when the doors move (cards,
  8-frame, once).
- **Loops (6)**: torch flames (have), torch smoke wisps, flags fluttering, pennants swaying, the
  CLOSED board swinging, a butterfly pair over the flower bed (2 × 4-frame card on a small orbit).
- **Remove / simplify**: the repeated palisade tile; the unreadable sign; the kiosk slab roof;
  the lawn's dash strokes; the two ruled sun-shaft lines over the gate.
- **Calm**: nothing spawns before d 32; the picture can be rich. Road + inner verges from the gate
  onward stay plain.

### S2 — First jungle road (beats 3–5, compy hold at d 64)
- **Story**: the tour route. A dropped camera with its strap, a child's shoe, a tour-guide
  megaphone, a "KEEP ARMS INSIDE THE VEHICLE" board on a post, a speed-limit 15 sign bent flat,
  a feeding-station trough on the left with a chewed goat tether (yes, that one), a crashed golf
  buggy nose-down in the ferns on the right at d ≈ 50 (cut-out card, 2.4 × 1.6 m, behind the fern
  belt), compy nests of twigs under two bushes (where they hop from), a line of small prints
  crossing the road.
- **Light**: canopy shade across the road in two soft bands per 16 m (≤ 1 step), dapple pools on
  the shoulders and on the first trunks, god-ray cards in front of the jungle wall only.
- **Silhouette**: the jungle walls close the horizon; lianas looping across the top corners of
  the frame (cut-out cards hung between two trunks at 9–11 m height, never over the road centre);
  a broken dead emergent; the volcano plume through one gap only.
- **Loops (5)**: fern fronds swaying (FLORA sway, have), a hanging liana swinging (2-frame), leaf
  fall (3 leaves on a 6-frame card, right side), dragonflies over the puddle (4-frame), motes in
  the ray cards.
- **Remove**: lawn green; the umbrella trees along the verge (swap for trunks + crowns); the
  sprite stretch; the checker dither on the road.
- **Calm**: road + first 2 m of both verges (compys are 12–20 px tall and yellow-green: no
  yellow-green dashes, no bright litter there; litter goes to the gutters and beyond).

### S3 — The fence run and the breach (beats 5–6)
- **Story**: the paddock boundary. Pylons with number plates (P-14, P-15 …), a maintenance
  ladder against one, a junction box with its door hanging open and cables pulled out, a
  dropped tool bag, a row of DANGER plates, warning lamps dead except two; at the old breach
  (d 124) bent wires, a scorched patch of grass, a dead compy on the wire (small, dark, a story
  not a target); beyond the fence the paddock: trampled undergrowth, a goat-feeding crane arm, a
  concrete trough; at d 154 the section that falls has fresh claw marks on its footing.
- **Light**: amber lamp glints (GLOW, 2 texels), spark flashes at the breach (FX, have), dapples.
- **Silhouette**: insulator stacks and lamp cages against the sky and the dark wall; a crane arm
  over the fence line; vultures-of-the-era (small pteros) perched on two pylons.
- **Loops (4)**: lamp blink, torn wire tip sparking (4-frame GLOW), a DANGER plate rattling
  (2-frame), perched ptero preening (4-frame, one).
- **Remove**: box posts, 16-tpm wire quads, speckle rust.
- **Calm**: the verge belts at d 70–90 (right) and 110–130 (left) where the raptors burst out with
  two rings at once; the gap at d 154 and what is behind it (keep the paddock behind the gap a
  quiet dark green so tan / red raptors pop).

### S4 — The fallen tree (beats 7–10)
- **Story**: a roadblock that is also a camp: the ranger's supplies (crate, duffel, radio, hat,
  flare), a jack-knifed chainsaw abandoned half-way through the trunk with a fuel can beside it
  (that is why the drums are here: a fuel dump for the saws — add a hand pump and a funnel by the
  drums), sawdust and cut discs, a tarp lean-to on the left against the root plate, a cold camp
  fire ring of stones, boot prints, the signal pole down.
- **Light**: the crown's shade over the right half of the road; a bright sunlit gap where the
  tree used to stand (pale dapple field on the left ground and on the root plate); drums' paint
  catches a highlight (they must read).
- **Silhouette**: branch stubs, fungi shelves, the vine, the tarp's ridge pole, the root plate's
  torn roots against the sky; beyond the log the far road continues between two walls.
- **Loops (4)**: radio LED, a strip of tarp flapping (4-frame), flies over the root hollow
  (2-frame dots), the vine swaying; plus leaf fall after the blast (one burst card, 8 frames).
- **Remove**: the cylinder's ruled top, the flat end discs, the box duffel.
- **Calm**: the log's face behind the dilos, the sky above it (spit blobs + ring), the bottom-left
  fern the ranger runs through (she is 55 px tall and khaki: the fern behind her stays mid-green,
  no pale fronds).

### S5 — The meadow: stampede and trike (beats 10–14a)
- **Story**: the herd's range. Wallows with standing water, a salt-lick block on a post, a
  watchtower with a ladder and a torn flag, a feed silo on legs far right (matte card at 40 m),
  a row of fence stubs with snapped rails, sauropod prints and a 2 m dung heap with flies, the
  tour car (story: doors open, a picnic cooler burst, a tour headset on its cable, luggage on
  the roof rack), a second tour car's roof just visible in the long grass at left (d ≈ 340,
  lat −14), a bleached skeleton far left, a helicopter pad sock on a mast.
- **Light**: open sun: the brightest scene. Cloud shadows as two very large dithered-edge decals
  (30 × 14 m, one step) lying across the meadow — they give the plane form; grass seed heads
  catch light (1-texel pale tips in drifts).
- **Silhouette**: no ruled horizon: the mid treeline layer + three lone emergent trees + the
  tower + the silo + the giants' necks; low swells of ground as cut-out cards (long 24 × 1.5 m
  grass-ridge strips at 30, 45 and 60 m either side of the road, tinted a step paler each).
- **Loops (5)**: grass ridges swaying (4-frame strips), the windsock (4-frame), flies over the
  dung (2-frame), the herd (have), the volcano plume (8-frame).
- **Remove**: the camo band, the lawn dashes, the stumpy cycad-barrel repetition along the road
  (keep a third), the box watchtower.
- **Calm**: the road centre and the pale band right behind the trike's charge (ring 110 px wide
  on the road); the churned crossing is brown and busy — keep its contrast to two adjacent tones
  between x 250–400 so the compys that bolt across it read.

### S6 — The cliff road and the falls (beat 14)
- **Story**: the scenic stretch of the tour. A viewpoint lay-by with a coin telescope and a
  FALLS VIEW board (right verge, d ≈ 440, cut-out cards), a rockfall across half the left verge
  with a crushed warning sign, safety netting torn off the cliff and hanging, pterosaur nests
  on the ledges, a climbing rope and a research hide half-way up one panel, fallen fruit and
  shells under the nests.
- **Light**: the cliff's own shadow lies on the left verge until d ≈ 430; the falls sit in a
  sunlit bowl with mist; wet rock glints (GLOW, sparse) beside the water.
- **Silhouette**: the canopy rim with emergents and a dead snag, nests, the netting, vines
  hanging free against the sky, the rainbow.
- **Loops (6)**: falling strands, lip curl, plunge boil, mist puffs, perched pteros flexing
  their wings on two ledges (4-frame), a vine swinging.
- **Remove**: 44 swivelling crag billboards (keep ≈ 10), the blue rectangle, the flat grass
  apron in front of the cliff (talus + ferns instead).
- **Calm**: the sky and the upper third of the wall (pteros are dark brown: keep the rock light
  and even behind their dive paths, nests no higher than y 110 of the b14 views).

### S7 — The river ford (beats 15–16)
- **Story**: a wet crossing on the tour route. Depth-gauge post in the water (0–2 m, cut-out
  card, left of the lane), a FORD — ENGAGE 4WD board on the near bank, a rope ferry line sagging
  across upstream with a pulley post, a drowned tour bicycle, crates floating against the big
  mid-stream rock, a ripped-open cooler on the far bank, the scientist's dropped sample case and
  notebook pages (where she cowers, right bank), claw prints going into the water.
- **Light**: sky glints on the water (GLOW, small, blinking), the bank trees' reflections, sun on
  the far bank's sand; shade under the right bank's overhang.
- **Silhouette**: reed beds and arum leaves along both banks, driftwood snags, the gauge post,
  the ferry rope, stacked boulder groups.
- **Loops (6)**: current lines, glints, bank foam, reeds swaying, the rope bobbing (2-frame), a
  kingfisher-like ptero flitting on the far bank (4-frame card, far right, above the HUD line).
- **Remove**: the 16-tpm dash field, ruled bank stripes, low-poly boulders, the lawn banks.
- **Calm**: **the water body between x 100–480, y 140–240** (compys stand ON it and two rings
  sit there): overlays there are 1-texel, two neighbouring teal tones, no white; foam and
  glints only at the banks and round boulders at |lat| > 5.

### S8 — The riverside road, boss chase (beat 17, ≥ 37 s, looking back)
- **Story**: the back road to the river station — the camera looks back the way it came, so
  dress it facing −d. On the far bank the river-tours landing (matte). Along the left treeline
  (frame right): the upturned tour car (profile, burnt, d 596), a bent lamp post, a row of
  half-buried tyres marking the road edge, a snapped NO STOPPING sign, a tangle of fallen
  bamboo; on the river side (frame left): mooring posts, a dragged canoe, drying nets on a rack,
  an oil-drum raft; on the road: three long claw gouges and smashed ruts appearing behind the
  boss's start point, a tree it shouldered aside leaning into the wall (card, d ≈ 520).
- **Light**: the river is the bright band on the left; the treeline side is in shade with
  dapples; the escarpment backdrop is the pale, calm field behind the boss's head.
- **Silhouette**: jungle wall on the treeline side (second plane paler), reeds on the river
  side, the landing's roof and lamp post, the escarpment with two waterfall threads, the falls
  matte far behind at the start.
- **Loops (5)**: current lines on the river, reeds, the landing's pennant, a swarm of small
  pteros wheeling far over the escarpment (8-frame card on the backdrop), a smoke wisp from the
  burnt wreck.
- **Remove**: the lawn on the treeline side (b17e: half the frame is lawn), box hut, cylinder
  driftwood, the repeated umbrella trees, black boulders.
- **Calm**: the road, both inner verges, and the band y 95–135 behind the boss's head (rings on
  the eyes are ≤ 60 px): keep the escarpment and far road two tones, no glints, no warm colours.
  Drums at the verges must stay the reddest things in the frame.

---

## 5. SLICES (four painters could work at once) and AUDIT SHOTS

`stages/d1/pixel.ts` is touched by three slices in different methods. First commit of slice A:
split it mechanically into `pwGround.ts` (ground, road, puddle, trample, patch, shadows),
`pwWater.ts` (river, waterfall, eddy, bossDressing's landing) and `pwStructures.ts` (gate, kiosk,
fence, tree, tourCar, barricade, signpost, drum), `pixel.ts` keeping the class, the rule, the
backdrop and `finish`. After that the slices do not share a file.

| slice | what | beats | files | size | shots |
|---|---|---|---|---|---|
| **A · GROUND** | road (3 variants + set pieces), verge strip, four ground biomes, decals, tree / cast shadows, stampede crossing, puddles | all; judged at 4, 5, 10–13, 17 | `pixelworld/d1Props.ts` (`paintRoad` → new `pixelworld/d1Road.ts`), `pixelworld/d1Tiles.ts` (meadow, trample, patch, puddle → new `pixelworld/d1Ground.ts`), `stages/d1/pwGround.ts` | L (≈ 4.6 M texels) | `d1:4:120`, `d1:5:300`, `d1:12:120`, `d1:10:270`, `d1:17:2200` |
| **B · FLORA, ROCK, DEPTH** | hero low plants, trunks + crowns, bushes, boulders, cliff wall, jungle walls, mid treeline, ray cards, mip bias, slide-out, herd | all; judged at 3, 5, 7, 14, 17 | new `pixelworld/d1Flora.ts`, `pixelworld/d1Species.ts`, `pixelworld/d1Sky.ts`, `pixelworld/d1Volcano.ts`, `pixelworld/d1Shafts.ts`, `pixelworld/d1Herd.ts`, `stages/d1/herdPixel.ts`, `stages/d1/env.ts` (`floraSplit`, `buildCliffs`, shafts: PIXEL WORLD branches only), `content/pixel/floraField.ts` (`mipBias` option, with the foundation owner) | L (≈ 2.8 M texels R8 + 1.1 M world + 0.2 M sky) | `d1:5:90`, `d1:3:300`, `d1:14:330`, `d1:17:600`, `d1:11:150` |
| **C · WATER** | still river (ford 64, rest 32), overlays, banks + waterline cards, falls matte + overlays, pool, river landing | 14–17 | `pixelworld/d1Water.ts`, `stages/d1/pwWater.ts` | L (≈ 2.5 M texels) | `d1:15:120`, `d1:15:260` (hud), `d1:14:560`, `d1:16:60`, `d1:17:1800` |
| **D · STRUCTURES, PROPS, JEEP** | gate, palisade, kiosk, flags, fence, fallen tree, supplies, drums, tour car profile, signposts, watchtower, barricade; the jeep at 128 | 0–3, 5–10, 13–14, 17 | `pixelworld/d1Tiles.ts` (gate, palisade, log), `pixelworld/d1Props.ts` (fence, car, kiosk, drums, signs), `pixelworld/d1Jeep.ts`, `stages/d1/pwStructures.ts`, `stages/d1/jeepPixel.ts`, `stages/d1/pwShapes.ts` (profile sweep, crossed cards) | L (≈ 1.9 M texels) | `d1:0:120`, `d1:3:90`, `d1:6:330`, `d1:7:120`, `d1:10:90`, `d1:14:120` |

Order if only one painter: B (bias + hero plants: the biggest visible change for the least
paint) → A → C → D.

**AUDIT SHOTS (6)** — `--shots "d1:4:120:ground,d1:5:90:verge,d1:3:90:gate,d1:14:120:car,d1:15:120:ford,d1:17:600:boss"`
- `d1:4:120:ground` — near ground and road, compy hold (fat texels, flat planes, calm lane).
- `d1:5:90:verge` — the verge plant that brushes the camera (worst FLORA magnification).
- `d1:3:90:gate` — near wall: palisade, pillars, kiosk, sign legibility, structures.
- `d1:14:120:car` — the big prop / vehicle (tour car) against the meadow.
- `d1:15:120:ford` — water at the camera, boulders, banks; add `--noauto --hud` for the rings.
- `d1:17:600:boss` — the boss arena looking back: road, river, both treelines, the jeep's rear.
Extra for the critic: `d1:14:560:falls` (the landmark), `d1:0:120:title` (the title card).

---

## 6. RISKS and constraints

**Gameplay geometry that must not move (rule 8: no new occluders, colliders, raycast targets,
RNG draws):**
- Bullet occluders are exactly two hidden classic groups: `gate.pillars` (the six logs r 0.42–0.48
  at x ± 5.15, iron bands r 1.0, both cross beams, the roof board 13.3 × 0.25 × 2.4 at y 10.35,
  the sign board 6.2 × 1.9 at y 7.4 and its trims) and the tour car body (2 × 1 × 4.6 box + cabin
  1.9 × 0.85 × 2.9, lying on its side, then flung: `flipCar`). Painted replacements must COVER
  those shapes: a bullet stopped by invisible wood in mid-air reads as a bug. Totems, charms and
  the car's profile cut-aways stay within 0.25 m of the occluder surfaces; the sign may grow only
  if it still covers the classic board.
- Destructibles: the fuel drums (3 at the tree, spawned in beat 7; 4 on the boss road, spawned at
  the boss). Their classic meshes are the hit boxes (cyl r 0.36 × 1.0); the painted drum is one
  shared geometry ridden on each root. Tiles must be registered before `atlas.build()`
  (`drumTiles()` pattern) — the same for anything spawned by a beat.
- Things that MOVE, each a batch in its own frame: gate doors (hinges rotate ± 1.75 rad), the
  breakable fence section (`fenceBreak` pivot, `rotation.z` → −1.38: it falls toward the road and
  ends 5 m from the rail), the two log halves (fly and rotate; crown and root billboards follow
  by TRANSLATION only — cards added to the halves rotate with them, billboards do not), the tour
  car (`followCar` copies the body matrix each frame), the herd, the jeep view model.
- Lanes that must stay open: every spawn is within |lat| ≤ 12 m (raptors land 6.5–12 m out);
  the herd crosses d 311–331 from lat −62 to +66 and the giants walk lat −46…−60 and +54…58 over
  d 282–380: no wall cards, no tall dressing in the meadow corridor; the boss lane is lat −12…+26
  for d > 504 (`BOSS_CLEAR`) and it dies tumbling into the river at `riverLatAt − W/2 + 2.6`:
  keep the water plane (y 0.075) and the near bank where they are, nothing tall on the near bank.
- `inFord` (|d − 501| < 7.5) switches the surface to water and spawns wheel splashes: the ford
  ramps must still look like water there.
- Civilians: the ranger (d 233, lat −4.6, z 5.4, flees left) and the scientist (d 497, lat 6.5,
  z 6.2, flees right), the tourist at the trike (lat −6.4, z 8.5). Nothing taller than 0.6 m
  between them and the camera; their flight paths cross the left / right verge belts.

**Tests that will bite:** `tests/unit/pixel-world-d1.test.ts` (occluders, raycasts, destructibles
and hit proxies identical in all three ARTs; rays at every drum, across the fence section and the
tree halves; atlas budget — the old 24 MB assertion needs the new 48 MB figure; full-stage
simulator), `D1_SIG=1 … d1-sig.test.ts` (CLASSIC / PIXEL CAST scene signature: every change must
sit behind `this.pw` / `pixelWorld(world)`), the simulator identity test (world RNG identical in
both styles: PIXEL WORLD-only variety comes from position hashes and `PwRng` seeded by tile key,
never from the stage `Rng`). `floraSplit` runs in PIXEL CAST too: the hero swap, the slide-out and
the density clamp are PIXEL WORLD-only.

**Shared code:** `content/pixel/floraSpecies.ts` is used by d2, d3, z1 and the title screen, and d3
paints `D1_STONES` (the shared four) in its own biome: add NEW species / keys in `d1Flora.ts` and
new stone keys; do not repaint the shared ones in place (or d3's slice changes under its painter).
`FLORA_MIP_BIAS` is global: make it a field option. FLORA atlases are R8 with ≤ 255 palette
entries per atlas: the hero set adds ramps (dead frond brown, lilac, coral, bark greys) — check
`colours` after painting, split into two fields if it overflows (+ 1 draw call).

**Pipeline:**
- One animated material today (`D1_WATER_FRAMES = 8` at 8 fps) plays every animated strip: all
  loops are 8 frames (2- and 4-frame loops repeat inside the strip) or cost a second material.
- FLORA has its own shader (`FRAG_LIGHT`, smooth fog): it must take the foundation's ramp-step
  light and banded fog or the plants will be the only smooth-shaded things left.
- Banded fog over a 1600 m flat plane will draw stripes across the meadow: dither the band
  edges on the ground or keep the ground's fog continuous-but-quantised to its own ramp.
- Fixed cut-out cards (walls, mattes) are alpha-tested, depth-writing quads: sort problems none,
  but they are large on screen (two wall planes each side): overdraw is new for this stage —
  check the phone frame time on `d1:17:600` and `d1:5:300`.
- Wrap tiles are multiples of 16 texels; module quads must be sized in whole texels at their
  density (912 × 240 at 32 tpm = 28.5 × 7.5 m, not "fit to the wall").

**Performance now (capture stats, 37 shots):** 27–42 draw calls, 20.1–21.4 k triangles, 38 visible
meshes (world batch 5 190 triangles, backdrop 4 608 + 5 × 768, plant billboards 2 480, jeep
1 294, stones 516). Budget is 250 calls: the plan adds ≈ 6–10 (two more world atlases, a hero
plant field, a trunk / crown field, perhaps a 4-frame animated material) and ≈ 3–5 k triangles
(cards, profile car, crossed posts). d1 already has the slowest stage build (1.15 s cold, 2.7–2.9 s
at 3 × CPU throttle, shared with PIXEL CAST): keep new placement loops O(plants), reuse the
probe's numbers (1 240 plants, 258 stones, 279 trees within 40 m for shadows).

**Art risks:**
- Green on green. The stage is one hue family; depth must come from VALUE bands (road lightest,
  verge plants saturated mid, jungle floor dark, walls darker and cooler, second wall paler
  toward the fog) or the richer paint turns to mush. Check each scene in greyscale.
- Enemy colours: compys are yellow-green, raptors tan / blue / red, dilos green with a frill,
  spit is bright yellow-green, rings are yellow → orange → red. Scenery never uses saturated
  yellow-green in the road corridor, nor orange / red except the tiny sources listed in §4.
- The park emblem (red disc, yellow ring) is ring-shaped and ring-coloured: on the hood it sits
  40 px from where near enemies get their rings — repaint it worn and dull (§22); on flags and
  plaques it is only on screen before any enemy.
- Richer dressing beside the road must not be mistaken for pickups (gems, health crosses, bombs
  float at 1.8–2.6 m): nothing small, bright and isolated above the verge line.
