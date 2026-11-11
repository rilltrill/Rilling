# z1 MAIN STREET — PIXEL WORLD 2 repaint work-list (scout report)

Scouted from the reference dev server (first-pass look, `http://localhost:5791`), 3x art frames
(624 x 288 art pixels, every art pixel 3 x 3, no CRT). Nothing in the repository was changed.

- Frames: `/tmp/pw2/scout/z1/frames/<label>-pixel.png` (43 art frames `b00 … b25b`, 6 HUD / no-autoplay
  frames `h04 h10 h12 h14 h21 h25`). Contact sheet: `/tmp/pw2/scout/z1/sheet.png`.
- Crops quoted below are `label (x0,y0)-(x1,y1)` in ART pixels (multiply by 3 for PNG pixels).
  Helper: `/usr/bin/python3.12 /tmp/pw2/scout/z1/work/crop.py <label> x0 y0 x1 y1 [scale]`.
- Capture command (one run at a time, ~8 shots a run):
  `cd /home/user/Rilling && node scripts/pixel-world.mjs --base http://localhost:5791 --out <dir> --modes pixel --retro pixel --vw 624 --vh 288 --dsf 3 --shots "z1:2:150:b02,…"` (add `--noauto --hud` for telegraphs).
- Camera facts used everywhere below: walk rig, eye 1.62 m, on the rail centreline; 58 deg vertical FOV,
  100 deg horizontal at 624 x 288. The bottom row of the frame hits the ground 2.9 m ahead (3.3 m slant).
  A surface `L` metres to the side of the rail enters the frame edge at `L / sin 50 deg = 1.3 L`.
  Pixels per texel = 260 / (density x distance) = 8.1 / distance at the first pass's 32 texels a metre.
- Stage numbers (capture stats, PIXEL WORLD): draw calls 20-63 (peak 63 at the rescue hold), triangles
  15.1 k-38.1 k, world atlas 2048 x 1136 (1.79 M texels in 352 tiles), sky 2048 x 368, fire 256 x 448.

**One-paragraph verdict.** The upper halves of the Main Street frames (signs, lit windows, far facades
at 10 m and more) are already near one texel a pixel and are not the problem. The stage reads as
Minecraft / Roblox because of the LOWER half and everything the rail passes close to: a road that is
35-50 % of every frame and is one dark plane with specks and 2.4 px texels; every vehicle a textured
box (two of them fill a third of the frame at 2-3 m); the alley, where brick and corrugated walls sit
at 3.5 m with 2-3.5 px texels and one wall brushes the camera at 1.2 m with 7 px texels; a town square
paved with giant flat slabs; plank-box kiosks at 3 m; and a set of buildings that are literally blank
boxes against the sky (intersection, gas station). Density fixes the first half of that list; only
re-drawing as illustrations and killing boxes fixes the second.

---

## 1. BEATS

26 beats (index.ts). `d` = rail distance, pos = camera world (x, z). Screen positions are art pixels
(624 x 288), projected from the spawn tables (`/tmp/pw2/scout/z1/work/proj.py`) and checked on the HUD
frames. HUD always covers: score (10-155, 5-45), progress bar / boss bar (230-450, 8-50), pause
(570-615, 8-52), hearts (10-130, 250-278), bomb (143-197, 230-280), weapon + reload (418-612, 203-278).
"Calm zone" = where the background must stay mid-contrast, unsaturated, with no ring shapes.

| # | kind | label | d / camera | scene | best shot(s) | enemies / civilians / telegraphs: calm zone |
|---|---|---|---|---|---|---|
| 0 | banner | MAIN STREET | 0 / (0, 6) | Police barricade seen from outside: sawhorses, ROAD CLOSED, tape, cones, two cruisers, HOTEL + BARBER left, HARDWARE + PAWN right | `z1:0:120:b00` | none; banner text mid-frame (y 90-180) |
| 1 | move | through the barricade | 0-20 | Walk through the 2.5 m gap between sawhorses (boards pass at 1.2-1.4 m), over the knocked-flat sawhorse, cruisers either side | `z1:1:90:b01a`, `z1:1:300:b01b` | one walker (cop) out of the fog, centre x 290-330, y 135-165 |
| 2 | hold | first contact | 20 / (0, -14) | Main Street looking north: CAFE / fire-escape block left, LAUNDRY + RIALTO marquee right, EAT blade ahead | `z1:2:150:b02` | walkers one at a time down the carriageway, x 230-370, y 132-175, growing to full height; shotgun pickup (275, 70-140). Calm: road x 150-480 from the horizon down |
| 3 | move | to the diner | 20-46 | Past RIALTO (lobby, marquee overhead right), tan parked sedan at 4 m right, teal car left | `z1:3:90:b03a`, `z1:3:300:b03b` | straggler left lane x 250-300 |
| 4 | hold | diner | 46 / (0, -40), looks 40 deg left | The chrome diner front 9.5-12 m away, interior through the glass, Diner sign, burning car far right | `z1:4:150:b04`, hud `z1:4:420:h04` | zombies INSIDE behind the glass then through panes 2 and 4: x 165-370, y 135-180; one on the sidewalk x 360; points pickup (361, 58-96). Calm: the interior back wall band y 120-165 and the sidewalk strip |
| 5 | move | past the burning car | 46-84 | Boarded shop + LIQUOR right, shutter block + BAR left, purple sedan left at 4 m, burnt car + fire right | `z1:5:90:b05a`, `z1:5:300:b05b`, `z1:5:520:b05c` | stragglers 21 m ahead, left lane then right lane |
| 6 | hold | crawlers | 84 / (0, -78), looks down the road | The intersection: crosswalks, hanging signal, pink wagon across the left lane with headlights, two cross-street corner blocks | `z1:6:150:b06` | CRAWLERS RISE OUT OF THE ASPHALT at (249, 178) and (345, 170); walkers x 230-440, y 128-160. Calm: the whole road x 150-480, y 125-200 (lowest contrast in the stage) |
| 7 | move | up Main Street | 84-126 | Pass the wagon's nose at 2.9 m, cross the intersection, green-awning block right, tank block left | `z1:7:90:b07a`, `z1:7:300:b07b`, `z1:7:520:b07c` | the first runner, centre |
| 8 | hold | pharmacy | 126 / (0, -120), looks right | PHARMACY window 9.5-13 m (the brightest surface in the stage), green cross, drum on the sidewalk | `z1:8:150:b08` | walkers IN FRONT OF THE LIT WINDOW x 300-410, y 135-180; crawler (297, 179); runners far left x 140-190. Calm: the window's lower half and the sidewalk in front |
| 9 | move | into the alley | 126-184 | GUNS blade, then the rail cuts the corner: the corner building's alley wall passes at 1.2 m (left edge), dumpster, graffiti, crates | `z1:9:90:b09a`, `z1:9:300:b09b`, `z1:9:560:b09c`, `z1:9:760:b09d` | walker out of the alley mouth (left-centre); crawler rises in the alley floor centre |
| 10 | hold | alley | 184 / (-30, -155), looks up 9 deg | 7 m alley: brick left, cold-storage corrugated right, fire escapes overhead both sides, police station at the far end | `z1:10:150:b10`, hud `z1:10:300:h10` | droppers from the fire escapes: x 240-390, y 0-80, landing centre; walkers at the alley end x 320-335, y 180-210; bomb pickup (249, 32-78). Calm: the fire-escape undersides, the sky slot, the floor centre |
| 11 | move | onto Second Street | 184-228 | Past trash-can fire, drum, bags, dumpster; T-junction facing the POLICE station; turn north | `z1:11:90:b11a`, `z1:11:300:b11b`, `z1:11:560:b11c` | walker on the left sidewalk |
| 12 | hold | rescue | 228 / (-58, -177) | Second Street: crashed cruiser right at 12 m, MOTEL blade, gas station ahead-left | `z1:12:150:b12`, hud `z1:12:300:h12` | COP civilian (419, 129-185) in front of the cruiser, runs right along the sidewalk; zombies x 140-290, y 131-175. Calm: the cruiser's side and the wall behind the cop |
| 13 | move | to the gas station | 228-250 | Pass the cruiser at 3.5 m, big puddle, canopy coming up left | `z1:13:90:b13a`, `z1:13:300:b13b` | straggler left-centre |
| 14 | hold | gas station | 250 / (-58, -199), looks 48 deg left | Forecourt 12-35 m: canopy, 2 pumps, 6 red drums, propane cage, GAS & GO store, brick block behind | `z1:14:150:b14`, hud `z1:14:300:h14` | zombies SMALL AND DARK on the forecourt x 190-360, y 138-165 (19-25 m); cowering civilian right foreground (484, 131-222); drums to shoot x 150-330, y 150-168. Calm and LIGHTER than the zombies: the forecourt slab and store front behind them |
| 15 | action | chain reaction | 250 | Drums / pumps blow, canopy buckles onto its west edge, 4 fires | `z1:15:60:b15` | - |
| 16 | wait | inferno | 250 | Burning station (2.4 s) | `z1:15:150` for the fire look (`z1:16:120:b16` loads the station intact) | - |
| 17 | move | to the bus | 250-282 | Blank brick block left, lit MOTEL lobby right, bus across the street in the distance | `z1:17:90:b17a`, `z1:17:300:b17b` | stragglers, centre |
| 18 | action | bus rocks | 282 | Bus bangs 3 times, emergency door blows off | `z1:18:120:b18` | - |
| 19 | hold | bus | 282 / (-58, -231) | Overturned school bus 15 m ahead, roof toward the camera, tan sedan at 3 m left | `z1:19:150:b19` | runners out of the rear door (301, 139-169) and leaping off the top (337-380, 97-126); crawler (282, 137-184). Calm: the bus roof panel and the sky above it |
| 20 | move | into the square | 282-319 | Swerve round the bus's rear end at ~2 m, TEAL SEDAN AT 2 m left, crosswalk, the square opens | `z1:20:90:b20a`, `z1:20:300:b20b`, `z1:20:500:b20c` | stragglers |
| 21 | hold | town square | 319 / (-58, -268), looks up-left | Kiosks 7.6 m ahead either side of the path, PRIME MEATS 36 m, bandstand right, BOOKS left | `z1:21:150:b21`, hud `z1:21:330:h21` | SPITTERS ON THE KIOSK ROOFS (214, 77-126) and (478, 68-122) with a yellow telegraph ring r 35 px above each; brute and walkers x 296-402, y 162-191. Calm: the walls and sky BEHIND the kiosk roofs, the path between the kiosks |
| 22 | action | something big | 319 | Music cuts, doors bang, red light pulses | `z1:22:120:b22` | - |
| 23 | move | approach PRIME MEATS | 319-334 | Walk BETWEEN the kiosks (walls at 2.8 and 3.4 m), square opens | `z1:23:90:b23a`, `z1:23:250:b23b` | - |
| 24 | wait | the doors bulge | 334 | PRIME MEATS front 20.5 m | `z1:24:30:b24` | - |
| 25 | boss | THE BUTCHER | 334 / (-58, -283) | Boss arena: paving, PRIME MEATS centre, shuttered block left, BANK right, two globe lamps, red car, grey wagon | `z1:25:240:b25`, `z1:25:900:b25b`, hud `z1:25:600:h25` | boss from the doorway (312, 60-175) up to full frame; ORANGE weak-point discs on him, WHITE ring r 45 px; adds rise at x 180-200 and 405-430, y 148-200. Calm: the doorway, the facade x 210-420, the paving centre; no orange / white discs in the set |

---

## 2. OFFENDERS (ranked by how loudly each says "Minecraft / Roblox")

Effort: S < 1 file and a day of painting; M one painter module plus its emitter; L several modules.

1. **The carriageway (Main Street, Second Street, cross street).** Every street frame; `b01b (300,180)-(480,288)`, `b07b` lower half, `b11b` lower half. *Flat empty plane + fat texels (2.4 px wide in the bottom rows, stretched into dashes by perspective) + speckle.* 35-50 % of the frame is one indigo tone with 640 one-texel chips, a few cracks and blue "glint" dashes. Code: `town.ts plane()` roads -> `pixel.ts asphalt()` -> `z1ground.ts z1AsphaltTile / paintZ1Asphalt` (256 x 256 at 32, mapped in world space by `retexture(…, { world })`); lane paint is 0.12 m boxes (`town.ts markings()`). **Treatment:** replace the planar wrap by a painted CROSS-SECTION module at 64 texels a metre: `z1RoadModule(variant)` 768 x 512 (12 m kerb to kerb x 8 m along), three variants A / B / C laid alternately with `b.rect` per street plane (u clamps kerb to kerb, v wraps). Passes: (a) base tone 3 of an indigo-violet asphalt ramp; (b) value structure: crown a half step lighter (hand-dithered edge), two tyre-polished wheel tracks per lane a step darker carrying the WET look as broken horizontal dashes in a sky-blue ramp (shaped dither, 3-9 texels long, never dots), a 0.6 m gutter band at each kerb a step darker with running-water streaks; (c) construction: centre and lane paving joints (dark line, lit lip), one saw-cut trench patch across a lane per variant with tar banding, a concrete gutter apron with joints every 3 m; (d) wear: alligator cracking in the wheel tracks, 5-7 tar snakes that follow the lane, 2 potholes with a lit far rim and water in the bottom, aggregate only as 2-4 texel shaped clusters on the crown; (e) baked dressing: the double yellow line WORN (chipped, scuffed off in the wheel tracks: drops the 0.12 m paint boxes), parking ticks, kerb drain grates, manhole with a cast pattern, leaf and litter drift in the gutters, a flattened can, cigarette packs; (f) contact: a 2-texel shadow line under the kerb. Keep x -3…+3 m in tones 2-4 only (enemy zone); put contrast in the gutters. **L.**

2. **Parked cars are textured boxes.** `b20b (0,130)-(280,288)` teal sedan at 2 m (a third of the frame: flat hood, flat side, slab bumper, 3-4 px texels); `b07a (0,140)-(230,260)` pink wagon across the lane (nose passes at 2.9 m); `b05b (60,130)-(240,220)`; `b01a (470,130)-(624,280)` (hubcap 24 texels over 36 px). *Textured box + straight box silhouette + fat texels + smooth light gradient across the flat faces.* Code: `props.ts car()` (body box 1.82 x 0.62 x 4.5, glass box, slab hood / roof) -> `pwCars.ts Z1Cars.part / face / wheel` -> `z1cars.ts paintSide` (144 x 20 !) `/ paintFront / paintTop / paintHood / paintWheel` (24 x 24). **Treatment (bible 4.5, extruded PROFILE):** in `pwCars.ts` drop the box faces and emit a profile sweep: per body style a 14-18 point side polyline (bumper, nose, hood slope, cowl, raked screen, roof crown, rear screen, trunk, tail, bumper) swept across the width as a strip (greenhouse narrowed 10 cm a side: tumblehome), the two sides one quad each carrying a CUT-OUT side painting at 64 texels a metre (288 x 96 for 4.5 x 1.5 m: wheel arches and the gap under the sills are alpha, wheels are separate discs set 5 cm in); styles: 70s three-box sedan, station wagon, cruiser (sedan + light bar + push bar), wreck (bent hood card, flat tyre), burnt shell. Painted: body crease line with a lit upper facet and a dark lower one, door shut lines, handles, chrome window surround, quarter light, side trim strip, fuel flap, rust at the arches, rain beads and a reflected-sky band on hood / roof / trunk modules (116 x 288), a real nose (grille bars, round lamps in bezels, plate, bumper with over-riders) and tail (116 x 64, cut out under the bumper), tyres with a sidewall highlight and a 5-spoke or dog-dish hubcap (48 x 48), wipers / mirrors / aerial / mud flaps as cards, an open door as its own profile card with the inner trim. The teal sedan `(-62.5, -252)` and the pink wagon `(-4.3, -86.5)` take a 96-texel side (432 x 144). Head / tail GLOW boxes and light bars stay classic (they flash). **L.**

3. **Alley brick wall.** `b10 (0,100)-(220,288)`, `b09d (0,0)-(260,250)`, `b11a (0,0)-(260,288)`. *Fat texels (1.8-3.5 px) + giant bricks (11 x 4 texels = 34 x 12.5 cm, 25 x 9 px each on screen) + visible repeat.* Code: `town.ts wh()` box with `facadeMat(0x664632,'brick')` -> retexture -> `surfaces.ts brickTile / paintBrick` (176 x 128, neutral-tinted); graffiti `z1graffiti.ts z1AlleyPiece`; `pwStreet.ts wall()`. **Treatment:** the ground-floor band (0-4.6 m) of both alley walls becomes unique painted modules at 64 texels a metre, 8 m x 4.6 m (512 x 296), three for the brick side: real-size brick in bond (14 x 5 texels with the joint), every brick a lit top edge and a shadowed bed joint, tone varied in runs of 3-6 bricks from three brick ramps, a soot band rising from the foot (stepped, hand dither), efflorescence under the door canopies, a bricked-up window with a different bond, a steel service door (kick plate, lever, hazard stencil, light leaking under it), gas meter and pipe run with clips and cast shadows, cable bundle, a wall lamp with a painted 3-ring pool, moss and splash-back at the foot, a torn layer of bills; THEY BITE re-sprayed natively at 64 with drips and overspray. Upper floors: the shared 256 x 256 wall wrap at 32 plus window modules. **L.**

4. **The alley-mouth corner wall at 1.2 m.** `b09c (0,0)-(140,288)`: 13-20 % of the frame is 6-8 px texels (quoin "stones" as half-metre grey slabs, then brick) for about 1.5 s while the rail cuts the corner at (-8.5, -152.7). *Fat texels at 6.8 px: the single worst texel in the stage.* Code: the corner building's side wall, `pwFacade.ts Z1FacadeExtras.sides` (wall foot / base) and its pilaster through `retexture` (`M.trimLight` -> `surfaces.ts stoneTile` 64 x 64). **Treatment:** one unique module at 128 texels a metre for the first 4 m of that wall, y 0-3.2 m (512 x 416; only y 0.8-2.45 m is ever on screen at that distance): small chamfered quoins (0.4 x 0.2 m) with lichen, brick at 128 with pitted faces, a cast-iron downpipe with a shoe and a rust fan, a POST NO BILLS stencil under three generations of torn bills, an enamel street plate, a hose bib with a drip stain. **M.**

5. **Town-square paving.** `b21 (120,190)-(460,288)`, `b23b` and `b25` lower halves (50 % of the boss frame). *Flat empty plane + fat texels + visible tile grid:* 0.75 x 1 m flags as single flat grey rectangles with a dark outline and a red-brick tic-tac-toe grid every 4 m: a Minecraft stone-slab floor. Code: `town.ts plane(… 'tiles' …)` -> `pixel.ts SQUARE_FLAGS()` -> `z1ground.ts z1PavingTile / paintZ1Paving` (256 x 256 at 32). **Treatment:** 512 x 512 at 64 (8 m): smaller setts and flags in a fan / herringbone mix so no joint runs 20 m straight to the horizon, each stone modelled (lit arris upper-left, worn dished centre a half step lighter, dark open joint only on the lower-right), wet sheen dashes in the dished stones, moss and sand in joints, cracked and re-set stones, a brass survey stud, drain channels with slotted covers along the path edges, the brick bands kept but as worn soldier courses broken by replaced stones; plus one unique "apron" module in front of PRIME MEATS (16 x 8 m, 512 x 256 at 32): a blood-rinsed gutter from the doorway to a drain, delivery-trolley wheel tracks, a hosed-down wet fan. Centre path x -3…+3 m low contrast. **M.**

6. **The two kiosks.** `b22 (400,60)-(624,288)` and `(0,60)-(130,230)`, `b23a`. *Textured box + fat texels (3-4 px in the posters and the NEWS / COFFEE letters) + flat faces:* plank stripes on a box with a slab roof, the camera walks between them at 2.8 and 3.4 m. Code: `town.ts` kiosk loop (`pwSq` tags) -> `pwSquare.ts kioskBody / kioskRoof / newsHatch / coffeeHatch` -> `z1square.ts paintKioskWall` (64 x 64 wrap) `/ paintBills` (128 x 48) `/ paintHatch` (61 x 32) `/ paintFascia`; signs `signs.ts neonSign`. **Treatment:** each visible face one painting at 96 texels a metre (about 278 x 250): tongue-and-groove boards drawn as boards (bevel highlight, shadow gap, nail heads, paint peeling to grey wood at the foot), corner posts, a real serving hatch with a fold-down counter, magazine racks with readable mastheads (EXTRA: DEAD WALK), a dropped shutter half-way on the coffee side, cup stacks, an urn, a chalk price board, bills pasted in layers at 96, newspaper bundles tied with string; break the box: cut-out roof overhang with a scalloped tin edge and a gutter, a striped canvas flap propped on two poles (profile card), a stove pipe and a sign bracket on the BACK edge of each roof. Sign boards repainted at 96 (192 x 58). The flat 3.0 m roof and footprint stay exactly (see RISKS). **M.**

7. **Buildings that are blank boxes against the sky.** `b06 (60,10)-(250,150)` green and `(400,20)-(560,150)` tan at the intersection; `b14 (345,30)-(505,160)`, `b16`, `b17a (60,30)-(250,155)` the brick block behind the gas station; `b13b (130,60)-(260,150)`. *Straight box silhouette + flat empty plane:* a side wall of one tone with four windows, a knife-edge corner and a ruler-straight parapet. Code: `pwFacade.ts Z1FacadeExtras.sides()` and `crown()` (crowns and clutter only on fronts), `town.ts` cross-street `bld()` loop, `bld(GAS_Z1…-246)`. **Treatment:** side walls become compositions: an enlarged, properly lettered painted wall advert (DR. KELSO'S TONIC, MILLBROOK FEED & SEED: 9 x 6 m, 288 x 192 at 32, flaking, with the brick showing through), a fire escape, two downpipes with cast shadows, a side door with a lamp and a small canopy, AC units with drip stains, a cable drop, ivy as a cut-out curtain on one corner; EVERY roof edge longer than 6 m gets silhouette cards from a roofline kit (water tank on legs, stair bulkhead with a door, chimney stacks with pots, aerial clusters, a billboard scaffold seen edge-on, a pigeon loft, a clothes line); corners get a drawn quoin / downpipe so two wall tiles never meet at a bare edge. **L.**

8. **Cold-storage corrugated wall and roller door.** `b11a (440,120)-(624,288)`, `b10 (390,0)-(624,288)`, `b09d (330,60)-(624,288)`. *Fat texels (2-3 px) + noise as texture (random streak columns) + smooth light gradient (the orange lamp pool).* Code: `z1alley.ts z1CorrugatedTile` (128 x 64), `z1ColdStorageSign`, `z1RollerDoor` (102 x 108), `z1BulkheadLamp` (14 x 10), `pwStreet.ts coldStorage()`. **Treatment:** three 8 x 4.6 m modules at 64: corrugation drawn as FORM (6-texel ribs: highlight, mid, core shadow, reflected step), sheet laps every metre with bolt heads and rust runs under each bolt, one dented sheet, a splash-dirt band at kick height, the roller door (205 x 218) with slat rhythm, guide rails, a padlocked hasp, chevrons on the bottom rail and a readable NO PARKING / LOADING DOCK stencil, a bulkhead lamp in a cage with its pool PAINTED as three stepped rings on wall and floor, conduit with junction boxes, the MILLBROOK COLD STORAGE lettering at 64 in faded block capitals with one sheet replaced (letter missing). **M.**

9. **Crates and explosive drums next to the camera.** `b09d (80,120)-(260,250)` (26 x 26-texel crates, 3 px texels, dark outline box: the Minecraft crate), `b11a (560,200)-(624,288)` and `b10 (415,210)-(455,265)` (drum, 6 px texels). *Textured box + fat texels.* Code: `pwProps.ts 'crate'` -> `z1props.ts paintCrate`; `pixel.ts skinGasProp('drum')` -> `pwDiner.ts cylinder` -> `z1alley.ts paintDrum` (64 x 32) `/ paintDrumLid` (22 x 22). **Treatment:** crates at 96 (86 x 86, three variants): separate boards with see-through gaps (cut-out), corner irons, rope handle, a stencil (MILLBROOK COLD STORAGE / KEEP FROZEN), a torn waybill; one crate burst open (splintered-board card plus straw), a tarp over the stack and a hand truck leaning on it (cards) so the stack has no square outline. Drum at 96 (208 x 88 wrap + 64 x 64 lid): rolled hoops shaded as hoops, the FLAMMABLE diamond drawn at 96, dents, a drip from the bung, rain pooled on the lid; it stays saturated red and readable as "shoot me". **S.**

10. **The overturned school bus is a yellow slab.** `b20a (350,105)-(590,190)`, `b19 (300,120)-(450,175)`. *Textured box + straight silhouette:* a clean rectangle with SCHOOL BUS on it; the rear end and roof pass the camera at 2-3 m. Code: `props.ts schoolBus()` -> `pwBus.ts Z1Bus.emit` -> `z1bus.ts paintRoof` (308 x 80) `/ paintSide / paintRear / paintDoor / paintNose`. **Treatment:** roof module at 96 (928 x 240): roof ribs every 0.6 m as raised form, two escape hatches (one hanging open: card), marker lamps, a strobe dome, the lettering on a painted panel, long scrape gouges to bare metal along the edge it slid on, mud and a cracked seam; rounded roof-to-side corner painted as a highlight roll; break the outline: the uppermost wheels and axle as profile cards above the body line, a buckled side panel peeling away, the stop-arm sticking up, the front crushed into the shop with fallen masonry cards, broken glass and a schoolbag, a shoe, loose papers on the road in front; rear end at 96 with the door opening dark, a hanging emergency-door hinge, hand smears. Same extents as the occluder box. **M.**

11. **The diner front is a stack of horizontal bars.** `b04 (0,60)-(200,220)`, `b03b (60,30)-(210,170)`, `b05a (0,60)-(140,180)`. *Textured boxes + straight silhouette:* kick panel, stripe, checker band, header are each a box with a wrap tile; under the windows a row of black rectangles reads as Lego studs; the interior back wall is a flat tan plane. Code: `town.ts buildDiner` -> `pwDiner.ts Z1Diner.convert` -> `z1diner.ts paintFlute / paintStripe / paintCheckerBand / paintPanel / paintWall / paintBackbar`. **Treatment:** the 18 x 4.4 m front as ONE painting (576 x 144 at 32) with the pane openings cut out: streamline stainless with sunburst panels under the windows, a rolled roof coping carrying the pink and cyan tube lines, a quarter-round glass-block corner (end-cap cards), a porthole door with a push bar, two steps and a rail, window lettering (COFFEE - PIE - OPEN 24 HRS), the street's neon reflected in the steel as broken colour bands; interior at real depth (zombies walk in it): back wall as one painting 576 x 128 (pass window with a heat lamp, pie case, coffee urns, menu board, clock, a calendar, a blood hand-smear), booth backs and stools as profile cards, a slumped body in booth 3, plates left on tables, a jukebox; roof silhouette: sign scaffold truss, two exhaust stacks, a duct. **L.**

12. **Gas-station canopy, pillars and soffit.** `b14 (100,30)-(420,170)`, `b15 (60,100)-(370,200)`, `b13b (0,60)-(210,180)`. *Textured box + straight silhouette + smooth 3D light gradient + blob noise:* a white slab on four white sticks, a soft specular blob under it, and when it buckles its top is a camouflage of dark blobs with fat texels. Code: `town.ts` canopy boxes -> `pwStreet.ts canopy() / pillar() / price()` -> `z1alley.ts paintFascia / paintBand / paintSoffit / paintRoofTop / paintPillar / paintLogo / paintPrice`. **Treatment:** fascia as a painted light-box band with a readable GAS & GO logo (letters at least 5 px tall at 15 m) and a drawn lower lip with drip stains; soffit as a ribbed deck with 12 recessed troffers painted as GLOW rectangles with a stepped halo (no specular: the blob goes), one dead, one flickering (anim); pillars as steel posts with a base shoe, a hazard collar, a number plate and a squeegee bucket (the dressing in the static zone batch, not on the scaling pillar); a clearance bar hanging off the street edge; on the roof a sign mast and vent stubs (cards); the roof deck seen after the collapse: standing-seam metal with puddles and a torn membrane edge. **M.**

13. **Flat facade fields and "pepper" brick.** `b05a (440,0)-(624,200)` (a green wall of one tone), `b12 (480,60)-(624,200)`, `b13b (505,0)-(624,200)`, `b25 (200,40)-(420,175)` (PRIME MEATS brick is per-pixel noise), `b01a (0,0)-(40,200)`. *Flat empty plane + speckle noise as texture:* at 10 m the 11 x 4-texel bricks land on 9 x 3 px and alias into red-on-blue pepper; render and panel walls are one tone with a streak under a sill. Code: `pixel.ts facade() / wallTile()` -> `surfaces.ts paintBrick`, `z1walls.ts paintZ1Plaster` (128 x 128) `/ paintZ1Panel` (192 x 96) `/ z1WallBands / paintStreaks / paintHoles`. **Treatment:** four 256 x 256 wraps at 32 painted for a 10 m view: brick as COURSES, not bricks (3-texel courses, bed joints as broken step-darker lines, perpends only inside 6-20-brick clusters picked out where paint has flaked or light falls; no per-brick random tone), render with large value structure (a dithered band darker to the foot and under the cornice, trowel patches, a hairline crack with a lit lip, a repaired rectangle), panels with joints, tie holes and rust weeps; then DRESS by rule from a sheet (W7): per floor a string course with drip stains, per window a lintel with a keystone and a sill with a streak fan, between windows one of: downpipe with brackets and a cast shadow, cable with clips, flagpole bracket, vent grille with a soot plume, a taped notice, a meter box, a bird-spiked ledge; one "event" per building (open window with a blowing curtain, a knotted-sheet rope out of a window, a HELP US bedsheet, a body over a sill, a TV-flicker window). **L.**

14. **Stone pilasters and jambs = block columns.** `b01a (0,0)-(130,200)`, `b08 (350,90)-(380,170)`, `b09a (55,70)-(85,180)` and `(500,60)-(520,175)`, `b17b (90,80)-(110,170)`. *Textured box:* every building corner is a 0.45 m column of half-metre grey blocks with dark outlines (`stoneTile` blocks are 32 x 16 texels = 1 x 0.5 m): Minecraft stone bricks, on every corner of the street. Code: `props.ts building()` pilaster boxes with `M.trimLight / trimDark` -> `pixel.ts` overrides -> `surfaces.ts stoneTile` (64 x 64); shop jambs `pixel.ts facade()`. **Treatment:** a `z1Pilaster` module set (16 x 148 ground storey, 16 x 104 upper repeat, capital 24 x 24 as a cut-out wider than the shaft): rusticated base course, panelled or fluted shaft with a lit left edge and a shadow right edge, a capital under the cornice; quoins where used are 0.3 x 0.2 m alternating long / short with a chamfer highlight and no outline grid; shop jambs painted in the shop's own colour with a bell push or a number plate. **M.**

15. **Barricade, ROAD CLOSED board, tape.** `b01a (120,125)-(260,215)`, `b00 (30,135)-(280,200)`. *Fat texels (2 px at 4 m, 5 px as the boards pass at 1.2-1.5 m) + straight boxes (the tape is a ruler line).* Code: `props.ts sawhorse()` -> `pwProps.ts 'sawhorse'` -> `z1props.ts paintSawFront` (78 x 38) `/ paintSawEnd`; `z1alley.ts paintRoadClosed` (80 x 19) `/ paintTape` (96 x 16); `pwStreet.ts`. **Treatment:** at 128: A-frame cut-out 308 x 154 (bolted legs, two boards with reflective diagonals, scuffs, a POLICE DEPT stencil, a battery flasher hung on one: 2-frame blink), end card 80 x 154, ROAD CLOSED 328 x 77 (enamel, rivets, mud splash, a sticker), tape as a sagging cut-out curve with a loose tail (4-frame flutter). **S.**

16. **Sidewalk slabs and kerb.** `b11b (390,190)-(624,288)` (the corner slab the rail walks over: one grey plate), `b04 (0,170)-(260,250)`. *Flat empty plane + fat texels (kerb tile 64 x 16) + knife edges.* Code: `town.ts sidewalk()` boxes -> `pixel.ts` overrides -> `surfaces.ts sidewalkTile` (160 x 160) `/ curbTile`. **Treatment:** 224 x 512 at 64 (3.5 x 8 m, two variants): 0.9 m flags with broken corners and one heaved by a tree root, tree-pit grates, a cellar hatch in diamond plate, coal-hole covers, gum, butts, utility paint marks, water running to the kerb; kerb as individual granite kerbstones (16 x 512 strip) with a chipped arris, yellow paint remnants, storm inlets; a splash / AO band where the wall meets the walk. **M.**

17. **Crushed-black shapes: burnt car, police cruisers, bin bags.** `b05b (330,110)-(470,200)` (a black slab on a box), `b13a (380,130)-(600,210)` (the cruiser is a black block with a POLICE strip), `b10 (205,200)-(265,235)`, `b11a (150,165)-(235,225)`. *Muddy colour / grey-black shadow + textured box.* 11-31 % of the lower half of every frame is below the luminance of #14122a. Code: `z1cars.ts` burnt set and `paintHex = 0x18191f` for police in `pwCars.ts`; `z1alley.ts paintBags`. **Treatment:** burnt shell as a profile with see-through window holes, seat frames and springs inside (cards), sagged roof, buckled hood card, tyres burnt to the rims, ash greys and rust oranges in MID values, ember dots (GLOW, anim), a painted scorch ring and glass on the road; cruiser two-tone with real form (white doors and roof, blue-black hood whose lit facets reach tone 3), star decal, push bar, spotlight, the open doors as profile cards; bags in a blue-black ramp, tones 1-4, with knot ears and a wet highlight, at 96. **M** (rides on offender 2).

18. **Light as blended discs.** `b12 (470,60)-(624,200)` (a pink wash with a smooth gradient over a whole wall), `b07a (150,180)-(420,260)` (headlight cone: smooth gradient on the road), `b05a (0,150)-(160,250)` (magenta wash), `b05c (60,0)-(150,180)` and `b07c (385,60)-(430,130)` (lamp shafts in fat checker dither), `b14 (215,85)-(275,105)` (soffit blob). *Smooth 3D light gradient + checker dither of fat texels + colours outside any ramp.* Code: `vfx.ts LightPools.buildPixel` + `pixel.ts pwPoolTexture` (256 texels over up to 14 m = 5 cm texels), `vfx.ts LightBeams.buildPixel`, `WetReflections`, `town.ts pools.add / addWall`. **Treatment:** with ramp-step lighting (bible 5) drop every `addWall` splash in PIXEL WORLD and paint the neon spill INTO the front it lands on (2-3 stepped rings, tinted tones); ground pools become painted decals at 64 (stepped rings with a hand-wobbled edge and broken-dash reflections inside them) under each fixed source, flicker left to the stage light; lamp shafts as a 3-step cut-out cone, 1-px dither only on its two edges; wet reflections as vertical broken-streak columns at 64. **M** (depends on the foundation).

19. **Puddles read as holes.** `b13a (140,200)-(350,288)`, `b20a (120,225)-(360,288)`, `b22 (330,230)-(540,288)`, `b09b (30,225)-(120,265)`. *Fat texels (edge steps 2-3 px) + muddy:* black or flat-blue blobs with a hard stepped outline. Code: `z1ground.ts paintDecals` (sheet 288 x 128 at 32: puddleA / B / C, oil, pothole…), scaled 0.8-1.3 in `pwGround.ts replaceTagged`. **Treatment:** the decal sheet at 64 (768 x 512, about 50 decals); puddles long and lobed along the wheel tracks and gutters, body one step darker than the road, the nearest sign's colour mirrored in broken dashes, a thin lit far rim, and a 4-frame rain-ring strip over them. **M** (slice 1).

20. **Repeated shop bays, and shop windows louder than the enemies.** `b11b (100,90)-(420,180)` (the POLICE lobby is the same bay four times), `b14 (45,120)-(245,160)` (the store bay three times), `b08 (365,95)-(610,165)` (pharmacy shelves as RGB confetti on a near-white floor, exactly where the walkers stand). *Visible tile repeat + violates "the game reads first".* Code: `z1shops.ts paintPolice / paintLitBay / paintLaundry`, `z1alley.ts paintStore`, laid with `uScale` in `pixel.ts facade()`. **Treatment:** every lit front one painting the full width of the shop (list in section 3, W2), no bay used twice; pharmacy: floor to tone 4, stock grouped in blocks by shelf with shadows under each shelf, a counter and register, a toppled rack, a spilled pill carousel, one blood drag; police: desk and counter, WANTED board, flag, bench, one bullet-starred pane, a dead tube. Keep the lower half of each lit window (y 135-180 on screen) two steps under the enemies' brightest tone. **L** (slice 3).

21. **PRIME MEATS front.** `b25 (200,40)-(420,175)`, `b23b (210,80)-(370,180)`. *Speckle noise as texture + muddy:* noise brick, windows that are red speckle fields, an unreadable valance, everything one saturated red at the same value as the boss's blood. Code: `town.ts` PRIME MEATS block -> `pwSquare.ts` -> `z1square.ts paintMeatWindow` (134 x 77) `/ paintDoorway / paintMeatDoor / paintAwning / paintValance / paintButcherTiles / paintCleaver`. **Treatment:** the 16 x 8.5 m front as one painting (512 x 272 at 32): white glazed-tile stall risers with a red band, two cold-room windows painted at 64 (269 x 154): three carcasses each as shaded forms on hooks from a rail, sawdust, a scale, a price fan, condensation running in streaks (not dots), a hand print; the doorway painted at 64 as a deep tiled corridor to a plastic-strip curtain with a chain hoist; awning as a sagging profile with a lettered scalloped valance (PRIME MEATS - EST. 1931) readable at 20 m; a pig-shaped hanging sign and the cleaver blade as silhouettes; upper storey darker and cooler so the boss (grey-green, orange discs) is the lightest thing between x 210 and 420. **M.**

22. **Awnings are striped slabs.** `b05a (465,70)-(624,120)`, `b11c (0,55)-(270,125)`, `b25 (0,60)-(210,120)`, `b00 (0,70)-(110,100)`. *Textured box + straight edges.* Code: `props.ts building()` awning box and valance box -> `pixel.ts facade()` -> `facade.ts awningTile / valanceTile`. **Treatment:** awning as a short profile sweep (wall rail, sagging canvas between three frames, front bar), the canvas painted with fold shadows and pooled rain, side triangles as cut-out cards, a scalloped valance cut-out lettered with the shop name, wall arms; two torn ones (a hanging flap card that sways, 4 frames), drips off the front edge (anim). **M.**

23. **Gas forecourt, cross street and T-junction are empty planes.** `b14 (0,150)-(624,288)`, `b06 (150,150)-(600,200)`, `b11b (0,150)-(624,288)`. *Flat empty plane.* Code: `town.ts plane(26, 36, 'concrete' …)`, `plane(130, 14 …)`. **Treatment:** forecourt: concrete bays with expansion joints, oil-dark pump lanes, painted arrows and NO SMOKING, a slot drain, a rainbow fuel spill leading from a dropped nozzle to the drums (story and a hint), tyre marks; intersection core as its own 896 x 896 module at 64 (stop bars, worn crosswalk bars with tyre scuffs, a patched trench, tram-rail scars); T-junction: a faded KEEP CLEAR box in front of the police station. **M** (slice 1 / 4).

24. **Dumpsters.** `b09c (285,140)-(355,185)`, `b11a (200,140)-(270,195)`. *Textured box.* Code: `props.ts dumpster()` -> `pwStreet.ts dumpBody / dumpLid` -> `z1alley.ts paintDumpster` (70 x 40). **Treatment:** at 96, a profile (sloped front, fork pockets, lid ribs) with the lid propped open as a card, bags and a mattress spilling over the rim, company stencil, rust at the seams, a cat silhouette that blinks (2 frames). **S.**

25. **Courthouse, tower and west shop row at the square's edge.** `b20c (430,0)-(624,160)` (a wall of half-metre grey blocks), `b21 (0,30)-(130,230)` (the bookshop's brick wall as giant bricks at 6 m). *Textured box + visible repeat.* Code: `z1square.ts paintAshlar` (64 x 64) `/ paintColumn / paintCourtWindow / paintFrieze / paintShopWindow`, `pwProps.ts 'pediment'`. **Treatment:** courthouse as one far painting at 16 texels a metre (576 x 176): channelled ashlar suggested by broken lines, a portico with drawn fluting and shadowed intercolumniation, steps, sandbags and a "RELIEF CENTER" banner, tall windows with one lit; tower with louvres and a clock stopped at 8:05. West row as one 20 m front (640 x 138): BOOKS window with a toppled display, TOYS dark with one wind-up toy lit. **M.**

26. **Lit upper windows repeat one silhouette.** `b02 (95,20)-(125,65)`, `b09b (130,60)-(160,110)` and `(400,20)-(600,150)`, `b11b (230,25)-(400,95)`. *Visible tile repeat.* Code: `facade.ts windowModule / paintWindow` (48 x 68, kinds warm / dim / tv / ghoul / blinds). **Treatment:** z1-own window set, 10 lit variants (lamp and curtain, half blind, a figure pounding the glass: 2 frames, TV flicker: 4 frames, plant and cat, cracked pane with a blood hand, boarded from inside, candle), each with a drawn sash, reveal shadow and a sill with a streak. **S.**

27. **The moon's halo is a bullseye.** `b12 (165,20)-(265,105)`, `b17a (190,10)-(280,90)`. *Flat discs:* four concentric flat violet discs 100 px across, ring-shaped. Code: `z1sky.ts paintSky`. **Treatment:** two halo steps at most, broken by drawn cloud wisps with lit edges; more cloud form and a few sodium-lit undersides near the townline. **S.**

28. **Telegraph look-alikes in the set.** `h21 (150,120)-(250,150)`: the NEWS board's frame is the telegraph ring's yellow, directly under the spitter's ring; `h25 (205,85)-(235,110)` and `(490,90)-(520,110)`: the square's globe lamps are bright warm discs the size and hue of the boss's orange weak points. Code: `town.ts boardSign('NEWS', C.neonYellow …)`, `z1props.ts paintGlobe`, `pwProps.ts 'sqLamp'`. **Treatment:** NEWS in cream on dark green with a thin green frame; globes as pale blue-white milk glass, two tones, in an ornate cast bracket with a visible cap and finial (not a clean disc), a step dimmer than any weak point. **S.**

29. **Explosion dust and smoke in fat checker dither.** `b15 (60,150)-(120,185)` and `(310,150)-(345,190)`. *Checker dither made of fat texels.* Code: `z3fx.ts z3PuffTile` used by `pixel.ts convertDyn`, `vfx.ts pwPuffTexture`, the engine's dust FX. **Treatment:** puff frames redrawn with solid stepped lobes at screen density (no 50 % checker), 2-3 tones a puff. **S** (shared FX: coordinate with z3).

30. **Hanging signal, bus shelter, news boxes, mailbox as small boxes.** `b06 (300,0)-(325,30)`, `b17b (400,125)-(435,160)`, `b01b (140,125)-(160,155)`. *Textured box.* Code: `town.ts` traffic light boxes, `pwStreet.ts part()` (`newsBox`, `mailbox`, `adPanel`), `z1alley.ts paintNewsBox` (16 x 30) `/ paintMailbox` (16 x 24). **Treatment:** signal head as a cut-out with three visors on a sagging span wire with a street-name blade; news boxes with a window showing the front page and a coin head; mailbox with a rounded top profile; shelter with a route map and a cracked ad panel. **S.**

31. **A screen-door over every surface.** Visible in every crop (for example `b20b (0,130)-(280,288)`): an ordered-dither mesh over flat areas from the monitor pass's colour reduction. *Checker dither over whole walls.* Foundation's job (palette-true output, bible 6), listed so the painter does not chase it; re-check after the foundation lands.

32. **Bug: the SLOW road legend is flipped.** `b05c (20,230)-(190,265)`: the letters run left to right but upside down for the player walking north. Code: `pwGround.ts dress()` `put('slow', -3, …, CROSS_Z0 + 16, 0, 2.4, 1.2)` with `decal()`'s v axis. Bake the legend into intersection module G2 the right way up and drop the decal. **S.**

33. **FLORA street props at 64 px a metre near the camera.** `b01a (120,190)-(150,260)` (cones at 1.5-3 m, 2.7-5 px texels), `b11a (455,180)-(520,230)`. *Fat texels.* Code: `content/pixel/floraProps.ts STREET_PROPS` (cone 32 x 40, hydrant 40 x 48, trash can 48 x 64), shared with PIXEL CAST. **Treatment:** only if a PIXEL WORLD-own species set is allowed (see RISKS): the barricade's cones and the alley's fire can at double resolution. **S, optional.**

---

## 3. DENSITY MAP

Distances are worked from `layout.ts RAIL`, `town.ts` and the 1.62 m eye. "Today" = the first pass's
tiles (all at 32 texels a metre). Texels are level 0; memory is 2 bytes a texel x 1.33 for levels.

### Ground

| class | nearest normal view | tier | today | new tile(s) | new texels |
|---|---|---|---|---|---|
| G1 carriageways (Main, Second, cross arms) | 3.3 m (bottom rows) | 64 | `z1asphalt` 256 x 256, planar | road modules A / B / C 768 x 512 | 1,179,648 |
| G2 intersection core | 3.3 m (beat 7 walks through it) | 64 | same tile | 896 x 896 unique | 802,816 |
| G3 alley floor | 3.3 m | 64 | same tile | 448 x 768 (setts, centre gutter) | 344,064 |
| G4 sidewalks + kerb | 3.3 m where the rail crosses them (alley mouth, Second St corner), 6.2 m in the turn-holds | 64 | `sidewalk` 160 x 160, `curb` 64 x 16 | 2 x 224 x 512 + 16 x 512 | 237,568 |
| G5 square paving + boss apron | 3.3 m; apron 12-20 m | 64 / 32 | `z1flags` 256 x 256 | 512 x 512 + apron 512 x 256 | 393,216 |
| G6 gas forecourt | 9.5-35 m | 32 | generic concrete | 256 x 256 wrap + 512 x 256 forecourt sheet | 196,608 |
| G7 ground decal sheet (puddles, covers, litter, blood, legends) | 3.3 m | 64 | `z1decals` 288 x 128 | 768 x 512 | 393,216 |
| G8 base ground between and behind buildings | 20 m and more | 32 | `z1asphalt` | kept (old tile) | 65,536 |

### Walls and fronts

| class | nearest normal view | tier | today | new tile(s) | new texels |
|---|---|---|---|---|---|
| W1 upper-storey wall fields (Main / Second St facade lines 9.5 m from the rail) | 9.5-12.4 m | 32 | `brick` 176 x 128 (x 2), `z1plaster` 128 x 128, `z1panel` 192 x 96, 48-row bands | 4 wraps 256 x 256 + 8 bands 256 x 48 | 360,448 |
| W2 ground-floor fronts | 9.5-10 m (perpendicular in the diner / pharmacy / rescue holds) | 32 | 18 bays 128 x 112, doors 40 x 92 | 14 hero fronts (RIALTO, PHARMACY, LIQUOR, LAUNDRY, PAWN, BAR, HOTEL, POLICE, MOTEL, GAS & GO store, BOOKS / TOYS, GRAND HOTEL, BANK, CAFE: about 300 m x 148 rows) + 6 generic dark fronts 384 x 148 | 1,761,792 |
| W3 side-wall murals (intersection, gas block, Second St) | 12-25 m | 32 | `z1ghost` 192 x 96 x 3, `z1billboard` | 4 x 288 x 192 | 221,184 |
| W4 alley-mouth corner wall | 1.2 m (1.57 m at the frame edge) | 128 | wall wraps + `stone` 64 x 64 | 512 x 416 unique | 212,992 |
| W5 alley walls, ground band | 3.5 m (4.6 m at the frame edge) | 64 | `brick`, `z1corr` 128 x 64, `z1rollerdoor` 102 x 108 | 5 modules 512 x 296 | 757,760 |
| W6 window and door modules | 9.5 m and more | 32 | 48 x 68 and 40 x 92 modules | 24 windows, 8 doors, 3 anim strips 48 x 272 | 146,944 |
| W7 wall dressing sheets (meters, vents, cables, notices, brackets) | 9.5 m; alley 3.5 m | 32 + 64 | posters 24 x 32, AC 28 x 22, pipe | 512 x 256 at 32 + 512 x 256 at 64 | 262,144 |
| W8 roofline kit (tanks, stacks, aerials, bulkheads, billboard frames) | 15 m and more | 32 | pediments 128 x 48, aerial, vent, pots | 512 x 256 | 131,072 |
| W9 awning profile set | 9.5 m | 32 | `awning`, `valance` | 3 x 128 x 64 (neutral, tinted) | 24,576 |
| W10 signs (neon boards, blades, marquee: fine as they are) + kiosk boards | 9.5 m; kiosk boards 2.8 m | 32; 96 | about 250 k | kept + 4 x 192 x 58 at 96 | 294,544 |

### Vehicles, props, set pieces

| class | nearest normal view | tier | today | new tile(s) | new texels |
|---|---|---|---|---|---|
| V1 parked cars (near side 3.5 m off the rail) | 4.6 m; teal sedan 2 m, pink wagon 2.9 m | 64; 96 for those two | side 144 x 20, top 58 x 144, wheel 24 x 24 … (about 42 k) | 5 profiles 288 x 96, 2 hero sides 432 x 144, 3 tops 116 x 288, 6 noses / tails 116 x 64, wheels, glass, shadow | 440,224 |
| V2 school bus | roof 15 m down to 3 m, rear end about 2 m | 96 roof / rear / door, 64 the rest | roof 308 x 80, side 308 x 68, rear 80 x 68, door 61 x 61 | roof 928 x 240, rear 240 x 208, door 184 x 184, side 616 x 136, nose / under | 450,272 |
| S1 diner | 9.5-12 m | 32 | flute 80 x 48, wall 64 x 128, backbar 320 x 45 … | front 576 x 144, back wall 576 x 128, booth / stool / jukebox cards, roof truss 320 x 96, 3 anim strips | 259,680 |
| S2 barricade, ROAD CLOSED, tape | 1.2-1.5 m | 128 | 78 x 38, 20 x 38, 80 x 19, 96 x 16 | 308 x 154, 80 x 154, 328 x 77, 384 x 24, flasher strip | 95,248 |
| S3 alley props (dumpsters, crates, bags, drums, cards) | 2-2.6 m | 96 | 70 x 40, 26 x 26, 64 x 36, 64 x 32 | see offenders 9, 17, 24 | 155,324 |
| S4 gas station (canopy, soffit, pillars, pumps, cage, price sign) | 12-35 m | 32 | about 60 k | about 150 k | 150,000 |
| S5 kiosks | 2.8-3.4 m | 96 | wall 64 x 64, bills 128 x 48, hatch 61 x 32 | 4 faces about 278 x 250, fascia, bundles | 270,000 |
| S6 bandstand | 6 m | 64 | post 21 x 90, balustrade 77 x 26, shingles 64 x 32 | doubled | 100,000 |
| S7 PRIME MEATS | 20.5 m (boss), 36 m (square) | 32 front; 64 doorway, doors, windows | 134 x 77, 102 x 109, 50 x 102, 448 x 16 | front 512 x 272, windows 269 x 154, doorway 205 x 218, doors 100 x 205, awning, signs | 303,600 |
| S8 courthouse and tower | 32-40 m | 16 | ashlar 64 x 64, windows 45 x 77, frieze 448 x 26 | 576 x 176 + 96 x 320 + clock 64 x 64 | 136,192 |
| S9 square furniture, street hardware | 5.5-12 m | 32 | about 40 k | about 100 k | 100,000 |
| F1 reflection, rain-ring, steam, paper, drip strips | 3.3 m | 64 | none | about 74 k | 73,728 |

### Total

- New world paint: **10.32 M texels** = 26.2 MB (2 B x 1.33).
- First-pass tiles not listed above (about 0.2 M texels: small generic metal / planks / roof tiles) left on
  the pipeline's 2x store: 0.86 M texels = 2.2 MB.
- Sky 2048 x 368, one level: 1.4 MB. Fire strips 256 x 448: 0.3 MB.
- **Stage total about 30 MB of the 48 MB budget: it fits, with 18 MB spare.** (The whole first pass
  at the 2x fallback alone would be 19.9 MB.) Nothing HAS to stay on the fallback for memory.
- The binding limit is PAINT TIME, not memory: the first pass painted 1.79 M texels in about 190 ms
  (9.4 M texels a second on the test box); 10.3 M texels at that rate is about 1.1 s plus the sky,
  against the 1.2 s budget. If the measured cold paint runs over, give back in this order (each is
  invisible at its distance): S8 courthouse stays on the fallback (-0.14 M), W2 generic fronts share 3
  paintings instead of 6 (-0.17 M), road variant C dropped (-0.39 M), W1 wraps back to 192 x 192
  (-0.11 M), S4 gas station stays on the fallback (-0.15 M). Never give back G1-G3, V1, W4, W5, S5.
- One 4096 x 4096 atlas holds 16.7 M texels (`PwAtlas` `maxSize` 4096): 10.3 M + fallback fits in one,
  so draw calls do not change. The 928-wide bus roof and 896 intersection module must stay under 4096.

---

## 4. SCENE BY SCENE (what a Metal Slug / 3rd Strike background artist would paint here)

Animation loops: standardise on 4-frame strips at 8 fps (one animated material a zone = one extra
draw call a zone); on / off blinks stay the stage's existing `blinkers`.

**A. The police barricade (beats 0-2).** *Story:* the cordon failed from the inside. A coffee cup and a
clipboard on a cruiser's hood, a shotgun dropped by an open door, spent shells and a hat on the road, a
riot shield leaning on a sawhorse, a body bag half-zipped on the HOTEL side kerb, flares burnt to stubs,
EVACUATION ROUTE arrow sign on a tripod, tyre tracks through the tape, a bloody drag from the gap
toward the HOTEL door. *Light:* the tripod floodlight throws a cold pale-blue fan north along the
left lane (3 stepped rings, hard-edged), red and blue from the light bars painted as two stepped
patches on the nearest wall and on the wet road under each car, flicking with the bars; the HOTEL
blade's red on its own wall. *Silhouette:* cruiser light bars and aerials, the floodlight head, the
ROAD CLOSED board's top, HOTEL blade, pawnbroker's balls, a flag over the barber's. *Loops:* light-bar
alternation (exists), flasher lamp on a sawhorse, tape tail flutter, a cruiser's wiper still going,
steam from a radiator. *Remove:* the 60 random paper rectangles as flat quads (replace with 6 drawn
litter decals), cone clones in a row (vary: two knocked over). *Calm:* the lane centre x 230-370.

**B. Main Street south (beats 2-3): CAFE, LAUNDRY, RIALTO.** *Story:* LAUNDRY with machines still
turning and a basket spilled on the walk; CAFE with chairs stacked inside and one table laid; the
RIALTO lobby: ticket booth with a slumped clerk, velvet ropes down, popcorn spilled down the steps,
poster cases (one smashed), LAST SHOW TONIGHT with two letters fallen and lying on the marquee's
lip; a newspaper box knocked over with pages plastered to the wet road; a pram on its side. *Light:*
the marquee is the scene's key: warm bulb light in 3 rings on the walk and a broken warm column on
the road; cyan from the laundry; sodium cones every 32 m. *Silhouette:* RIALTO blade and its finial,
the marquee's wedge prow (not a box), fire escape, a water tank, utility poles with transformer
drums and sagging wires. *Loops:* marquee chase (exists), one washing machine drum turning, a
flickering letter on the blade, drip line off the marquee edge, a page blowing along the gutter.
*Remove:* the black marquee box underside (paint a bulb grid), the ticket booth box. *Calm:* road.

**C. The diner (beat 4).** *Story:* mid-meal panic: a body slumped in the third booth, plates and a
tipped milkshake, a stool knocked flat, blood hand-smear inside pane 1, a waitress's order pad on the
counter, the pie case intact, the jukebox still lit, a pickup's keys on the counter, the door wedged by
a shoe. Outside: a bubblegum machine, a newspaper box (headline readable), a bike on its side, a menu
sandwich board. *Light:* the interior is one warm rectangle; paint its spill as a warm trapezoid per
pane on the walk (2 steps) and a broken column on the road; pink and cyan from the roof sign on the
coping and the wet kerb. *Silhouette:* sign scaffold truss, stacks, duct, the EAT blade's arrow head.
*Loops:* the buzzing r (exists), ceiling fan, jukebox bubble tubes, steam off the urn, a fly-zapper
flicker. *Remove:* the black rectangle row under the windows, the flat tan back wall. *Calm:* the
back-wall band behind the zombies (y 120-165): low-contrast tiles only; no bright objects there.

**D. Burning car block (beat 5): boarded shop, LIQUOR, shutters, BAR.** *Story:* LIQUOR looted:
shelves gapped, a smashed pane with a trolley through it, bottles in the gutter, a hand-written
NO CASH sign; boards with sprayed counts (DEAD INSIDE, a tally, an arrow); the burnt car with a second
one nosed into it and a hydrant knocked and spraying; a suitcase burst open. *Light:* the fire is the
key: orange in 3 rings on the road and up the nearest two fronts (painted warm tone shifts on the
LIQUOR front's left third), embers; LIQUOR red on its walk; BAR pink ahead. *Silhouette:* smoke column
(exists), billboard on the roof at the corner with a torn sheet flapping, BAR blade and martini.
*Loops:* flames (exist), ember dots on the shell, hydrant spray, billboard flap, martini neon step.
*Remove:* BONZ-sized graffiti on every boarded bay (one piece a wall, plus a pasted notice). *Calm:*
both lanes; the fire's rings stop at 2 m radius on the left lane.

**E. The intersection (beats 6-7).** *Story:* a collision frozen: the pink wagon across the lane
with its door open and a grocery bag spilled, skid marks into it, a fallen signal-control box
sparking at the corner, a city bus-stop pole bent, a motorcycle on its side in the cross street, a
row of abandoned shopping bags. Corner walls carry the big painted adverts. *Light:* the wagon's
headlights as two hard stepped trapezoids on the road (not a gradient), the amber blinker
alternately tinting a 3 m patch under it, far cross-street lamps as small sodium cones in the fog.
*Silhouette:* signal on its span wire, corner street-name blades, roof tanks and a billboard frame
on both corner blocks, far steeple down the cross street. *Loops:* amber blink (exists), sparks at
the control box, wagon's hazard lamp, a traffic-signal WALK hand flashing, steam from a manhole
(placed at the FAR side of the junction). *Remove:* nothing; this scene is empty. *Calm:* THE ROAD
x 150-480, y 125-200 is where crawlers rise: keep module G2's centre in tones 2-4, legends and
crosswalk bars worn to tone 4 at most, no white.

**F. Pharmacy block (beats 7-9).** *Story:* a queue that broke: a dropped crutch, a wheelchair on
its side on the walk, prescriptions blowing, an ambulance gurney at the kerb, CLOSED - NO MEDICINE
taped inside the door, the green cross with one arm dead; GUNS shuttered with a ram-raid dent and a
SOLD OUT board. *Light:* green from the sign and the window as a 2-step trapezoid on the walk and a
broken green column on the road; keep it off the lane centre. *Silhouette:* the cross blade, tank
roof left, fire escape right, pole and transformer. *Loops:* cross buzz (exists), a dead-tube
flicker inside, the pharmacy's rotating mortar sign, papers. *Remove:* confetti shelving. *Calm:*
the lower half of the window and the walk in front of it (enemies stand there).

**G. The alley (beats 9-11).** *Story:* a back way people fled through: a mattress and bedding
dragged out, a shopping trolley of tins, a barricade of pallets pushed aside, a dropped torch still
on (throws a small cone along the floor), paw prints, a rat on a pipe, steel door with claw gouges
and "THEY BITE", the loading dock with a pallet jack and a spilled crate of frozen fish, a rope of
knotted sheets from a fire escape, a chalk tally by the door. *Light:* three caged bulbs with painted
warm rings on wall and floor, the trash-can fire's orange up the corrugated wall (painted warm shift
on module 2), the cold blue of the police station at the end; the sky slot stays the darkest band.
*Silhouette:* fire-escape platforms and ladders (cut-outs, exist: add hanging washing, a pot plant,
a satellite dish), wires across the slot, a pigeon row, the dumpster's open lid. *Loops:* fire in
the can (exists), a bulb flicker, a drip from the fire escape with a ring in a puddle, steam from a
wall vent, the cat's eyes blinking. *Remove:* the second and third copies of the same crate, the
straight conduit drawn from a rotated drainpipe. *Calm:* undersides of both fire escapes (droppers
appear there: paint them as plain dark slats, nothing light behind), the floor centre.

**H. Second Street, the police station (beats 11-13).** *Story:* the station tried to hold: sandbags
at the door, a patrol-car door used as a shield, evidence boxes spilled on the steps, a notice board
of MISSING photos on the wall beside the door (rain-curled), a wrecked cruiser against a hydrant with
its siren speaker hanging; the boarded shop sprayed with a body count; MOTEL with NO VACANCY lit.
*Light:* blue door lamps (2 stepped rings each on the wall), the lobby's cold white through four
different windows, the crashed cruiser's bar flicking red / blue on the pink wall as hard patches
(replaces the pink gradient wash), sodium cones. *Silhouette:* the station's flagpole and aerial
mast, MOTEL blade, a tank, the fire escape, the price pylon of the gas station ahead. *Loops:* light
bar (exists), NO VACANCY letter buzz, flag in the rain, a lobby tube flicker, hydrant dribble.
*Remove:* the four identical bays. *Calm:* the cruiser's flank and the wall strip behind the cop
(x 380-470, y 125-190): mid-dark, no posters there.

**I. The gas station (beats 13-17).** *Story:* a car at pump 2 with the nozzle still in and the
driver's door open, a jerrycan queue (five cans in a line), a hand-written LAST FUEL - CASH ONLY board,
an ice chest, a tyre rack, air and water tower, a payphone off the hook, the propane cage with a
BLUE FLAME placard, a fuel rainbow running from pump 2 to the drums, a delivery van behind the store
(cut-out at 30 m). Store: cigarette and lottery posters, a cashier's window, a mop bucket. *Light:*
the canopy's troffers give the stage's one big PALE pool: paint the forecourt under it two steps
lighter than the lot (stepped rectangle with a dithered skirt) so the dark zombies silhouette
against it; the store window as a cold strip; the price pylon's red and green. After the blast:
the fires' rings and a warm shift on the store front. *Silhouette:* price pylon, canopy mast and
vent stubs, the store's roof sign, the brick block's tank and billboard frame, a tall lot lamp.
*Loops:* one troffer flicker, price digits glitching, a moth swarm at a lamp (4 dots), pump display
blink, after the blast: flames (exist) and dripping burning fuel off the canopy edge. *Remove:* the
soffit specular blob, the camouflage roof top. *Calm:* the forecourt slab x 180-370, y 135-170: flat
pale concrete with joints only; drums stay the only saturated red there.

**J. The bus (beats 17-20).** *Story:* it ploughed into the corner shop: masonry and a shop sign on
its nose, a child's backpack, lunch boxes, a single trainer, homework sheets stuck to the wet road,
long gouges in the asphalt leading to it (bake into the road at that spot as decals), a STOP arm bent
up, hand prints on the inside of the windows, the driver's cap. The teal sedan beside it has its
boot open with suitcases. *Light:* the engine fire's orange on the shop wall and the bus's front
third (painted warm shift), the roof warning lamps alternating (exist), a sodium cone on the roof
panel's left end. *Silhouette:* upper wheels and axle above the body line, the stop arm, the hanging
hatch, the shop's broken parapet behind, smoke. *Loops:* warning lamps (exist), engine fire
(exists), a wheel still slowly turning (4 frames), a dangling wire sparking, papers. *Remove:*
nothing. *Calm:* the roof panel between the two hatches (runners leap off its top edge: keep the
top 0.3 m of the panel and the sky above plain).

**K. The town square (beats 20-23).** *Story:* a relief point that was overrun: a Red Cross folding
table and cots under the bandstand, a water bowser, stacked ration boxes, a notice board of evacuee
lists at the news kiosk, headlines (EXTRA: DEAD WALK, CURFEW 8 PM), a toppled coffee urn and paper
cups, string lights half torn down and trailing on the paving, the war memorial with a wreath, a
bicycle rack, an abandoned ambulance by the fountain (cut-out at 22 m), cones round an open
manhole. *Light:* string bulbs as tiny warm points (no pools), kiosk hatches as warm trapezoids on
the paving, globe lamps as pale 2-ring pools, PRIME MEATS red far ahead (the only red). *Silhouette:*
bandstand cupola and weathervane, kiosk stove pipes, the courthouse pediment and clock tower, the
hotel's roof sign, bare plane trees (cut-out branches, not blobs), the memorial soldier. *Loops:*
string lights swaying (2-frame shimmer), a kiosk magazine page flapping, fountain trickle, clock
tower's lit face with a dead quadrant flicker, steam from the coffee kiosk's vent. *Remove:* the
giant-slab paving, the box kiosks, the yellow NEWS frame. *Calm:* the wall and sky directly behind
each kiosk roof (x 150-280, y 40-130 and x 420-540, y 30-125 in the hold): plain dark wall, no lit
window, no ring; the path between the kiosks.

**L. PRIME MEATS, the boss arena (beats 23-25).** *Story:* a butcher's that kept working: a delivery
trolley with a covered load by the door, a hose still running, drag marks from the square's edge
to the doorway, a stack of bloodied crates, a chalk board TODAY: PRIME CUTS, hooks on a rail through
the windows, a meat van (the red car re-cast as a panel van profile) with its rear doors open,
BANK next door with its night-deposit lit and an ATM out of order, a bench with a newspaper. *Light:*
red from the sign and doorway as 3 stepped rings on the apron (pulsing with `bossLight`), red rim on
the awning's underside; everything else cool blue so the red marks the threat. *Silhouette:* the pig
sign and cleaver blade, awning sag, two roof ventilator cowls (exist as tanks: redraw), BANK's
flagpole, the GRAND HOTEL's stepped parapet. *Loops:* PRIME MEATS letter buzz, the hose's water
fan, a swinging hook in the left window, door crack light pulse before the burst (exists as
`bossLight`), awning drip. *Remove:* speckle windows and speckle brick, the two warm globe discs
(recolour, offender 28), saturated red on the parked car (make it oxblood, tone 2-3). *Calm:* the
doorway and the front x 210-420 two steps darker than the boss; paving centre plain.

---

## 5. SLICES AND AUDIT SHOTS

Five slices of similar effort. Each writes its painters in its OWN new file(s) so two painters never
edit the same painter file; `stages/z1/pixel.ts` is the shared hub (each slice edits only the block
named).

| slice | beats | what | files | shots |
|---|---|---|---|---|
| **1. Ground and wet light** | all | G1-G8 road modules, intersection, alley floor, sidewalks, kerbs, square paving + apron, decal sheet, puddles, reflections, painted pools, lane paint removal (offenders 1, 5, 16, 18, 19, 23, 32) | new `pixelworld/z1road.ts`; `pixelworld/z1ground.ts` (decals, paving); `stages/z1/pwGround.ts`; `stages/z1/vfx.ts` (pools / beams / reflections, PIXEL WORLD branches only); `pixel.ts` constructor overrides + `asphalt()`; `env.ts` base ground and pool build lines | `z1:2:150`, `z1:6:150`, `z1:7:300`, `z1:11:300`, `z1:21:150`, `z1:25:240` |
| **2. Vehicles and near props** | 0-3, 5-7, 9-13, 17-20, 25 | profile cars (5 styles + 2 hero), burnt shell, cruisers, school bus, barricade / ROAD CLOSED / tape, crates, drums, dumpsters, bags (offenders 2, 9, 10, 15, 17, 24) | new `pixelworld/z1vehicles.ts`, new `pixelworld/z1near.ts`; `stages/z1/pwCars.ts`, `pwBus.ts`; the sawhorse / crate cases of `pwProps.ts`; the dumpster / bags / ROAD CLOSED / tape cases of `pwStreet.ts`; `pixel.ts skinGasProp` | `z1:1:90`, `z1:7:90`, `z1:5:300`, `z1:13:90`, `z1:19:150`, `z1:20:300`, `z1:9:760` |
| **3. Street walls and shop fronts** | 0-9, 11-13, 17 | W1 wall wraps, courses-not-bricks, pilasters, W2 fronts (14 hero + 6 generic), windows, awnings, dressing sheet, light painted into fronts (offenders 13, 14, 20, 22, 26) | new `pixelworld/z1fronts.ts`, new `pixelworld/z1wallkit.ts`; `pixelworld/z1walls.ts`, `z1shops.ts`; `pixel.ts facade() / wallTile() / cornice()` | `z1:0:120`, `z1:3:300`, `z1:5:90`, `z1:8:150`, `z1:11:300`, `z1:12:150` |
| **4. Alley, blank blocks, gas station** | 6-7, 9-11, 13-17 | W4 corner wall, W5 alley modules, cold storage, side-wall murals and roofline kit on every block, gas canopy / store / forecourt dressing, street hardware, moon and FX puffs (offenders 3, 4, 7, 8, 12, 27, 29, 30) | new `pixelworld/z1alleywalls.ts`, new `pixelworld/z1roofkit.ts`; `pixelworld/z1alley.ts` (gas + hardware painters), `z1facade.ts`, `z1sky.ts`; `stages/z1/pwStreet.ts` (wall / coldStorage / canopy / pillar / price), `pwFacade.ts` (sides / crown) | `z1:9:560`, `z1:10:150`, `z1:11:90`, `z1:6:150`, `z1:14:150`, `z1:15:60`, `z1:17:90` |
| **5. Diner, town square, boss arena** | 3-5, 20-25 | diner front + interior + roof, kiosks, bandstand, PRIME MEATS, courthouse, west shop row, square lamps and furniture, telegraph look-alikes (offenders 6, 11, 21, 25, 28) | `pixelworld/z1diner.ts`, `z1square.ts`, `z1props.ts` (square furniture); `stages/z1/pwDiner.ts`, `pwSquare.ts`, the bench / sqLamp / fountain / plinth / pediment cases of `pwProps.ts` | `z1:4:150`, `z1:4:420` hud, `z1:21:150`, `z1:21:330` hud, `z1:23:90`, `z1:25:240`, `z1:25:600` hud |

Order: slice 1 first if only one painter is free (it changes 40 % of every frame); slices 2-5 are
independent of each other. Slices 2 and 5 both touch `pwProps.ts` (different `case` blocks) and slices
2 and 4 both touch `pwStreet.ts` (different `case` blocks): merge by block.

**Audit shots (6):**

1. `z1:2:150:first-contact`: near ground in a hold, street walls at 10 m, a parked car at 4 m.
2. `z1:9:560:alley-mouth`: the wall at 1.2 m (worst texel in the stage), dumpster, alley floor.
3. `z1:10:150:alley`: near walls at 3.5 m both sides, near props, fire escapes (run again with `--noauto --hud` at 300 frames for the droppers).
4. `z1:20:300:teal-sedan`: a vehicle at 2 m filling a third of the frame, the crosswalk, the square beyond.
5. `z1:4:150:diner`: the interior seen through glass, neon, enemies in front of a lit room.
6. `z1:25:240:butcher`: the boss arena: paving, PRIME MEATS, boss readability (and `z1:25:600` with `--noauto --hud`).

Reserve: `z1:14:150:gas` (far set piece, small dark enemies against the forecourt) and `z1:21:330` with
`--noauto --hud` (spitter telegraph against the kiosk roofs).

---

## 6. RISKS AND CONSTRAINTS

**Gameplay geometry that must keep its shape**
- Occluders (`town.ts occ()`, invisible boxes, untouched by PixelWorld): the facade rows, both alley
  walls, the bus body (11.4 x 2.4 x 2.8 m, yaw 0.38). Painted silhouette pieces may stick out of them
  visually but bullets stop on the old boxes: keep new cards within about 0.3 m of the occluder faces
  where enemies stand behind / beside them (bus top edge, alley walls), or shots will appear to hit air.
- Kiosk roofs are walkable ground (`layout.ts ROOF_PADS`, y = 3.0 m) and `env.ts kioskCollide` pushes
  ground zombies 0.75 m clear of the footprint: roof plane, height and footprint stay exactly; roof
  dressing only on the far (north) edge and no taller than 0.3 m in front of where spitters stand;
  canvas flaps and props stay inside the 0.75 m margin.
- The diner interior is real space: zombies spawn inside (local x -11 to -14.5 from the rail) and
  burst through panes 2 and 4, which are `GlassPane` destructibles drawn in the classic material. The
  front painting must be CUT OUT at all four pane openings and the door; interior dressing goes on
  the back / side walls or as cards at their true depth, never on the window plane; nothing new may
  stand in the two burst lanes (pane 2 and 4, 3.15 m wide each) between the booths and the glass.
- Destructibles keep their classic meshes as hit boxes with an undrawn material (`pixel.ts
  skinGasProp`): pumps, propane cage, 6 + 3 drums. Painted skins must stay within the hit volume
  (drum r 0.33 x 0.9 m, pump 0.85 x 1.75 x 0.55 m) or shots on the paint miss. Drums stay saturated red.
- PRIME MEATS: the two door leaves are animated groups that fly off (`setpieces.ts BurstDoors`), the
  boss spawns 1.5 m behind the facade plane in the doorway: door leaves stay two flat 1.55 x 3.2 m
  panels; the doorway painting must read as depth but nothing may be modelled in front of z = -304.
- Bus: the body group rocks (`BusWreck.bang`) and the emergency door is a separate group that flies
  (`blowDoor`): every bus card must be emitted into the body group's local frame (`pwBus.ts emit`),
  the door stays one panel; runners use the rear opening and leap from y = 2.6 m on its top edge.
- Gas canopy rotates 0.32 rad about its west edge and the pillars are scaled in y to crumple
  (`GasStation.update`): pillar art must survive non-uniform scale (no cards parented to pillars);
  under-canopy dressing lower than the fallen roof: height limit about 5.2 - 0.33 x (x + 82) - 0.4 m
  (1.8 m at x = -73, 1.2 m at x = -71); no new vehicle east of x = -72.5 under it. The canopy's
  under-lights and price glow are switched off by the script: painted GLOW troffers must sit in the
  same group that gets hidden (`gas.underGlow`), or they stay lit after the blast.
- Fires, light bars, blinkers, the diner's r, the pharmacy cross and the marquee chase are driven by
  `env.ts update`: keep those objects and their visibility toggles; paint around them.

**Identity and tests**
- Rule 8 stands: CLASSIC / PIXEL CAST build byte-identically, occluders, `groundAt`, and the world RNG
  are identical in both styles (`tests/unit/pixel-world*.test.ts`, the simulator identity test). All
  new dressing positions come from `hash2` or fixed tables, never `rng`; no new meshes in the classic
  builders, only `userData` tags.
- Trees, hydrants, trash cans and cones are FLORA sprites shared with PIXEL CAST
  (`content/pixel/floraProps.ts`, about 64 px a metre): repainting them changes PIXEL CAST. Offender 33
  needs a PIXEL WORLD-own species set or stays as it is.
- `facade.ts`, `surfaces.ts`, `signs.ts`, `interior.ts`, `props.ts` and `z3fx.ts` are shared with
  other stages: z1 work goes into z1-own painters (the new files above); do not change shared tile
  keys or sizes (other stages' atlases and their budget tests depend on them).

**Density plumbing**
- Most emitters size quads as `tile.w / PW_TPM` (`pwStreet.ts`, `pwSquare.ts`, `pwProps.ts`,
  `pwDiner.ts`, `pwFacade.ts crossed()`, `pwGround.ts decal()`, `pixel.ts` sign / poster / hole code),
  and several pass texel offsets (`u0`, `v0`, `sub: { x, y, w, h }`, `Z1_DECALS`, `Z1_WEAR`, the car
  door's `{ x: 42, w: 34 }`): every one of these assumes 32 texels a metre. A tile raised to 64 / 96 /
  128 must have its emitter switched to `tile.density` and its sub-rects rescaled, or it draws at 2-4x
  size. `pwCars.ts wheel()` hard-codes `* 32`; `pwDiner.ts cylinder()` uses `PW_TPM`.
- Roads are mapped by world-space planar projection today (`retexture … { world }`); the cross-section
  module needs explicit `b.rect` per street plane and the lane-paint boxes dropped from the retexture
  (they are tagged by material: `M.yellowPaint`, `M.whitePaint`).
- Wrap tiles must be multiples of 16; a module seen from 3 m to 60 m (road) needs calm coarse levels:
  check the hand-made levels of G1-G3 in motion (dash rows can crawl), and keep joints at least
  2 texels wide at level 0 so they survive level 1.

**Performance**
- Today: 20-63 draw calls, 15-38 k triangles; one PixelWorld mesh a zone. Cut-out cards cost
  triangles, not draws: budget about +6 k triangles for profiles (10 cars x about 120 quads), cards
  and roof kit; fine. Animated strips need the animated material: one extra draw a zone IF every
  loop shares frames x fps (4 x 8); a second strip format doubles it. Peak would be about 70 calls.
- Paint time is the tight budget (section 3). Big ground modules must be painted with row / span
  fills; `smooth()` and `cells()` per texel over 0.4-0.8 M texels will blow 1.2 s: evaluate them on a
  quarter-size grid. Measure with `PW_PROF=z1`.
- Cut-outs are alpha-tested (class 0), so no sorting; but a profile car's see-through arches show the
  ground behind: the contact-shadow decal must be there or cars float.

**Readability (bible 2.7)**
- Enemies stand on the carriageway centre in nine of ten holds, in front of the pharmacy window, on
  the pale forecourt, on the kiosk roofs and in the PRIME MEATS doorway (table 1). Those are the
  places a painter most wants to decorate: keep them the calmest paint in each scene. Check every
  hold with `--noauto --hud` after repainting (h-shots above).
- Telegraph rings are yellow or white circles of 35-45 px radius, weak points are orange discs: no
  yellow frames, warm globes, clock faces or ring-shaped halos within about 60 px of where they
  appear (kiosk roofs, the doorway, the lane centre).
- Night floor: 11-31 % of the lower half of today's frames is under #14122a (car bodies, puddles,
  bags, shadows). Repainted tiles should bottom out at ramp tone 0 = about #14122a; verify with the
  audit once ramp-step lighting is in (the flashlight spot and the fire / accent point lights will
  now move whole tone steps across near walls: check the alley for band edges that pop).
- Beat 16 loaded directly shows the station intact (the chain-reaction action did not run): judge the
  inferno on `z1:15:60` … `z1:15:150`.
