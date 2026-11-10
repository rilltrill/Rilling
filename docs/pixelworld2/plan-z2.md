# z2 ST. MERCY HOSPITAL — PIXEL WORLD 2 repaint work-list (scout report)

Read-only scouting of the first-pass look (reference server :5791, ART: PIXEL WORLD, 3x art frames).
Nothing in the repository was changed. Everything below is for the painter who executes next.

- Frames: `/tmp/pw2/scout/z2/frames/<label>-pixel.png` (1872 x 864 = the 624 x 288 art frame x3).
  Labels `bNN` / `bNNa` / `bNNb` = beat NN (a = early instant, b = late instant of a move beat);
  `hudNN` = the same hold with `--noauto --hud` (enemies close in, rings on screen).
- Contact sheet: `/tmp/pw2/scout/z2/sheet.png` (one frame per beat, 5 x 6).
- Crop boxes below are in ART-FRAME pixels `[x0,y0,x1,y1]` of the 624 x 288 frame. To look at one:
  `/usr/bin/python3.12 /tmp/pw2/scout/z2/work/crop.py b21 0 0 240 288 5` (label, box, zoom).
  (`python3` on this box has a broken PIL; `python3.12` works.)
- Numbers used: eye height 1.62 m (`RailRig` walk), vertical FOV 58 deg, horizontal ~100 deg.
  px per texel = 8.1 / distance (m) at the first pass's 32 texels a metre. The floor under the
  rail is first seen at 3.1 m slant (bottom edge) and 4.1 m (bottom of the middle 80 %): 2.6 / 2.0 px
  a texel. A 4.6 m corridor's walls are seen from 2.8 m (frame edge): 2.9 px a texel.
- Atlas today (capture stats): `z2` 2048 x 688, 325 tiles, 913 779 texels, 7.5 MB with levels, paint
  277 ms in the browser; `z2-sky` 1024 x 416, 3 tiles, 1.7 MB, one level. Draw calls 25–109 (bay
  heaviest), triangles 3.4 k–16.7 k.

## 0. Verdict

Two thirds of this stage is axis-aligned box rooms walked through at arm's length, textured with
2–4 m wrap tiles at 32 texels a metre. In EVERY interior frame the nearest wall and the floor are
drawn with 2–3.7 px texels; the walls are two stacked wrap tiles with about one decal per 2.2 m; every
piece of furniture and both ambulances are re-textured Kit boxes. The basement uses a running-bond
block tile (`z2BlockTile`) that is, pixel for pixel, Minecraft's stone brick. The exterior is a navy
plane (half of the frame), a speckled brick box and a black slab. Only the storm sky, the neon and the
small sprite props look like pixel art. The repaint is not "more decals": it is (1) unique painted
wall panels and backdrops at the right density, (2) every box prop replaced by a profile or a cut-out,
(3) painted light, (4) story dressing and loops — with the gameplay lanes kept calm.

Three hue collisions with gameplay found on the way (fix while repainting):
- telegraph rings, the `!` marker and PATIENT ZERO's weak points are ORANGE: the atrium's glowing
  floor veins are the same orange and run through the ring area (hud29) — veins go crimson / magenta;
- spitter bile is saturated yellow-green: the operating theatre's walls are saturated green (hud23) —
  the theatre goes desaturated blue-green, two steps darker behind the gallery;
- hit-flash and blood FX are pure red: the drag-trail ribbon and the wall words ("RUN", "IT HUNGERS")
  are pure saturated red in the middle of the lane (b08, b21) — dried maroon, tone 1–3 only.

## 1. BEATS

30 beats (0–29), `stages/z2/index.ts`. `d` = rail distance at the captured instant. Loading at an
`action` beat reports the next beat (the action runs at once): `z2:2:60` shows the ambulance mid-swerve
under the label of beat 3; `z2:3:60` skips the crash (no wreck), beat 4 snaps it in place.
"Calm zone" = where enemies / civilians / telegraph rings / pickups are on screen (art px), from the
spawn tables projected through each hold camera (script `work/proj.py`) and checked on the `hud` frames.
The telegraph ring of a walker at arm's length is ~230 px across, centred low-middle
(hud04: x 165–395, y 90–288), with an orange `!` above it. HUD: score top-left, progress / boss bar
top-centre (y 0–50), pause top-right, hearts + bomb bottom-left, weapon panel bottom-right.

| # | kind: label | d (m) | scene | best shot spec | calm zone (enemies / civilians / rings) |
|---|---|---|---|---|---|
| 0 | banner | 0 | Foot of the drive (z 29), looking up at the whole hospital: wing left, canopy centre, fence + burning city right, storm sky | `z2:0:120:b00` | none (banner text centre) |
| 1 | move: up the drive | 3–28 | 28 m walk up the ambulance lane in the rain; cones, tipped gurney, IV stand, wheelchair pass close | `z2:1:300:b01b` (also `z2:1:90:b01a`) | 3 walkers on the apron: (2.6,-15) centre far, (-8.6,6) left near, (8.8,-1) right. Keep x 150–480, y 125–205 calm, and the lane to the bottom edge |
| 2 | action: ambulance crash | 28.5 | Ambulance swerves in from the right (30,-3) and ploughs into the front-left pillar | `z2:2:60:b02` | the wreck's path: right half then centre-left; nothing spawns |
| 3 | wait: crash | 28.5 | Under-canopy view, smoke | `z2:3:60:b03` (set without the wreck; use `z2:2:100` for the crash itself) | — |
| 4 | hold: ambulance bay | 28.5 | Camera (0,1.62,0.5) looks at the wreck (left) and the ER doors; parked ambulance right | `z2:4:120:b04`; hud `z2:4:330` | heads y ~134, feet y 163–195, x 200–490 (runners burst from the wreck's rear x 265–280; patient / riot / nurse under the canopy x 208–415; worker x 490; a runner from far right x > 600); shotgun crate x 470–510, y 130–210. The under-canopy back wall x 190–470, y 105–165 is right behind every head: darkest, calmest |
| 5 | move: into the ER | 32–45 | Past the wreck (2.5–4 m to its rear-left), under the canopy, to the broken sliding doors | `z2:5:90:b05a`, `z2:5:300:b05b` | a nurse (-7.6,-21.8) under the canopy, left |
| 6 | hold: ER reception | 59.5 | Camera (0,-30.6) looks SW-ish: reception desk left, triage bays at the back, waiting chairs + WARD 3 opening right | `z2:6:120:b06`; hud `z2:6:300` | CIVILIAN nurse grabbed at x 400–530, y 120–215 (right-centre; today blue chairs sit right behind her); vaulters over the desk x 100–210, y 125–195; walkers from the back x 280–400, y 128–170; ceiling drops x 300–430; health kit over the desk x 45–105, y 120–150 |
| 7 | move: to corridor A | 63–77 | Curve through the ER's east half, through the 4.6 m opening into corridor A | `z2:7:300:b07b` (the worst frame of the stage), `z2:7:90:b07a` | one patient shambling down the corridor centre (x 300–330, y 125–165) |
| 8 | hold: corridor A | 89.8 | Camera (20.5,-44) looks down 32 m of corridor; door 324 at left 4 m, door 329 right 9 m | `z2:8:120:b08`; hud `z2:8:420` | vanishing rectangle x 285–350, y 120–170 (walkers 15–30 m); door a24 burst far LEFT x 35–170, y 120–250 (riot, 5 m); door a29 right x 385–435, y 128–182; ceiling drops x 310–360, y 128–200; pickups x 255–300, y 105–135 |
| 9 | move: down the corridor | 93–100 | 10 m walk; wheelchair, crash cart, gurney pass at 1.5 m | `z2:9:90:b09a`, `z2:9:260:b09b` | doctor bursts from door a38 (left wall, 7 m ahead) and walks down the middle |
| 10 | action: corridor A clear | 100.3 | same camera as 11 | `z2:10:60:b10` | — |
| 11 | hold: corridor vent | 100.3 | Camera (31,-44) looks slightly down the corridor; gurney right | `z2:11:120:b11` | crawler lands x 320–350, y 110–190; runner from the right door x 350–365, y 112–150 |
| 12 | move: into the ward | 104–115 | Last 15 m of corridor A (door 338 left, laundry cart, bin), ward opening ahead | `z2:12:300:b12b`, `z2:12:90:b12a` | first patient at (59.8,-39.6): right, behind the first curtain |
| 13 | hold: ward | 123.3 | Camera (54,-44) looks down the aisle; curtained bays both sides; nurse station at the far end | `z2:13:120:b13`; hud `z2:13:360` | curtains ARE the spawn points: left x 40–110, right x 440–520, y 120–210; far end x 300–320, y 128–152; aisle centre to the bottom; pickups x 200–220 (bomb) / 355–375 (health), y 120–150 |
| 14 | move: to the nurse station | 127–140 | Down the aisle into the hub | `z2:14:300:b14b`, `z2:14:90:b14a` | runner from the hub's north door (right) |
| 15 | hold: nurse station | 142.8 | Camera (73.6,-44.1) looks at the U counter; fire doors left, north door right | `z2:15:120:b15` | SPITTERS behind the counter: heads x 300–395, y 135–180 against the back wall (today the multi-coloured medicine shelves are exactly there); S door left x 30–55, N door right x 520–600, y 135–210 |
| 16 | move: to the stairs | 146–155 | Through the red fire doors (1.75 m either side) onto the top landing | `z2:16:90:b16a`, `z2:16:240:b16b` | — |
| 17 | hold: stairwell | 156.8 | Camera at the top of the flight looks 22 deg down the stairs to the lower landing and the morgue door | `z2:17:120:b17` | walkers on the lower landing x 280–340, y 100–148; ceiling drops x 250–260 (left, 8 m) and x 410–430, y 85–190 (right, 5 m) |
| 18 | move: down to the morgue | 160–172 | Down the flight; the morgue's tiled entrance wall fills the frame | `z2:18:300:b18b`, `z2:18:90:b18a` | one patient coming up the stairs, centre |
| 19 | hold: morgue | 178.8 | Camera (79,-76.6) looks down the room: autopsy tables, cold-storage banks both walls, far door | `z2:19:120:b19`; hud `z2:19:330` | centre x 265–360, y 128–175 (bloaters, walkers); drawers that open: RIGHT bank x 465–565, y 128–195, LEFT bank x 55–75, y 128–190; far door x 295–310 |
| 20 | move: to the service corridor | 182–194 | Across the morgue to the far door | `z2:20:300:b20b`, `z2:20:90:b20a` | — |
| 21 | hold: service corridor | 197.5 | Camera (79,-95.4) looks down 13 m of basement corridor; LINEN door left, DANGER door right | `z2:21:120:b21` | crawler lands left-centre x 270–280, y 115–200; runner through the DANGER door x 365–415, y 115–170 |
| 22 | move: into surgery | 201–213 | Down the corridor into the operating theatre | `z2:22:300:b22b`, `z2:22:90:b22a` | — |
| 23 | hold: operating theatre | 213.8 | Camera (78.9,-111.6) looks SE: op table + lamp centre, gallery window upper right | `z2:23:120:b23`; hud `z2:23:330` | CIVILIAN doctor cowering x 100–155, y 140–215 (left); enemies x 240–390, y 142–205; SPITTERS in the gallery x 430–565, y 55–130 (upper right, behind the glass); table crawler x 386; oxygen tanks (destructible) x 55–70 and far right |
| 24 | move: towards the atrium | 218–231 | Out of the theatre's west door into corridor C | `z2:24:300:b24b`, `z2:24:90:b24a` | — |
| 25 | hold: brute | 232.3 | Camera (66.4,-121) looks west down corridor C; the boiler wall is on the RIGHT 5–8 m ahead; atrium glow at the end | `z2:25:120:b25` (wall intact; `z2:25:260` after the burst); hud `z2:25:420` | breach x 360–405, y 112–178 (brute is bigger: x 340–430, y 95–185); crawler x 195–205, y 110–212; far walkers x 245–285, y 115–152; gas cylinders (destructible) x 220–235 and x 303–320, y 125–165 |
| 26 | move: into the atrium | 236–246 | Last metres of corridor C, then the atrium opens | `z2:26:240:b26b`, `z2:26:90:b26a` | — |
| 27 | action: it wakes | 251.6 | Boss camera, cocoon | `z2:27:60:b27` | — |
| 28 | wait: the cocoon splits | 251.6 | Boss camera (47,-121) looks west at the pool (35,-121), 12 m | `z2:28:60:b28` | — |
| 29 | boss: PATIENT ZERO | 251.6 | 60–80 s on this one frame: boss in the pool, three balcony levels, skylight | `z2:29:240:b29`; hud `z2:29:900` | boss body x 225–400, y 50–200 (weak points = glowing yellow-orange eyes); balcony walkers land at x 205 and x 419, y 158–180 and walk in to bottom-centre; pickups x 140–170 / 460–490, y 150–260; boss bar y 20–50, x 175–450 |

## 2. OFFENDERS (ranked by how loudly each says "Minecraft / Roblox")

Shared treatments referred to below (bible section 4):

- **PANEL** — a wall is a sequence of unique painted modules 6–8 m long, full wall height, laid by a
  hand-written layout table per wall (which panel at which x, flipped or not). Implementation: for the
  shell pieces the converter classifies as `wallHi` / `wallLo` / `block` (`pixel.ts emitAll`, `pieceKind`),
  stop emitting world-planar wrap triangles; intersect each piece's face rectangle with the layout's
  spans and emit `b.rect(origin, ux, Y, w, h, panel, { sub: {x, y, w, h}, flipU })` per span. Door and
  window openings need nothing (pieces only exist where the wall is solid). The bumper rail / skirting
  boxes sample the same panel rows (continuous paint, a little relief at grazing angles). Text never
  goes in a panel that may be flipped: it is a separate overlay module.
  Paint every panel in the passes of bible 4.1 and check it at level 3 first (a corridor panel is
  seen from 2.2 m to 40 m): block in at 12 texels a metre, then refine.
- **PROFILE** — the painted side elevation as a cut-out on two parallel quads, plus a strip of quads
  following the outline across the width (roof, bonnet, mattress top), each segment mapped from a
  strip tile. Replaces a stack of boxes for vehicles and furniture. Gameplay proxies (invisible
  occluder boxes) are separate meshes and stay.
- **CARD** — cut-out card fixed in the world (against a wall, or two crossed / an L for free-standing
  things). **BILL** — camera-facing billboard (`Z2Billboards`): only for small roundish props that
  nothing spawns behind.
- **POOL** — painted light: the source is `GLOW`, its pool is painted into the tile as +1 / +2 tone
  steps in 2–3 rings with a shaped dither edge (bible 2.4, 5). Moving light stays the pipeline's job.
- **ANIM** — 4-frame vertical strips at 7 fps on the zone's existing anim batch (`Job.anim`, the puddle
  material `{frames: 4, fps: 7}`): no new material, at most +1 draw call per zone that uses it.

| # | What | Where (beat, file, crop) | Anti-pattern | Built / painted by | Treatment | Effort |
|---|---|---|---|---|---|---|
| 1 | **Stone-brick basement**: stairwell walls, service corridor B, corridor C, the boiler wall | b17 `[0,0,200,200]` + `[430,0,624,200]`; b16b whole frame; b21 `[0,0,240,288]`; b20b `[100,15,280,280]`; b24b; b25 | The Minecraft stone-brick block, literally: 16 x 8-texel blocks in running bond, 128 x 48 tile repeated over 13–24 m of both walls; texels 2.7–3.7 px in the corridors (walls at 2.2–3 m), 2 px in the stair (4 m); per-texel "pore" speckle (`hash2 > 0.965`); near-black mud in the stair (b17: 60 % of the frame); a green block band below = "mossy stone brick" | `stages/z2/zonesLower.ts buildStair / buildCorrB / buildCorrC` with `zonekit.ts styles.concrete()` through `shell.ts wall`; picked in `stages/z2/pixel.ts pickFor` case `'brick\|1.25\|0.5'`; painted by `pixelworld/z2surfaces.ts z2BlockTile`; decals by `pixel.ts scatter / wallDecal` (block branch) | Kill the block field. These are painted service walls: fair-faced blockwork under two coats of gloss — bottle-green dado to 1.2 m with a hand-painted cream line, grey-violet above. Block courses only ghost through as a one-step line every 20 cm and show as real blocks only inside 3–4 peeled patches per panel (flake edge: lit lower lip, shadowed upper lip). **PANEL**, corridors B + C: 2 unique panels 6 m x 3.4 m at 96 (576 x 326) — `service A`: movement joint, a conduit drop to a junction box, an electrical cabinet with a hazard label, lagged-pipe brackets with rust weeps, damp tide-mark rising 40 cm (dithered band), a chalked tally and "B1 CLEARED" crossed out; `service B`: hose-reel cabinet, laundry-chute hatch, a fire-alarm bell, a clip-frame notice, a long trolley gouge at 0.9 m, a hand-drag of dried blood. Overlays (not flipped): stencilled wayfinding band "MORGUE  SURGERY  BOILER" with arrows at 1.5 m. Stairwell: 2 panels 8 m x 4.5 m at 64 (512 x 288): `stair U` (upper storey: level number, a caged bulkhead with its painted pool, an evacuation-chair bracket, conduit) and `stair L` (basement storey: red beacon pool, hand-drags following the handrail, water staining from the landing slab). AO step at ceiling and floor, cast shadow under every pipe and box (pass f). Boiler wall: same paint continued over the 12 breakable blocks (painted in place, `paintWall`) at 96 (307 x 259), "KEEP OUT" boards kept | L |
| 2 | **Corridor A walls** (and the same clinic style in the ER and the hub): empty plaster over giant wainscot tiles | b07b `[0,150,170,288]` and whole frame; b08 `[370,60,624,288]`; b09a `[0,0,250,288]`; b11 | Texels 2.6–3.7 px; upper wall = one 128 x 96 two-tone tile with at most 1 decal per 2.2 m (flat empty plane, 55 % of the frame); wainscot = 25 cm flat tiles on a 4 m repeat with a contrast grout grid (visible tile grid); smooth light gradients; the warm flicker turns the whole corridor custard yellow (b10 vs b11: off-palette) | `zonesUpper.ts buildCorrA / buildER / buildHub`, `styles.clinic()`; `pixel.ts pickFor` `'stucco\|1\|0.65'`, `'tiles\|1.2\|0.62'`, `scatter`, `bandDecals`, `brokenTiles`, `wallDecal`; `z2surfaces.ts z2PaintTile`, `z2GlazedTile`, `z2RailTile`, `z2SkirtingTile` | **PANEL**, 3 unique panels 6 m x 3.2 m at 96 (576 x 307), each a picture of a hospital corridor wall: 10 cm glazed wainscot tiles (10 texels: glaze highlight top-left, shadow bottom-right, chipped / missing ones showing adhesive ridges), timber bumper rail with brass caps and gouges, cove skirting with mop grime, TWO wayfinding stripes at dado height (blue = wards, red = ER) running the whole length, cable trunking under the ceiling, a shadow band at the ceiling line. `clinic A`: notice board (shift rota, layered missing-person flyers, a child's drawing), recessed extinguisher cabinet with broken glass, call point. `clinic B`: hand-gel dispenser, glove boxes + sharps bin, oxygen outlet plate, light switches, a ceiling-to-rail crack with a water stain, a wall phone off the hook. `clinic C` (quiet panel for the spans that hold a door): room-number plate, clipboard holder, a bloody hand-drag sliding down to the skirting, quarantine tape stuck across. Door architraves as overlay modules. Dried maroon instead of the red wall words. Mid-wall brightest tone 4. Layout table for both walls of corridor A (7 spans each), reuse A/B/C at 64 minified in the ER and hub side walls | L |
| 3 | **VCT chequer floor** (ER, corridor A, hub) | b06 `[150,180,624,288]`; b07a `[0,170,624,288]`; b08 `[200,170,470,288]`; b15 `[0,190,624,288]` | Chessboard of 50 cm tiles with fleck speckle; texels 2–2.6 px across the whole lower third of every upper-floor frame; smooth spot gradient | `pixel.ts pickFor` `'checker\|0.55\|0.34'` → `z2surfaces.ts z2VinylTile` (128 x 128); floor boxes from `shell.ts buildShell` | New floor design, not a denser chessboard: sheet-vinyl field with a 2-tile chequer border along the walls and across thresholds only; a worn pale traffic path down the middle; gurney-wheel arcs; the cove edge. Corridor tile 384 x 384 at 96 (4 m wrap), rooms 256 x 256 at 64; `pickFor` must know the zone (`job.parent.name`) to choose. Break the repeat every 3–4 m with unique floor decals at 96: boot prints leaving the blood trail, a dropped stethoscope, a wet-floor A-board's puddle, spilled pill tray, a burst file box. Troffer pools become painted stepped pools (keep the additive pool mesh only if the foundation keeps it) | M |
| 4 | **Both ambulances are white boxes** | b04 `[165,100,320,190]`; b05a `[55,75,280,215]`; b05b `[505,60,624,220]`; b02 `[370,95,624,215]` | Textured box: two boxes + n-gon wheels, one flat module per face (128 x 74 side); knife-edge silhouette; 2–3.2 px texels as the camera walks past the wreck at 2.5–4 m; lettering mangled by the mips ("TNIA MCIA") | model `stages/z2/props.ts ambulance()`; `pixel.ts paintAmbulance`, `layAmbulanceBody`, `layAmbulanceDoor`, `handle` case `'ambulance'`; painters `pixelworld/z2vehicles.ts ambulanceSide / Front / CabSide / Door` (its header says "keep their boxes") | **PROFILE** of a 2000s box ambulance on a van chassis, side elevation 6.2 m x 2.9 m at 96 (595 x 278): sloped windscreen and bonnet, cab roof fairing, box with radiused top corners, wheel arches CUT OUT, running board, bumpers, mirrors and aerial as silhouette cards, light bar on the fairing (the red / blue glow meshes stay where they are: y 2.6, z 0.95). Painted: panel seams with rivets and a lit edge, the stripe, lockers with latches, star of life, grime fans behind the arches, rain streaks, bloody hand smears. Wheels: painted discs (81 x 81 cut-out, hub, tread strip). Rear 2.3 x 2.6 m at 96 (221 x 250) with the two door leaves (dynamic hinge groups keep their frames; leaf 106 x 211) and a painted interior (stretcher rails, cabinets, spilt drip bags, blood) seen when the doors are open (134 x 128 at 64). Crashed one: crumpled-bonnet variant of the nose strip, a broken headlamp, steam (**ANIM**) at the flame anchors (local 0, 1.5, 2.6). "AMBULANCE" as its own sign tile on the 4-texel grid (`z2BigSign` style) so levels keep it. Classic boxes dropped in PIXEL WORLD only | L |
| 5 | **Atrium marble chessboard** | b28 `[0,185,300,288]`; b29 `[0,200,624,288]`; b26b `[0,160,624,288]` | 1 m slabs in a two-stone checker with blotch "marbling", texels 2–2.6 px in the bottom third of the boss frame for 60–80 s; ordered-dither screen-door visible in the pool's glow; veins and pustules in telegraph orange | `zonesLower.ts buildAtrium` (floor `T(C.marble, TX.marble)`, `vein` / `veinNode` tags); `pixel.ts pickFor` `'checker\|0.32\|0.36'` → `z2surfaces.ts z2MarbleTile`; `handle` cases `'vein'`, `'veinNode'`; `z2atrium.ts veinTile`, `pustuleDecal`; pool glow `atriumDressing` | Lobby floor as one design centred on the fountain: honed dark stone field with a compass / caduceus inlay ring 14 m across around the pool (unique painting, quadrant 224 x 224 at 32 mirrored x4), brass strip joints, the near camera strip (x 40–52) from a 256 x 256 wrap at 64 with polish reflections of the skylight as stepped streaks. Veins repainted as fleshy roots that LIFT and crack the slabs (lit rim of broken stone, dark gap, wet highlight), crimson / magenta glow, 64 x 256 ribbons at 64, two variants, plus a root-ball junction 96 x 96; pustules pulse (**ANIM** 48 x 48). Pool glow as a painted stepped pool, no dither veil | L |
| 6 | **The cocoon is a brick-textured low-poly rock** | b28 `[255,70,375,185]`; b26b `[270,105,345,175]` | Six jittered icosahedra carrying `z2FleshTile`, whose dark-creased lobes read as a brick grid on facets: textured low-poly lump, centre of the frame during the reveal | `zonesLower.ts buildCocoon` (dynamic, heartbeat scale, hidden by `boss.ts` at the split); `pixel.ts convertInto` → `emitAll` → `pickFor` `'hide\|…'` → `z2surfaces.ts z2FleshTile` | **CARD**: one cut-out painting 5 m x 4.6 m at 64 (320 x 294) facing the boss camera (east), plus a second card at 70 deg for the approach from corridor C: a translucent-skinned sac hung from flesh ropes, a curled figure and a hand pressed against the membrane (backlit silhouette), veins as painted relief, wet highlights, drips into the pool; glow nodes `GLOW`. Heartbeat scale and `visible` stay on the same group (`sc.cocoon`). Pool surface under it: unique 336 x 336 painting at 32 (membranes, the fountain's broken tier, bones) instead of a 64 x 64 wrap | M |
| 7 | **Furniture is boxes**: gurneys (8), beds (10), reception + nurse counters, autopsy tables (4), op table, chair rows, vending machines, shelves, filing cabinets, benches, info desk | gurney b09b `[385,165,525,285]`, b11, b22a `[180,165,260,260]`, b04 `[0,195,100,288]`; bed b13 `[0,165,110,215]`; counters b06 `[0,150,200,220]`, b15 `[230,145,480,195]`, b16a `[440,160,624,260]`; autopsy b19 `[0,160,130,250]` + `[480,160,624,240]`; op table b23 `[310,165,370,200]`; chairs b07a `[470,170,580,245]` | Textured boxes with knife edges; flat enamel / steel / linen faces from 64 x 64 NEUTRAL tiles; 4 px texels when a gurney passes at 2 m; the nurse counter's side is a flat dark slab (b16a) | models `stages/z2/props.ts gurney / bed / counter / autopsyTable / opTable / chairRow / vending / bedside`; `pixel.ts handle` cases `'gurney'`, `'bed'`, `'counter'`, `'autopsy'`, `'opTable'`, `'chairs'`, `'vending'`, `'shelf'`, `'anesthesia'` + generic `emitAll`; painters `pixelworld/z2furniture.ts`, `z2modules.ts`, NEUTRAL `z2Steel / z2Enamel / z2Linen / z2Veneer / z2PlainTile` | **PROFILE** for everything long: gurney side elevation 2.0 x 1.1 m (X-frame, castors, rail, mattress edge, drip hook) at 128 for the corridor ones (256 x 141), top from the existing sheet / body mounds (keep the mounds: they already are form); bed side 2.1 x 1.25 m at 64 (rails, crank, chart clipboard, urine bag, straps); autopsy table (dished top, pedestal, hose, head block); op table (segmented pads, arm boards, straps). Counters: a front ELEVATION painting, not panels — reception 5.2 x 1.2 m at 64 (333 x 77): laminate fascia with the hospital crest, kick plate, a cracked glass hatch, leaflet rack, queue-ticket dispenser, "NOW SERVING" display; silhouette cards on the top (monitor, bell, file carousel) all below 1.45 m and away from the spitters' spots. Chair rows: a front-elevation card + seat tops; coats, a teddy, a slumped arm. Vending: front already a module — repaint at 64 with smashed glass and spilt cans on the floor, add cut-out top edge. Filing / shelves: boxes are allowed (they are boxes) but with painted edge wear and things on top (bible 4.5) | L |
| 8 | **The bay's ground is a navy plane** | b00 `[0,150,624,288]`; b01a `[0,160,624,288]`; b03 `[0,190,624,288]`; texel crop b04 `[0,180,200,288]` | 45–55 % of every exterior frame: flat two-tone asphalt with 1500 speckle clusters per tile (speckle as texture), 2–2.6 px texels in the lower third, smooth flashlight gradient, three dark RECTANGLES (cut-patch decals) and straight lane paint | `zonesUpper.ts buildBay` (80 x 61 m box, lane boxes, puddle discs); `pixel.ts bayGround`, `puddle`, `bayLights`; `pixelworld/z2bay.ts z2WetAsphaltTile` (256 x 256), `z2PatchDecal`, `z2OilDecal`, `z2SkidTile`, `z2RoadStencil`, `z2ReflectDecal`, `z2PuddleTile` | Paint a wet hospital forecourt, not asphalt texture. Lane tile 512 x 512 at 64 (8 m): aggregate drawn as shaped stones only in the lit bands, long horizontal wet-sheen dashes (shaped dither), tar joints, a drainage fall toward two gullies; far apron tile 256 x 256 at 32, calmer. Unique paintings at 64 on top: the hatched AMBULANCES ONLY box in front of the doors (8 x 3.6 m, 512 x 230: worn chevrons, tyre scuffs, an oil drip line where ambulances idle), two long skids ending at the wreck (96 x 512), a fan of windscreen glass, a burst medical bag and drip bags, wet leaves and litter drifted along the kerb (256 x 32), bloody footprints from the wreck to the doors, the neon's reflection as broken vertical streaks (keep `z2ReflectDecal`, repaint at 64). Sidewalk + kerb slab at 64 (256 x 230 + 256 x 24). REMOVE the rectangle patches and the random puddle discs' flat rims; keep the animated puddles, redraw at 96 x 64 a frame with lumpy outlines | L |
| 9 | **Atrium architecture is grey slabs** (balconies, fascias, columns, flat walls) | b29 `[0,0,624,150]`; b28 whole upper half; b26b | Box slabs and box columns with straight silhouettes; walls at 12–25 m carry a 4 m wallpaper wrap minified to mush (0.3–0.7 px a texel); mud colour; the busiest lit things (elevators, clock, lit windows) sit right behind the boss | `zonesLower.ts buildAtrium`; `pixel.ts atriumDressing`, `handle` cases `'glassRail'`, `'doorway'`, `'officeWin'`, `'skylight'`, `'drip'`, `'membrane'`; `pickFor` `'wallpaper\|1\|0.4'`, `'concrete\|1\|0.8'`; `pixelworld/z2atrium.ts` | Treat the boss frame as a Street Fighter III stage painting. Back wall (x = 22, 30 x 18 m, 25 m away): ONE backdrop painting at 16 texels a metre (480 x 288; 0.65 px a texel) — three storeys of arcade bays, the dead elevator bank, a "ST. MERCY — CARING SINCE 1954" mosaic of a nurse with a lamp overgrown by flesh roots, donor plaques; the centre bay behind the boss (z -126…-116, all three storeys) in the two darkest architecture tones, lit windows and the clock moved out to the flanks. Side walls: one 30 x 18 m painting at 16 (480 x 288) mirrored, with the café as an overlay. Balcony fronts: bay module 2.5 x 1.55 m at 32 (fascia with a lit top edge, glass with reflections, handrail, hanging plants gone brown, a draped bedsheet, a slumped body), 5 variants. Balcony soffits: coffered, with dead downlights (128 x 128). Columns: fluted stone with a base and a capital module, roots climbing the lower 6 m (96 x 256). Silhouettes against the skylight: a suspended art mobile of doves (cut-out, sways), banners (repaint), root curtains hanging from the top balcony | L |
| 10 | **Glazed-tile rooms** (morgue white, theatre green) | b18b `[125,10,500,210]`; b20a `[0,40,180,200]`; b20b `[0,0,100,288]`; b22b `[190,75,460,170]`; b23 `[0,60,330,180]` | Blank 50 x 37 cm tiles (16 x 12 texels) at 1.6–2.7 px a texel; a smooth flashlight disc on the entrance wall (b18b); the theatre's far wall collapses into VERTICAL STRIPES (the calm levels keep the grout columns and lose the rows) | `zonesLower.ts buildMorgue / buildOR`, `styles.morgue()` / `styles.or()`; `pixel.ts pickFor` `'tiles\|1.2\|0.62'` with the `GLAZED` table (`0x587478`, `0x9fb2b4`, `0x2a6a56`, `0x3a7462`); `z2surfaces.ts z2GlazedTile`; levels `d2CalmLevels` | 15 cm tiles at 64 (10 texels) on a 4 m x room-height wrap (256 x 269 morgue, 256 x 320 theatre) with real variation painted in: a darker dado course, a row of bullnose tiles, replaced tiles of another batch, rust weeps under fixings, limescale runs, condensation at the foot. Far levels designed by hand (grid gone by level 2, value structure kept). Entrance walls the rail walks through as **PANEL** modules at 64: morgue door surround 8 x 4.2 m (512 x 269: steel architrave, "MORTUARY — AUTHORISED STAFF" plate, card reader, gurney bump plates, a blood wipe to the door), theatre exit surround 6 x 5 m (384 x 320: scrub-up notice, switch panel with pilot lamps). Theatre recoloured desaturated blue-green (bile must pop) | M |
| 11 | **Brick facade and wing** | b00 `[0,0,215,180]`; b01b `[0,0,200,170]`; near view b05b `[190,55,300,160]` | At distance the brick minifies into a red-brown field with isolated dark dots (speckle noise); near the doors each brick is a 2-texel blob; the wing is a bare 16 x 12 x 38 m box with windows pasted on and NO ground floor; identical window modules in a grid | `zonesUpper.ts buildBay`; `pixel.ts pickFor` `'brick\|0.8\|0.85'` → `pixelworld/surfaces.ts brickTile` (NEUTRAL), `roofline`, `facadeDetail`, `handle` cases `'win'`, `'wingWin'`, `'cross'`; `z2modules.ts hospitalWindow` (56 x 68), `roofUnit`, `copingTile` | Facade as bays, not brick + stickers: one bay module 3.2 x 3.3 m at 32 (104 x 106) = window with stone lintel and sill, its brick surround with soot above and a drip stain below; 10 variants (lit with a figure, blinds askew, boarded, broken with a curtain blowing out (**ANIM**), an AC unit with a rust run, a TV flicker (**ANIM**), a bedsheet "HELP US" hanging out). Brick field 256 x 192 at 32 in a maroon-violet night ramp with designed far levels (courses → flat tone + large stains, never dots). Ground floor under the canopy at 64: door bay 6.4 x 4.6 m (410 x 294) and a window bay 6.8 x 4.6 m (435 x 294) — stone plinth with vent grilles, taped notices inside the glass ("TRIAGE FULL"), handprints, wall lamps with painted pools on the brick, intercom, CCTV dome, a row of chained wheelchairs. Wing ground floor (new): loading dock shutters, a liquid-oxygen tank in a chain-link cage, the outpatients door with an awning, dumpsters. Roofline: helipad edge lights and a windsock, water tank, aerials, a blinking beacon (**ANIM**) | L |
| 12 | **Ward curtains read as plank fences** | b13 `[80,85,280,205]` (zoom: `crop.py b13 60 40 330 220 5`); b14a `[0,60,250,210]` | Stacks of folded boxes with a diamond print, dead-straight top and hem, tan / orange / salmon: they look like wooden crates. They are also the SPAWN surfaces of this hold | `zonesUpper.ts curtainPanel` (static sides) and the 4 dynamic front curtains in `buildWard` (`bakeInto` holders that slide and scale); `pixel.ts pickFor` `'wallpaper\|0.7\|0.55'` → `z2surfaces.ts z2CurtainTile` (64 x 64 NEUTRAL) | Cloth cards: one painted curtain 4.0 x 2.2 m at 64 (256 x 141, NEUTRAL, tinted) with a mesh top band, hook gliders, deep S-folds shaded as form (ramp steps, not stripes), a scalloped hem cut out, a bloody hand smear, and on the closed fronts a dark figure silhouette as if back-lit from the bed. Side partitions 0.9–3.9 m from the same painting (`sub`). Colours: hospital blue-grey and sea-green, pale print, tones 2–4 only. The dynamic holders keep their transform (a flat card scales exactly like the boxes) | M |
| 13 | **Canopy is a black slab** | b03 `[55,45,570,110]`; b04 top; b05a `[0,30,624,100]` | Straight box with a flat enamel fascia and a flat concrete soffit; the police light paints smooth red / blue blobs on the soffit | `zonesUpper.ts buildBay` (slab box, fascia box, `panel` downlights); `pixel.ts pickFor` (`'corrugated\|1.2\|0.5'` → enamel, `'concrete\|1\|0.8'`), `z2BigSign` for EMERGENCY | Fascia painting 20.2 x 0.9 m at 64 (1293 x 58): aluminium cassette panels with joints, a gutter lip, drip streaks, bird mess, the neon's tube clips and transformer box, red spill painted on the panels. Soffit 256 x 256 at 64: ribbed metal planks, recessed downlights (6 modules 48 x 48 with painted cones), sprinkler pipe, a water stain. Silhouette pieces: a "CLEARANCE 3.2 m" bar on chains (cut-out), the gutter's rain curtain along the front edge (**ANIM**, 64 x 96 cards). Pillars 160 x 294 at 64 with a painted hazard collar and scrape marks at bumper height (the crashed pillar: cracked, rebar) | M |
| 14 | **Ceilings**: dark flat planes with a fat grid | b06 `[0,0,624,95]`; b08 `[150,0,500,60]`; b13 `[0,0,624,110]`; b19 `[0,0,624,90]` | 1 m lay-in tiles = 32-texel squares, 2 px texels at 3.3 m, nothing on them but a few stains; smooth light blobs round every lit panel | `shell.ts buildShell` ceiling box; `pixel.ts pickFor` `'tiles\|0.5\|0.8'` → `z2surfaces.ts z2CeilingTile` (128 x 128 NEUTRAL); `z2modules.ts troffer` (22 x 40); `z2decals.ts ceilingHoleDecal`, `ceilingStainDecal`; `z2objects.ts z2DangleCard` | 60 cm T-bar grid at 64 (256 x 256, 4 m wrap): tiles sagging, water-ringed, two missing with joists and flex duct visible; troffers 44 x 80 with tube shadows and a painted halo on the neighbouring tiles; sprinkler heads, smoke detectors with a red LED (**ANIM**), a square air diffuser, a CCTV dome. Silhouette pieces hanging INTO the room: blue wayfinding boards on chains ("X-RAY", "WARDS") as cut-outs, cable loops, the existing dangling panel. Basement: bare slab soffit with the pipes as painted profiles (lagging bands, flanges, valve wheels) and a cable tray with drooping cables (cut-out) | M |
| 15 | **Doors**: fire doors, corridor doors, closed doors | fire doors b16a `[105,45,165,265]` + `[285,80,320,220]`; b12a `[110,80,180,235]`; b21 `[160,85,205,265]` | Flat slabs with 3–5 px texels (the fire doors pass at 1.75 m, corridor doors at 2.3 m) | `zonesUpper.ts buildHub` (`fireDoor` tag); door slots → `setpieces.ts spawnDoor` → `pixel.ts paintDoor`; `z2objects.ts z2FireDoorLeaf` (54 x 88), `z2modules.ts doorLeaf` (42 x 70) | Same slabs (the breakable doors ARE hit boxes), repainted: fire-door leaf 1.7 x 2.75 m at 128 (218 x 352): rebated panels, wired-glass vision panel with a cracked corner, push plate, kick plate with trolley dents, closer arm, "FIRE DOOR KEEP SHUT" plate, bloody palm slide. Room door leaf at 96 (125 x 211), 3 colours: veneer with a lacquer sheen, vision slot, lever handle, number plate, quarantine tape. Painted architraves as overlay modules | S |
| 16 | **Sprite props up close** (wheelchair, bin, IV stand, crash cart, laundry cart) | b09a `[445,205,510,288]`; b21 `[455,210,535,288]`; b12b `[420,195,510,288]`; b08 `[65,95,115,280]` | Well-drawn sprites at 32 texels a metre: 4–7 px texels when they pass at 1.2–2 m | `pixel.ts handle` (billboard cases) → `pixelworld/z2props.ts *Sprite`, `z2billboard.ts` | Repaint the five corridor props natively at 128 (wheelchair 96 x 122 + tipped variant, IV 51 x 256, bin 52 x 84, crash cart 90 x 135, laundry cart 115 x 128), the rest at 64. Same design language, more parts: spokes, brake levers, drip chamber and tube, drawer labels | S |
| 17 | **Terrazzo theatre floor** | b23 `[0,200,624,288]`; b22b `[0,175,624,288]`; b24a | Confetti: chips are random 2–3 texel specks at 2 px a texel (speckle as texture), 2 m divider strips as fat dark lines | `pixel.ts pickFor` `'asphalt\|1.6\|0.6'` → `z2surfaces.ts z2TerrazzoTile`; `z2bay.ts z2SterileField` | Seamless anti-static sheet floor at 64 (256 x 256): welded seams, a conductive-grid ghost, coved edge, wheel tracks converging on the table; the sterile field tape repainted at 64 (192 x 256) with the blood pool, swabs, dropped clamps and a drip from the table edge (**ANIM**); bloody footprints to the exit | S |
| 18 | **Morgue quarry floor** | b19 `[0,210,624,288]`; b20a `[0,200,624,288]` | 64 x 64 tile = a 2 m repeat of 50 cm tiles with a dark grid, fat texels | `pickFor` `'tiles\|0.5\|0.85'` → `z2surfaces.ts z2FloorTileTile` | 256 x 256 at 64: 15 cm quarry tiles laid to falls, a stainless drain channel across the room (256 x 26 module), wash-down trails converging on the drain (decals), wet sheen dashes, boot prints | S |
| 19 | **Ward sheet floor** | b13 `[0,150,624,288]`; b14a | One flat grey-green plane with a smooth gradient and a few specks (flat empty plane) | `pickFor` `'checker\|0.55\|0.34'` (other hex) → `z2surfaces.ts z2SheetVinylTile` | 256 x 256 at 64 with bed-wheel scars arcing out of every bay, welded seams, a polished path down the aisle; unique decals: slippers, a dinner tray, a fallen drip bag's puddle, get-well cards | S |
| 20 | **Concrete floors and black "puddles"** | b17 `[0,215,624,288]`; b21 `[130,200,470,288]`; b24b `[240,190,400,288]` | Flat grey with blotch clusters and ruler-straight joints; indoor puddles are black blobs that read as holes | `pickFor` `'concrete\|1\|0.8'` → `z2surfaces.ts z2ConcreteTile`; `handle` case `'puddle'` (indoor) → `z2decals.ts puddleDecal` | Painted floor at 96 for corridors B / C (384 x 384): grey floor paint worn through to concrete along the wheel line, yellow walkway edge lines, a hatched KEEP CLEAR box at each door, oil drips under the pipes. Puddles mirror the troffer above (pale stepped streak, drip rings **ANIM**), mid tones, never black | S |
| 21 | **Cold-storage banks** | b19 `[0,95,115,180]` + `[470,100,624,180]`; b20a `[0,95,45,180]` | A grid of identical 22 x 20 drawer faces on a box cabinet | `props.ts morgueWall`; `pixel.ts handle` case `'morgueWall'`; `z2modules.ts drawerFace` (3 variants); dynamic drawers in `zonesLower.ts buildMorgue` | A 2-column x 3-row bank module 1.56 x 2.5 m at 64 (100 x 160), 4 variants: brushed steel doors with heavy latch handles and hinges, handwritten tags, frost at the seals, condensation runs, dents pushed out from INSIDE, one door ajar with a toe-tagged foot. Plinth, top vent grille and a small temperature display above the bank (red LED, **ANIM**, small and high: drawers are spawn points). The 5 dynamic doors and trays repainted to match (same slabs) | M |
| 22 | **Blood ribbon and gore decals** | b08 `[315,170,360,288]`; b21 `[270,150,320,288]`; b09a `[300,170,330,288]`; wall hands b08 `[510,15,575,110]` | A 32 x 96 tile stretched 0.8 m wide: 3–5 px blocks of pure saturated red down the middle of the lane | `pixel.ts handle` cases `'trail'`, `'smear'`, `'pool'`, `'wallSmear'`; `z2decals.ts dragTrailTile`, `bloodPoolDecal`, `handprintDecal`, `bloodWipeDecal`, `bloodWordsDecal` | Drag trail at 96 (77 x 384, two variants): a body-wide smear with parallel finger tracks, heel gouges, drying brown edges, a wet dark core, boot prints leaving it. Pools at 64 with a skin, a reflection streak and satellite drops. All blood in a maroon ramp, tones 1–3, one small tone-4 glint | S |
| 23 | **Plate signs and posters with fat texels** | b16a `[0,95,95,125]`; b07b `[205,0,420,15]`; b24b `[0,5,80,60]`; b09b `[485,40,525,115]` | 3–5 px texels when passed | `pixel.ts handle` cases `'plate'`, `'lit'`; `z2signs.ts z2PlateSign`, `z2Poster` | Posters and plates the rail passes within 3 m repainted at 96 (designed: border, logo, wear, tape); the rest stay on the 2x fallback | S |
| 24 | **Smooth 3D light on flat planes** | b18b `[130,20,500,200]` (flashlight disc); b05a `[330,45,624,100]` (blue blob); b12b `[290,20,430,70]` (red); b13 floor | Smooth radial gradients, off-palette yellow / red washes | lights in `stages/z2/env.ts` (flashlight, `accent`, `flick`), pool meshes `z2bay.ts z2PoolMesh` | Pipeline (ramp-step lighting, bible 5). Painter's share: paint the FIXED pools (bulkheads, sconces, troffer halos, neon spill, furnace glow) into the tiles (**POOL**), paint everything else evenly lit, put `GLOW` on sources only | S |
| 25 | **Moon shafts are glass slabs** | b28 `[235,0,275,120]` + `[430,0,470,130]` | Flat translucent blue rectangles | `zonesLower.ts buildShafts`; `pixel.ts paintShafts` (`d1ShaftMaterial`) | Tapered ray cards with a stepped, dithered edge and dust motes (**ANIM** sparkle), one of them carrying a rain column from a broken pane; cold pool on the floor painted | S |
| 26 | **Stair treads** | b17 `[30,170,600,215]` | A grey ramp of identical strips, 64 x 16 tile | `handle` case `'step'` → `z2surfaces.ts z2TreadTile` | 192 x 32 at 96: terrazzo tread with a black ribbed nosing, a worn dip in the middle third, blood dripping step to step; riser strip with scuffs | S |
| 27 | **Pillars, bollards, lamp posts** | b03 `[125,75,150,170]`; b05b `[53,165,70,210]` | Straight cylinders, fat stripes on the collars | `pixel.ts emitCylinder`, `cylKind`; `z2objects.ts z2CylTile` | Pillar tile at 64 (see 13); bollards 32 x 58 at 64 with chipped paint and a reflective band; street lamps as cut-out swan-neck CARDS with a painted halo and a rain cone (**ANIM**) | S |
| 28 | **Flat floor decals** (papers, trays) | b09b `[220,225,255,245]`; b13 `[300,235,360,260]` | White rectangles with 3 px texels | `handle` case `'paper'`; `z2decals.ts papersDecal`, `trayDecal` | Repaint at 64 (80 x 64 x 3): forms, charts with a readable header line, an X-ray film, a trodden one with a boot print; never pure white (tone 4 max) | S |
| 29 | **Parked cars, fence** | b01b `[590,130,624,175]`; b00 `[410,140,624,180]` | Boxes with a side module (far: 22 m) | `props.ts car`; `handle` cases `'car'`, `'fence'`; `z2vehicles.ts carSide`; `pixelworld/props.ts chainFenceTile` | Side-profile CARDS at 32 (138 x 48, 3 colours) with open doors; fence 256 x 64 with a razor-wire coil and a quarantine banner | S |
| 30 | **Pendant lamps, surgical lamp** | b28 `[190,95,215,105]`; b23 `[300,90,370,105]` | Faceted cones / discs | `zonesLower.ts buildAtrium` pendants, `props.ts surgicalLamp` (re-textured only) | Cut-out cards on the same swinging groups; surgical lamp heads as painted discs with a `GLOW` underside and a painted pool on the table | S |

## 3. DENSITY MAP

Tier from the nearest normal view (bible section 3). Sizes in texels (w x h). "Today" = first pass at 32.
Far backdrops go BELOW 32 where the camera never comes near (16 texels a metre at 20–25 m is still
0.65–0.8 px a texel): `tile.density` is per tile.

### Bay (beats 0–5)

| surface / prop | nearest view | tier | today | new native tiles | texels |
|---|---|---|---|---|---|
| Asphalt, rail lane (\|x\| < 6) | 3.1 m | 64 | `z2asphalt` 256 x 256 | lane 512 x 512 | 262 k |
| Asphalt, far apron | 6.5 m+ | 32 | same tile | 256 x 256 | 65 k |
| Lane dressing: hatch box, stencil, skids, glass, litter, footprints, oil, manholes, drains, reflections | 3.1 m | 64 | stencil ~170 x 50, patches / oil / skid / manhole ≈ 14 k, reflections 109 x 38 + 70 x 35 | hatch 512 x 230, stencil 340 x 100, skids 96 x 512, others | 320 k |
| Animated puddles (4 lights) | 3.1 m | 48 | 48 x 32 x 4 frames x 4 | 96 x 64 x 4 frames x 4 | 98 k |
| Sidewalk + kerb | 3.1 m | 64 | `z2conc` 128 x 128, `curbTile` | 256 x 230 + 256 x 24 | 65 k |
| Facade ground floor under the canopy | 4–6 m | 64 | brick wrap + glass boxes | door bay 410 x 294, window bay 435 x 294 | 248 k |
| Facade ground floor beyond the canopy | 12 m+ | 32 | brick wrap | 2 modules 256 x 157 | 80 k |
| Facade upper storeys (68 x 11 m) | 10 m+ | 32 | brick wrap, `z2hwin` 56 x 68 x ~12, copings, pipes | 10 bay modules 104 x 106, brick field 256 x 192, banner 192 x 80, roof units, parapet | 250 k |
| Wing east face (38 x 12 m) | 18 m | 32 | brick wrap + windows | bay modules shared + ground floor 2 x 304 x 109 | 70 k |
| Canopy soffit / fascia / pillars + collars | 3.5 m / 9 m (passes overhead) / 8.6 m | 64 | `z2conc`, `z2enamel`, pillar 64 x 160, collar 48 x 32 | soffit 256 x 256 + 6 x 48 x 48, fascia 1293 x 58, pillar 160 x 294, collar 160 x 58 | 210 k |
| Ambulances (wreck passes at 2.5–4 m; parked at 4.4 m) | 2.5 m | 96 | side 128 x 74 x 2, door 35 x 70, front 70 x 43, cab 61 x 43 x 2 | profile 595 x 278, lettering 230 x 38, rear 221 x 250, leaf 106 x 211, front 141 x 160, roof 74 x 198, wheel 81 x 81, interior 134 x 128 | 322 k |
| Cars, police car, queue (cards) | 22 m | 32 | side 138 x 22, cabin 70 x 19, end 58 x 22 (x 3 colours) | 6 cards 138 x 48, ends | 46 k |
| Bay props: lamps + rain cones, fence, triage tent, sandbags, dumpsters, gurney, wheelchair, IV, body bags, corpse, cones, bins, rain curtain | 1.6–18 m | 32–128 | sprites ≈ 12 k, fence 64 x 48 | see offenders 16, 27, 29 and section 4 | 190 k |
| Storm sky, city, roofs (panorama) | far | ~1 px a texel | `z2-sky` 1024 x 416, one level | keep (the best art of the stage) | (426 k, own atlas) |
| **Bay subtotal** | | | | | **2.23 M** |

### Interiors (beats 5–29)

| surface / prop | nearest view | tier | today | new native tiles | texels |
|---|---|---|---|---|---|
| VCT floor, corridor A | 3.1 m | 96 | `z2vinyl` 128 x 128 | 384 x 384 | 147 k |
| VCT floor, ER + hub | 3.1 m | 64 | same | 256 x 256 | 65 k |
| Floor decals (trail, pools, prints, papers, stains, pills) | 3.1 m | 64–96 | ≈ 25 k | trail 77 x 384 x 2, pools 128 x 112 x 3, papers 80 x 64 x 3, others | 170 k |
| Corridor A walls (2 x 42 m x 3.2 m) | 2.2–3 m | 96 | `z2paint2` 128 x 96, `z2glazed` 128 x 48, rail, skirting | 3 panels 576 x 307 | 531 k |
| Room door leaves (5 breakable + 3 closed) | 2.3 m | 96 | `z2leaf` 42 x 70 x 3 | 125 x 211 x 3–4 colours | 105 k |
| Ceilings (all rooms) + troffers, holes, hanging signs | 3.3 m+ | 64 | `z2ceil` 128 x 128, troffer 22 x 40, holes 32 x 32 | 256 x 256, troffer 44 x 80 x 4, 8 decals, 4 signs 102 x 32 | 125 k |
| ER walls: back (22 m), west (24 m), east by the corridor mouth, east rest | 6.4 m / 11 m / 2.3 m / 9 m | 32 / 32 / 64 / 32 | paint + glazed wraps | back 704 x 134, west 2 x 256 x 134, mouth 512 x 269, east 384 x 134 | 352 k |
| Reception + nurse counters | 7.7 m / 4 m | 64 | `z2counter` 128 x 48 | 333 x 77 + 461 x 77, tops, insides | 97 k |
| Chair rows, vending machines | 3.3 m / 10 m | 64 | chair tiles 16 x 15, vend 32 x 62 | chair cards 180 x 61 x 2, vend 64 x 125 x 3 | 61 k |
| Ward floor | 3.1 m | 64 | `z2sheet` 128 x 128 | 256 x 256 | 65 k |
| Ward walls (behind beds and curtains) | 5.5 m+ | 32 | paint + glazed wraps, `z2nightwin` 58 x 38 | 4 bed-bay modules 134 x 115, 2 end modules 144 x 115 | 95 k |
| Ward curtains (static + 4 dynamic) | 3.8 m | 64 | `z2curtain` 64 x 64 | 256 x 141 x 2 + bunched 58 x 141 | 80 k |
| Beds, bedside lockers, over-bed tables | 4.7 m | 64 | boards 32 x 25 / 32 x 14, linen | profiles 134 x 80 x 2, tops, boards, sprites | 60 k |
| Hub walls: back (spitter backdrop), north, fire-door wall | 6.5 m / 7 m / 1.8 m | 32 / 32 / 64 | wraps, `z2shelf` 36 x 64 | 448 x 115 x 2, door surround 384 x 230, rest 256 x 115 | 220 k |
| Fire-door leaves | 1.75 m | 128 | `z2firedoor` 54 x 88 | 218 x 352 | 77 k |
| Stairwell walls (2 x 24 m x 8.1 m), end wall, treads | 4 m / 8 m+ / 2–3 m | 64 / 32 / 96 | `z2block` 128 x 48, `z2tread2` 64 x 16 | 2 panels 512 x 288, end 256 x 125, tread 192 x 32, riser 192 x 16, bulkheads | 347 k |
| Morgue floor + drain + wash trails | 3.1 m | 64 | `z2ftile2` 64 x 64 | 256 x 256, 256 x 26, decals | 95 k |
| Morgue walls: tile wrap, entrance surround | 4.5 m+ / 3 m | 64 | `z2glazed` 128 x 48 x 2 | 256 x 269, 512 x 269 | 207 k |
| Cold-storage banks + dynamic drawers | 7.6 m (spawn surfaces) | 64 | `z2drawer` 22 x 20 x 3 | 4 modules 100 x 160, door 44 x 40, tray 115 x 38 | 70 k |
| Autopsy tables, sinks, scales, hoist, UV lamp, blackboard, jars | 4 m | 64 | top 28 x 64, pedestal 10 x 26 | profiles + cards | 65 k |
| Corridors B + C walls (2 x 13 m + 2 x 19 m) | 2.2–3 m | 96 | `z2block` 128 x 48 x 2 colours | 2 panels 576 x 326 | 376 k |
| Boiler wall (12 blocks) + rubble core | 2.2 m | 96 | block tile + `z2rubble` 32 x 32 | 307 x 259 + 64 x 64 | 84 k |
| Corridors B + C floor, soffit, pipes, steam, boiler room glimpse, cylinders | 3.1 m / 3.3 m / 4 m / 3 m | 96 / 64 / 32 / 64 | `z2conc`, enamel, `z2cyl` 48 x 48 | 384 x 384, 256 x 256, pipe strips 256 x 24 x 3, steam 48 x 64 x 4, glimpse 224 x 109, cylinders 80 x 77 x 2 | 280 k |
| Theatre floor + sterile field | 3.1 m | 64 | `z2terrazzo2` 128 x 128, `z2sterile` 48 x 64 | 256 x 256, 192 x 256 | 114 k |
| Theatre walls: tile wrap, exit surround, gallery band + interior, supply wall | 4.5 m / 2.3 m / 9 m / 14 m | 64 / 64 / 32 / 32 | `z2glazed` 128 x 48 x 2 | 256 x 320, 384 x 320, 288 x 83 x 2, 512 x 160 | 335 k |
| Theatre kit: table, lamp, anaesthesia machine, trolleys, pendant, x-ray boxes | 4 m | 64 | drape 24 x 64, anesthesia 22 x 38, xray 42 x 28 | profiles, cards, sprites | 70 k |
| Atrium floor: near strip, inlay ring, roots, pustules | 3.1 m / 7 m+ | 64 / 32 | `z2marble2` 128 x 128, `z2vein3` 32 x 64 | 256 x 256, 224 x 224, 64 x 256 x 2, 96 x 96, 48 x 48 x 4 | 160 k |
| Pool surface, coping, drapes | 7–17 m | 32 / 64 | `z2flesh` 64 x 64, `z2coping` 64 x 64 | 336 x 336, 128 x 140, 3 x 64 x 56 | 142 k |
| Cocoon (cards) | 12 m | 64 | `z2flesh` 64 x 64 on lumps | 320 x 294 (+ second card from the same tile) | 94 k |
| Atrium back wall / side walls (30 x 18 m each) | 25 m / 19 m | 16 | `z2paper` 128 x 96, `z2stone` 128 x 48, modules | 480 x 288 + 480 x 288 + café overlay 160 x 96 | 292 k |
| Balcony fronts, soffits, columns, skylight, shafts, mobile, banners, desk, benches | 11–25 m | 16–32 | `z2glassbay` 80 x 32 x 5, fascia 80 x 16, column 32 x 32, skylight 96 x 96 | 5 x 80 x 50, 128 x 128, 96 x 256 + 96 x 32 x 2, 240 x 240, cards | 190 k |
| Gurneys (8) | 1.3–3 m | 128 / 64 | `z2sheet` 64 x 64, hem 64 x 16 | profile 256 x 141, end 83 x 141, tops 61 x 182 x 3 | 80 k |
| Billboard props (13 kinds) | 1.2–8 m | 128 (5 corridor kinds) / 64 | ≈ 12 k | see offender 16 | 110 k |
| Signs, plates, posters | 2.3 m+ | 96 near / fallback | ≈ 90 k | near ones native, rest 2x | 365 k |
| Wall decals outside the panelled walls | 4 m+ | 64 | ≈ 40 k | native | 100 k |
| Generic NEUTRAL materials (steel, enamel, linen, veneer, plain, skirting, rail), side rooms | — | 2x fallback | ≈ 36 k | none (upscaled) | 147 k |
| **Interior subtotal** | | | | | **5.97 M** |

### Total

- World: **≈ 8.2 M texels** (today 0.914 M: x 9). At two bytes a texel with levels (x 1.33):
  **≈ 21.9 MB**; sky 0.43 M texels, one level: 0.85 MB. **≈ 23 MB of the 48 MB budget — it fits**, with
  room to raise the two service-corridor and three clinic panels to 4 unique panels each (+0.4 M) or
  to give the atrium back wall 24 texels a metre (+0.17 M).
- Packing: 8.2 M texels do not fit 2048-wide (the first pass is 2048 x 688). Needs a 4096-wide atlas
  (4096 x ~2200) or two world atlases (exterior + interior). Two atlases cost the bay one extra batch
  for the props it shares with the interior (gurney, wheelchair, IV, corpse).
- The binding budget is PAINT TIME, not memory: today 0.914 M texels paint in 277–332 ms in the browser
  (96 ms in node). At that rate 8.2 M texels are 0.9 s (node rate) to 2.5 s (browser under load) against
  the 1.2 s budget. Measure after the first slice. If it does not fit, these stay at the 2x-upscaled
  fallback, in this order (least seen first): (1) generic NEUTRAL materials and side rooms (already),
  (2) signs / posters / wall decals beyond 3 m, (3) hub north wall, ER west wall, ward walls,
  (4) theatre supply wall and gallery, morgue far wall, (5) wing ground floor and the facade beyond the
  canopy, (6) atrium side walls. Never trade away: corridor panels (A, B, C), the corridor floor,
  the stairwell panels, the ambulance, the lane, the atrium back wall and floor.

## 4. SCENE BY SCENE — what is missing

Mood per scene (bible 4.6: one architecture hue family, one light accent, one danger accent). Darkest
painted tone #14122a, never below. Background brightest tone 4 except small sources.

### 4.1 Ambulance bay (beats 0–5) — night, rain, the city burning
Architecture deep blue-violet (brick as maroon-violet); light = warm tungsten windows and sodium lamps;
danger = the EMERGENCY red. The storm panorama stays as it is.

- **Story** ("the radio said it was a safe zone"): a road-side A-board at (6.5, 16) "ST. MERCY SAFE ZONE —
  TRIAGE AHEAD" with an arrow, sprayed over with a red X; a white triage tent with a red cross, half
  collapsed, at x 11.5–17, z 7–13 (two cards in an L; it must stay right of x 11: the walker spawned at
  (8.8,-1) is seen past its left side); a sandbag checkpoint with a dropped rifle rack and a stencilled
  barrier by the fence; a queue of three abandoned cars with open doors and a burst suitcase at
  x 13–16, z 18–28, one a police car with a dead light bar; bedsheets "HELP US" / "ALIVE INSIDE" hanging
  from second-floor windows left of the canopy (x -22…-16, y 6–9); a body half out of a broken window;
  stacked body bags under a tarp against the wing at (-13,-20); the liquid-oxygen tank cage and
  dumpsters along the wing wall (x ≤ -13.5: clear of the nurse's line from (-7.8,-14.6));
  chained wheelchairs by the doors; a spilled medical bag, drip bags, a single shoe and a windscreen's
  glass fan on the lane (flat decals only inside the lane).
- **Light**: every lit window throws a stepped warm pool on its sill and the wall below; the two
  working street lamps a cone with rain in it and a pool on the wet ground (broken streaks toward
  the eye); the canopy downlights six cones on the ground; EMERGENCY spills red on the fascia panels
  and as a long broken reflection; the wreck's headlamp a cone across the lane to the left; fire-lit
  cloud undersides already in the sky — add a faint orange rim on the roofline clutter facing the city.
- **Silhouettes**: roofline (helipad lights, windsock, water tank, aerials, a mast beacon), lamp
  swan-necks, a flagpole with a torn flag, telephone wires from the wing to a pole, razor wire on the
  fence, the clearance bar under the canopy, dead trees (FLORA, keep).
- **Loops** (pick 5–6): EMERGENCY dead letter buzzing; gutter rain curtain along the canopy edge; lamp
  rain cones; mast beacon blink + one TV-flicker window; torn flag / quarantine tape flapping; puddle
  rings (exist); a curtain blowing out of a broken window; steam from the wreck.
- **Remove / simplify**: the three rectangle patches and the yellow lane lines' ruler edges (worn,
  broken paint instead); the flat black canopy faces; identical window grid (variants by rule);
  the bare wing box.

### 4.2 ER reception (beats 5–7)
Architecture cool sea-green / mint-grey (no custard cream); light = cold white fluorescent, the desk's
cyan LED strip; danger = the corridor's red strobe and blood.

- **Story**: reception as a designed piece (offender 7); a queue-number display stuck on "047" (blink);
  a bell; a triage whiteboard on the back wall with names crossed out and "NO BEDS"; waiting chairs
  with coats, a teddy, magazines, one slumped arm; a magazine table knocked over; wet footprints from
  the doors and bloody ones to the desk; a dropped clipboard; a water cooler lying in its puddle; the
  vending machines' glass smashed and cans rolled out; a gurney jam at the TRIAGE door; the wayfinding
  stripes start here (red and blue lines on the wall, arrows on the floor: "FOLLOW BLUE FOR WARDS") —
  the blood trail follows the blue line all the way to ward 3.
- **Light**: troffer halos on the ceiling and stepped pools on the floor; wall-wash scallops at the top
  of the back wall under the lit panels; the TV's blue wash on the east wall; the EXIT sign's green on
  the door head.
- **Silhouettes**: hanging wayfinding boards (two, on chains, at x -4 and x 6, z -34: above head
  height, y > 3 m), the dangling panel (exists), a ceiling-mounted TV bracket, the drip stands.
- **Loops**: TV broadcast bars; "NOW SERVING" blink; a sprinkler drip into the cooler's puddle; the
  flickering troffer (exists); vending machine light stutter.
- **Calm**: the east wall behind the grabbed nurse (x 400–560, y 110–215): move the TV up and toward
  the entrance, chairs there in dark navy with nothing bright on them; desk top props below 1.45 m.

### 4.3 Corridor A (beats 7–12) — the showpiece
Same clinic hues; the far end stays the red-lit dark rectangle (it is where enemies appear).

- **Story**: the three panels of offender 2; the office window at x 17 (right wall) painted as a
  window: bent blinds, a desk lamp still on, a hand print; doors 324 / 329 / 338 / 344 with number
  plates, clipboards, one with quarantine tape, one with "DO NOT OPEN — DEAD INSIDE" in marker; a
  linen alcove; a wall phone swinging off the hook; an overturned records trolley with files fanned
  across the floor at (30,-45.6) beside the crash cart; a wet-floor A-board at (42,-42.3); pills,
  a stethoscope, a single clog; a child's "get well" balloon stuck under the ceiling at (46,-44).
- **Light**: each lit troffer a halo on the ceiling tiles, a scallop on both walls (overlay modules
  placed under the lit panels: x = 13 + 2.8 i) and a stepped pool on the floor; the office lamp's warm
  wedge through the blinds onto the floor; the red beacon at x 52.6 a painted red wash on the last 3 m
  of both walls.
- **Silhouettes**: exit sign on a ceiling bracket, CCTV dome, the dangling panel and its cables
  (exists), the IV stands and the gurney's drip hook against the pale wall.
- **Loops**: phone handset sway; smoke-detector LED; a ceiling leak dripping into a puddle at (25,-45.3);
  the monitor trace in the office; the buzzing troffer (exists); the balloon bobbing.
- **Remove**: the chessboard floor; red wall words; the pure-white paper rectangles.
- **Calm**: vanishing rectangle (x 285–350, y 120–170); the left wall around door 324 (riot guard
  bursts at 5 m); nothing saturated at head height (y 120–140) from x 240 to x 400.

### 4.4 Ward 3 (beats 12–14)
- **Story**: curtains as cloth with shadow-play figures (offender 12); bed profiles with charts,
  restraint straps on two of them, an empty bed with the sheet dragged to the floor; bed-head trunking
  with oxygen flowmeters and call-button cords on the wall behind each bed (the wall bay modules);
  lockers with flowers gone brown, cards, a deflating foil balloon; over-bed tables with dinner trays;
  a pinboard of children's drawings; windows with blinds, rain running down the glass and the burning
  city glow behind; a mop and bucket left by the wall at (56,-38.2).
- **Light**: cold moon rectangles with blind stripes thrown on the floor under the three windows of
  each wall (painted, stepped); warm reading-lamp pool over one bed; flatline green on a monitor.
- **Silhouettes**: ceiling curtain tracks (exist), swing-arm TVs over two bays, drip stands, the
  balloon.
- **Loops**: rain on the six windows; monitor flatline blink; balloon; one curtain breathing in a
  draught (static side curtain only, never a spawn curtain); the dying troffer (exists).
- **Calm**: the curtains (tones 2–4, desaturated); the aisle; the far opening to the hub.

### 4.5 Nurse station (beats 14–16)
- **Story**: the U counter as a front elevation with a cracked sneeze screen, CCTV quad monitor, a
  phone with a blinking hold light, patient-file carousel, mugs, a desk fan; a bed-state board
  ("BED 7 — DECEASED" down the column); a pneumatic-tube station on the north wall with a canister
  jammed in it; the drug cabinet's roller shutter HALF DOWN over the shelves (dark, calm: it is the
  backdrop of both spitters); a stopped wall clock; an aquarium on the side counter with floating
  fish and a bubbling filter.
- **Light**: desk-lamp pool on the counter top (exists as a glow box: paint the pool); monitor glow
  on the back counter; STAIRS sign's blue wash on the fire-door head.
- **Loops**: CCTV monitor flicker; phone light; aquarium bubbles; desk fan; the buzzing warm troffer
  (exists).
- **Remove**: the multi-coloured medicine boxes behind the spitters; the flat dark counter side.

### 4.6 Stairwell (beats 16–18)
Architecture grey-violet concrete with a bottle-green dado; light = amber bulkheads; danger = red beacon.

- **Story**: a barricade that failed on the top landing (stacked chairs, a filing cabinet, a bed frame
  shoved aside — cards against the side walls, clear of the 3 m in front of the camera); "DON'T GO
  DOWN" in marker over the level stencil; hand-drags of dried blood along the handrail wall; an
  evacuation chair on its bracket; a body bag that slid half-way down the flight (flat on the treads,
  left third); tally marks scratched by the bulkhead; fire-hose cabinet with the hose pulled out
  down the steps.
- **Light**: every bulkhead a painted amber pool on its wall (4 lit, 1 dead); the red beacon at the
  bottom right a red wash on the lower wall and the landing; the open morgue door a cold wedge on the
  lower landing floor.
- **Silhouettes**: riser pipes with flanges and a valve wheel in the two far corners (half-round
  profiles), a cable tray crossing overhead with a hanging loop, cobwebs in the soffit corners,
  handrails with drawn brackets.
- **Loops**: a buzzing bulkhead (glow + pool strip); moths round a lit one; a drip from the landing
  slab; the beacon (light); a swinging cable.
- **Calm**: the lower landing and the morgue doorway (centre, y 100–150); the "B1" stencil stays above
  the soffit (it is over the walkers' heads: fine).

### 4.7 Morgue (beats 18–20)
Cold blue-white tile; light = cyan fluorescent + one violet UV fly-killer; danger = small red LEDs.

- **Story**: fridge banks (offender 21); a chalkboard of organ weights with a last line trailing off;
  a ceiling hoist rail with a chain and sling over the left tables (cut-out); specimen jars on a
  shelf by the sinks; instrument cabinets with glass doors; a hose on a reel with water still
  running to the drain; a mop bucket full of red water; body bags stacked two deep on a trolley
  because the fridges are full; a toe tag on the floor.
- **Light**: UV lamp's violet pool on the wall and ceiling near the sinks (far left corner: off the
  lane); troffer pools; the temperature displays.
- **Silhouettes**: hoist chain, hanging scales (exist, swinging), ceiling pipes (profiles), the
  dangling panel.
- **Loops**: UV lamp flicker; running water + ripple at the drain; extractor fan blades in the far
  wall; LED blink; scales (exist).
- **Calm**: both fridge banks (spawn), the far door, the floor centre.

### 4.8 Service corridor B and corridor C (beats 20–22, 24–26)
- **Story**: panels of offender 1; overhead services as the hero (lagged steam pipes with bands and
  valve wheels, a red sprinkler main, a cable tray); a floor scrubber abandoned at (80.6,-106.5); a
  rack of chained oxygen cylinders (painted card, NOT near the real destructible ones); laundry sacks
  spilling from the LINEN door; KEEP CLEAR hatching in front of the DANGER door; corridor C: the
  boiler wall with its boards and "KEEP OUT", scorch marks spreading from its edges, a warm glow in
  the cracks before it bursts; the boiler room behind as a painted glimpse (boiler front with gauges,
  a furnace door grille glowing).
- **Light**: bulkhead amber pools; furnace orange wash on the corridor floor after the burst (painted
  on the boiler-room floor and the opening's reveal, where no enemy stands: keep it out of the ring
  area); the red beacons' washes.
- **Loops**: steam puff from a pipe joint (ceiling height); drips into the puddles; furnace flicker;
  a buzzing bulkhead.
- **Remove**: stone bricks; black puddles; red words.

### 4.9 Operating theatre (beats 22–24)
Desaturated blue-green tile; light = the surgical lamp's warm white pool; danger = blood.

- **Story**: the table as a profile with straps cut; a gas pendant from the ceiling; the anaesthesia
  machine with bellows still pumping; a cardiac monitor flatlining; kick buckets of swabs; glass-front
  supply cabinets on the far wall (dark); a blood fridge with a cold lit window (far left, small);
  scrub trough with elbow taps by the entrance; a "SURGICAL SAFETY CHECKLIST" board; the gallery:
  dark glass with a long bloody smear and a slumped silhouette in a seat (low contrast: spitters
  stand there).
- **Light**: lamp pool painted on the drape, the table and a stepped ellipse on the floor; x-ray
  boxes' pale wash on the north wall; pilot lamps.
- **Loops**: bellows; monitor trace; blood drip from the table edge; pilot-lamp blink.
- **Calm**: the left wall behind the cowering doctor (x 60–200, y 120–220); the gallery band; centre.

### 4.10 Atrium and boss (beats 26–29)
Architecture dark warm stone / violet-brown; light = cold moon-blue shafts; danger = flesh crimson
and magenta glow. NO orange in the background.

- **Story**: the backdrop painting, the inlaid floor lifted by roots, the hanging sac (offenders 5, 6,
  9); a café with its shutter half down and chairs stacked (right wall, overlay); an information
  desk overgrown; wheelchairs and a gurney tipped where people fled; root curtains hanging from the
  top balcony carrying bodies wrapped like flies; rain falling through a broken skylight pane onto
  the pool.
- **Light**: moon shafts with painted cold pools; sconces on the balcony walls as small warm points
  with a painted scallop (keep the centre bays' sconces dead); the pool's crimson glow as a stepped
  painted pool on the inlay ring; pustule glow.
- **Silhouettes**: the dove mobile and pendant lamps against the skylight; banners; balcony rails
  with things draped over them; column capitals; the skylight's glazing bars with two broken panes.
- **Loops**: pustule pulse; rain column + ripples in the pool; dust motes in a shaft; the mobile and
  pendants swaying (exist as swingers); one sconce flickering; a slow drip from a root curtain.
- **Calm**: the three centre bays of the back wall behind the boss; the two landing spots of the
  balcony walkers (x 205 and 419, y 150–185: plain dark floor there, no roots); the floor in front
  of the camera where the pool crawlers come (roots thin out toward the camera, already a rule in
  `buildAtrium`).

## 5. SLICES and AUDIT SHOTS

`stages/z2/pixel.ts` (2097 lines) is the one file every slice would touch. First step, before
any parallel work (small, S): split it — keep `Z2PixelWorld` (jobs, finish, emitAll, rule) and move
zone code behind a registry (`handle` by tag kind, `pickFor` by preset and ZONE) into
`stages/z2/pwBay.ts`, `pwShell.ts`, `pwProps.ts`, `pwBasement.ts`, `pwAtrium.ts`; add the PANEL layout
helper and the PROFILE helper (if the foundation does not ship them).

| slice | beats | painter files (pixelworld/) | stage files (stages/z2/) | shots | effort |
|---|---|---|---|---|---|
| **A — Bay exterior**: ground, facade + wing + roofline, canopy, ambulances, cars, bay props, painted light | 0–5 | `z2bay.ts`, `z2vehicles.ts`, new `z2facade.ts` (window bays, ground-floor modules, roof units; replaces the facade parts of `z2modules.ts`) | `pwBay.ts` (from `bayGround`, `facadeDetail`, `roofline`, `bayLights`, `paintAmbulance`, `layAmbulance*`, cases `ambulance` / `car` / `fence` / `win` / `wingWin` / `cross` / `puddle`) | `z2:0:120`, `z2:1:300`, `z2:4:120`, `z2:5:90`, `z2:5:300` | L |
| **B — Clinical shell, ground floor**: walls, floors, ceilings, doors' architraves, signs and painted light of ER, corridor A, ward, hub | 5–16 | new `z2clinic.ts` (panels, VCT / sheet floors, ceiling, wall-bay modules); `z2decals.ts`, `z2signs.ts` | `pwShell.ts` (PANEL layout tables, zone-aware `pickFor`, `scatter` / `bandDecals` / `brokenTiles` retired for panelled walls) | `z2:6:120`, `z2:7:300`, `z2:8:120`, `z2:9:260`, `z2:13:120`, `z2:15:120` | L |
| **C — Furniture and props, whole stage**: gurneys, beds, counters, chairs, vending, shelves, curtains, autopsy / op tables, anaesthesia machine, trolleys, billboards, door leaves, cylinders | all | `z2furniture.ts`, `z2props.ts`, `z2billboard.ts`, `z2objects.ts`, `z2modules.ts` (fixtures, leaves, troffers) | `pwProps.ts` (PROFILE builder, `handle` cases for every prop tag, `paintDoor`, `paintTank`) | `z2:9:90`, `z2:11:120`, `z2:13:120`, `z2:16:90`, `z2:19:120`, `z2:23:120` | L |
| **D — Basement shell**: stairwell, morgue, corridors B / C, boiler wall, theatre walls / floors / services | 16–25 | new `z2basement.ts` (service + stair panels, tile rooms, floors, treads, pipes, fridge banks) | `pwBasement.ts` (layout tables, `paintWall`, `boards`, `morgueWall` case) | `z2:16:240`, `z2:17:120`, `z2:18:300`, `z2:21:120`, `z2:22:300`, `z2:25:120`, `z2:25:260` | L |
| **E — Atrium and boss arena**: backdrop walls, balconies, columns, skylight, floor inlay, roots, pool, cocoon, shafts, mobile | 26–29 | `z2atrium.ts` (takes marble / wallpaper / stone / flesh over from `z2surfaces.ts`) | `pwAtrium.ts` (from `atriumDressing`, `paintShafts`, `coping`, cases `vein*` / `drip` / `membrane` / `glassRail` / `doorway` / `officeWin` / `skylight`, cocoon in `convertInto`) | `z2:26:240`, `z2:28:60`, `z2:29:240`, hud `z2:29:900` | M–L |

`z2surfaces.ts` empties out as B, D and E take their surfaces into their own files; what is left
(generic NEUTRAL materials) stays untouched on the 2x fallback. Slice C meets B and D only at the
`handle` registry.

**Audit shots** (the six that best test this stage):

1. `z2:1:300:bay-drive` — near ground + facade + vehicles at distance (exterior).
2. `z2:5:90:bay-wreck` — the big vehicle at 3–5 m, canopy soffit overhead.
3. `z2:7:300:corrA-mouth` — near walls both sides at 2.3 m, door frame, floor (worst frame today).
4. `z2:17:120:stairwell` — the stone-brick room; tall walls, treads.
5. `z2:21:120:service-corridor` — basement near wall, pipes, door, wheelchair brushing past.
6. `z2:29:240:boss` — boss arena (60–80 s frame); check with `--noauto --hud` at 900 frames.

Secondary: `z2:13:120` (ward: floor + curtains), `z2:19:120` (morgue), `z2:23:120` (theatre vs bile).

## 6. RISKS and constraints

- **Identity tests** (`tests/unit/pixel-world-z2.test.ts`): PIXEL CAST must build byte-identically and
  the world RNG state must be equal in both arts — classic builders may only RECORD (`pwTag`); every
  new placement uses `hash2` of positions, never `ctx.rng` / `world.rng`. The same test asserts atlas
  bytes ≤ 24 MB (line 61): the foundation must raise it to the bible's 48 MB or the repaint fails CI.
- **Occluders** are invisible proxies and never change: reception desk (5.2 x 1.1 x 0.25 at
  (-6,0.55,-35.0)), nurse counter (0.25 x 1.1 x 7.2 at (82.75,0.55,-44)), parked ambulance
  (2.3 x 3.2 x 6.0 at (5.6,1.6,-19.7), yaw -0.08). What is PAINTED must still cover them: a profile
  ambulance or an elevation counter that is thinner / lower than its proxy makes bullets stop in
  thin air. The crashed ambulance has no proxy.
- **Destructibles keep their triangles** (hit boxes, ray distances asserted): 5 breakable doors (corridor
  A x 24 / 29.5 / 38 / 44.5 and the DANGER door of corridor B), 2 gas cylinders in corridor C
  ((54.6,-119.4), (56.4,-122.8)), 3 oxygen tanks in the theatre. Paint in place only (`paintDoor`,
  `paintTank`); no cut-out silhouettes, no profile. Do not dress anything that looks like a cylinder
  next to them.
- **Moving set pieces** (transforms owned by gameplay / env): crashing ambulance (`root` path and yaw,
  `body` roll, door hinges, flames parented at body-local (-0.6…0.6, 1.5, 2.6), smoke at (0, 2.2, 2.6),
  light-bar glow meshes toggled by visibility); ward front curtains (slide + `scale.x` to 0.28 + yaw:
  a painted figure squashes — acceptable, keep it near the fixed edge); morgue drawers (door swing,
  tray slide); vent grates (fall and tumble: both faces painted); dangling panels, scales, pendants
  (swingers); boiler wall (12 blocks jitter, then `burstWall` swaps in `userData.pwChunk` geometry —
  the continuous wall painting must map onto blocks and chunks as `paintWall` / `wallChunk` do today);
  flicker panels (material swap `on` / `off`: keep the two-material scheme); the cocoon (heartbeat
  scale, hidden by `boss.ts` line ~720); the troffer light pools are per zone meshes.
- **Things enemies come out of or stand behind**: side rooms behind every corridor door, morgue
  drawers, ceiling vents, the reception desk (vaulted), the nurse counter (spitters' torsos above it),
  the theatre gallery glass (spitters behind it), the op table (a crawler under it), ward curtains.
  Silhouette pieces and cards must not hide more than the classic boxes do: nothing above 1.45 m on
  either counter, no card in front of a drawer bank, a door, a curtain or the gallery. Never use a
  camera-facing BILL for anything an enemy can be behind (it swings with the view).
- **Calm lanes**: section 1's zones. The specific traps found: medicine shelves behind the spitters
  (hub), blue chairs behind the grabbed nurse (ER), orange floor veins under the boss's rings, green
  theatre walls vs green bile, pure-red trail and words in the lane.
- **Zone culling**: each zone group is shown by rail distance (`env.ts addZone`); `bay` (near) lives
  until `D.corrA + 3`, `bayField` until `D.erDoor + 3`. New geometry must join the right zone's batch
  (it culls with it); the atrium is visible from `D.or + 2`, so its backdrop is seen down corridor C.
- **Levels**: a 96-texel panel is seen from 2.2 m to 40 m (levels 0–4). One-texel linework is gone by
  level 1; grids collapse into stripes (the theatre's far wall today). Paint value structure first,
  keep forms ≥ 2 texels, look at levels 2–3 of every panel. `d2CalmLevels` only runs on wrap tiles;
  `finish()` puts signs on their own material by the key regex `^z2(lit|plate|exit|stencil|road)\|` —
  new sign tiles must keep those prefixes; lettering needs the 4-texel-grid treatment to survive.
- **Animation**: one anim material per (frames, fps) pair. All new strips = 4 frames at 7 fps to
  share the puddle material; an anim batch costs one draw per zone. Nothing large or high-contrast
  animated near a calm zone (bible 4.7); respect `reduceFlashes` (env already rate-limits lights).
- **Performance** (capture stats, this box): draw calls 25–109 (bay 88–109, ER 71, corridor A 53–97,
  ward / hub 26–46, stair 59–67, morgue 71–75, corridor B 62–69, theatre 28–52, corridor C 54–63,
  atrium / boss 25–48); triangles 3.4 k–16.7 k (bay 15.5–16.7 k). Budget 250 calls. Profiles and
  cards add little; PANEL rects per span add quads but remove nothing. Cut-out overdraw: keep big
  cards (cocoon, curtains, tent) single-layer. A second world atlas adds one material set.
- **Paint time / atlas size**: see section 3 — ~8.2 M texels need a 4096-wide atlas or two atlases
  and may exceed the 1.2 s cold-paint budget at today's rate; measure after slice A or B and apply
  the fallback order.
- **Light**: the reference server still multiplies smooth Lambert light and warm point lights over
  the paint. Do not compensate by painting darker or greyer; paint evenly lit for the ramp-step
  pipeline (bible 5) and judge final colour only on the foundation build.
- **Capture quirks**: loading at beat 3 or later skips the crash (the wreck is snapped in at beat 4 or
  when d > 32); loading at beat 26 shows the boiler wall intact; the corridor's colour swings with
  the flicker light between captures of the same camera (b10 vs b11).
