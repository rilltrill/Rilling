# d2 RESEARCH LABS — PIXEL WORLD 2 repaint work-list (scout report)

Scouted read-only from the reference server `http://localhost:5791` (first-pass look), commit `9c65dd9`.
Nothing in the repository was changed. Everything this report cites is under `/tmp/pw2/scout/d2/`:

- `frames/bNN*-pixel.png` — 3× art frames (624 × 288 frame, every pixel 3 × 3), 38 shots, every beat;
  `hud/hNN-pixel.png` — nine hold beats with `--noauto --hud` (enemies closed in, telegraph rings up);
- `sheet.png` — contact sheet, one frame per beat; `tiles/*.png` — every painted tile of the stage (look-dev dump, ×3,
  wrap tiles 2 × 2); `bench.txt` — tile sizes and paint times; `stats1…6.json` — draw calls / triangles / atlas per shot;
- `tools/crop.py <label> x0 y0 x1 y1 [scale]` — crop a frame region (coordinates in FRAME pixels, 624 × 288; × 3 for the PNG);
  `tools/density.py` — the table of §3.

**All crop boxes below are in frame pixels `(x0,y0)-(x1,y1)` of the 624 × 288 art frame.**

## 0. The stage in numbers (what the first pass is)

| | |
|---|---|
| atlas | `d2` 2048 × 720, **271 tiles, 1 105 278 texels**, 7.86 MB RGBA with 5 levels; `d2-sky` 256 × 272 (0.28 MB); FLORA R8 ≈ 0.7 MB |
| paint | 192 ms warm (node, min of 6; tile painters 94 ms of it) · 276 ms in the dev browser → **174–250 ns a texel** |
| density | every tile 32 texels a metre. Wrap tiles are 64–128 texels = **2–4 m** (only the lobby floor is 8 × 4 m); walls / floors / ceilings are those tiles repeated |
| level policy | `pixel.ts`: `D2_SURF_BIAS = 1.0` (walls, ceilings), `D2_FLOOR_BIAS = 1.5` (floors) + `d2CalmLevels` (levels ≥ 2 of every wrap tile re-made as a blurred, palette-snapped mean). The painters were told to paint for it: "2-texel strokes", `chunky2()` (d2kit.ts:190: every 2 × 2 block = one texel) on the flagstones, 4-texel tesserae in the emblem laid at 18 texels a metre |
| draws / tris | 18–74 draw calls (max: pump-room hold 74, wing 54–67), 5.6 k–36.8 k triangles (max: hatchery → kitchen doorway) |
| audit v1 (`/tmp/pw2/audit-v1.txt`) | lobby: 13.5 % of world pixels > 1.5 px a texel, **49 % drawn from a level texel > 2 px**, 14 % flat blocks · atrium 14.1 % / 35 % / 9.9 % · kitchen 22 % / **61 %** / 21 % · boss 5.4 % / 56 % / **35 % flat** (pass: ≤ 5 % · — · ≤ 8 %) |
| darkness (my measure, share of frame below the bible's darkest tone #14122a, lum < 18) | lobby 14 %, shop 16 %, atrium 10 %, hatchery 7 %, kitchen 10 %, **server room 56 %** (35 % near pure black), **tunnel 41 %**, **pump 33 %**, wing 16 %, **hall 40 %**, boss 32 % |

Camera facts used throughout (RailRig walk eye 1.62 m; 58° vertical, 100.4° horizontal at 624 : 288; focal length f = 260 px):

- wall at lateral distance **L** from the rail, at the 80 % line of the half-width (x = 250 px): **px per texel = 250 / (L · density)** (at the frame edge 312 / (L · density));
- floor (H = 1.62 m under the eye) or ceiling (H above the eye) at the 80 % line of the half-height (y = 115 px): **115 / (H · density)**;
- a surface facing the camera at depth z: 260 / (z · density).

So at 32 texels a metre, *before* the level bias doubles it: every floor is 2.2 px a texel where the player looks (4.4–6 px after the
floor bias), the tunnel walls (L 2.6 m) 3.0 px (6 px after bias; 7–9 px at the frame edge), the shop tables and incubators
(L 2.9 m) 2.7 px, the door jambs you walk through (L 1.5–1.8 m) 4.6–5.7 px. The lobby's side walls (L 12.5–17.5 m) and the whole
boss hall (≥ 11 m) are *already sub-pixel at 32*: what reads as blocks there is not density, it is **the level bias, 1 m × 2 m
"bricks", and flat sparse paint**.

## 1. BEATS

26 beats (`stages/d2/index.ts`). Shot spec = `stage:beat:frames:label`. Action beats (19, 23) run and pass on in one step: a shot
loaded there lands in the following wait. "Zone" = where enemies / civilians / telegraph rings / pickups appear on screen (frame
pixels), i.e. where the background must stay calm (mid contrast, no bright or ring-shaped paint, no cut-out taller than the classic
silhouette). HUD keeps: score (10,5)-(155,50), progress bar (230,15)-(395,30), pause (570,8)-(615,52), hearts (10,255)-(135,280),
bomb (145,230)-(198,280), weapon + reload (418,203)-(612,278).

| # | kind · label | rail d | what the scene is | best shot(s) | gameplay zone (calm) |
|---|---|---|---|---|---|
| 0 | banner · title | 0 | Lobby from the entrance doors: 30 × 64 m hall, 15 m high, mezzanines on pillars, skylight, T. rex skeleton on its plinth at 30 m, WELCOME banner, mural on the far wall | `d2:0:120:b00` | title card centre; none |
| 1 | move · into the visitor centre | 0 → 15 | Walk past the first pillar pair to the reception desk (right, L 4.3 m), emblem mosaic ahead | `d2:1:90:b01a`, `d2:1:240:b01b` | tan raptor waits on the LEFT mezzanine rail at (−11.2, 5.2, −29) and leaps: (150,55)-(270,135) down to the floor centre |
| 2 | hold · lobby | 15 | Look at (0.5, 2.2, −30): emblem under the camera, desk at the right edge, skeleton left-centre, GIFT SHOP door at 41 m | `d2:2:120:b02`, hud `d2:2:300:h02` | raptor from right of the plinth → (300,140)-(385,205); 2nd wave: STAFF door burst, right wall (455,125)-(545,190) + leap off the RIGHT mezzanine at z −37 (430,65)-(525,125); shotgun pickup (395,148)-(422,172) |
| 3 | hold · skeleton collapse | 15 | Look at (−1.8, 2.6, −28): the skeleton comes down in chunks, skull lands at (1.6, −33.8) with dust | `d2:3:150:b03` (and `d2:3:30` before the fall) | red raptor leaps over the plinth (190,105)-(335,205); compys from the plinth's open end (290,165)-(410,220); blue raptor from the back (330,135)-(400,195); points pickup (255,150)-(285,175) |
| 4 | move · to the gift shop | 15 → 65 | 45 m walk down the hall: plinth passes at L 4–5 m on the left, far wall + mural grow, through the 3.6 m door | `d2:4:120:b04a`, `d2:4:420:b04b` | compys on the floor centre (250,170)-(400,245); green raptor leaps off the far LEFT mezzanine (0,60)-(200,220); compys out of the shop door (270,150)-(345,215) |
| 5 | hold · gift shop | 65 | 16 × 24 m shop, 4.4 m ceiling: 4 display tables at L 2.9 m, merchandise walls at L 7 m, counter right-back, plush mascot left-back, door to the atrium at 19 m | `d2:5:120:b05`, hud `d2:5:330:h05` | compys drop from 3 ceiling vents onto the carpet (190,120)-(465,260); raptor bursts from STOCK, left wall (150,115)-(215,185); raptor leaps at (380,125)-(470,205); raptor from the atrium door (270,110)-(345,200); **civilian tech** cowers right (515,145)-(580,200), runs in along the right aisle; bomb pickup (120,140)-(165,172) |
| 6 | move · into the atrium | 65 → 92 | Through the shop's back door into the 28 × 44 m greenhouse; PREHISTORIC FLORA sign passes at L 3 m | `d2:6:120:b06a`, `d2:6:330:b06b` | compys on the path (270,160)-(350,215) |
| 7 | hold · atrium | 92 | Look at (−1.5, 1.8, −103): flagstone path curving left, beds, palms, glass walls, night sky, pond right at 12 m, HATCHERY door at 32 m; lightning | `d2:7:120:b07`, hud `d2:7:300:h07` | dilo in the left bed + its spit (105,80)-(195,210); dilo by the pond (395,135)-(445,190); raptors leap from both beds (120,110)-(260,215), (360,120)-(470,205); compys / raptor far on the path (270,140)-(350,185); health pickup (425,140)-(462,168) |
| 8 | move · to the hatchery | 92 → 135 | Along the path, pond on the right, to the glazed far end and its 3.6 m door | `d2:8:120:b08a`, `d2:8:420:b08b` | raptor leaps from the far left bed (60,110)-(220,215); compys out of the doorway (290,150)-(345,190) |
| 9 | hold · hatchery | 136 | 20 × 38 m lab, 4.8 m ceiling: incubator tables at L 2.9 m, embryo tanks on both walls, grated aisle, consoles + sequencer displays at the far wall 26 m | `d2:9:120:b09`, hud `d2:9:300:h09` | raptor bursts from LAB B, left (75,100)-(130,170); compys off the left incubator (105,115)-(225,195); raptor from LAB C, right (435,115)-(475,170); hybrid off the far-left incubator (215,115)-(290,170); raptors up the aisle (245,105)-(360,288); **civilian tech** right edge (585,130)-(624,205); magnum pickup (215,150)-(250,175) |
| 10 | move · to the kitchen | 136 → 172 | Down the aisle, through the 3.2 m door between parked swing doors (L 1.6 m) | `d2:10:150:b10a`, `d2:10:420:b10b` | compys in the doorway (280,160)-(350,215) |
| 11 | hold · kitchen | 172 | 18 × 32 m kitchen, 4.2 m ceiling: 4 islands at L 3.8 m, wall counters + hoods at L 7.9 m, FREEZER door right, SERVER ROOM door at 22 m | `d2:11:120:b11`, hud `d2:11:330:h11` | raptor up the central aisle — **ring centre (263,120), radius 62 — right over the ceiling bloom**; raptors vault off the far counters (395,110)-(485,190), (140,110)-(230,190); hybrid bursts from FREEZER (430,115)-(505,175); last wave from the server door (255,110)-(370,180); **gas tanks** (65,150)-(95,190) and (540,150)-(565,190); pickups (215,150)-(250,175), (375,150)-(410,175) |
| 12 | move · to the servers | 172 → 203 | Between the islands to the end wall and its 3.4 m door | `d2:12:120:b12a`, `d2:12:330:b12b` | compy drops out of the cable tray over the door (300,60)-(330,140) |
| 13 | hold · server room | 203 | 16 × 24 m, 3.8 m ceiling: four rack rows each side, end panels at L 2.3 m, blue cold-aisle strips, bulkhead B-2 at 15 m | `d2:13:120:b13`, hud `d2:13:300:h13` | compys drop from 2 vents (245,35)-(375,245); raptors burst up the cold aisle — ring centre (285,160) r 37; hybrid (255,120)-(330,200); points pickup (250,140)-(285,170) |
| 14 | move · maintenance tunnels | 198 → 249 | Under the rising bulkhead (jambs L 1.5 m) into the 5.2 m wide, 3.3 m high curved tunnel | `d2:14:120:b14a`, `d2:14:300:b14b` | compys drop from two ceiling ducts (270,30)-(355,130) |
| 15 | hold · alcove ambush | 249 | Look into the left alcove 2.5 m ahead; tunnel bends right; red strobe | `d2:15:120:b15` | raptor leaps out of the alcove (225,160)-(375,230); raptor + compys from the bend (290,120)-(365,175) |
| 16 | move · to the pump room | 249 → 281 | Rest of the tunnel to its mouth | `d2:16:120:b16a`, `d2:16:330:b16b` | compys from the pump-room mouth (270,170)-(310,195) |
| 17 | hold · pump room | 281 | From the tunnel mouth: 16 × 18 m, 5.5 m: two tanks at the back, pump units at the edges (L 6 m), side-tunnel openings ±30°, CONTAINMENT WING door at 13 m | `d2:17:120:b17`, hud `d2:17:300:h17` | raptors leap from the side openings (120,110)-(170,165), (460,110)-(505,165) → floor (150,130)-(300,230); compys + hybrid from the wing door (280,140)-(345,200); **gas tanks** (155,145)-(175,182), (410,150)-(426,172); health pickup (375,140)-(410,165) |
| 18 | move · containment wing | 281 → 306 | Across the pump room, through the 4.4 m blast frame into the 12 m wide cell corridor (glass fronts at L 6 m) | `d2:18:120:b18a`, `d2:18:300:b18b` | compys bolt out of the wing door (275,150)-(310,180) |
| 19 | action · thud… thud… | 306 | Look at cell 4 (right): the glass cracks | `d2:19:2:b19` | cell 4 glass (395,30)-(624,250) |
| 20 | wait · the glass gives | 306 | same, 1.1 s | `d2:20:30:b20` | same |
| 21 | hold · containment | 306 | Look at (14, 1.6, −310): corridor, six cells, HOLDING HALL X door at 22 m | `d2:21:150:b21`, hud `d2:21:300:h21` | trike bursts through cell 4 and charges across the frame (300,105)-(624,215); raptors leap out of the far cells (125,115)-(185,175), (430,115)-(480,175); raptor / hybrid from the hall door (215,135)-(260,165); bomb pickup (30,140)-(110,180), health (330,150)-(365,175) |
| 22 | move · into the holding hall | 306 → 343 | Past the cells, through the 6.2 m blast doors, 8 m into the hall | `d2:22:120:b22a`, `d2:22:420:b22b` | compys bolt out of the hall (255,200)-(320,235) |
| 23 | action · lights out | 343 | Hall dims to 0.75, tank pane 1 cracks | `d2:23:2:b23` | pane 1 (290,100)-(345,160) |
| 24 | wait · something in the dark | 343 | 2 s | `d2:24:60:b24` | — |
| 25 | boss · SPECIMEN X | 343 | 36 × 54 m hall, 11 m: four 2.2 m pillars (11 and 27 m away), specimen tank across the back at 36 m, catwalks, pen gates; the camera pans ± 40° | `d2:25:240:b25a`, `d2:25:700:b25b`, hud `d2:25:900:h25` | the boss anywhere in the arena between and in front of the pillars; pounce ring lands centre — (270,55)-(365,150), radius ≈ 47; tail-whip ring beside it; minions out of tank panes 1–2 (255,100)-(370,165); pickups low left / right (155,160)-(205,195), (395,160)-(440,190). **Calm: the whole floor, the pillar shafts 0.5–4 m, the tank's centre panes, the dado band of the long walls** |

Two readability faults visible in the HUD shots that the repaint must fix, not inherit: the kitchen's white telegraph ring sits on
the white ceiling bloom and the white wall tile (h11); the hatchery's yellow / white rings sit on pale mint walls (h09, wall
luminance p50 = 105). The shop tech's white coat stands in front of the busiest, brightest shelf bay (h05).

## 2. OFFENDERS (ranked: how loudly each one says "Minecraft / Roblox")

Each entry: **what** · where (frame, crop) · anti-pattern · code that builds and paints it · TREATMENT · effort.

1. **The stage-wide chunk policy.** Every frame; worst b09, b11, b15. *Fat texels by design.* Level bias 1.0 / 1.5 and the calm
   levels show a wall from level 1 and a floor from level 1–2 even right under the camera, and the painters paint "at 2 texels" to
   survive it (49–61 % of world pixels come from a level texel > 2 px). `stages/d2/pixel.ts: D2_SURF_BIAS, D2_FLOOR_BIAS,
   splitSurfaces, finish()`; `pixelworld/d2levels.ts: d2CalmLevels`; `d2kit.ts: chunky2`; `d2green.ts: flagstoneTile` (half-res grid);
   `d2lobby.ts: emblemMosaic` (128 texels over 7 m). TREATMENT: delete the two biases (one material bias for the stage, the
   foundation's), keep `d2CalmLevels` only as the far-level maker (levels ≥ 2) for regular patterns (chequer, grating, cladding),
   remove `chunky2` and every "2-texel so it survives level 1" rule from the painters, give every tile a `density` from §3. This is
   step 0: nothing painted on top of the old policy can pass the audit. **M** (code, no paint).
2. **Hatchery shell: three flat pale planes and a green gradient.** b09 whole frame; b10a. *Flat empty plane + speckle + smooth 3D
   light gradient + muddy pastel.* Mint wall with a faint grid, mint floor with random dashes (crop (0,190)-(250,288)), a ceiling
   that is one smooth green falloff from the accent light (crop (130,40)-(500,110)). `green.ts: buildHatchery`;
   `pixelGreen.ts: convertHatch`; `d2lab.ts: subwayTileWall, vinylFloorTile, gratingTile`; `d2shop.ts: acousticTile`; light:
   `env.ts` accent `0x40ff70 pulse`. TREATMENT: walls as three 8 × 4.8 m bay paintings at 32 (L 10 m): glazed tile to a 1.2 m dado
   with dirty grout and the green stripe, painted plaster above, and IN the painting the benches, tanks' wall plates, conduits,
   posters, an observation window (see §4); wall mid-tone two steps darker than today. Floor: 4 × 4 m vinyl wrap at 64 with welded
   seams, trolley scuffs, a darker walk-worn lane, + unique decals. Ceiling: 64, T-bar grid with troffer housings painted, stained
   and missing tiles; paint the tanks' green as stepped pools (2–3 rings, dithered edge) on floor and wall instead of relying on
   the gradient. **L**.
3. **Tunnel: flat walls 2.6 m away, octagonal prism pipes, a smooth red wash.** b15 crop (0,20)-(250,288) and mirrored; b16a,
   b16b. *Fat texels at 3–9 px + textured box (prisms) + smooth 3D light gradient.* `tunnels.ts: buildTunnel` (pipeRuns as
   8-sided `pipe()` cylinders, brackets as boxes); `pixelService.ts: convertTunnel, wallRibbon, ceilingRibbon, servicePaint`;
   `d2service.ts: tunnelWallTile (128 × 112), pipeTile, tunnelDeckTile`; `corrugatedTile` ceiling; strobe accent in `env.ts`.
   TREATMENT: walls repainted natively at **96**: three unique 8 × 3.3 m panels (768 × 320) laid along `wallRibbon`, mirrored
   for the other wall: cast concrete with board marks and tie holes, the green cladding as a drawn dado with dents and a rust
   foot, and the pipe runs PAINTED on the panel as modelled forms (highlight line, core shadow, reflected step, cast shadow on the
   wall, flanges every 2 m, hangers, valves, lagging, stencilled IDs). Drop the 3D pipe cylinders and bracket boxes
   (`dropMeshes` by tag — tag them in `tunnels.ts`); keep at most the red main as an extruded half-round profile where it crosses
   the ceiling line. Red strobe = painted red pools round each beacon (2 rings) + the material's whole-step pulse. **L**.
4. **Lobby floor: 1 900 m² of grey blotches.** b02 crop (0,170)-(624,288); b04b crop (0,165)-(624,288). *Fat texels (joints 3–4
   px, blotches 6–20 px) + flat empty plane + visible calm-level mush beyond 5 m.* `lobby.ts: floorQuad(stat, floor…)`;
   `pixelLobby.ts: convertLobby` (`matIs(m, 0x948a7a, 'tiles')`); `d2lobby.ts: lobbyFloorTile` (256 × 128). TREATMENT: 64 texels
   a metre; an 8 × 8 m wrap of 64 individually drawn 1 m fossil-limestone slabs (bevel lit top-left, shadowed bottom-right joint,
   a few with ammonite / shell sections, veining, 3 cracked, 2 replaced in a different stone) with a darker polished-granite
   border course along the pillar lines; over it three unique 4 × 4 m decals on the walk (scuffed lane with luggage-wheel tracks,
   the spilled-coffee claw print, the paper fan by the desk) and stepped light pools (moon shaft, pendants). Keep the strip x −4…+5 m
   between plinth and desk low-contrast (raptors run there). **L**.
5. **Boss hall: mud.** b23, b25a, b25b, b25c whole frame; crop b25a (0,170)-(624,288) floor, (0,0)-(624,80) roof. *Muddy colour
   (40 % of the frame under #14122a) + flat empty plane (audit 35 % flat blocks) + straight box silhouettes (trusses, buttresses)
   + a bright ring on the floor.* `containment.ts: buildHall`; `pixelContain.ts: convertHall`; `d2contain.ts: slabFloorTile,
   concreteColumnTile, floorLineTile, hazardBandTile, tankWallTile`; `d2contain.ts: dadoTile`; `d2walls.ts: hallWallTile, dripStainTile, cableTrayTile, fadedHazardTile`. TREATMENT (all at 32:
   everything is ≥ 11 m away): re-key the whole room three ramp steps up into blue-violet mid-tones (floor ≈ #2a2c4a…#3a3e60,
   never under #14122a even at `dimTarget 0.75`); one unique 16 × 16 m arena floor painting (expansion joints, drain channels
   to the drain, tyre arcs, KEEP CLEAR, the ring redrawn as a **worn hazard octagon in broken dashes at mid contrast**, the tank's
   cyan glow as three stepped bands reaching 8 m out, dim warm lamp pools); three 6 × 11 m wall-bay paintings (see §4); trusses
   as cut-out lattice cards; pillar haunches. **L**.
6. **Kitchen islands and wall counters: 9 m stainless boxes.** b11 crops (0,150)-(210,262), (420,150)-(624,262); b12a.
   *Textured box, straight silhouette, fat texels (L 3.8 m, 4 px with the bias).* `kitchen.ts: buildKitchen` (island slabs,
   counterBase); `pixelLab.ts: convertKitchen`; `d2kitchen.ts: cabinetFrontTile, islandEndTile, counterTopTile, counterLipTile,
   hoodFrontTile`; `d2lab.ts: applianceTile`. TREATMENT: each island becomes an extruded PROFILE prop at 64: end elevation
   drawn as a stainless prep table (legs, undershelf with pots and gastro tubs in shadow, drawer bank, towel bar), the long side a
   9 × 1 m painting in three units of different front (doors / open shelf / drawers) with a 4-texel shadow gap between units, top
   a 9 m painting with boards, bowls, burn rings; the top line broken by the existing clutter cards redrawn at 64 and by the pot
   rack as ONE cut-out strip per island. Wall runs: 6.8 m bay paintings (range / oven / sink fronts as drawn appliances with
   handles, dials, kick plates, grease runs). Same footprints and heights (raptors vault off the tops at y 0.95). **L**.
7. **Gift-shop display tables: green boxes with a white lid, 2.9 m from the camera.** b05 crops (0,180)-(135,288),
   (498,185)-(624,288); b06a (0,180)-(185,288). *Textured box + fat texels (2.7–4 px) + flat plane (the white top).*
   `lobby.ts: buildShop` (`table`, `tablecloth`); `pixelShop.ts: convertShop`; `d2shop.ts: tableSkirtTile (64 × 32),
   tableclothTile, skirtLogoTile, shirtStackTile, merchCardTile`. TREATMENT: **96**. Skirt = a cut-out card set standing 3 cm
   proud of the box: draped cloth with real folds, sag between the legs, a scalloped hem 6 cm off the carpet, the printed
   emblem following the folds; the box under it shrinks to a dark core. Top = two unique 1.8 × 4 m paintings (cloth with fold
   creases, price cards, mug rings, a knocked-over snow globe). Merchandise as 8 cut-out cards at 96 (mug pyramid, plush heap,
   folded shirt piles with size stickers, hat tree, ADOPT A RAPTOR easel). **M**.
8. **Lobby walls: 1 × 2 m "bricks" below, speckled pink plaster above.** b02 crop (0,0)-(190,165); b04b crop (100,88)-(520,168)
   (the far wall: an even field of dark dots). *Speckle noise as texture + visible tile repeat + flat plane; a smooth red
   gradient from the beacon accent.* `lobby.ts: wallX/wallZ (stucco)`, `balcony`; `pixelLobby.ts: convertLobby` (shell rule,
   `balcony` → `g.plaster`); `d2walls.ts: lobbyAshlarTile (128 × 64), pilasterTile`; `d2surfaces.ts: d2PlasterTile`;
   `d2lobby.ts: wainscotTile, friezeTile, clerestoryTile`. TREATMENT: 32 is enough (L ≥ 12.5 m) — paint BAYS, not tiles: two
   12 × 4.8 m ground-storey paintings (coursed sandstone in 0.3 m courses with tooled faces and a rusticated base course, panelled
   timber wainscot with a lit cap, a display vitrine, a bench alcove, the poster, a fire-hose cabinet, the STAFF door in bay B) and
   two 12 × 9.8 m upper-storey paintings (smooth render in two tones with a stepped lamp wash under each clerestory, the arched
   window with its deep reveal and sill stain, pilaster with fluting and capital, frieze, gallery doorway with a barrier, a water
   run from the gutter with a mineral edge). No dot speckle anywhere. **L**.
9. **Door frames and the doors you walk through.** b10b crop (140,60)-(480,288) (swing doors as two flat grey slabs, jambs);
   b14b crops (0,0)-(180,288), (445,0)-(624,288) (the bulkhead surround: two navy slabs filling a third of the frame each,
   texels 5–8 px); b22b crops (0,0)-(125,288), (500,0)-(624,288) (hazard stripes 8–10 px a texel); b12b. *Fat texels at their
   worst (L 1.5–1.8 m) + textured box.* `build.ts: frameZ, frameX, hazardBand`; `kitchen.ts` (swing doors, bulkhead group);
   `containment.ts` (blastDoor); generic rule `pixel.ts: genericPaint` (`d2MetalTile`, `hazardTile`); `pixelShared.ts: paintDoor`;
   `d2signs.ts: d2DoorTile`; `d2lab.ts: bulkheadTile`; `d2contain.ts: blastDoorTile`. TREATMENT: one painted door-surround module
   per doorway at **96** (jamb face + reveal + header: pressed-steel frame with a lit arris, hinge leaves, strike plate, kick
   scuffs, cable entry, card reader, hazard chevrons painted at 96 where they exist), the 2 m of wall either side at 64–96 as part
   of each room's end-wall painting; swing doors as painted leaves with porthole, push plate, rubber edge and a drawn thickness.
   Eight doorways. **M**.
10. **Pump room: an empty red-lit concrete box.** b17, b18a whole frame; crop b17 (0,175)-(624,288) floor, (0,0)-(190,150) wall.
    *Flat empty plane + smooth gradient (red pool on the floor) + speckle ("plank" concrete with black flecks) + textured boxes
    and cylinders (pump boxes, tank cylinders, box-section rust manifold), black ceiling (33 % under tone).* `tunnels.ts:
    buildPump`; `pixelService.ts: convertPump, servicePaint`; `d2service.ts: oilyConcreteTile, tankSkinTile, motorTile,
    pumpFaceTile, oilPoolTile`; `d2surfaces.ts: d2ConcreteTile`. TREATMENT: tanks as 5.2 × 3.2 m cut-out PROFILE cards at 64
    (dished ends, saddles, ladder, sight glass, relief valve, stencil) on crossed cards; pump units as 2.2 × 5 m profile cards
    (motor, coupling guard, volute, riser with flanged elbow to the manifold); manifold as a 16 m cut-out pipe run; walls as two
    8 × 5.5 m bay paintings at 32; floor 64 with bund kerbs, a green walkway, a drain channel, stepped lamp pools; ceiling with
    I-beams and the chain hoist silhouette. **L**.
11. **Lobby pillars: streaky cylinders between two boxes.** b02 crop (35,0)-(78,188); b01b (120,0)-(152,190); b04a (195,25)-(215,165).
    *Speckle (vertical streak noise) + straight box silhouette (0.4 m box base, 0.6 m box capital) + fat texels (3 px).*
    `lobby.ts` (`pillar`, `pillarBase`, `pillarCap`); `pixelLobby.ts` rule; `d2lobby.ts: columnTile (32 × 128), graniteTile`;
    `surfaces.ts: stoneTile`. TREATMENT: 64; shaft = cyl wrap 192 × 512 with drawn flutes (lit left flank, core shadow, reflected
    step at the right edge, entasis shading), drum joints every 2 m, a red beacon pool painted at 3.5 m; base and capital as
    cut-out profile cards on crossed quads (torus + plinth; echinus + abacus with the bracket to the balcony) replacing the two
    boxes; the banner card stays. **M**.
12. **Hatchery incubators, embryo tanks, eggs.** b09 crops (35,110)-(232,218), (510,90)-(580,190); b10a (35,118)-(232,215),
    (392,118)-(590,215). *Textured box (a plate on four legs with an apron), classic primitives showing through: flat peach discs
    for eggs, a sphere-cap dome, fluid cylinders.* `green.ts: buildHatchery` (tables, dome, `am.egg` spheres, tank cylinders
    `am.fluid`); `pixelGreen.ts: convertHatch` (`b.box` apron); `d2lab.ts: incubatorApronTile, incubatorPanelTile, nestTile,
    hoseCardTile`. TREATMENT: incubator = PROFILE prop at **96** (3.5 × 2.5 m side and end elevations: cabinet with louvres and
    the control panel, gasketed tray rim, the acrylic dome drawn with two highlight arcs and condensation, gantry with heat
    lamps, hoses) on crossed cards over a dark core box the height of the classic table; top painting at 64 (nest, eggs as shaded
    ovoids with speckle, split shells, slime). The egg glow stays a GLOW spot per egg. Tanks: camera-facing cards 1.6 × 3.5 m at
    64, three variants, + a 6-frame bubble strip. Keep compy / hybrid perches (table tops at y 0.95–1.05) clear. **L**.
13. **Containment wing.** b20, b21, b22a; crops b21 (0,150)-(624,288) floor, (150,0)-(450,90) ceiling, b20 (0,0)-(85,230) pier.
    *Flat empty plane (floor), black ceiling (a quarter of the frame), textured boxes (0.7 m steel piers, head beam), dashed
    glass sheen repeating, classic triangle glass teeth.* `containment.ts: buildWing`; `setpieces.ts: GlassWall`;
    `pixelContain.ts: convertWing, glassFrames, glassOverlay`; `d2contain.ts: slabFloorTile, strawTile, baleTile,
    blastDoorTile`; `d2glass.ts: glassSheenTile, condensationTile, clawCrackTile`. TREATMENT: per-cell front as one 10.2 × 6 m
    cut-out painting at 32 in the wall's own frame (bolted mullions, door rams, placard, keypad; glass with two long soft
    reflections, nose smears, rake marks — not a dash pattern), three states; piers as I-section profiles at 64; cell interiors
    as 10 × 7.5 m back-wall paintings; ceiling services at 32; floor wrap 64 + decals. **L**.
14. **Classic leftovers that were never painted.** *Lambert primitives inside a pixel frame.* Steam = grey icosahedron balls
    (b16a (35,0)-(160,62); b18a (155,58)-(172,118); `tunnels.ts: steamVents`); beacons = red blobs on dark boxes (b14b
    (45,0)-(88,38); `build.ts: beacon`); propane tanks = pink-white cylinders (b17 (155,145)-(176,183); `setpieces.ts:
    propaneTank`); the moon shaft = a hard-edged translucent box across the lobby (b02 (120,0)-(330,160); `lobby.ts` `shaft`);
    the balcony's glow strip = a 1-px white line across the whole frame, both sides (b02 (0,62)-(200,130), (432,60)-(624,130);
    `lobby.ts:109`); bed uplights = mint boxes (b08a (30,262)-(72,288); `green.ts`); fountain = a pale cone (b08a (515,130)-(536,152));
    pendant lamps = cones + discs; light panels = white boxes; glass shards = flat quads; tank bubbles; robot arms = orange
    boxes. TREATMENT: steam as painted stepped puffs (the z1 smoke-billow cards, 6 variants) on the same emitters; beacons as a
    painted cage-lamp card + a 2-frame sweep; propane tanks as a painted cut-out over the undrawn hit mesh (the d1 fuel-drum
    method), the most saturated prop in its room; moon shaft as a camera-facing stepped, Bayer-edged beam (z3 searchlight) with
    a painted pool; glow strip replaced by spaced downlight cards + pools; uplights as bollard-lamp cards + pools; lamps and
    troffers as painted fittings with a GLOW lens. **M** (shared kit, used by every room).
15. **Atrium beds: bare brown.** b07 crops (0,170)-(200,288), (430,170)-(624,288); b08a. *Flat empty plane with a few specks.*
    `green.ts: buildGreenhouse` (soil floorQuad); `pixelGreen.ts: convertGreen`; `d2green.ts: soilTile`. TREATMENT: 64; 4 × 4 m
    wrap of raked soil with mulch chips, leaf litter and root humps in three tones + four unique 2 × 2 m decals (irrigation
    loops with drippers, a trowel and gloves, muddy three-toed tracks, a seed-tray stack) and more FLORA ground cover along the
    kerb; lamp pools from the bollards. Spawn spots of `clear[]` stay bare. **M**.
16. **Atrium path and kerb.** b07 crop (130,170)-(455,288); b08b (130,180)-(500,288). *Fat texels on purpose (`chunky2`: 4–6 px)
    + box kerb (1 m boxes with noise, sawtooth silhouette).* `green.ts` (`path` ribbon, `kerb` boxes); `d2green.ts:
    flagstoneTile, rubbleTile`. TREATMENT: one 3.75 × 8 m ribbon module at 64: individually drawn flags (riven faces, lit and
    shadowed joints, moss cushions in the joints, two puddles), the kerb painted as dressed edging stones INSIDE the module's
    outer 0.25 m with a 0.2 m cut-out upstand strip; kerb boxes dropped. **M**.
17. **Gift-shop carpet.** b05 crop (130,170)-(500,288). *Fat texels near (3 px), calm-level blotches mid-distance.*
    `d2shop.ts: shopCarpetTile`. TREATMENT: 64, 4 × 4 m wrap: woven pile drawn as short diagonal dashes in two tones, the
    footprint medallion and trellis kept but two steps lower in contrast, worn lane down the aisle; 3 decals (blue slush spill
    with compy prints, trampled popcorn, a dropped basket's contents). **S**.
18. **Server room: black with flat-topped racks.** b13, b14a; crops b13 (0,50)-(190,110), (435,50)-(624,110) (empty dark upper
    walls), (0,105)-(190,230) racks. *Muddy / crushed colour (56 % under tone, 35 % near black) + straight box silhouette + flat
    plane.* `kitchen.ts: buildServers`; `pixelLab.ts: convertServers`; `d2lab.ts: serverWallTile, raisedFloorTile,
    rackFrontTile (176 × 80), rackEndTile, gratingTile, cableDropTile`. TREATMENT: lift the room into deep blue-violet (darkest
    #14122a, racks mid blue-grey); rack fronts at 64, two variants with mixed equipment (see §4); end panels at 96; rack-top
    silhouette cards (top-of-rack switch, fan trays, cable loops up to the tray) — nothing spawns behind the racks; upper walls
    as perforated panels with conduit and a CRAC unit; floor 64 with lifted tiles. **M**.
19. **Lobby balcony.** b02 crops (0,62)-(200,135), (432,60)-(624,135). *Straight box silhouette 58 m long + repeated balustrade
    tile + the white line.* `lobby.ts` (`balcony`, `fascia`, `railing`); `pixelLobby.ts`; `d2lobby.ts: fasciaTile,
    balustradeTile`. TREATMENT: 12 m bay modules at 64: fascia with a bracket course and a dentil shadow, soffit with recessed
    downlights and their pools, balustrade cut-out with turned spindles, a newel + urn finial at each pillar line, bunting and
    one draped jacket; the leap points (z −29 left, z −37 right, z −50 left) keep a plain see-through rail. **M**.
20. **Kitchen floor and ceiling.** b11 crops (0,200)-(624,288), (200,35)-(420,110). *Calm-level flat periwinkle plane beyond
    6 m; a white bloom on the ceiling exactly where the telegraph ring lands.* `d2lab.ts: kitchenChequerTile`;
    `d2shop.ts: acousticTile`; `pixelLab.ts: z2PoolMesh` pools; `env.ts` accent `0xc8dcff`. TREATMENT: quarry-tile chequer at
    64 with grout, mats in front of the ranges, a flour burst with raptor prints; pools painted INTO floor and island tops as
    stepped tone shifts (drop the additive pool mesh); ceiling pool capped at tone 4, no GLOW outside the tubes. **M**.
21. **Gift-shop ceiling, wallpaper, back shelf.** b05 crops (240,15)-(530,110), (0,35)-(200,120), (350,128)-(492,168).
    *Smooth orange gradient; 0.5 m stripes with 3-px texels; the back shelf is the merchandise tile offset so it reads as brown
    brick blocks.* `d2shop.ts: acousticTile, wallpaperTile, merchShelfTile`; `pixelShop.ts` (`backShelf`). TREATMENT: ceiling
    64 with T-bars, sagging and missing tiles, the counter lamp as a stepped warm pool; wallpaper with a dado rail, framed
    prints, a height chart; back shelf as its own 8 × 4.4 m end-wall painting. **M**.
22. **Atrium glass.** b07 crops (0,60)-(155,172), (470,60)-(624,172). *Visible tile repeat: the same sheen dashes every 4 m,
    3-px dashes.* `d2glass.ts: glassSheenTile, condensationTile`; `d2green.ts: glazingTile`. TREATMENT: two 11 × 6 m cut-out bay
    paintings at 32: glazing bars with brackets, one long broken reflection per pane, condensation band with rivulets, fronds
    pressed on the outside, a taped crack. **M**.
23. **Skeleton and plinth.** b04a crops (5,45)-(292,160), (0,160)-(282,188). *Per-texel speckle (granite) + box bones.*
    `setpieces.ts: SkeletonDisplay`; `pixelLobby.ts: skeleton, skullCards`; `d2lobby.ts: graniteTile, plaqueTile`;
    `d2surfaces.ts: d2BoneTile`. TREATMENT: plinth sides as a 10 × 0.5 m polished-granite module (mirror streaks, a brass
    inlay line, chipped arris); each bone chunk a pair of crossed painted cut-outs in its own frame, as the skull already is.
    **M** (dynamic: see §6).
24. **Reception desk.** b02 crop (475,150)-(624,252); b01b (430,155)-(624,250). *Textured box.* `lobby.ts` (`desk`,
    `deskReturn`, `deskTop`); `d2lobby.ts: deskFrontTile`. TREATMENT: fronts at 64 as panelled joinery with a kick recess,
    brass rail and the INFORMATION board; top painting; six dressing cards breaking the top line (two CRTs, a banker's lamp
    with its pool, brochure rack, a bell, the dangling handset). **S**.
25. **Lobby furniture.** b00 crop (135,172)-(192,200) bench; b04a (385,143)-(402,178) kiosk, (515,205)-(572,258) chair.
    *Boxes.* `lobby.ts: bench()`, kiosk, chair boxes. TREATMENT: profile cards at 64 (slatted bench with cast-iron ends, kiosk
    with a screen hood, the tipped chair, a bin, a stroller). **S**.
26. **Hall pillars, buttresses, trusses.** b25a crops (138,0)-(200,200), (0,20)-(624,78). *Streak noise on a cylinder, a steel
    box for a capital, plain bars for trusses.* `d2contain.ts: concreteColumnTile`; `containment.ts` (`column`, `truss`,
    `buttress`). TREATMENT: board-marked shaft with steel bands and a conduit (the cylinder's silhouette unchanged), haunch
    cards above 6 m, lattice truss cut-outs. **M**.
27. **Tunnel deck.** b16b crop (150,170)-(480,288). *Flat grey with a few dashes.* `d2service.ts: tunnelDeckTile`. TREATMENT:
    64, 5.2 × 8 m module: chequer-plate panels with lifting holes, a grated centre trench with water glints, puddles. **S**.
28. **Emblem mosaic.** b04a crop (0,215)-(450,288); b02 (175,185)-(430,245). *Fat texels: 22 cm tesserae, 5–8 px blocks under
    the camera.* `d2lobby.ts: emblemMosaic`. TREATMENT: 448 × 448 at 64, tesserae 2 texels with grout, gold a step duller
    (enemies stand on it in beats 2–3). **S**.
29. **Empty black overhead.** b02 (400,0)-(624,48); b17 (0,0)-(624,60); b21 (150,0)-(450,90). *Flat empty plane, crushed.*
    Shell ceilings through `genericPaint`. TREATMENT: per room in §4 (services, beams, lamps) at 32–64, never under #14122a. **S** each.
30. **Signs and wall lettering.** b00 (0,130)-(80,150); b06b (0,175)-(238,205). *Fat letter strokes near the camera.*
    `d2signs.ts: d2SignTile, d2WallTextTile`; `d2service.ts: wallMarkTile`. TREATMENT: 64; same layouts (`D2_TEXT_FITS`), add
    board thickness, fixings, lamp wash. **S**.
31. **Decals.** Gouges, pocks, blood at 32 × 32–48 × 32. `d2decals.ts`. TREATMENT: redraw at 64 as shapes with a lit lip and a
    dark core; fewer, larger, placed by story. **S**.
32. **Smooth light everywhere.** b05, b09, b15, b17. *Smooth 3D light gradient.* `env.ts` accents + torch. Pipeline's job
    (ramp-step lighting); painters paint evenly lit and add the fixed pools named above. **—**.

## 3. DENSITY MAP

Tier from the nearest NORMAL view (bible §3), worked out from `layout.ts` (rail x per z, room boxes), the builders' coordinates and
the formulas of §0. Thresholds for ≤ 1.5 px a texel: **walls** 32 needs L ≥ 5.2 m · 64 needs L ≥ 2.6 m · 96 needs L ≥ 1.75 m ·
128 needs L ≥ 1.3 m; **floors** (eye 1.62 m) are 2.2 px at 32 and 1.1 px at 64 → every floor on the rail is **64**; **ceilings**
32 is enough from 2.4 m above the eye (rooms ≥ 4.0 m high), but 64 is taken for the three low rooms' ceilings because they fill
the top third of the frame and are the flattest thing in it. End walls are approached from tens of metres to 0 m and walked
through: their centre (door ± 4–6 m) takes the near tier, their wings the far one. "Cost" = 16-aligned rect × variants.

| room | surface / prop class | nearest normal view | tier | painted today (32 tpm) | new tile(s), texels | cost | note |
|---|---|---|---|---|---|---|---|
| lobby | floor slabs (30x64 m) | H 1.62 m under the eye: 2.2 px/texel at 32 | **64** | d2lobbyfloor 256x128 wrap, floor bias 1.5 | 512x512 | 262 k | wrap 8x8 m: 64 unique 1 m slabs |
| lobby | floor: worn path / spill / debris decals | on the rail | **64** | d2blood 32x32, d2paper 16x16 | 256x256 x3 | 197 k | 3 unique 4x4 m cut-out decals |
| lobby | emblem mosaic (7 m) | on the rail, passes under the camera | **64** | d2emblem 128x128 over 7 m (18 tpm!) | 448x448 | 201 k | unique |
| lobby | side walls, ground storey bay (12 m between pillar lines, 0-4.8 m) | L 12.5-17.5 m | **32** | d2ashlarwall 128x64 wrap + d2wainscot 64x48 + d2plaster 128x128 | 384x160 x2 | 123 k | 2 bay paintings (A posters / B staff door, gouges) |
| lobby | side walls, upper storey bay (5.2-15 m) | L 12.5-17.5 m | **32** | d2plaster + d2pilaster 32x32 + d2clerestory 64x128 + d2frieze 64x32 + d2gallery 64x80 | 384x320 x2 | 246 k | 2 bay paintings incl. window, pilaster, frieze, gallery door, water run |
| lobby | far wall centre (door surround +-6 m, 0-5.6 m) | approached to 0 m (door 3.6 m wide: L 1.8) | **64** | d2plaster + d2wainscot + sign | 768x368 | 283 k | unique; the 2 m either side of the door could go 96 (+0.1 M) |
| lobby | far wall wings (0-5.6 m) | >= 8 m | **32** | d2plaster + d2wainscot | 576x192 | 111 k | unique |
| lobby | far wall upper + mural (5.6-15 m) | >= 10 m | **32** | d2mural 352x112 + d2plaster | 960x304 | 292 k | unique: the mural grows a painted frame, wall wash lamps |
| lobby | coffered ceiling (H 13.4 m) | far | **32** | d2coffer 128x128 wrap | 128x128 | 16 k | wrap, repaint |
| lobby | balcony fascia + bracket course (12 m bay) | L 8.5-13.5 m | **64** | d2fascia 64x32 wrap | 768x64 | 49 k | module |
| lobby | balcony soffit (4 m deep) | L 8.5 m, seen from below | **32** | d2plaster | 384x128 | 49 k | module with lamp pools |
| lobby | balustrade (cut-out card, 12 m) | L 8.5-13.5 m | **64** | d2balustrade 32x32 wrap | 768x80 | 61 k | cut-out, with draped bunting / missing spindles |
| lobby | pillars x10 (0.96 m dia, 15 m) | L 8.5 m (frame edge at 7 m depth) | **64** | d2column 32x128 cyl wrap + granite / stone boxes | 208x512 | 106 k | cyl wrap 8 m tall + profile cards for base and capital |
| lobby | pillar base + capital profile cards | L 8.5 m | **64** | d2granite 64x64, stone 64x64 on boxes | 112x80 x2 | 18 k | 2 cut-out profiles (crossed cards) |
| lobby | reception desk fronts (8 m + 3.2 m) | L 4.3 m | **64** | d2desk 256x32 / 96x32 fit | 720x80 | 58 k | modules |
| lobby | reception desk top + dressing cards | L 4.3 m | **64** | terrazzo 128x128 wrap | 576x64 | 37 k | top module |
| lobby | desk dressing: monitors, lamp, brochure rack, phone, bell (cards) | L 4.5 m | **64** | d2crt 32x20 | 64x64 x6 | 25 k | 6 cut-out cards |
| lobby | skeleton plinth sides + plaque | L 4-8 m | **64** | d2granite 64x64 wrap | 640x32 | 20 k | module strip, both long sides |
| lobby | skeleton bone chunks (cut-out profile per chunk) | 8-20 m | **32** | d2bone 64x64 wrap on boxes | 384x208 | 80 k | one profile sheet, cut per chunk |
| lobby | benches, bins, kiosk, chair, pots (profile cards) | L 4-9 m | **64** | d2wood / d2metal on boxes | 160x112 x5 | 90 k | 5 props |
| lobby | posters x3 | L 12-17 m; one passes at 5 m | **64** | d2poster 64x80 | 112x144 x3 | 48 k |  |
| lobby | welcome banner | >= 14 m | **32** | d2welcome 304x112 | 416x144 | 60 k | keep, add folds |
| lobby | pillar banners, vines, wall decals | L 8-15 m | **64** | d2pbanner 32x112, d2vines 64x48, gouges 48x32 | 64x224 x6 | 86 k |  |
| shop | carpet (16x24 m) | H 1.62 | **64** | d2carpet 128x128 wrap | 256x256 | 66 k | wrap |
| shop | carpet wear / spill decals | on the rail | **64** | d2blood 32x32 | 128x128 x3 | 49 k |  |
| shop | merchandise shelf walls (2.4 m high) | L 7.0 m (frame edge at 5.8 m) | **64** | d2merch 256x80 x2 wrap | 512x160 x3 | 246 k | 3 unique 8 m bays (toys / books+mugs / ransacked) |
| shop | wallpaper + pelmet above the shelves | L 8 m | **32** | d2wallpaper 128x144 wrap | 128x64 | 8 k | wrap |
| shop | far wall centre (door surround) | approached to 0 m (L 1.8) | **64** | d2wallpaper + sign | 512x288 | 147 k | unique |
| shop | far wall wings + back shelf | >= 5 m | **64** | d2merch (u0 70) on the back shelf | 512x288 | 147 k | unique: counter back-bar, key rack, pin board |
| shop | ceiling (H 2.78 m above the eye) | 1.3 px at 32 | **64** | d2acoustic 64x64 wrap | 256x256 | 66 k | wrap + 3 unique stained / missing panels |
| shop | display tables x4: long skirt (4 m) | L 2.9 m | **96** | d2tableskirt 64x32 wrap, d2skirtlogo 48x18 | 384x96 x2 | 74 k | 2 variants |
| shop | display tables: end skirt + top | L 2.9 m | **96** | d2tablecloth 48x96 | 176x480 x2 | 169 k | tops as 2 unique paintings |
| shop | table merchandise cut-outs (mug pyramid, plush pile, shirt stacks, SALE easel) | L 3-4 m | **96** | d2merchcard 24x24, d2shirtstack 18x8, d2plushcard 16x16 | 80x80 x8 | 51 k | 8 cards |
| shop | counter front + top + till | L 2.6-7 m | **64** | d2counter 141x32 | 288x96 | 28 k |  |
| shop | mascot, spinner rack, plush on floor (cards) | L 2.4-5 m | **64** | d2mascot 64x96, d2postcard 8x12 | 128x176 x2 | 45 k |  |
| atrium | soil beds (28x44 m) | H 1.62 | **64** | d2soil 128x128 wrap | 256x256 | 66 k | wrap |
| atrium | bed litter / mulch / root decals | L 2-6 m | **64** | - | 128x128 x4 | 66 k |  |
| atrium | flagstone path (3.6 m ribbon) | on the rail | **64** | d2flagstone 128x128 wrap, chunky2 (every texel 2x2) | 240x512 | 123 k | ribbon module with kerb stones painted in |
| atrium | glass side walls: glazing bars + sheen + dew (cut-out) | L 10.8-17 m | **32** | d2glasssheen 128x64, d2condense 128x32, steel boxes | 352x192 x2 | 135 k | 2 bays |
| atrium | low stone base wall (1 m) | L 10.8-17 m | **32** | d2rubble 64x64 wrap | 256x32 | 8 k |  |
| atrium | far end: glazing + plinth + door surround (centre 10 m) | approached to 0 m (L 1.8) | **64** | d2glazing 64x64 wrap, d2ashlar 64x32, d2canopy 160x16 | 640x448 | 287 k | unique |
| atrium | far end wings | >= 5 m | **32** | d2glazing, d2ashlar | 576x224 | 129 k | unique |
| atrium | pond: water (anim 6 frames, 2 m wrap) | L 5 m | **64** | classic S.water disc | 128x128 x6 | 98 k | 6-frame strip |
| atrium | pond rim, lilies, fountain (cards) | L 5 m | **64** | classic rock icos / discs | 256x96 x2 | 49 k |  |
| atrium | PREHISTORIC FLORA sign + post | L 3 m | **96** | d2sign 224x32 | 336x48 | 16 k |  |
| atrium | bench, uplights + pools, misting line, vines | L 2.6-6 m | **64** | classic boxes, d2vines | 128x96 x5 | 61 k |  |
| hatch | vinyl floor (20x38 m) | H 1.62 | **64** | d2vinyl 128x128 wrap | 256x256 | 66 k | wrap |
| hatch | floor decals: spill, scorch, drag, broken table debris | on the rail | **64** | d2blooddrag 32x80 | 224x224 x2 | 100 k |  |
| hatch | grated service aisle (3 m) | on the rail | **64** | d2grating 32x32 wrap | 192x256 | 49 k | wrap |
| hatch | side walls (8 m bay, 4.8 m) | L 10 m | **32** | d2subway 128x160 wrap | 256x160 x3 | 123 k | 3 bay paintings (LAB B door bay, tank bay, LAB C door bay) |
| hatch | far wall centre (consoles, door, sequencers) | approached to 0 m (L 1.6) | **64** | d2subway + d2sequencer 128x48 + d2helixscreen 32x16 | 640x320 | 205 k | unique |
| hatch | far wall wings | >= 5 m | **32** | d2subway | 320x160 | 51 k |  |
| hatch | ceiling (H 3.18) | 1.1 px at 32 | **64** | d2acoustic 64x64 wrap | 256x256 | 66 k | wrap + troffers painted |
| hatch | incubators x5: side / end elevations (profile, 3.5x2.5 m) | L 2.9 m | **96** | d2incapron 128x32, d2incpanel 112x12, classic plates + legs + dome | 336x240 x3 | 242 k | 3 profiles (intact side, hatched side, end) |
| hatch | incubator tops (tray, nest, shells) | L 2.9 m, 0.7 m under the eye | **64** | d2nest 32x32 + classic | 224x224 x2 | 100 k |  |
| hatch | embryo tanks x8 (card, 1.6x3.5 m) + bubble strip | L 8.7 m | **64** | classic cylinders (fluid, glass) | 112x224 x3 | 75 k | 3 variants |
| hatch | lab cabinets, doors, robot arm skin | L 9-10 m | **64** | d2labcabinet 48x64, d2door_lab 80x96 | 144x176 x3 | 76 k |  |
| kitchen | chequer floor (18x32 m) | H 1.62 | **64** | d2chequer 128x128 wrap | 256x256 | 66 k | wrap |
| kitchen | floor decals: grease, drain, dropped pans, spill | on the rail | **64** | d2grease 48x32, d2drain 24x24 | 96x96 x6 | 55 k |  |
| kitchen | wall bay behind the counters (6.8 m: splash-back, hood, upper wall) | L 9 m | **32** | d2kitwall 128x144 wrap + d2hood 128x64 + d2utensils 48x20 + d2stores 64x20 | 224x144 x3 | 97 k | 3 bay paintings |
| kitchen | wall counter / appliance front run (6.8 m) | L 7.9 m | **64** | d2cabinet 128x64, d2appliance 45x29 | 448x64 x3 | 86 k |  |
| kitchen | islands x4: long cabinet side (9 m) | L 3.8 m | **64** | d2cabinet 128x64 wrap | 576x64 x2 | 74 k | 2 variants |
| kitchen | islands: end elevation + top (9 m) | L 3.8 m | **64** | d2islandend 48x26, d2countertop 64x64 wrap | 112x640 x2 | 143 k |  |
| kitchen | pot rack + hanging pans (one cut-out strip per island) | L 4.6 m | **64** | d2pan 16x24 cards | 576x64 x2 | 74 k |  |
| kitchen | counter clutter cards | L 4.6-8.5 m | **64** | d2clutter 24x16 | 64x48 x8 | 25 k |  |
| kitchen | end wall centre (door surround) | approached to 0 m (L 1.7) | **64** | d2kitwall + notices + clock + extinguisher | 576x272 | 157 k | unique |
| kitchen | end wall wings | >= 5 m | **32** | d2kitwall | 288x144 | 41 k |  |
| kitchen | ceiling (H 2.58) | 1.4 px at 32 | **64** | d2acoustic 64x64 wrap | 256x256 | 66 k | shared with the hatchery / shop if the same tile |
| kitchen | entry swing doors x2 (you pass between them) | L 1.6 m | **96** | d2steel 64x64 on a slab | 160x224 | 36 k |  |
| kitchen | freezer door + interior painting | L 9 m | **64** | d2door_steel 64x96, classic slab | 240x192 | 46 k |  |
| servers | raised floor (16x24 m) | H 1.62 | **64** | d2raised 128x128 wrap | 256x256 | 66 k | wrap |
| servers | floor decals: lifted tile, cable hatch, coolant leak | on the rail | **64** | - | 96x96 x3 | 28 k |  |
| servers | side walls above the racks | L 8 m | **32** | d2serverwall 128x128 wrap | 256x128 | 33 k |  |
| servers | rack fronts x8 (5.1x2.3 m) | head-on from 5 m; frame edge at 1.9 m when passing | **64** | d2rack 176x80 fit | 336x160 x2 | 108 k | 2 variants; 96 if budget allows (+0.11 M) |
| servers | rack end panels (0.95x2.3 m) | L 2.3 m | **96** | d2rackend 32x80 | 96x224 x2 | 43 k |  |
| servers | rack-top silhouette cards + cable drops | L 2.3-7 m | **64** | d2cabledrop 24x32 | 336x48 x2 | 32 k |  |
| servers | cable trays (0.6 m, 4 m wrap) | H 1.5 m above the eye | **64** | d2grating_b09028 32x32 | 256x48 | 12 k |  |
| servers | ceiling plenum (H 2.18) | 1.65 px at 32 | **64** | d2grating_2e343c 32x32 wrap | 256x256 | 66 k |  |
| servers | end wall + bulkhead (door 3 m: L 1.5) | approached to 0 m | **64** | d2serverwall, d2bulkhead 96x96 | 512x256 | 131 k | unique; jambs 96 |
| servers | bulkhead door + jambs | L 1.5 m | **96** | d2bulkhead 96x96, d2metal on jamb boxes | 288x272 | 78 k |  |
| tunnel | walls (8 m panel, 3.3 m) | L 2.6 m | **96** | d2tunnelwall 128x112 wrap | 768x320 x3 | 737 k | 3 unique panels, mirrored for the other wall |
| tunnel | deck (5.2 m wide ribbon) | H 1.62 | **64** | d2tunneldeck 176x64 wrap | 336x512 | 172 k | 8 m module |
| tunnel | ceiling (H 1.68) | 2.1 px at 32 | **64** | corr 128x128 wrap | 384x256 | 98 k |  |
| tunnel | alcove walls + crates | L 2.6-5 m | **64** | d2concrete, d2crate 32x32 | 160x176 x4 | 113 k |  |
| tunnel | stand-off pipe elbows, valve wheels, junction boxes (cards) | L 2.3 m | **96** | d2pipe 32x64 on 8-sided cylinders | 80x80 x5 | 32 k |  |
| pump | floor (16x18 m) | H 1.62 | **64** | d2oilfloor 128x128 wrap | 256x256 | 66 k |  |
| pump | oil pools (anim sheen) + drain + markings | on the rail | **64** | d2oilpool 64x48 x3 | 128x96 x5 | 61 k |  |
| pump | side walls (8 m bay, 5.5 m) | L 8 m | **32** | d2concrete 128x128 + corr band | 256x176 x2 | 90 k | 2 bays (side-tunnel opening bay, pump bay) |
| pump | back wall centre (door surround, 4.4 m door: L 2.2) | approached to 0 m | **64** | d2concrete + sign | 640x352 | 225 k | unique |
| pump | back wall wings | >= 6 m | **32** | d2concrete | 192x176 | 34 k |  |
| pump | tanks x2 (profile cut-out 5.2x3.2 m) | head-on 16 m, passing L 4 m | **64** | d2tankskin 64x64 cyl, d2tanklabel 48x16 | 336x208 x2 | 140 k |  |
| pump | pump units x4 (profile incl. riser 2.2x5 m) | L 6 m | **64** | d2pumpface 45x38, d2motor 32x32 | 144x320 x2 | 92 k |  |
| pump | overhead manifold (cut-out, 16 m) | H 3.2 m above the eye | **32** | d2metal on slabs | 512x32 | 16 k |  |
| pump | console, side-tunnel dim corridors, ceiling | L 5-8 m | **64** | d2dimcorr 64x80 | 208x192 x2 | 80 k |  |
| wing | corridor floor (12x34 m between the hazard lines) | H 1.62 | **64** | d2slabfloor 128x128 wrap | 256x256 | 66 k | shared wrap with the hall |
| wing | floor decals: drag trail, glass scatter, hoof scrapes, hazard lines | on the rail | **64** | d2dragtrail 32x96 | 128x192 x5 | 123 k |  |
| wing | cell fronts: frame + glass overlay per cell (10.2x6 m, cut-out) | L 6 m | **32** | d2glasssheen 128x64 wrap, d2condense, d2clawcrack 64x64, d2metal boxes | 336x192 x3 | 194 k | intact / cracked / broken |
| wing | piers (0.7 m box, 7.5 m) + head beam | L 5.65 m | **64** | d2metal 64x64 on boxes | 48x480 x2 | 46 k |  |
| wing | cell interiors: back wall painting (10x7.5 m) | L 12 m, through glass | **32** | d2concrete, d2straw 128x128, d2bale 32x24 | 320x240 x2 | 154 k |  |
| wing | hall-side end wall + blast doors (6.2 m opening: L 3.1) | approached to 0 m | **64** | d2blastdoor 64x112, d2concrete | 832x416 | 346 k | unique |
| wing | ceiling services (H 5.9) | far | **32** | d2concrete tinted | 128x128 | 16 k |  |
| hall | floor near the camera (wrap) | H 1.62 | **64** | d2slabfloor 128x128 wrap | (shared) | 0 k | the wing wrap |
| hall | arena floor painting (16x16 m: ring, drain, KEEP CLEAR, stains, lamp pools) | >= 5 m (y 115 px line = 3.7 m) | **32** | d2floorline 32x128, d2floorstencil 224x48, d2drain | 512x512 | 262 k | unique |
| hall | long walls (6 m buttress bay, 11 m) | L 18 m | **32** | d2hallwall 128x128 wrap, d2dado 128x160, d2cabletray, d2fadedhazard, d2dripstain | 192x352 x3 | 203 k | 3 bay paintings |
| hall | pillars x4 (2.2 m dia, 11 m) | >= 11 m | **32** | d2conccolumn 64x128 cyl wrap | 224x352 | 79 k |  |
| hall | tank front: frame + pane overlays (6x8.4 m) | 36 m | **32** | d2glasssheen, d2metal | 192x272 x3 | 157 k |  |
| hall | tank interior back wall + X | 42 m | **32** | d2tankwall 128x128, d2tankx 96x96 | 256x256 | 66 k | keep size |
| hall | catwalk underside, balustrade, truss lattice (cut-out) | L 15-18 m, H 4-9 m | **32** | d2grating, d2balustrade, d2metal slabs | 384x48 x3 | 55 k |  |
| hall | SPECIMEN X board, gates, crates, debris | >= 14 m | **32** | d2specimenboard 336x80 | 336x80 x2 | 54 k |  |
| shared | generic set (metal, steel, wood h/v, plain, cloth, concrete, plaster, bone, hazard, corrugated) | 2x fallback of the 64x64 tiles | **64** | d2metal ... 64x64 / 128x128 wrap | 128x128 x11 | 180 k | stays on the 2x-upscaled fallback (no native repaint) |
| shared | signs + wall lettering (55 tiles) | over doors: L 1.8-3 m as you pass | **64** | d2sign 80-240 x 32, d2walltext, d2wallmark | 320x48 x34 | 522 k | re-laid at 64 with 2-texel strokes kept as 2 px |
| shared | doors (wood x2, lab, steel), vents, beacons, light fittings (cards) | L 1.6-10 m | **64** | d2door 64x96 etc. | 80x96 x10 | 77 k |  |

**Per room:**

- lobby: 2.52 M texels
- shop: 1.10 M texels
- atrium: 1.04 M texels
- hatch: 1.15 M texels
- kitchen: 0.96 M texels
- servers: 0.60 M texels
- tunnel: 1.15 M texels
- pump: 0.80 M texels
- wing: 0.94 M texels
- hall: 0.88 M texels
- shared: 0.78 M texels

**TOTAL: 11.92 M texels; +10% packing = 13.11 M; bytes at 2 B x 1.33 = 33.3 MiB** (today: 1.11 M texels, 7.9 MB as RGBA).

### Does it fit?

- **Memory: yes.** The table totals **11.9 M texels**; with 10 % packing loss 13.1 M → at two bytes a texel with levels (× 1.33)
  **≈ 33 MiB of the 48 MB**, + the sky atlas (one level, 0.15 M texels ≈ 0.3 MB) and FLORA (R8, 0.7 MB). About 5 M texels of
  headroom: spend it, in this order, on (1) rack fronts 64 → 96 (+0.11 M), (2) the 2 m of wall either side of each of the eight
  doorways 64 → 96 (+0.4 M), (3) hatchery and kitchen side-wall bays 32 → 64 (+0.9 M), (4) a third lobby ground-storey bay.
- **One atlas no longer works.** 13 M texels is 4096 × 3200 in one texture (a 35 MB upload and one 35 MB store record). Split by
  zone group, each ≤ 2048 × 2048: **d2a** lobby + shared (3.3 M) · **d2b** shop + atrium + hatchery (3.3 M) · **d2c** kitchen +
  servers + tunnel (2.7 M) · **d2d** pump + wing + hall (2.6 M). Rooms are already separate meshes, so draw calls do not
  change; the shared generic tiles are registered in each atlas that uses them (+0.2 M each).
- **Paint time is the budget that does NOT fit as things stand.** Today the stage paints 1.1 M texels in 192 ms (node) / 276 ms
  (dev browser): 174–250 ns a texel. 11.9 M texels at that cost is **2.1–3.0 s against the 1.2 s budget.** Three ways out, to be
  decided by whoever owns the foundation, not by the painter:
  1. the indexed pipeline has to be about twice as fast per texel as the RGBA one (half of today's 192 ms is resolve / pack /
     levels, not painting) — measure first;
  2. paint by zone: only **d2a** must be ready behind the intro card (3.3 M ≈ 0.6–0.8 s); b / c / d start 60 m of rail and two hold
     beats away (a zone is not even drawn beyond d + 62 m) and can paint in `pwPaintStep` slices during play — a risk for the "no long
     task in play" rule on a phone, so it needs a measurement too;
  3. the lean cut, if neither holds (saves ≈ 2.6 M, to ≈ 9.3 M): shared generic set and ALL signs / wall lettering stay on the
     **2× upscaled fallback** (they are flat fills and designed text: the upscaler is enough; −0.78 M native paint); the lobby
     mural, WELCOME banner, SPECIMEN X board, tank wall and tank X stay as today's tiles at 2× (−0.5 M); one bay variant instead
     of two / three for the lobby upper storey, the hall walls, the tunnel (−0.5 M); the end-wall wings of atrium, hatchery,
     kitchen and pump as 32 wrap tiles + decals instead of unique paintings (−0.45 M); cell interiors one variant (−0.08 M);
     lobby floor wrap 8 × 4 m (−0.13 M); pillar / hall-pillar wraps 4 m tall (−0.1 M).
- **What stays at the 2× fallback in any case:** `d2MetalTile / d2SteelTile / d2WoodTile / d2PlainTile / d2ClothTile /
  d2ConcreteTile / d2PlasterTile / d2BoneTile`, `hazardTile`, `corrugatedTile`, `grateTile` (they only remain on small parts:
  frames of glass walls, robot arms, trolley, chair legs, pipe stubs), the three unlit sky tiles, the vent grilles and the
  dim-corridor voids. Once the doorway modules of offender 9 exist, the only things in that list within 3.5 m of the rail are the kitchen trolley (x −2.6…−1.8, z −189) and the hatchery robot arms (L 3.2 m): give the trolley a profile card and the arms a native 64 tile.

## 4. SCENE BY SCENE — what a Metal Slug / SF III background artist would paint here

Mood per scene: one hue family for the architecture, one accent for light, one for danger (bible §4.6). Positions are world
metres (x, z) unless they are obvious from the object.

### 4.1 Lobby (beats 0–4) — warm sandstone and dark timber · cool moonlight · red beacons

*Story: a visitor centre emptied in one minute at closing time.*
- **Reception (6.8…10, −11…−19.7):** queue stanchions with velvet ropes knocked over like dominoes; a toppled brochure rack and
  park maps fanned across the slabs with a boot print and one three-toed print in spilled coffee; a hand-written "TOURS
  SUSPENDED" sheet taped to the desk front; the phone handset hanging off the desk on its curly cord; a banker's lamp still on;
  a tray of visitor lanyards; key hooks; the two CRTs (SYSTEM FAILURE) with a third dark and cracked.
- **Left wall bays under the mezzanine:** fossil vitrines between the pillars (ammonite, a claw, an egg clutch on velvet; one
  smashed, glass on the floor), a lit YOU-ARE-HERE park map lightbox with the HATCHERY TOUR route, a snack vending machine
  (flickering) and a drinking fountain, a fire-hose cabinet, a wheelchair, the donor plaque wall.
- **Floor trail from the doors to the desk:** an abandoned stroller on its side with a plush dino hanging from the handle, a
  wet-floor A-sign folded flat, two souvenir bags, a child's shoe, a ranger hat.
- **Plinth:** interpretive lectern with its own little lamp, two floor spotlights on stands aimed up at the bones (warm light
  painted on the bone cards), the steel armature and three guy wires to the roof (thin cut-outs that swing after the collapse).
- **Mezzanines:** bunting between the pillars, a tipped planter spilling over the fascia, "EXHIBIT CLOSED" barriers in the
  gallery doorways, claw gouges on the fascia at the three leap points.
- **Far wall:** a gilded painted frame and two wall-washer lamps on arms for the mural; the GIFT SHOP neon throwing an amber
  pool on wall and floor; a photo booth ("DINO SNAPS") and a penny-press machine in the right corner; green EXIT man over the
  staff door.
- **Light:** moon shaft (cool stepped pool crossing the emblem, dithered edge), pendant lamps (two lit: warm 3-ring pools;
  two dead), recessed downlights under the mezzanines every 3 m (one flickering) with pools on the wainscot and floor, desk
  lamp, vending machine, neon, red beacon pools on the pillar shafts.
- **Silhouette against skylight / ceiling:** pendants on chains, banner ropes, pillar capitals with brackets, urn finials on
  the balustrade, the skeleton, bunting.
- **Loops (6):** a park balloon bobbing under the left soffit; the handset swinging; the vending machine / downlight flicker;
  dust motes in the moon shaft (8 frames, tone +1 only); CRT cursor; beacon sweep (2 frames).
- **Remove / simplify:** the white glow line under the mezzanines; the box moon shaft; dot speckle on the plaster; 1 × 2 m
  blocks; box capitals; the bright gold of the emblem (one step duller). Nothing but slabs, the border course and soft pools in
  the strip x −4…+5 from z −20 to −50.

### 4.2 Gift shop (beats 5–6) — cream and bottle-green · warm lamp light · toy-bright colour kept on the shelves, off the floor

*Story: looted in a panic, then the compys moved in through the ceiling.*
- **Counter (2.6…7, −74.3…−75.3):** till drawer open with notes spilling, the receipt roll unspooled across the counter and
  down to the carpet, a dangling card reader, a "BACK IN 5 MIN" card, a spiral coin-wishing well, candy jars of dino eggs, a
  plush raptor sat on the counter; behind it the back wall as a back-bar: key rack, pin board with the staff rota, a kettle,
  shelves of boxed stock.
- **Shelf bays (three paintings):** A plush by species in rows with shelf-talkers ("20 % OFF"), ranger hats on pegs, toy rifles;
  B field guides, mugs, volcano snow globes, amber keyrings on a spinner, lunch boxes; C **ransacked**: a shelf board hanging
  by one bracket, stock on the floor, a dark empty back — this is the bay behind the tech's cover spot (right wall, z −69…−72):
  mid-dark and quiet so the white coat reads.
- **Tables:** see offender 7; one mug pyramid half collapsed with shards on the cloth; a "PLEASE DO NOT CLIMB" rope round the
  plush T. rex; a coin-operated triceratops kiddie ride by the entrance (profile card, left of the door, x −6, z −58).
- **Ceiling:** T-bar grid; tiles pushed aside round the three vents, one hanging by a corner over (−1.6, −65); a mobile of
  paper pterosaurs over each table pair (x ± 3.7 — never over the centre aisle where the compys drop); sprinkler heads.
- **Walls above the shelves:** dado rail, framed dinosaur prints, a "HOW TALL ARE YOU?" raptor height chart by the door, a
  security mirror dome and a CCTV camera in the back corners, "SMILE — YOU'RE ON CAMERA", the STOCK door with a kick plate.
- **Carpet:** blue slush drink spilled with a trail of compy prints toward the back, trampled popcorn, a dropped basket,
  price tags.
- **Light:** troffers (two flicker) as stepped pools on the carpet; a warm pool at the counter (the existing flicker accent);
  the till display; a neon OPEN sign in the lobby-side window; the atrium door as a cold blue-green rectangle.
- **Loops (5):** neon OPEN flicker; the pterosaur mobiles turning (4 frames); CCTV LED; the hanging ceiling tile swaying; the
  kiddie ride's coin lamp chase.
- **Remove / simplify:** white table lids; the brown "brick" back shelf; the orange ceiling gradient; carpet medallions two
  steps down in contrast under the gameplay zone.

### 4.3 Botanical atrium (beats 6–8) — deep greens and wet stone · moon blue · warm grow-lamp

*Story: the gardeners' evening round, dropped mid-task.*
- **Path edge, left (−4…−6, −86…−95):** a wheelbarrow of potting soil with a trowel stuck in it, a kneeling pad, gloves and a
  radio (LED blinking) left on the kerb, species stakes (CYCAD, TREE FERN, GINKGO, HORSETAIL) along both beds.
- **Left wall (x −13):** a potting bench under a hanging grow lamp (the warm accent at (−3.5, −104) gets a real fitting),
  stacked terracotta pots, seed trays, bags of mulch, a hose reel on the low wall with a dripping tap, an electrical box with
  conduit, a brass plaque "CRETACEOUS GARDEN".
- **Right side:** a pruning ladder against the palm at (9, −92); an overturned garden cart; by the pond a stone bench and
  a tiered stone fountain bowl (replacing the cone) with falling strands, lily pads, two koi, a dropped sun hat floating.
- **Dilo story (never on the spawn spots of `clear[]`):** an information plaque blackened by a venom splash with drips, a
  blinded-keeper's face shield on the path.
- **Structure:** cast-iron columns with scrolled spandrel brackets at every rafter foot (cut-out cards on the x ± 14 lines,
  4 m apart: the silhouette against the sky), roof vents propped open, a rolled shade cloth with one panel hanging loose, the
  misting pipes with nozzles, hanging baskets on chains along the ridge.
- **Glass:** condensation rivulets, handprints, one cracked pane patched with tape, fronds pressed against the outside.
- **Path:** puddles mirroring the moon with drip rings, a brass drain grate, fallen fronds, muddy three-toed tracks crossing
  bed to bed.
- **Light:** bollard lamps (replacing the mint boxes) with green-white pools on flags and leaf undersides; two grow lamps
  with warm cones on the beds; moon through the roof as a faint lattice of glazing-bar shadows on the path; lightning.
- **Loops (6):** drip rings in two puddles; fountain strands; mist puffs from two nozzles (small, tone +1); the loose shade
  cloth; a koi turning; moths round one bollard.
- **Remove / simplify:** box kerbs, the dashed sheen pattern, bare soil, the cone fountain and uplight boxes. Beds stay open
  and dark behind both dilo spots and the two flank-leap spots.

### 4.4 Hatchery (beats 9–10) — cool grey-green tile and stainless · sodium-warm heat lamps · green tank glow

*Story: the genetics shift fled between two readings.*
- **Incubator bays:** temperature strip-chart recorders, egg-turner racks, labels "CLUTCH 14-B", slime trails over the table
  edge and small wet three-toed prints leading down the aisle toward the kitchen; the knocked-flat table (4.65, −138.7) as a
  3.5 m floor painting of buckled legs, shattered dome and spilled eggs.
- **Wall benches between the tanks (three bay paintings):** microscopes, an open centrifuge, tube racks, a laptop with the
  helix, binders "PROJECT X — CONFIDENTIAL", a whiteboard with a growth curve and "IT'S LEARNING" scrawled across it, a
  backlit cabinet of amber samples, two liquid-nitrogen dewars with frost, a −80 freezer, an eyewash station and emergency
  shower (yellow), biohazard bins, a wall phone, "DAYS SINCE LAST INCIDENT 0", an observation window into LAB B (dark,
  equipment in silhouette), card readers glowing red at both lab doors.
- **Tanks:** brass-capped cylinders, three embryo poses, one tank shattered with its fluid in a stepped green pool on the
  vinyl, floor valves, cable bundles to the ceiling.
- **Floor:** the grated aisle with a drain channel and coloured pipes visible under it, hazard edge strips, knocked-over lab
  stools, a dropped clipboard, broken glassware, a gurney with restraints by the kitchen door.
- **Ceiling:** troffer grid (the dead ones dark and one hanging), the robot arms' ceiling rail, sprinkler heads, a cable tray.
- **Light:** troffers as white stepped pools; heat lamps as warm pools on the nests; tank glow tinting floor and dado green
  within 2 m; screens.
- **Loops (6):** tank bubbles; strip-chart pen; a failing troffer; LN2 vapour wisp; drip from the broken tank; card-reader LED.
- **Remove / simplify:** the green ceiling gradient; pale mint everywhere (walls two steps darker, floor one: rings are
  yellow, white and red here); black rectangles behind the lab doors (dim corridor paintings). The dark cabinets behind the
  tech at (9.75, −140.6…−143.7) stay at least as dark as today.

### 4.5 Kitchen (beats 11–12) — cream tile and stainless · cold white tubes · blue gas flames, red stripe

*Story: dinner service, abandoned with the burners lit.*
- **Ranges:** pots boiling over, a fryer with its baskets up, a salamander grill glowing, ladles and tongs on the rails,
  order tickets on a rail over the pass, heat lamps, plate stacks, a stock pot overturned with a soup spill running to the drain.
- **Islands:** boards with half-chopped vegetables and a knife, a mixer, gastro tubs, a raw chicken, a burst flour sack with a
  white fan across the floor and **raptor prints through the flour toward the freezer** (by the right island, z −180).
- **Walls:** grease-stained hood filters, a knife magnet, fire blanket, first-aid box, hand-wash sink with soap, the HACCP
  clipboard, the stopped clock, a violet insect zapper, the menu board ("TODAY: BRONTO BURGER"), a fridge with its door ajar.
- **Freezer:** painted interior with hanging sides of beef on a hook rail, frost haze, the blood drag into it.
- **Floor:** rubber mats in front of the ranges, a mop and yellow bucket, a "CAUTION WET FLOOR" sign, a dropped tray of
  smashed plates, the existing drains.
- **Ceiling:** rectangular extract ducts with flanges running to the hood (the silhouette piece), sprinkler pipe, troffers.
- **Light:** tubes as stepped pools on island tops and floor (failing one dark); blue pilot flames; the fridge's cold wedge;
  zapper glow; red beacons.
- **Loops (6):** steam from two pots; gas flames; order tickets fluttering; zapper flicker; a dripping tap; the failing tube.
- **Remove / simplify:** the ceiling bloom (cap at tone 4: the ring lands there), unbroken 9 m boxes, the flat periwinkle
  far floor, the three red capsules in the freezer.

### 4.6 Server room (beat 13) — blue-violet steel · cyan-white LEDs · amber warnings

*Story: the fences went down from this room.*
- **Racks (two front paintings):** blade chassis, a tape library with a window and its robot, patch panels with cable
  waterfalls, a KVM drawer pulled out, its screen reading "PERIMETER FENCE — OFFLINE"; perforated doors, two swung open
  (cards); a crash cart with monitor and keyboard parked at the A3 end; the toppled rack with its sparking cable (exists).
- **Side walls above the racks:** two CRAC units with louvres and status lamps, a row of red gas-suppression cylinders with a
  strobe / horn, a UPS cabinet with a buzzing amber lamp, conduit, a network diagram.
- **Floor:** a lifted tile with the suction lifter still on it, the void showing cable bundles and a compy nest of chewed
  cable; a laptop on the floor on a console lead; a coffee cup.
- **Ceiling:** cable trays with bundles spilling to the rack tops, aspirating smoke-detector pipe, emergency light bars.
- **Light:** the blue cold-aisle strips as painted pools on the tiles; LED clusters (the three animated materials stay);
  monitor glow; amber lamp.
- **Loops (5):** LEDs (exist); the tape robot shuttling; KVM cursor; amber lamp rotating; CRAC fan shimmer (2 frames).
- **Remove / simplify:** crushed black; flat rack tops; empty upper walls. Cold aisle and bulkhead wall stay plain.

### 4.7 Maintenance tunnel (beats 14–16) — warm grey concrete and green cladding · sodium lamps · red strobe

- **Wall panels:** pipe runs as painted forms with flanges, hangers, red valve wheels, pressure gauges, torn lagging showing
  foil, drip stains and rust tongues under the joints, stencilled flow arrows and IDs ("CHW-2", "STEAM"), junction boxes, a
  yellow emergency phone, an extinguisher niche, distance markers ("PUMP ROOM 40 m →"), the crew's tally "RAPTORS 3 — US 0".
- **Floor:** chequer plate with a grated trench (water glinting below), puddles under the leaks, a dropped torch still lit
  throwing a wedge along the deck, a spilled tool bag, oily boot prints, the blood smear into the alcove.
- **Alcove:** lockers (one open, a jacket), hard hats on hooks, a calendar, a workbench with a vice; the interior stays DARK
  and plain (the raptor waits there) — dressing only on its outer edges.
- **Ceiling:** corrugated deck with conduit bundles, sprinkler main, caged bulkhead lamps (one hanging by its cable).
- **Light:** lamp pools on ceiling and wall heads (3 rings); red beacon pools; the torch wedge.
- **Loops (5):** two steam leaks as painted puffs; drip rings; the hanging lamp swinging; water glint under the grating;
  beacon sweep.
- **Remove / simplify:** prism pipes, bracket boxes, the red gradient, 6-px cladding ribs.

### 4.8 Pump room (beats 17–18) — oily concrete and machine green · sodium lamps · red strobe, yellow guards

- **Pump skids:** motor, yellow coupling guard, volute, anchor bolts, drip trays, gauges, name plates, lock-out tags, an oil
  can and rags; **tanks** with dished ends, saddles, caged ladders, a green sight glass, a relief valve venting, hazard
  diamonds; **console** as a mimic panel with pump lamps, a red E-STOP, a logbook, a tipped chair; MCC cabinets on the right
  wall; a permit-to-work board; a red tool chest with drawers open; a spill-kit drum; a pallet of sacks.
- **Overhead:** I-beams and a chain hoist on a trolley with the hook swinging — the silhouette piece; the flanged manifold.
- **Floor:** yellow bund kerbs round the skids, a worn green walkway from the tunnel mouth to the wing door, a drain channel
  to the drain, hazard chevrons at both side-tunnel thresholds, the oil pools.
- **Light:** three reflector lamps with warm pools; strobes; console and sight-glass glow.
- **Loops (5):** hoist hook; relief-valve steam; console lamps; sight-glass float; slow sheen on one oil pool.
- **Remove / simplify:** "plank" concrete, the red floor gradient, box-section manifold, classic propane cylinders. Side
  openings stay black and empty; floor centre plain.

### 4.9 Containment wing (beats 18–22) — cold blue-grey concrete and steel · amber beacons · red HOLDING HALL sign

- **Cell fronts:** bolted mullions, hydraulic door rams, feeding hatches with chutes, a keypad with a red / green lamp, species
  placards ("VELOCIRAPTOR × 2 — DO NOT ENTER"), feeding-schedule clipboards; broken panes as hanging laminated shards and
  crystal heaps on the floor.
- **Interiors (paintings seen through the glass):** stained concrete, shredded wall padding, caged heat lamps, a water trough,
  a feeding hoist with a carcass in silhouette, torn bales, bones, a tyre; cell 4: dented steel plate and hoof gouges.
- **Corridor:** a cattle-prod rack, a tranquilliser-rifle cabinet with its glass broken and one rifle gone, a hand truck with
  feed buckets (one spilled), wash-down hose reels, floor gutters, a dropped keycard and a ranger hat.
- **Overhead:** cable trays, ducts with dampers, PA horns, sprinkler runs, the pendants.
- **Light:** pendants (warm pools); the cells' strip lights thrown through the glass as stepped parallelograms on the
  corridor floor; amber beacons; the red sign's pool on the lintel and floor.
- **Loops (5):** amber beacon sweep on the piers; one cell light flickering; a hose dripping; the carcass hook swinging;
  keypad lamp.
- **Remove / simplify:** black ceiling, box piers, triangle teeth, dashed sheen. Corridor floor and the lower 2.5 m of the far
  cell fronts stay quiet.

### 4.10 Holding hall, boss (beats 22–25) — blue-violet concrete · cyan tank glow · hazard yellow, alarm red

- **Tank wall:** riveted I-section mullions, an algae line and the water level, floodlights under water, a broken restraint
  gantry and dangling chains inside, the drain fan turning; the SPECIMEN X board with one letter failing; a warning light bar.
- **Wall bays (three paintings between buttresses):** A hose reels, a valve manifold, an electrical cabinet, the bay number;
  B a caged ladder up to the catwalk and a parked forklift with a pallet of tranquilliser crates (profile cut-out, against the
  wall, outside the arena bounds x 0.5…21.5); C a wheeled restraint cage with bent bars and a toppled floodlight tower still
  lighting the wall. A lit control-booth window high on the left wall.
- **Overhead:** warren-truss lattices with cable trays, a monorail chain hoist, ducts, PA horns, the four pendants on chains.
- **Floor:** see offender 5; tranquilliser darts, the dropped rifle, glass from pane 0, puddles holding the tank's blue.
- **Light:** tank glow (three cyan bands across the floor, rim light on the two far pillars); four dim warm pools; alarm red
  in whole steps during the fight; lights-out as a whole-step drop.
- **Loops (5):** tank bubbles; drain fan; the failing sign letter; pillar beacons; two steam vents as painted puffs.
- **Remove / simplify:** navy mud, the cream ring, plank walls, bar trusses. **The floor carries no bright shape at all;** the
  pillar shafts between 0.5 and 4 m carry only low-contrast form marks.

## 5. SLICES

**Step 0 (one person, before anything is painted; M, code only):** `stages/d2/pixel.ts` — remove `D2_SURF_BIAS` /
`D2_FLOOR_BIAS`, per-zone atlases (d2a…d2d), tile densities, generic set on the fallback; `pixelworld/d2levels.ts` — far
levels only; `stages/d2/pixelShared.ts` + a new `pixelworld/d2fittings.ts` — the shared kit of offenders 9, 14, 30 (door
surrounds, beacons, lamps, troffers, steam puffs, propane cut-out, signs at 64); and the file splits that keep the slices from
colliding: `pixelGreen.ts` → + `pixelHatch.ts`; `pixelLab.ts` → `pixelKitchen.ts` + `pixelServers.ts`; `d2lab.ts` → hatchery
tiles stay, kitchen tiles to `d2kitchen.ts`, server tiles to a new `d2servers.ts`; `d2walls.ts` → lobby part stays, hall part
to `d2contain.ts`, `dimCorridorTile` to the shared kit. `d2decals.ts`, `d2signs.ts`, `d2kit.ts`, `d2art.ts`, `d2surfaces.ts` are
shared: changes to them go through step 0's owner. Tags the painters need in the classic builders (`userData.pw` only, no RNG draw moved): tunnel pipes and
brackets, pump manifold, wing piers, hall trusses, kitchen swing doors, lobby benches / kiosk / chair.

| slice | beats | files (painter owns) | shots | effort |
|---|---|---|---|---|
| **A · Lobby** | 0–4 | `stages/d2/pixelLobby.ts`, `pixelworld/d2lobby.ts`, `d2walls.ts` (lobby), `d2skull.ts` | `d2:0:120`, `d2:1:240`, `d2:2:120`, `d2:3:150`, `d2:4:120`, `d2:4:420` | L (2.5 M texels; offenders 4, 8, 11, 19, 23, 24, 25, 28) |
| **B · Gift shop + atrium** | 5–8 | `pixelShop.ts`, `d2shop.ts`, `pixelGreen.ts` (atrium), `d2green.ts` | `d2:5:120`, `d2:6:120`, `d2:6:330`, `d2:7:120`, `d2:8:120`, `d2:8:420` | L (2.1 M; offenders 7, 15, 16, 17, 21, 22) |
| **C · Hatchery + kitchen** | 9–12 | `pixelHatch.ts`, `d2lab.ts` (hatchery), `pixelKitchen.ts`, `d2kitchen.ts` | `d2:9:120`, `d2:10:150`, `d2:10:420`, `d2:11:120`, `d2:12:120`, `d2:12:330` | L (2.1 M; offenders 2, 6, 12, 20) |
| **D · Servers + tunnel + pump** | 13–18 (to the wing door) | `pixelServers.ts`, `d2servers.ts`, `pixelService.ts`, `d2service.ts` | `d2:13:120`, `d2:14:120`, `d2:14:300`, `d2:15:120`, `d2:16:330`, `d2:17:120`, `d2:18:120` | L (2.6 M; offenders 3, 10, 18, 27) |
| **E · Containment wing + boss hall** | 18 (from the wing door)–25 | `pixelContain.ts`, `d2contain.ts`, `d2glass.ts` | `d2:18:300`, `d2:20:30`, `d2:21:150`, `d2:22:420`, `d2:24:60`, `d2:25:240`, `d2:25:700`; hud `d2:21:300`, `d2:25:900` | L (1.8 M, but the boss readability loop; offenders 5, 13, 26, 31) |

Every slice ends with its hold beats re-shot with `--noauto --hud` against the zones of §1.

**AUDIT SHOTS (6):**

1. `d2:2:120:lobby` — near floor and emblem, desk at 4 m, pillars, far walls (the v1 baseline shot `d2-lobby`);
2. `d2:5:120:shop` — the 96-tier tables at 2.9 m, carpet, shelf walls, low ceiling;
3. `d2:9:120:hatchery` — the flattest interior and the biggest props (incubators, tanks);
4. `d2:10:420:doorway` — walking through a door: jambs and swing doors at 1.6 m, the next room framed;
5. `d2:15:120:tunnel` — walls at 2.6 m and the gradient test;
6. `d2:25:240:boss` — the arena (baseline `d2-boss`: 35 % flat, 40 % under tone).

Secondary (baseline continuity): `d2:7:120` (`d2-atrium`), `d2:11:120` (`d2-kitchen`).

## 6. RISKS

**Gameplay geometry that must not move**
- **Occluders are the room shells and intact glass only** (`env.ts: LabScene.update` — zone `shell` + `GlassWall.pane`). Tables,
  islands, racks, incubators, pillars, tanks are NOT occluders: an enemy visually hidden behind a taller repaint is still
  hittable and still attacks. So no cut-out taller or wider than the classic silhouette inside the zones of §1: shop tables
  (the tech ducks between them), kitchen island tops (raptors vault off (±4.6, 0.95, −183/−184)), incubator tops (compys leap
  off (−4.65, 1.05, −138.7), the hybrid off (−3.6, 0.95, −147.2)), the mezzanine rail at z −29 / −37 / −50, the hall pillars
  (the boss uses them as visual cover and its paths keep a fixed clearance from their centres: the 2.2 m cylinder silhouette
  stays exactly, haunches only above 6 m).
- **Spawn voids stay dark and empty:** behind the five burst doors (enemies stand 1.6–1.8 m behind them), the tunnel alcove,
  both pump side tunnels, the hall's pen gates, the tank interior behind panes 1–2, the three shop vents and two server vents
  and two tunnel ducts (the engine moves 'drop' spawns under the ceiling and puffs dust there).
- **Dynamic set pieces, each painted in its own moving frame** (`pw.dynamic`): five `BurstDoor`s (swing or blast physics — the
  leaf must stay a thin two-faced box), the WELCOME banner (sways), the `SkeletonDisplay` (every chunk is tweened; the skull's
  `crush()` kills at a fixed spot; cards must hold up while tumbling: crossed pairs, as `skullCards`), the server bulkhead
  (rises 2.75 m as you approach), four robot arms (three animated joints each), `GlassWall` overlays (hide with `pane.visible`;
  the three states need a hook on `crack()` / `shatter()` — today only visibility is watched), instanced bubbles and steam.
- **Destructibles:** four propane tanks (`setpieces.ts: propaneTank`; kitchen (−7.2, −181), (7.0, −180.5); pump (5.2, −284.8),
  (16.8, −289)). The model IS the hit mesh. Paint a cut-out over it, same 0.6 × 1.45 m silhouette, gone on explosion, and keep
  it the most saturated prop in the room (the game shouts "SHOOT THE GAS TANKS!").
- **Civilians:** shop tech at (6.65, −70.55), hatchery tech at (8.0, −140.0): backgrounds there dark and quiet.
- **The boss:** cloaks by palette fade — it needs a mid-tone, low-contrast floor and wall behind it, not black; its rings are
  yellow / orange / red / white: nothing ring-shaped or brighter than tone 4 on the hall floor; `dimTarget` (0.75 at lights-out,
  0.15 in the fight) and `alarm` red must be checked against the new ramps so nothing drops under #14122a.

**Identity tests** (`tests/unit/pixel-world.test.ts`, `pixel-world-d2.test.ts`): classic builders may only gain `userData` tags —
no geometry, no `ctx.rng` draw added or moved (the room RNG is shared down the whole stage); PIXEL CAST must build byte-identically
and hold no PixelWorld mesh. Sign layouts are recorded in `D2_TEXT_FITS` (`d2kit.ts: recordFit`): signs re-laid at 64 keep their fit.

**Budgets**
- Texture memory fits (≈ 33 MiB of 48); **paint time does not at today's cost** (§3) — decide zone painting or the lean cut
  before slice A starts painting big modules.
- Draw calls are comfortable (18–74 of 250) but each animated strip format is its own material: cap at **two strip formats for
  the stage** (8 frames @ 8 fps for loops, 2 frames @ 2 fps for blinkers) so a room adds at most two draws; the kitchen's
  additive pool mesh goes (−1). Hot spots today: pump hold 74 draws (classic glows, beacons, steam, tanks), hatchery → kitchen
  doorway 36.8 k triangles (two rooms in view). Cards add triangles only: the hatchery (5 incubators + 8 tanks) and kitchen
  (pans, clutter) should stay under ≈ 2 k added triangles each.
- Atlas splits change `D2PixelWorld.atlas` users: `d2CalmLevels`, `D2_DEBUG` (the dump test), `pw.dynamic`, the store records
  (one per atlas name — good: a painter's change repaints one zone group).
- Single-file build: painter code is in the script; the 64 KB growth gate (`scripts/single-size.json`) will trip on every
  slice — plan the `SINGLE_SIZE_UPDATE=1` acceptance once, at integration.

**Look risks**
- Light: ten accent point lights, the shoulder torch (intensity 26, 0.5 rad cone) and lightning act on everything; with
  ramp-step lighting the torch becomes a stepped disc in the middle of every frame — painted pools must sit under it without
  doubling (keep painted pools to +1 tone, lamps' own GLOW only on the lens).
- The hatchery and kitchen are meant to be bright rooms; bringing walls down two steps for the rings must not turn them into
  another dark room — keep the floor light, darken the walls' upper half and the ceiling.
- The lobby's far wall and every end wall are approached from 40 m to 0 m: paint them at their near density and check the
  far levels (mural, signs) at beat-start distance, not only at the door.
- Flora (lobby palms, atrium) is already cut-out art at screen density: do not let new ground decals or bollard pools climb
  above its contrast; lightning brightens the unlit sky tiles through `skyFlash` — new unlit cards behind glass must use the
  sky atlas to flash with them.
