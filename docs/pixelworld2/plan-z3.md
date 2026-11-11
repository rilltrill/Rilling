# z3 HIGHWAY TO HELL — PIXEL WORLD 2 repaint work-list (scout report)

Read-only scouting of the first-pass look (reference dev server :5791, HEAD 9c65dd9). Nothing in the repo was
changed. Everything here lives under `/tmp/pw2/scout/z3/`:

- `frames/*.png` — 40 art frames (624 × 288, every frame pixel 3 × 3, no CRT). `b<beat><a-d>-…` = autoplay,
  `h<beat>-…` = `--noauto --hud` (enemies, rings, pickups, HUD).
- `sheet.png` — one art frame per beat, labelled. `sheet-all.png` — every captured instant.
- `work/crops1.png`, `work/crops2.png`, `work/c-*.png` — enlarged crops of the worst offenders.
- `work/atlas-a.png`, `work/atlas-b.png` — the world atlas as painted today (×2), `tiles.txt` — all 240 tiles with sizes.
- `stats-1…6.json` — capture stats (draw calls, triangles, atlas bytes).

Conventions: crop boxes are `[x0,y0,x1,y1]` in ART pixels of the 624 × 288 frame (× 3 in the PNG). Distances are
from the eye (drive rig: eye 2.05 m above the rail, vertical FOV 58°, so the bottom frame row meets the road
4.0 m away and the middle-80 % boundary at 4.7 m; a thing at lateral offset `x` enters the middle 80 % of the
frame at ≈ 1.44 · |x| m). `px/texel = 260 / (density × distance)`; the first pass is 32 texels a metre.

**The verdict in one paragraph.** The sky, the smoke and the flame strips are the only parts of this stage a
2005 arcade artist would sign. Everything else is the thing the owner rejected: low-poly boxes with a small tile
on each face. The stage has only FIVE classes of surface that ever come nearer than 6 m — the road, the
pickup and gun, cars in the adjacent lanes, the things we drive through (tank halves, tanker cab, barricade,
gate) and the pile-up's police cruiser — and those are where the fat texels are (2–5 px each). The rest of the
stage is never nearer than 8–60 m, where 32 texels a metre is already sub-pixel: there the failure is NOT
density, it is boxes, straight silhouettes, empty planes, one small tile repeated, crushed black (the tunnel
ceiling is 56–80 % pure `#000000`) and a single red-brown mud (`#5a2910`-ish) over asphalt, scrub, concrete and
walls alike. Repainting the same boxes at a higher density would fail a fourth time. The plan below is mostly
about shapes, pictures and dressing; density is a small, cheap part of it.

---

## 1. BEATS

18 beats (`src/content/stages/z3/index.ts`). Shot spec = `stage:beat:frames:label` for `scripts/pixel-world.mjs`
(`--modes pixel --retro pixel --vw 624 --vh 288 --dsf 3`). "Calm zone" = where enemies, civilians, pickups and
telegraph rings appear on screen (art px): the background there must stay mid-contrast, no pale discs, no
ring-shaped highlights, no bright saturated clusters.

| # | label (kind) | rail d | scene | best shots | calm zone (art px, 624 × 288) |
|---|---|---|---|---|---|
| 0 | title (banner 3.2 s; look BACK, yaw 172°, pitch +5°) | 0 | The burning city behind the truck: start apron road, jersey median, box tenements either side, skyline panel, smoke | `z3:0:120:b00-title` | Banner text over the middle; nothing spawns. First impression of the stage: must be a painting. |
| 1 | leaving the city (move, 11 m/s) | 0 → 146 | Outskirts: suburb houses far left, gas station + pole sign right (d 54–72), utility line right, first warehouses, scattered wrecks | `z3:1:90:b01a-city`, `z3:1:300:b01b-city`, `z3:1:600:b01c-city` | Runners leap aboard from both flanks and from behind: both bottom corners `[0,180,110,288]` `[510,180,624,288]`; roadside walkers in our lanes 25–29 m ahead `[250,135,380,172]`; points pickup high centre-right. |
| 2 | pile-up (hold) | 146 | Every lane blocked: police cruiser 3 m off the left bumper, 7 wrecks (2 burning), a car on its roof, the red blocker car across the middle lane, jack-knifed semi + FRESH FOODS trailer on the oncoming lanes, 6 flares, warehouses right | `z3:2:120:b02-pileup`; HUD: `--noauto --hud z3:2:300:h02-pileup` | Walkers / crawlers among the wrecks `[225,120,380,225]`; wave 2 comes over from the oncoming lanes in front of the semi and trailer `[60,105,165,172]`; the riot brute vaults the cruiser and lands centre-left, huge `[190,90,340,288]` (head ring ≈ (265,130)); pack runners at both bottom corners; civilian runs in on the right shoulder `[460,105,505,188]` (HELP bubble above); bomb pickup ≈ (205,115). |
| 3 | ram through (move, 13 m/s) | 146 → 226 | The blocker car is shoved aside (tween), we thread the wrecks at 3–4 m, sound wall starts on the right (d 182–252), house left | `z3:3:60:b03a-ram`, `z3:3:240:b03b-ram` | Bottom corners (pack aboard); right flank runner `[430,150,560,230]`. |
| 4 | overpass approach (move, 5 m/s; look UP at the deck) | 226 → 244 | The overpass fills the frame; spitters on the deck edge; a car smashes through the parapet and explodes on the road (set piece) | `z3:4:90:b04a-ovapp`, `z3:4:200:b04b-ovapp` | The deck railing / fascia band, full width `[0,105,624,150]` and the sky just above it (spitter silhouettes); the wreck + explosion `[170,150,260,215]`. |
| 5 | ambush from the deck (hold; pitch ≈ +5°) | 244 | Under-view of the deck 18–30 m ahead, BRIDGE 3 MI sign, burning bus on the deck, sound wall + NO WAY OUT right, house left | `z3:5:120:b05-deck` | Walkers and runners DROP from the deck: `[140,75,450,190]` (in front of fascia, soffit shade and the road beyond); deck spitter at the right end ≈ (455,80); health pickup ≈ (150,55) against the sky. |
| 6 | under the overpass (hold) | 244 | Same place, camera level | `z3:6:120:b06-under`; HUD: `z3:6:240:h06-under` (rings on screen) | Rings: white Ø 100 at (222,195), yellow Ø 160 at (408,193) → the whole road band `[130,110,520,275]`; walkers under the deck `[270,135,350,165]`; runners over the median `[95,150,130,200]` and the right rail; more drops from the deck. The burning wreck `[185,140,255,180]` sits at the edge of the ring zone: do not brighten it. |
| 7 | billboard alley (move, 14 m/s) | 244 → 432 | Open desert: BURGER BARN (left), REPENT (right, towering over the shoulder), burning MOTEL board, the motel (far right), gantry at d 432, wrecks in the next lane | `z3:7:90:b07a-bill`, `z3:7:300:b07b-bill`, `z3:7:520:b07c-bill`, `z3:7:740:b07d-bill` | Bottom corners (runners aboard); walkers / crawlers in our lanes ahead `[230,140,400,200]`; health pickup high left. |
| 8 | tanker (hold) | 432 | Overturned tanker across the lanes 15 m ahead (the shoot target), cab on its side right, fuel slick, flares, the ridge and portal behind, gantry overhead | `z3:8:120:b08-tanker`; HUD: `z3:8:300:h08-tanker` | The TANK `[163,122,375,172]` must stay the cleanest read on screen (prompt SHOOT THE TANKER! over y 180–205); walkers round the cab `[375,135,400,178]`, from the left `[60,130,190,178]`, centre `[240,140,330,215]`; brute vaults the median → centre-left; health pickup ≈ (490,120). |
| 9 | tanker blast (wait 1.4 s) | 432 | Explosion; the two halves fly apart and land (one in our right lane) | `z3:9:40:b09-blast` | — (FX only) |
| 10 | into the tunnel (move, 15 m/s) | 432 → 590 | Past the halves and the cab (4–6 m), the ROUTE 9 portal + rock flanks, then the bore | `z3:10:90:b10a-tun` (loaded here the tank is still whole), `z3:10:330:b10b-tun`, `z3:10:520:b10c-tun` | Runners from both flanks; crawlers DROP from the ceiling `[230,10,400,210]`; pack from behind. |
| 11 | stalled in the tunnel (hold; power flickers out, headlights) | 590 | Mid-bore: two tiled walls, ceiling, the exit glow 62 m ahead | `z3:11:120:b11a-stall`, `z3:11:420:b11b-stall`; HUD: `z3:11:360:h11-stall` | The far end + exit glow `[240,110,360,170]` (walkers silhouette against it); the road `[150,130,480,270]`; nurse civilian cowers at the right wall foot `[485,160,520,205]`; brute leaps from the left wall foot `[60,130,200,200]`; crawlers from the ceiling; bomb pickup ≈ (232,112). |
| 12 | bridge approach (move, 16 m/s) | 590 → 760 | Out of the bore, 70 m of scrub, onto the suspension bridge; tower A grows from a salmon silhouette | `z3:12:90:b12a-brapp`, `z3:12:300:b12b-brapp`, `z3:12:450:b12c-brapp`, `z3:12:600:b12d-brapp` | Bottom corners; soldier walkers in our lanes after the exit `[240,140,400,210]`. |
| 13 | army barricade (hold) | 760 | Chain-link gate + sandbags + jersey blocks 14 m ahead between tower A's legs, floodlight towers, army truck left, fire left, bay right | `z3:13:120:b13-barricade`; HUD: `z3:13:300:h13-barricade` | Soldiers in front of gate and sandbags `[220,135,410,205]`; from the far left in front of the army truck `[0,105,150,182]`; spitters `[215,128,242,162]` `[395,128,422,162]`; two brutes over the LEFT sandbags → centre; cop civilian right shoulder `[560,168,602,222]`; pickups ≈ (247,122) (432,130). |
| 14 | smash the gate (move, 7 m/s) | 760 → 776 | Through the gate: panels fly aside; sandbags / jersey blocks pass at 3.6–4 m | `z3:14:60:b14a-gate`, `z3:14:150:b14b-gate` | — |
| 15 | something big (wait 1.6 s) | 776 | Between the tower legs; BEHIND YOU! | `z3:15:60:b15-big` | — |
| 16 | THE BEHEMOTH (boss; look BACK, yaw 180°, pitch +7°; truck rolls to d 1112) | 776 → 1112 | Looking back down the deck: the giant 20–27 m behind, tower A, railings, the burning skyline panel + ridge panel, red beacon light on the road | `z3:16:240:b16a-boss`, `z3:16:900:b16b-boss`, `z3:16:2400:b16c-boss` (death cam) | The giant `[230,60,400,205]`; weak point (glowing chest) ≈ (300,95); thrown cars / slabs fly at the camera through `[150,20,480,160]`; lamp-post club swings across mid-frame; shockwave ring on the deck; tail runner from the left; pickups `[290,110,335,132]`. Everything BEHIND the giant — skyline panel `[0,80,624,170]`, tower struts — must sit a clear step below the chest core. |
| 17 | escape (action 0.6 s, then the rig runs +90 m at 18 m/s; credits) | 1112 → ≈1176 | Forward again: main cable coming down to the deck, burnt wreck, SAFE ZONE gantry + searchlights | `z3:17:60:b17-escape` (also `z3:16:3600` once the giant is dead) | — |

Capture stats today (PIXEL WORLD, this box): draw calls 25–63 a frame (limit 250), triangles 18–50 k (≈ 48 k from
the alley to the tunnel), world atlas `z3` 2048 × 928 = 240 tiles, 1.36 M texels (9.7 MB RGBA with levels), sky
0.79 M texels (one level), fx 28 k, pickup 40 k (at 48 texels a metre).

---

## 2. OFFENDERS (ranked by how loudly each says "Minecraft / Roblox")

Format: **what** — where — anti-pattern — code — TREATMENT — effort.

### 1. Cars: flat-shaded boxes with a decal on each face, 3–4 m from the lens
- Where: every outdoor beat. `b02` police cruiser `[0,150,225,288]` (crop `work/c-b02-police.png`); `b03a`
  sedans `[100,150,225,288]`; `b07b` red sedan `[370,155,624,285]` (`work/c-b07b-redcar.png`); `b07c` teal van
  `[140,140,275,210]`; `b12b` purple sedan `[470,135,624,250]`; `b17` burnt pickup `[395,135,535,245]`.
- Anti-pattern: textured box + straight box silhouette + fat texels. Adjacent-lane wrecks pass at 3.4–4.1 m and
  the cruiser stands 2.5–4 m away through a 40 s hold: 2.0–3.3 px a texel (measured: POLICE strokes 2–3 px,
  windscreen checker dither in 3 px cells). Bonnet, roof, side and boot are each ONE flat tone (Lambert per
  face); wheel wells and the lower body crush to `#000000` (22 % of the cruiser's lower body is pure black); the
  wheel is a pale flat disc with five dots; the shadow is a 32 × 48 dither blob with fat cells.
- Code: `stages/z3/pwVehicles.ts` `Z3Vehicles.car` / `profileBody` (box body, chamfered ends, cut-out
  greenhouse); `pixelworld/z3cars.ts` `z3CarPaintSide`, `z3CarPaintTop`, `z3CarSideDetail`, `z3CarGlassSide`,
  `z3CarScreen`, `z3CarNose`, `z3CarTail`, `z3WheelFace`, `z3TyreTile`, `z3BumperTile`, `z3CarShadow`,
  `z3BurntShell`, `z3BurntSide`; set pieces through `pixel.ts` `dynCar`.
- TREATMENT (kill the box, bible §4.5 "extruded PROFILE"): per kind (sedan, hatch, SUV, van, police) and state
  (clean, burnt) paint THREE pictures at 64 texels a metre and build the car from them:
  (a) the SIDE as one cut-out painting of the whole car, 4.7 × 1.6 m → ≤ 304 × 104 texels: real profile (raked
  screen, C-pillar, boot step, bumper overhang, arches), door seams with a lit edge, handles, mirror, trim
  strip, a 3-step sky reflection running along the shoulder line, glass with two broken reflection bars and the
  silhouettes of seats / headrests / a slumped body, rocker shadow, tyres drawn INSIDE the arches (tread
  blocks, mid-grey five-spoke hubcap with dark gaps — never a pale full disc), mud splash behind each wheel;
  (b) the TOP as one unrolled strip nose → bonnet → screen → roof → rear screen → boot, 1.95 m × ≈ 6.4 m →
  128 × 410: bonnet crease and highlight band, cowl and wipers, cracked screen with the dusk in it, roof
  (roof-rack + strapped suitcases on one variant, light bar on the police car), boot with badge and plate;
  (c) NOSE and TAIL, 128 × 64 each: grille, lamps (glow texels when `lit`), bumper with plate, tow eye.
  Geometry: sweep the side profile (12–16 points) across the width with 0.12 m tumblehome above the belt line
  so roof, screen and bonnet are real slopes; wheels are painted in the side, plus an inset disc for the 3/4
  view. All light is painted (warm top, mid sides, violet under), tones 1–5; contact shadow = a stepped ellipse
  decal 128 × 192 at 64 with a dashed edge. Burnt = same profile with sagged roof, no glass, seat springs,
  ash / rust / primer mid-values (never black), white ash on the ground. Police cruiser facing the camera in
  beat 2: side at 96 (422 × 140). Silhouette test: filled flat black, each kind must still read as that car.
- Effort: L.

### 2. The tunnel: a box corridor with a crushed-black lid
- Where: `b10c`, `b11a`, `b11b`, `b12a`, `h11` (whole frame); ceiling `[130,0,500,110]`; wall-foot bands
  `[0,150,240,195]` `[400,150,624,195]`.
- Anti-pattern: flat empty planes + visible tile repeat + crushed black + muddy colour. Measured: ceiling 56 %
  (`b11a`) to 80 % (`b10c`) pure `#000000`; the wall-foot band is `#100808`; the wall is one 192 × 240 tile
  (6 × 7.5 m) of uniform enamel panels repeated 22 times a side with no fixture bigger than a 40 × 18 exit
  sign; lamps are small rectangles that light nothing; the oncoming bore beside it is a black rectangle.
  Density is NOT the problem (walls 10.7 / 12.7 m away, ceiling 11.7 m: 32 is right).
- Code: `stages/z3/pwStructures.ts` `tunnelSeg`, `fan`; `pixelworld/z3structures.ts` `z3TunnelWall`,
  `z3TunnelCeil`, `z3SosMarker`, `z3FanTile`, `z3FanEnd`; `pixelworld/z3roadside.ts` `z3TunnelLamp`;
  `pixelworld/z3bay.ts` `z3ExitSign`, `z3SosPhone`; `pixel.ts` cases `tseg`, `tlight`, `exit`, `phone`, `fan`;
  light in `env.ts` `Z3Scene.update` (hemi × 0.38, sun × 0.08 inside; `tunnelLights.visible` during the stall).
- TREATMENT: paint the tunnel as a place, at 32 texels a metre with big unique modules:
  walls = 5 unique panels 12 m × 7.4 m (384 × 240), laid in a fixed order L and R (flip for the far side):
  enamel panels with a value structure (darker toward the foot and the crown, a lighter band at lamp height),
  two missing panels showing dowelled concrete, water runs from every third joint with a lime bloom at the foot,
  soot fan above the crashed car's position, a cable tray at 5.6 m with sagging cable bundles and drop boxes, a
  hand rail, drain grating, and one NICHE per panel: fire cabinet with hose reel (red, glass smashed), SOS phone
  booth with a green lit sign, an escape door with a running-man lightbox and "EXIT 120 m →", an electrical
  cabinet hanging open, evacuation arrows stencilled every 12 m, taped MISSING posters, bloody hand-drags at
  shoulder height. Wall foot = a raised service WALKWAY as an extruded profile (kerb 0.9 m high, 1.0 m deep,
  visual only: inside the existing occluder proxy line) with a hazard-striped kerb edge, a railing cut-out and
  dropped luggage / a shoe / a wheelchair on it — it replaces the black band. Ceiling = 2 unique bays
  (384 × 256 wrap): precast segments with a shadow line every 6 m, conduit runs, lamp housings with a 2-ring
  painted halo, drip stalactites, jet fans on drawn brackets with safety chains. Under every lamp a painted
  3-ring sodium pool on the wall and an elongated one on the road. Darkest painted tone `#14122a`; the bore
  reads warm sodium ochre where lit and blue-violet between lamps. IMPORTANT: every lamp halo and pool goes
  into the LIGHTS group's batch (`tunnel.lights`, converted separately in `env.ts`) so the stall's flicker
  switches them off with `tunnelLights.visible`; with the power out the walls drop to the violet steps and the
  only light is the truck's headlight cone, two red emergency luminaires and the green exit signs.
- Effort: L.

### 3. The road: the lower third of every frame is stretched texels on a nearly empty plane
- Where: every frame, rows 170–288. `b07b` `[0,180,260,288]` (`work/c-b07b-road.png`), `b00` `[0,180,330,288]`.
- Anti-pattern: fat texels + speckle as texture + visible repeat + muddy colour. Lanes are 32 texels a metre:
  2.0 px wide × 1.0 px tall at the bottom row, 1.6 px at row 250, > 1.5 px below row ≈ 245 either side of the
  hood: single "aggregate" texels become 2–3 px horizontal dashes. The paint is base tone + 670 single chips +
  14 identical oil almonds + one saw-cut rectangle per 8 m, the same 256 × 256 tile (two lane variants) for
  1.2 km; lit asphalt comes out `#3a2921` brown, the same hue as scrub and concrete.
- Code: `stages/z3/pwRoad.ts` `Z3Road.lay` / `decals` / `decal`; `pixelworld/z3road.ts` `z3LaneTile` /
  `paintLane`, `z3ShoulderTile` / `paintShoulder`, `z3MedianTile`, `z3LineTile`, `z3SkidDecal`, `z3OilDecal`,
  `z3ScorchDecal`, `z3BloodDecal`, `z3DebrisDecal`, `z3PotholeDecal`, `z3SpillDecal`.
- TREATMENT: lanes natively at 64: four variants of 4 m × 16 m (256 × 1024 each) assigned per lane and stretch
  by hash so no two lanes repeat together. Passes: (a) violet-grey base (the lit result must stay violet: see
  Risks, light); (b) value structure: two tyre-polished wheel paths one step lighter with ragged dashed edges,
  a darker oil band down the centre, a paler dusty edge by the lines; (c) construction: transverse paving joints
  every 12 m with a tar bead (lit lip, shadow), longitudinal joint, one full-width repair band per tile, ghost
  lines of ground-off old markings; (d) wear as shapes of 4–20 texels with a light and a shadow side: alligator
  cracking in a wheel path, ravelled patches with exposed aggregate drawn as clustered pebbles (not chips),
  a pothole with broken edge and gravel fan, tar snakes with a glint dash, rubber build-up before the wrecks;
  (e) dressing by decal rule per stretch, at 64: tyre shreds ("gators"), a hubcap, broken glass fans (cyan-white
  1-texel glints, sparse), a suitcase burst open with clothes, loose paper sheets, a child's shoe, drag marks in
  blood, shell casings near the pile-up and barricade, oil with a rainbow rim, skid pairs that END at a wreck;
  (f) contact: an AO step along the jersey foot and under every wreck. Lines at 64 (32 × 640 dash, 32 × 256
  edges): worn thermoplastic with chipped ends, raised reflector studs every 12 m (amber on yellow, white on
  dashes: 2-texel glow). Shoulder + median stay at 32 (≥ 8 m) but become 3 m × 16 m with rumble strip, blown
  sand tongues, weeds in the joint, drain inlets every 36 m. Keep the centre of our three lanes calmer than the
  edges (rings sit there).
- Effort: L.

### 4. The pickup: a flat red plane that is on screen for the whole stage
- Where: bottom centre of every forward frame, e.g. `b13` `[180,225,460,288]` (`work/crops2.png` H).
- Anti-pattern: flat empty plane + fat texels on the player's own vehicle. 48 texels a metre at 2.0–4.3 m =
  2.7–1.3 px a texel; the hood is one red with a single orange diagonal; NOT TODAY is 2–3 px strokes, cut off
  by the light bar; the hazard tape is five fat parallelograms; mirrors are dark boxes with a pale blue slab.
- Code: `stages/z3/truck.ts` `TruckViewModel.buildBody` + `paintTruck` (own atlas `z3-truck`, 3 levels);
  `pixelworld/z3truck.ts` `z3TruckPaint`, `z3TruckHood`, `z3TruckRoof`, `z3TruckGlass`, `z3TruckBed`,
  `z3TruckHazard`, `z3TruckSteel`, `z3TruckTailgate` (`TRUCK_TPM = 48`).
- TREATMENT: whole pickup atlas at 128 (bible: the player's vehicle), ≈ 285 k texels. Hood 1.84 × 1.5 m =
  236 × 192: pressed centre bulge with a lit ridge and two stamped ribs, a sanded primer patch with feathered
  edge, three claw gouges to bare metal, bullet dents with a highlight crescent, a dried blood hand-smear, hood
  pins, washer jets, a front-edge highlight line and a dark seam to the fenders; NOT TODAY re-lettered as
  dripping spray paint that fits between light bar and nose. Roof 230 × 186: drip rails, CB aerial base, ammo
  box lashed down, spent brass in the gutter. Light bar: four amber lamps with lens ribs and a wiring loom;
  hazard tape with torn end and wrinkles. Windscreen: dusk reflection in 3 bands, a bullet star, wiper arcs in
  the dust. Mirrors as drawn shapes (housing, stalk, glass with a strip of sky). Bed (boss look-back):
  diamond-plate floor with scuffs, jerry can, olive ammo cans with stencils, spare tyre, tailgate lettering.
  The plow: welded plates with bead lines, rust blooms, gore. Replace the boxy fenders by a profile strip
  (wheel-arch flare) so the hood edge is not a straight box line.
- Effort: M.

### 5. Overpass: abutment walls, piers and deck are raw boxes with a small tile repeated
- Where: `b07a` `[440,40,624,200]` (`work/crops1.png` B: a 14 × 7.3 m flat wall and a 1.4 m pier with the same
  moss / poster specks repeated); `b05` fascia `[0,82,624,108]` (`work/crops1.png` F: the same stain group every
  4 m, 20 times); `b07a` soffit `[130,25,600,95]` (one blotch per 2 m bay); piers `b06` `[60,100,90,180]`.
- Anti-pattern: textured box + visible tile repeat + straight silhouette (an 80 m ruler-straight slab).
- Code: `stages/z3/pwStructures.ts` `overpass`; `pixelworld/z3structures.ts` `z3FasciaTile` (128 × 32),
  `z3SoffitTile` (64 × 64), `z3PierTile` (64 × 128), `z3RiprapTile` (64 × 64); railing `props.ts`
  `railingTile`; deck bus `pwTrucks.bus`.
- TREATMENT (32 texels a metre; nearest view 7.6–9 m): fascia = five unique 16 m modules (512 × 48):
  parapet cap with a lit top line, drip stains under every scupper, a rust halo at each bearing, one spalled
  patch with rebar, a bridge number plate, swallow nests; soffit = one 12 × 12 m bay (384 × 384): steel
  girders with stiffeners and diaphragms drawn in perspective-neutral elevation, a drain pipe, pigeon streaks,
  a dead luminaire, deep violet between girders (never black). Piers: hammerhead cap drawn with formwork lines
  and a shadow under the cap; shaft 2 variants (96 × 208): water-stained shoulders, a collision gouge with a
  hazard chevron board, layers of posters / spray tags, rebar rust. Abutment: replace the flat 14 × 7.3 m wall
  by a painted wing-wall module (448 × 240) with weep holes and stains + SLOPE PAVING (hexagon concrete setts,
  256 × 448 wrap) with a drainage chute, a shopping trolley, a tarp shelter and a burnt mattress under the
  deck. Silhouette pieces on the deck edge (cut-out cards, visual only, behind the spitters' feet line, top of
  railing stays open): a chain-link anti-throw cage in two torn spans, a bent light mast, a bedsheet banner
  "ALIVE INSIDE" hanging from the railing left of x = −12 (sway loop), crows on the far parapet. Keep the 12 m
  of railing above our lanes (x −6…+6) free of dressing: spitters and droppers stand there.
- Effort: M.

### 6. The tanker's cab lying on its side: a 6 × 2.5 m flat red box face, passed at 4–6 m
- Where: `b08` `[375,125,480,175]`, `b09` `[355,120,455,170]`, `b10a` `[405,115,624,235]`
  (`work/c-b10a-tanker.png`).
- Anti-pattern: textured box, flat plane with speckle, 1.4–2.0 px texels at the pass.
- Code: `stages/z3/scenery.ts` `buildTankerSite` → `pwTrucks.ts` `Z3Trucks.semi`; `pixelworld/z3trucks.ts`
  `z3SemiCabSide`, `z3SemiCabBack`, `z3Deflector`, `z3SemiHoodSide`, `z3SemiGrille`, `z3MarkerLamp`,
  `z3ChromeTile`.
- TREATMENT: because it lies on its side, the faces we see are its ROOF and its UNDERSIDE: paint those two as
  unique modules at 64 (410 × 192 each): underside = frame rails, prop shaft, twin fuel tanks (one split,
  dripping: 8-frame drip loop), air tanks, exhaust stack, both axles with the wheels end-on (tread, hub
  reduction), a mudflap hanging; roof = sleeper fairing, five marker lamps, air horns, a bent CB whip, the
  wind deflector crumpled. Cab as an extruded profile (sloped screen, bonnet, bumper), the door hanging open
  toward the sky with a boot on the sill, a smeared hand-print trail down the roof, diesel run-off joining the
  slick. Same profile kit repaints the blue pile-up cab (item 17).
- Effort: M.

### 7. The ridge: terraced "courses of bricks" — literally stairs of blocks
- Where: `b08` `[100,60,480,130]` (`work/crops2.png` G), `b10a` `[45,55,470,115]`, `b10b` `[490,0,624,180]`
  (`work/c-b10b-rock.png`: each bed is a row of rectangular blocks with vertical joints).
- Anti-pattern: textured boxes stacked in equal layers; horizontal tile grid; straight ledges.
- Code: `stages/z3/pwRock.ts` `craggyLump`; `pixelworld/z3structures.ts` `z3StrataTile` (128 × 128);
  `pixel.ts` cases `ridge`, `shore`; ledge plants `Z3PixelWorld.plant`.
- TREATMENT: keep the lumps as carriers but stop drawing masonry: (a) new strata tiles 2 × 256 × 256 with beds
  of UNEQUAL height (0.4–4 m), cross-bedding at a slight dip, vertical desert-varnish streaks, undercut
  shadows drawn as broken shapes, talus cones (scree drawn as graded pebbles) at the foot of gullies, no
  vertical joints at regular spacing; (b) `craggyLump`: vary bed heights 1 : 6, let two beds merge into one tall
  cliff band, slope the lowest third into a talus apron instead of a step, round the crown; (c) the flank right
  of the portal (15–25 m, in frame for 4 s): one unique painted face 640 × 320; (d) silhouette cards on the
  crown: balanced boulders, a dead juniper, a transmission pylon with a red beacon (blink loop), a triangulation
  post; (e) from the tanker hold (70–110 m) add two far mesa cut-out cards (512 × 160) behind the lumps so the
  horizon is a designed skyline, one step nearer the fog colour.
- Effort: M.

### 8. Tunnel portal: a 52 × 16 m flat concrete wall and a pure-black rectangle
- Where: `b10b` `[0,0,624,150]`; oncoming bore `[50,68,190,150]` (89 % `#000000`); from the tanker hold `b08`
  `[205,100,375,125]`.
- Anti-pattern: flat empty plane + speckle + crushed black + box silhouette.
- Code: `stages/z3/pwStructures.ts` `portal`; `pixelworld/z3structures.ts` `z3PortalTile` (128 × 128 wrap),
  `z3CastLetters`; `scenery.ts` `buildTunnel` (portal boxes, glow lamps stay classic).
- TREATMENT: one unique painting for our bore's surround (18 × 9 m, 576 × 288): board-formed concrete with
  form-tie holes in rows, a moulded arch lip (lit top, shadow under), rust weeping from each cast letter,
  louvred vent grilles, a height-limit board "4.2 m", a CCTV camera on a bracket, lane-control signals over each
  lane (red X / green arrow: 8-frame blink loop), an amber "TURN ON LIGHTS" flasher, sodium lamp pools painted
  on the wall beside each lamp; wings as a 256 × 256 wrap with the same language; the oncoming bore becomes a
  PAINTED interior (384 × 240, glow where lit): receding lamp dots, a jack-knifed lorry in silhouette with one
  hazard lamp blinking, wet floor streaks — dark violet, never black. Crown silhouette (cut-out cards along the
  top edge): dead brush, a chain-link rockfall fence with caught boulders, a crow.
- Effort: M.

### 9. Title: box tenements with a window grid (the first thing the player sees)
- Where: `b00` `[430,85,545,180]` (`work/crops1.png` A), `[60,120,230,175]`.
- Anti-pattern: textured box, flat faces (one olive-brown per face), straight parapet, 12 identical windows.
- Code: `stages/z3/scenery.ts` `buildStartApron` (blocks) → `pwBuildings.ts` `block`, `blockRoof`;
  `pixelworld/z3buildings.ts` `z3BrickTile` (64 × 32), `z3FireWindow`; `facade.ts` `windowModule`.
- TREATMENT: three façade paintings (12 m wide × up to 16 m, 384 × 512 at 32, or 192 × 256 at 16: they are never
  nearer than ≈ 33 m) chosen by hash: ground-floor shopfront with rolled shutters and a burning awning, fire
  escape zig-zag with a mattress on it, lit / burning / boarded windows with soot plumes, a collapsed corner
  with floor slabs showing, water stains under sills, a painted wall advert. Side face = a plainer brick wall
  with a ghost sign. ROOFLINE cut-out cards per block: water tank on legs, stair bulkhead, aerial forest, a
  billboard frame, roof fire (existing flame strips). Loops: two window flickers, one flapping curtain.
- Effort: M.

### 10. Empty scrub planes and empty oncoming lanes
- Where: `b07b` `[0,140,260,165]` `[430,140,624,172]`; `b08` `[0,135,160,160]` `[480,135,624,165]`; `b12c`
  `[420,145,624,170]`; the oncoming carriageway in every frame (left third).
- Anti-pattern: big empty planes with a few specks; one 128 × 128 tile world-projected for 500 m each side.
- Code: `pixel.ts` `Z3PixelWorld.ground`; `pixelworld/z3road.ts` `z3ScrubTile`; flora `env.ts` (`Z3_FLORA`:
  dead tree, bush, wide bush) via `scenery.ts` `scatterVerge`; cars `scatterCars`.
- TREATMENT: (a) scrub tile → 2 × 256 × 256: cracked-earth polygons with lit rims, pebble drifts, tufts as
  shaped clumps, tyre ruts; value bands (darker patches 20–40 m wide laid as large decals) so the plain has
  structure; (b) a fence line as cut-out cards both sides (x = +12 and −24): barbed wire on leaning posts,
  plastic bags caught on it (flutter loop), a section flattened by a car; (c) verge kit laid by hash per
  50 m chunk (never the world RNG): mile-marker posts, a culvert headwall with a dry wash (decal 256 × 128),
  tumbleweeds, an abandoned pram, cardboard signs ("NEED GAS"), a dead cow, pylons marching away (3 sizes of
  cut-out card), a water tower, a windmill pump (blade loop); (d) new FLORA species: yucca, creosote clump,
  prickly pear, dead cottonwood, sage — 5–6 m apart instead of 4–9 m one side at a time; (e) the oncoming
  lanes tell the evacuation: a frozen jam of profile-extruded cars with roof luggage, open doors, a school bus,
  an ambulance with its rear doors open (blink loop), all pointing toward the bridge; cheap (≥ 12 m, 32 texels a
  metre, shared car tiles).
- Effort: M.

### 11. Gas station: posts + slab + a grey box, and a shop window that renders as rainbow confetti
- Where: `b01b` `[440,88,624,165]`; window `[555,128,624,150]` (`work/crops1.png` C).
- Anti-pattern: textured boxes; noise (the `shopbay|liquor` goods minify to saturated 1-px confetti: the most
  saturated cluster in the frame, in a beat where runners board from that side).
- Code: `stages/z3/pwBuildings.ts` `gas`, `gasSign`; `pixelworld/z3buildings.ts` `z3CanopyFascia`,
  `z3PumpFront`, `z3GasSign`, `z3BrickTile`; `facade.ts` `shopfrontModule`.
- TREATMENT: shop front as ONE painting (12 × 4.5 m, 384 × 144): door propped by a body, ice chest, propane
  cage, newspaper box on its side, posters, lit interior as three calm warm bands with shelf silhouettes (no
  per-item colours), a flickering OPEN sign; canopy with brand stripe and fascia lettering GAS-N-GO, underside
  light panels (two dead, one buzzing loop) and a painted light pool on a concrete forecourt slab (256 × 192
  decal: oil stains, pump islands with kerbs, bollards); pumps as cut-out cards with hoses, one hose still in the
  burnt car's filler; price sign on the pole with missing digits; a tow truck silhouette behind; roof: AC unit,
  sign frame.
- Effort: M.

### 12. Warehouses: 30 m dark flat walls with a ruler roofline
- Where: `b01c` `[420,85,624,150]` (`work/crops2.png` I), `b02` `[500,80,624,150]`, `b03a` `[520,80,624,155]`.
- Anti-pattern: textured box, straight silhouette, flat dark plane (lit result ≈ `#3a2010`), 64 × 64 cladding tile.
- Code: `stages/z3/pwBuildings.ts` `warehouse`; `pixelworld/z3buildings.ts` `z3CladdingTile`, `z3RollerDoor`,
  `z3OpenBay`, `z3CompanyName`, `z3LitStrip`, `z3GrimeRuns`.
- TREATMENT (≥ 43 m: paintings, 16–32 texels a metre): three dock-front modules (12 × 10 m): dock leveller pits,
  bumpers, a backed-in trailer, a forklift cut-out with a pallet, wall packs each throwing a painted sodium
  pool down the cladding, a personnel door with a keypad, company fascia sign; cladding wrap ≥ 8 m with rust
  runs and a replaced lighter sheet. Roofline cards: ridge vents, spinning turbine ventilators (loop), a rooftop
  tank, a flagpole with a rag, a broken skylight leaking smoke. In front: a chain-link yard fence (existing
  `chainFenceTile`) with razor coil and stacked containers. Lift the base value two steps: the building must
  read as lit violet-grey steel, not a brown shadow.
- Effort: M.

### 13. Sound wall: 70 m of one fluted-plank tile with a knife-straight top and a box end
- Where: `b03b` `[370,75,624,185]`, `b04a` `[445,110,624,225]`, `b04b` end box `[540,125,624,240]`.
- Anti-pattern: visible tile repeat, straight silhouette, textured box; graffiti in clean giant font.
- Code: `stages/z3/pwStructures.ts` `soundWall`, `graffiti`; `pixelworld/z3structures.ts` `z3SoundWallTile`
  (2 × 128 × 148), `z3GraffitiWords`. OCCLUDER: proxy box 0.4 × 4.6 × 70 m at x = 11.5, d 182–252 (keep the
  wall's face and height where it is).
- TREATMENT: six unique 4 m panels (128 × 148): precast ribbed concrete with a value structure (splash-dark
  foot, sun-bleached head), H-posts drawn with lit flange and shadow, one panel cracked through with rebar, one
  replaced in new pale concrete, a maintenance door, drain pipes with stain fans; LAYERED graffiti painted in:
  buffed-out rectangles, throw-ups, a stencilled biohazard, tally marks, "THEY'RE COMING" kept but as a
  hand-sprayed tile with drips and overspray at 2 heights; a row of MISSING posters; bullet pocks and a blood
  fan. Crown cards above the top edge (visual only): dead ivy mats hanging over, razor coil, a line of crows
  (one flaps), a security lamp on a gooseneck with a painted pool. Foot: weeds, blown rubbish, a tipped
  shopping trolley. End of the wall: a return panel and a collapsed last bay instead of a box corner.
- Effort: M.

### 14. Barricade: sandbag "brick walls", floodlights that are boxes, an army truck that is a box
- Where: `b13` sandbags `[183,155,262,177]` `[358,155,455,177]` (`work/c-b13-gate.png`), flood heads
  `[140,40,175,62]` `[432,42,468,62]`, army truck `[0,90,60,175]`; `b16a` truck `[455,125,612,172]`.
- Anti-pattern: straight box silhouettes; a flat rectangle with a brick-like bag pattern; textured boxes.
  We drive through at 3.6–4 m (sandbag ends, jersey blocks, gate posts: 64 tier).
- Code: `stages/z3/pwStructures.ts` `sandbags`, `flood`, `hazard`; `pwRoadside.ts` `jersey` (army variants);
  `pwTrucks.ts` `armyTruck`; `pixelworld/z3structures.ts` `z3SandbagTile`, `z3FloodHead`, `z3KeepOut`;
  `z3trucks.ts` `z3ArmyCabSide`, `z3CanvasCover`, `z3OliveTile`, `z3UnitStencil`; `scenery.ts` `buildBarricade`.
- TREATMENT: sandbag walls as two unique cut-out paintings at 64 (4.2 m and 3.4 m × 1.2 m): sagging pillow
  bags in running bond with tie-ears, an IRREGULAR top (bags missing, one slumped, one burst and spilling), a
  firing slit with an abandoned M60 on a bipod, blood down the face; a top-view strip. Floodlight towers: a
  lattice mast cut-out with a generator on a trailer at the foot, cable looped to the gate, head = four lamp
  cans on a bar with a glow halo, beam painted as a 3-step cone on the deck. Army truck as an extruded profile
  (bonnet, canvas tilt with bows, tailgate down, a stretcher sliding out). Dressing cards: a command tent with
  a camp table and radio (whip aerial), ammo crates stencilled, hedgehog tank traps, concertina wire rolls,
  body bags in a row on the right shoulder (keep clear of the cop at `[560,168,602,222]`), traffic cones, a sign
  "CHECKPOINT — HALT — LETHAL FORCE AUTHORIZED", spent casings as a road decal.
- Effort: M.

### 15. Gate panels after the smash: chain-link at 3–5 px a texel next to the lens
- Where: `b16a` `[0,175,105,288]` (`work/crops1.png` D), `b15` `[95,140,165,200]`, `b14b` `[145,80,195,180]`
  `[425,80,480,180]`.
- Anti-pattern: fat texels (64 × 64 chain-link at 32, 1.5–3 m away); KEEP OUT unreadable blocks.
- Code: `pixel.ts` `dynGate`; `pixelworld/props.ts` `chainFenceTile`; `z3structures.ts` `z3KeepOut`.
- TREATMENT: chain-link cut-out at 96 with drawn knuckles, a bent frame tube with crushed end, torn mesh
  curling at one corner, KEEP OUT plate 96 × 48 (per metre × 0.5 m) in bold pixel font with a dented corner
  and a bullet hole; both sides painted (it spins).
- Effort: S.

### 16. Bridge entry: the abutment's top face lies ON the road (a flat khaki plane + a fat blocky band)
- Where: `b12d` `[0,180,624,288]` (`work/c-b12d-deck.png`), d ≈ 720–736.
- Anti-pattern: flat empty plane + fat texels, plus plain z-fighting. The shore group's boxes have their top at
  y = 0: the abutment (40 × 26 × 10 m) is world-projected with the footing tile and the cliff box
  (520 × 27 × 6 m) with the strata tile, coplanar with the road ribbons.
- Code: `pixel.ts` `paint()` case `shore` (uses `bay.footing` / `strata` on every face); `scenery.ts` `buildBay`.
- TREATMENT: do not emit the top faces of the two shore boxes inside the road corridor (x −22…+10); lay a
  painted expansion joint across the lanes at d = 726 (steel finger joint 512 × 32 at 64, rubber seal torn, a
  thump mark of tyre rubber after it) and a "BRIDGE — NO STOPPING" kerb marking.
- Effort: S.

### 17. Jack-knifed semi and trailer at the pile-up
- Where: `b02` `[0,65,160,150]`, `b03a` `[40,90,120,165]`, `h02`.
- Anti-pattern: textured boxes (cab = blue box with a rectangular screen; trailer = a 13 × 3 m flat grey slab
  with fat vertical scratches), straight silhouettes; it is the backdrop of wave 2.
- Code: `stages/z3/pwTrucks.ts` `semi`, `trailer`; `pixelworld/z3trucks.ts` `z3TrailerSide` (416 × 96),
  `z3TrailerBack`, `z3SemiCabSide` (84 × 84), `z3SemiCabBack`, `z3Deflector`, `z3SemiHoodSide`, `z3SemiGrille`.
- TREATMENT: cab from the profile kit of item 6; trailer side repainted (same size, 32): ribbed panels with
  rivet lines and a value structure, FRESH FOODS livery scuffed, reefer unit on the nose, underride guard,
  landing legs, mudflaps, the rear doors burst with crates of oranges and lettuce spilled over the oncoming
  lanes (road decal + cut-out crates), a long double skid arc leading to it. Keep its face mid-value and
  low-contrast: enemies of wave 2 stand in front of it.
- Effort: M.

### 18. Jersey median: speckle noise for 1.2 km
- Where: left of every frame: `b01b` `[0,170,270,235]`, `b00` `[330,170,624,270]` (`work/crops2.png` K).
- Anti-pattern: speckle as texture, visible repeat (4 variants of 128 × 32 every 4 m), flat ochre.
- Code: `stages/z3/pwRoadside.ts` `Z3Roadside.jersey`; `pixelworld/z3roadside.ts` `z3JerseySide` / `paintJersey`,
  `z3JerseyTop`.
- TREATMENT: one 16 m run for the side facing us at 64 (1024 × 64; nearest view 8.6 m, but it is a third of
  every frame): cast seams every 4 m with a lifting slot, amber reflector tabs on top (alternate ones
  missing), a lit top edge and a shadow line under the slope break, tyre-rubber arcs, a gouge to the rebar,
  drainage slots with a stain fan on the road, weeds at the foot, bloody hand-drags, spray tags ("EVAC →",
  a house-search X-code), taped photos of the missing; the far side keeps two variants. AO step on the road
  along the foot.
- Effort: S.

### 19. Blown tank halves: two plain cylinders with a mottled wrap, one lands in our right lane
- Where: `b09` `[80,75,195,130]` `[315,80,400,130]`; passed at ≈ 4 m in beat 10 (real play).
- Anti-pattern: textured primitive, fat blotches (64 × 64 burnt tile round a 5 m drum).
- Code: `pixel.ts` `dynHalf`; `env.ts` (halves built in `buildHighway`); `z3cars.ts` `z3BurntShell`.
- TREATMENT: burnt shell wrap 256 × 256 at 64 (heat-blued bands, peeled paint, weld seams), TORN open ends as
  cut-out petal cards (jagged curled steel, 128 × 128 × 2), inside = dark violet with ember specks (twinkle
  loop) and a smoke puff emitter; the ground under each landing spot gets a scorch + fuel-fire decal.
- Effort: S.

### 20. The tanker tank (the shoot target): a clean banded cylinder with almost nothing on it
- Where: `b08` `[163,122,375,172]`, `h08`; `b10a` `[0,105,415,215]`.
- Anti-pattern: sparse paint, smooth facet gradient (12-sided Lambert banding), 256 × 64 shell tile.
- Code: `stages/z3/pwTrucks.ts` `tank`; `pixelworld/z3trucks.ts` `z3TankShell`, `z3FlammableBand`,
  `z3Placard`; `props.ts` `tankerTank` (the classic meshes stay as hidden hit boxes).
- TREATMENT: unique shell painting for the half facing the camera (11 × 4.25 m, 352 × 136 at 32; it is 15 m
  away while whole): polished-steel look as 4 stepped horizontal bands with broken dash transitions, weld seams
  per ring, manway hatches and the top catwalk now on its side, a ladder, rollover scrapes to bare metal,
  dents with highlight crescents, FLAMMABLE band + 1203 diamonds + UN plate, the leaking valve with a fuel
  drip (loop) and a wet run to the slick, rear underrun bar and lamp cluster, landing gear. Keep the outline
  exactly on the classic cylinder (hits must look like hits) and keep it the palest, cleanest thing in the
  frame.
- Effort: S.

### 21. Suburb houses: gabled boxes
- Where: `b01a` `[0,90,145,150]`, `b03b` `[125,118,190,150]`, `b05` `[75,135,145,180]`.
- Anti-pattern: textured box, flat wall tone, straight eaves; 42 m and more away (density irrelevant).
- Code: `stages/z3/pwBuildings.ts` `house`; `pixelworld/z3buildings.ts` `z3SidingTile`, `z3ShingleTile`,
  `z3HouseDoor`, `z3FireWindow`, `z3ChimneyTile`, `z3Antenna`, `z3SootPlume`; `props.ts` `picketFenceTile`.
- TREATMENT: four house paintings (front 12 × 5.5 m + gable end with the roof slope; 16 texels a metre is
  enough): porch with posts and a swing seat, clapboard with a shadow under each course at this scale drawn as
  bands, a boarded window with a spray-painted X-code, sagging gutter, roof with missing shingles and a tarp,
  chimney; yard cut-outs: a cottonwood, a pickup in the drive, a mailbox, washing on a line (sway loop), a
  kid's swing set, a satellite dish, a basketball hoop. Burning ones: roof ribs showing, flame strips + smoke.
- Effort: M.

### 22. Motel: a brick box with dots
- Where: `b07c` `[525,95,624,150]` (`work/crops2.png` J), `b07b` `[408,115,525,145]`; 60 m away.
- Code: `stages/z3/pwBuildings.ts` `motel`, `motelSign`; `z3buildings.ts` `z3MotelDoor`, `z3MotelWindow`,
  `z3StuccoTile`; `signs.ts` neon boards.
- TREATMENT: one front painting 34 × 7 m (544 × 112 at 16): two-storey walkway with stairs at both ends,
  doors ajar with light spilling, curtains, an ice machine and a vending machine glowing, a pool fence, cars
  nose-in (one with its boot open), roof sign frame; MOTEL / VACANCY neon with a dying letter (flicker loop)
  and a magenta pool on the forecourt.
- Effort: S.

### 23. Billboards: a board on two sticks
- Where: `b07b` `[150,75,215,145]` (BURGER BARN), `b07c` `[355,72,420,145]` (burnt MOTEL), `b07b`
  `[485,0,624,165]` (REPENT: post + board edge overhead).
- Anti-pattern: straight box silhouette, flat back face.
- Code: `stages/z3/pwBuildings.ts` `billboard`; `z3buildings.ts` `z3BillboardFace` (288 × 120 × 3),
  `z3BillboardBack`; `props.ts` `billboard`.
- TREATMENT: a real structure as cut-out cards: lattice uprights with cross-bracing, a catwalk with railing
  and ladder, four gooseneck lamps (two lit: painted pools on the sheet), an apron board with the lessor's
  name; torn paper layers showing the previous advert; birds; the burnt one keeps a charred lattice with
  hanging sheet rags (flutter loop) and embers.
- Effort: S.

### 24. Bridge towers: a grid of identical riveted cells
- Where: `b13` `[140,0,178,150]` `[365,0,402,150]`; `b14b` `[35,0,112,160]` `[395,0,450,160]`; `b15`; `b16b`.
- Anti-pattern: visible tile repeat (64 × 128 cell tile × 17 m of leg), flat-lit box faces.
- Code: `stages/z3/pwStructures.ts` `tower`, `trussBox`, `cable`, `bridgeLamp`, `bridgeSeg`;
  `z3structures.ts` `z3BridgeSteel`, `z3TrussTile`, `z3CableTile`, `z3ClampTile`, `z3LadderTile`,
  `z3TowerStencil`, `z3GrimeRuns`.
- TREATMENT: a unique lower-leg module per visible face from deck −1 m to +16 m (96 × 544 and 136 × 544):
  plate laps with rivet rows that vary, an access door with a padlocked hasp, conduit and a junction box, the
  A / B stencil, an inspection tag, rust blooms at laps, gull streaks, a lit edge drawn down the sun side and
  a violet core shadow on the other; upper cells stay a wrap with 3 variants. Parapet + railing as a 10 m
  module (2 variants) with scuppers, a life-ring box, a lamp base. Add an aircraft-warning strobe on the top
  (blink loop: exists as a classic glow box).
- Effort: M.

### 25. The bay: a flat pink plane beyond the parapet
- Where: `b13` `[470,128,624,160]`, `b12d` `[430,135,624,190]`, `b16c` `[0,140,330,215]`.
- Anti-pattern: flat empty plane (water hazes to one tone within 100 m).
- Code: `pixel.ts` `bayRoot`, `hazeMaterial('z3water')`; `pixelworld/z3bay.ts` `z3BayWater` (128 × 256,
  4 frames), `z3HullTile`, `z3BridgeHouse`, `z3ContainerTile`.
- TREATMENT: water strip repainted (8 frames, 256 × 96): long broken wave dashes in 3 tones that shorten toward
  the horizon, a sun-glitter path under the sun's azimuth (pale dashes, twinkle), fire reflections under the
  city side; the freighter as one painted cut-out silhouette (listing, containers sliding, deck fire, oil
  sheen ring), channel buoys with blinking lights, a capsized ferry, gulls (sprite loop); far shore: a lit
  quay line.
- Effort: S.

### 26. The crashed set-piece wreck under the overpass and other burnt shells
- Where: `b05` `[170,170,245,215]`, `b06` `[185,140,255,180]`, `b17` `[395,135,535,245]`
  (`work/crops1.png` E: blocks of flat brown with black holes).
- Code: `env.ts` (overpass burnt car, `dynCar`), `pwVehicles.car` burnt branch, `z3BurntShell`, `z3BurntSide`.
- TREATMENT: covered by item 1's burnt state; this one lies on its ROOF: paint the chassis underside
  (exhaust, sump, spare-wheel well) for kinds 0–2 (the falling car shows it for 0.8 s and the wreck forever).
- Effort: S (with item 1).

### 27. Police light bar: two pure-colour boxes
- Where: `b02` `[68,145,125,162]`.
- Code: classic glow boxes kept by `Z3Vehicles.classicParts`; strobe = `Z3Scene.accent` point light.
- TREATMENT: a painted light-bar module (lens ribs, chrome end caps, takedown lamps) with an 8-frame
  alternating red / blue glow strip; remove the classic boxes.
- Effort: S.

### 28. Sky: the zenith band is a 3D dome arc
- Where: `b04a` `[0,0,624,130]`, `b00` `[0,0,624,60]`, `b16a` `[0,0,624,60]`.
- Anti-pattern: reads as a sphere, not as a painted sky: constant-elevation colour bands curve across the top
  of the frame whenever the camera pitches up (beats 0, 4, 5, 16).
- Code: `pixelworld/z3sky.ts` `z3SkyTile`; `backdrop.ts` `PwBackdrop` (cylinder / band mapping, el −6…40°).
- TREATMENT: break every band edge above 25° with cloud shapes (a torn smoke pall drifting from the city
  azimuth, lit bellies toward the sun), extend the painting to 55° so the top of a pitched-up frame is cloud,
  not a clean arc; keep the lower sky as is.
- Effort: S.

### 29. Hills strip: a ruler-flat violet band with the same striped mast every 60 px
- Where: `b07b` `[0,105,624,138]`, `b12c` `[0,105,624,140]`.
- Anti-pattern: visible repeat, straight silhouette.
- Code: `pixelworld/z3sky.ts` `z3HillsTile` (2048 × 64).
- TREATMENT: two depth bands (far pale mesa line, nearer darker hills) with a designed profile (buttes,
  notches, one long mesa), 5–6 distinct landmarks round the panorama instead of one repeated mast (water tower,
  radio mast with red blink, grain elevator, a ranch with one lit window, wind turbines turning), dust haze at
  the foot.
- Effort: S.

### 30. Twin gun: classic Kit-textured cylinders 1.3–2 m from the eye
- Where: `b06` `[400,195,470,288]` (`work/c-b06-gun.png`), `b16b` `[340,185,425,288]`.
- Code: `stages/z3/truck.ts` `buildGun` (classic `M.lam(..., 'metal')`; `heatParts` swap materials as the gun
  heats).
- TREATMENT: paint at 192 texels a metre (tiny tiles): perforated cooling jackets with holes that show the
  barrel, flash hiders with slots, a front sight, a feed chute with linked rounds, heat-blued muzzle bands;
  keep barrel and brake as their own meshes so the heat-glow swap keeps working (PixelWorld material + the
  existing glow materials).
- Effort: S.

### 31. Generic dust / blast FX: screen-door discs made of 2 px cells
- Where: `b05` `[160,100,250,205]`, `b07a` `[0,150,250,288]`, `b09` `[220,60,300,115]`.
- Code: `src/fx/Particles.ts` (shared by all stages) — NOT a z3 file. Flag to the foundation: stepped, shaped
  puffs like `Z3FxAtlas` instead of a checker over a disc.
- Effort: — (foundation).

### 32. Boss arena: a smooth red light gradient over the whole road
- Where: `b16a`, `b16b` `[0,165,624,288]`.
- Anti-pattern: smooth real-time light gradient (the beacon point light, 40 m range).
- Code: `env.ts` `Z3Scene.update` (accent light, `beacon`). Painter's part: after the foundation's ramp-step
  light lands, check the asphalt ramp has enough warm steps that the beacon reads as 3–4 hard rings, not
  posterised mud; otherwise paint the beacon as a stepped pool decal riding with the rig.
- Effort: S (check).

### 33. Gantry and highway signs
- Where: `b07d` `[235,80,362,145]`, `b17` `[272,95,355,140]`.
- Anti-pattern: thin box posts and a box beam (the lattice reads at distance, fine); sign text is illegible
  below ≈ 40 m and the backs are flat.
- Code: `pwStructures.ts` `gantry`, `sign`; `z3structures.ts` `z3HighwaySign`, `z3SignBack`, `z3TrussTile`.
- TREATMENT: keep; add sign lighting brackets with lamps (pools on the sign face), a hand-painted bedsheet
  hung over the TUNNEL sign ("NO WAY THROUGH"), bird droppings, a body hanging from the walkway (silhouette,
  off-centre right, clear of the tanker).
- Effort: S.

### 34. Lamps light nothing
- Where: every lit cobra head (`b01c` `[175,25,265,150]`), bridge lamps, floodlights.
- Code: `pwRoadside.ts` `lightPole`; `pwStructures.ts` `bridgeLamp`, `flood`; `z3roadside.ts` `z3CobraHead`.
- TREATMENT: under each LIT head a stepped sodium pool decal on the road / median (3 rings, dashed edges, 8 × 5 m
  at 32 on the oncoming side, at 64 where it crosses our lanes — keep it one step only inside the ring zone),
  a 1-ring halo card round the lens, moths as a 4-frame sprite on two lamps per scene.
- Effort: S.

### 35. Main cable where it meets the deck (end of the boss run, escape)
- Where: `b17` / `b16d` `[0,85,150,140]` `[395,0,580,140]`.
- Anti-pattern: a thick tube with 32 × 32 wrap and clamp tile at 2–3 px a texel (≈ 4 m from the lens).
- Code: `pwStructures.ts` `cable`; `z3structures.ts` `z3CableTile`, `z3ClampTile`.
- TREATMENT: cable + clamp tiles at 64 for the two end spans (d < 760, d > 1100) with wrapping wire lines, a
  painted anchorage block where it enters the deck.
- Effort: S.

---

## 3. DENSITY MAP

Nearest NORMAL viewing distance from the rail geometry (`layout.ts`: lanes ±5.6, median −7, rail +7.6; tunnel
L −7.4 / R +8.8 / H 7.4; bridge parapets −22.2 / +9.6; eye 2.05 m). Tier per the bible table. "Today" = tiles of
the class in the current atlas (`tiles.txt`). "New" = level-0 texels proposed.

| class | nearest normal view | tier | today (tiles → texels at 32) | new texels |
|---|---|---|---|---|
| Lanes (ours) | 4.0 m (bottom row), 4.7 m (80 % line) | **64** | `z3lanes` 256 × 256 → 65.5 k | 4 × 256 × 1024 = 1 049 k |
| Lane lines | as lanes | **64** | `z3line` × 3 → 9.2 k | 37 k |
| Road decals on our lanes (skid, oil, pothole, debris, scorch, blood, spill, flare pool, new litter / glass / lamp pools) | 4–6 m | **64** | 11 tiles → 66.7 k | ≈ 510 k |
| Shoulder (right), median strip | ≥ 8.1 m | 32 | `z3shoulder` × 2, `z3median` (96 × 256) → 73.7 k | 3 × 96 × 512 = 147 k |
| Scrub ground + verge decals | ≥ 12 m | 32 | `z3scrub` 128 × 128 → 16.4 k | 2 × 256 × 256 + 98 k = 229 k |
| Jersey median (side facing us) | 8.6–9.5 m | 32 by rule; **64** recommended (a third of every frame) | `z3jersey` × 5 + top → 24.6 k | 1024 × 64 + far side = 98 k |
| Army jersey blocks, sandbags, gate posts (driven through) | 3.6–4 m | **64** | `z3jersey|…b8b4a8` × 2, `z3sandbag2`, `hazard` → 14.3 k | ≈ 100 k |
| Gate panels (land beside the truck) | 1.5–5 m | **96** | `chainfence` 64 × 64, `z3keepout` → 6.1 k | ≈ 45 k |
| Guard rail, posts, light / utility poles, cobra heads | 10–21 m | 32 (2× fallback is enough) | 18.5 k | 74 k (fallback) |
| Cars, our lanes (adjacent-lane wrecks, blocker, set pieces) | 3.4–4.1 m | **64** | `z3cardet/tail/nose/burntside/glass/carside/cartop/screen/wheel/tyre/bumper/carshadow/burnt2/chrome` → 140.6 k | 5 kinds × 2 states × ≈ 100 k + overlays = ≈ 1 090 k |
| Police cruiser (beat 2 hold) | 2.5–4 m | **96** (side facing the camera) | in the above | + 60 k |
| Cars on the oncoming lanes / shoulder / overpass deck | ≥ 8–12 m | 32 (levels of the same tiles) | — | 0 |
| Tanker cab on its side | 4–6 m (beat 10) | **64** | `z3semicab/semiback/deflector/semihood/semigrille` → 42.6 k | ≈ 300 k |
| Blue cab + trailer (pile-up) | 12–17 m | 32 | `z3trailer` 416 × 96, `z3trailerback` → 48 k | ≈ 130 k |
| Tanker tank (whole) | 15 m (gone before the pass) | 32 | `z3tankshell` 256 × 64, `z3flammable`, `z3placard` → 20 k | 64 k |
| Tank halves | ≈ 4 m (beat 10) | **64** | `z3burnt2` (shared) | 98 k |
| Bus, army truck, army tank | 14–25 m | 32 | ≈ 24 k | ≈ 160 k (truck repainted, rest fallback) |
| Overpass (fascia, soffit, piers, abutments, deck dressing) | 7.6–9.3 m | 32 | `z3fascia`, `z3soffit` × 2, `z3pier`, `z3riprap`, `railing` → 25.6 k | ≈ 600 k |
| Sound wall + graffiti | 16.5 m | 32 | `z3soundwall` × 2, `z3graffiti` × 4 → 61.8 k | ≈ 195 k |
| Gantry, highway signs (ink levels) | 11.5 m | 32 | `z3sign` × 4, `z3truss`, `z3signback` → 102 k | 105 k |
| Billboards | 18–26 m | 32 | `z3bb` × 3, `z3bbback` → 107.8 k | 135 k |
| Gas station | 27 m | 32 | `z3canopy`, `z3pump`, `z3gassign`, `shopbay`, `z3brick` → 35.7 k | ≈ 190 k |
| Title tenement blocks | ≥ 33 m | 32 (16 allowed: 0.5 px a texel at 33 m) | `z3brick`, 6 `win|…3a3a42`, `z3firewin` → 27.7 k | 516 k at 32 / 129 k at 16 |
| Houses | ≈ 42 m | 32 (16 allowed) | siding, shingles × 6, 8 `win|…e0d8c8`, doors … → 70 k | 618 k at 32 / 155 k at 16 |
| Warehouses | ≈ 43 m | 32 (16 allowed) | roller × 3, openbay, cladding, coname × 5, litstrip × 2, grime → 148 k | 420 k at 32 / 183 k at 16 |
| Motel | 60 m | 32 (16 allowed) | moteldoor × 9, motelwin × 2, stucco, neon × 2 → 45 k | 230 k at 32 / 85 k at 16 |
| Tunnel walls, walkway, ceiling, lamps, fans, niches | 10.7–12.7 m (walls), 11.7 m (ceiling) | 32 | `z3tunwall` 192 × 240, `z3tunceil`, `z3tunlamp`, `z3fan`, `z3fanend`, `z3sos`, `z3exit`, `z3sosmark`, `hazard` → 58.8 k | ≈ 750 k |
| Portal (both), cast letters, bore interior | 10.7–11.7 m | 32 | `z3portal` 128 × 128, `z3cast` → 21.6 k | ≈ 463 k |
| Ridge / shore rock, mesa cards | 14–23 m (flank), 70 m+ | 32 | `z3strata` 128 × 128 → 16.4 k | ≈ 550 k |
| Bridge towers, struts, cables, parapet, railing, lamps | 12.8–13.5 m (cable ends ≈ 4 m → 64 for two spans) | 32 | `z3bsteel` × 2, `z3truss`, `z3cable`, `z3clamp`, `z3ladder`, `z3stencil` × 2, `railing`, `z3grime`, `z3footing`, `z3flood` → 42 k | ≈ 406 k |
| Barricade dressing (tent, crates, wire, towers) | 8–14 m | 32 | — | ≈ 105 k |
| Bay water (anim), freighter, buoys | 30 m+ | 32 / lower | `z3water` 128 × 256, hull, house, container → 45 k | ≈ 235 k |
| Silhouette / dressing cards + anim strips (shared) | varies | 32–64 | — | ≈ 410 k |
| Everything not repainted (2× fallback) | — | 2 × | ≈ 100 k | ≈ 400 k |
| **World atlas total** | | | **1.36 M** | **≈ 9.3 M** (far buildings at 16) … **10.7 M** (all at 32) |
| Sky panorama (one level) | — | 1 px a texel | 0.79 M | ≈ 1.05 M (sky to 55°, second hill band) |
| FX (flames, puffs, new sprites) | — | — | 28 k | ≈ 170 k |
| Pickup view model | 1.4–5.2 m | **128** | 40 k at 48 | ≈ 285 k |
| Twin gun | 1.3–2.0 m | **192** | classic | ≈ 40 k |

**Budget** (two bytes a texel, levels × 1.33): world 9.3 M × 2 × 1.33 = **24.7 MB** (28.3 MB with every
building at 32) + sky 1.05 M × 2 = 2.1 MB + fx 0.45 MB + pickup and gun 0.86 MB = **≈ 28 MB (≤ 32 MB) of 48 MB**.
The stage fits with 16–20 MB to spare: nothing has to stay at the 2× fallback for memory. What stays at the
fallback is by priority only: guard rail, posts, poles, cobra heads, crossarms, the bus, the army tank, the far
checkpoint, signs' backs. Two things do NOT fit the current plumbing and are listed under Risks: the world atlas
no longer fits one 2048 × 2048 page (9.3 M texels ≈ 4096 × 2304), and `tests/unit/pixel-world-z3.test.ts:63`
still asserts the old 24 MB.

---

## 4. SCENE BY SCENE — what a Metal Slug / 3rd Strike background artist would paint here

Palette for the whole stage: architecture and road in dusty VIOLET-GREY / mauve (shade) to salmon (sun side);
light accent = sodium amber + the low sun; danger accent = red (flares, brake lamps, fire) with cold spots of
police blue and exit-sign green. Today every surface resolves to one red-brown: the first job of each scene is
three distinguishable hue families.

### S0 — Title, the city behind us (beat 0; also the boss's backdrop from the bridge)
- Story: the evacuation route out of a burning city. An overturned city bus across the oncoming lanes with its
  hazard lamps on; an abandoned checkpoint of traffic cones and a police sawhorse; luggage dropped in a line
  down the road; a jam of cars nose-to-tail on the oncoming side all the way to the skyline; a "ROUTE 9 EAST —
  EVACUATION ROUTE" shield sign with an arrow; a newspaper box knocked over, pages plastered on the asphalt.
- Light: fire glow from the left block (painted orange pool on its neighbour's wall and on the road), two
  sodium lamps still lit with pools, lit windows.
- Silhouette: rooflines (water tanks, aerials, a crane, a church spire) against the skyline panel; a traffic
  signal mast leaning; power lines.
- Loops: window flicker × 2, roof fire (exists), traffic signal stuck on blinking red, a curtain flapping,
  paper sheets drifting (sprite), helicopter light crossing the sky panel (2-px blink).
- Remove: the plain olive boxes; the fat-speckled jersey right at the lens (repaint at 64).

### S1 — Outskirts (beat 1, d 0–146)
- Story: left, a suburb caught mid-evening: garage doors open, a sprinkler still running, a school bus stopped
  with its STOP paddle out. Right, the gas station looted: pumps with hoses on the ground, a burnt car at the
  pump, a queue of three empty cars with fuel caps open, a hand-written "NO GAS" board, a tow truck. Utility
  line with a snapped wire trailing sparks, a pole down across the shoulder.
- Light: gas canopy pool on the forecourt; the burnt car's fire lighting the canopy underside (painted warm
  step); each lit cobra head's pool on the median; porch lights.
- Silhouette: pole + transformer + bird row on the wire, the GAS pole sign, a billboard frame, house roofs with
  aerials and one tree each, the water tower on the hills strip.
- Loops: sparks at the snapped wire (4 frames), canopy tube buzz, sprinkler arc, OPEN sign, birds lifting off
  the wire as we pass (sprite), bus STOP paddle lamp blinking.
- Remove / calm: the confetti shop window; keep both bottom corners plain road (runners board there).

### S2 — Pile-up (beats 2–3, d 146–180)
- Story: a police roadblock that failed. Cruiser angled across lane 1 with the driver's door open and a
  shotgun on the bonnet; traffic cones and a flare line funnelling to it; a stretcher and an open paramedic
  bag; the semi jack-knifed with oranges and lettuce spilled; a car on its roof with a child seat on the road
  beside it; a motorcycle on its side; brass casings; chalk-and-tape of an earlier accident scene; the red
  blocker car with its hazard lamps blinking.
- Light: red flare pools (exist: enlarge to 3 rings), police strobe (stage light) + painted red / blue spill
  strips on the cruiser roof, the two burning wrecks' pools, head- and tail-lamps of live cars as short cones
  painted on the road.
- Silhouette: the trailer's burst doors, the cab's stacks and aerials, a road-works arrow board (dead), a
  light pole knocked to 60°, warehouse rooflines with vents.
- Loops: light bar (8 frames), hazard blinkers on two cars (shared strip), flare sputter, steam from a
  radiator, a wheel still turning on the overturned car, drip under the semi's tank.
- Remove / calm: keep the cruiser's side (behind the brute's vault) to large calm shapes; no pale discs (hubcaps
  mid-grey); the trailer side behind wave 2 stays low-contrast; nothing new on the right shoulder where the
  civilian runs `[460,105,505,188]`.

### S3 — Sound wall and overpass (beats 3–6, d 180–300)
- Story: the wall is the neighbourhood's message board (see item 13). At the overpass: people tried to climb
  down — knotted bedsheets from the railing, a ladder against the abutment, a rope with a bucket; an ambulance
  on the deck with its doors open beside the bus; under the deck a camp (tarp, trolley, a barrel fire that has
  gone out); the parapet gap the falling car made stays broken with rebar bent outward.
- Light: the deck's own shadow as a hard-edged darker band across the road (painted stepped edge, 2 tones),
  sun shafts between the piers on the far side, barrel-fire embers, the sign's lamp brackets.
- Silhouette: deck clutter against the sky (cage fence, mast, banner, crows, the bus, the ambulance light
  bar) — except over our lanes; pier caps; the house beyond framed between piers.
- Loops: banner sway, ambulance beacon (slow), crows hopping, water dripping from a scupper onto the road
  (drip + ripple ring decal: keep it at the left pier, outside the ring zone), embers from the bus fire.
- Remove / calm: the fascia's repeated stain; the soffit blotches; the 14 m dirt-brown abutment wall. Calm
  zone = fascia band over our lanes, soffit shade, and the road `[130,110,520,275]`.

### S4 — Billboard alley (beat 7, d 300–432)
- Story: open desert, the long empty stretch: the oncoming jam thins to single abandoned cars with doors
  open and belongings in a line toward the bridge; a horse trailer on the verge, gate down; a crashed light
  aircraft's tail in the scrub (far left); the motel with cars still in the lot; a roadside memorial cross
  with plastic flowers; a "LAST GAS 40 MI" sign shot full of holes.
- Light: the sun dead ahead (keep), billboard lamps (pools on the sheets), motel neon pool, the burning board.
- Silhouette: billboard structures (item 23), pylons striding across the plain, the gantry, mesas, dead
  cottonwoods, a windmill pump.
- Loops: motel neon flicker, windmill, plastic bags on the fence, rags on the burnt board, a dust devil on
  the plain (far), vultures circling (sky sprite).
- Remove: nothing; this scene is EMPTY — it needs objects. Keep our three lanes clear of new props (cars only
  in lanes ±3.8 as scripted).

### S5 — Tanker (beats 8–10, d 432–470)
- Story: the driver swerved for something: double skid arcs across three lanes, the guard rail on the right
  torn open where the cab went through and came back, a crushed sedan under the tank's nose (only its tail
  shows), hazmat cones and a fire-brigade hose reel abandoned mid-job, a warning triangle, the fuel slick with
  a rainbow rim creeping to the flares (the story of why you shoot it).
- Light: flare pools (red) at the slick's edge, the cab's one living marker lamp, portal lamps far behind,
  after the blast three fuel fires with wide stepped pools.
- Silhouette: the tank's catwalk and ladder, the cab's wheels in the air, the gantry overhead, the designed
  mesa skyline.
- Loops: fuel drip at the valve + a slow sheen shimmer on the slick (4 frames, low contrast), flare sputter,
  heat shimmer line above the tank (2-px wobble row, optional), marker lamp blink.
- Remove / calm: the tank must stay the palest, simplest big shape; no dressing on the tank's face beyond its
  own livery; nothing bright on the road between truck and tank except the slick.

### S6 — Portal and tunnel (beats 10–12, d 500–652)
- Story: see items 2 and 8. Inside: a crashed minibus against the left wall at d ≈ 548 with luggage on the
  walkway; chalk arrows "→ OUT" and "DON'T STOP"; a line of emergency candles someone lit in a niche; a
  maintenance pickup with an amber beacon still turning at d ≈ 625; water pooled at the low point reflecting
  the lamps in broken streaks.
- Light: sodium lamp pools (walls + road) in a rhythm of 6 m, three dead lamps and one that buzzes; green
  exit lightboxes with a green step on the wall; the daylight wedge at each mouth as stepped bands on walls
  and road; in the stall: headlight cone (stage light) + red emergency luminaires every 30 m.
- Silhouette: against the ceiling — fans, cable trays, hanging sign frames ("KEEP IN LANE"), a dangling cable;
  against the exit glow — the bridge tower.
- Loops: buzzing lamp, beacon on the maintenance truck, drip + ripple, exit sign blink, a fan blade turning
  slowly (one of four), sparks from the dangling cable.
- Remove: pure black everywhere; the uniform panel grid; the classic glow boxes for portal lamps (paint
  them). Calm zone: the exit glow and the road; keep the right wall foot `[485,160,520,205]` (nurse) and the
  left wall foot `[60,130,200,200]` (brute) free of bright niches: put the lit niches above 2.5 m or further
  down the bore.

### S7 — Bridge approach and army barricade (beats 12–15, d 652–776)
- Story: the army held here and lost. Approach: tank-trap rows pushed aside, a Humvee on its roof on the
  verge, a field hospital tent with a red cross collapsed on the right, spray-stencilled "INFECTED WILL BE
  SHOT". Barricade: see item 14; plus a tally board of crossed-off unit names, MRE boxes, a flag at half
  mast on tower A, a helicopter wreck's tail rotor on the oncoming lanes behind the truck.
- Light: two floodlight cones (painted stepped pools on the deck in front of the gate — one step only, they
  sit in the ring zone), the fire on the left, the tower's red aircraft lamp, the sun low right.
- Silhouette: tower A's struts and ladders, cables and hangers, floodlight masts, the radio whip, the flag,
  razor-wire coils along the sandbags' top, gulls on the railing.
- Loops: flag, floodlight flicker (one), aircraft lamp blink, radio's green LED, gulls taking off, water
  glitter under the sun.
- Remove / calm: the brick-pattern sandbag rectangles; keep the gate mesh, the sandbag faces behind the
  walkers and the lower tower legs mid-contrast; nothing on the right shoulder near the cop.

### S8 — The bridge, boss arena (beats 16–17, d 776–1176; camera looks BACK)
- Story: the giant wrecks the bridge behind us. Along the deck (every 20–30 m, alternating sides, outside the
  lanes): abandoned army lorries, a cable inspection gantry, toll-plaza remains near tower B, a bus on its
  side against the parapet, lamp posts (one is ripped off by the boss — keep them real), suicide-prevention
  phones, a painter's cradle hanging off a cable. Behind the giant: the city burning (panel) — add a slow
  collapse silhouette (a tower with its top missing), searchlights from the city side, the ridge with the
  ROUTE 9 portal glowing.
- Light: bridge lamps with pools every 30 m (the rhythm that sells speed), the red beacon (stage), city fire
  glow on the underside of the pall, the SAFE ZONE searchlights ahead (exist).
- Silhouette: towers, cables, hangers, the lattice struts, lamp posts, railing pickets; the skyline panel.
- Loops: aircraft lamps on both towers, a hanger cable swinging loose, city window flicker, bay glitter,
  gulls, embers off the burning car on the deck.
- Remove / calm: lower the skyline panel's brightest fire tone one step and avoid round fire blobs behind
  `[230,60,400,205]`; no new saturated orange near the chest core.

---

## 5. SLICES (for painters working at once) and AUDIT SHOTS

Pre-step (S, before anyone paints): split the two files three slices would otherwise share —
`pixelworld/z3structures.ts` → keep signs / gantry / overpass / sound wall there; move `z3TunnelWall`,
`z3TunnelCeil`, `z3PortalTile`, `z3CastLetters`, `z3FanTile`, `z3FanEnd`, `z3SosMarker`, `z3StrataTile` to a new
`pixelworld/z3tunnel.ts`; move `z3BridgeSteel`, `z3CableTile`, `z3SandbagTile`, `z3FloodHead`, `z3KeepOut`,
`z3LadderTile`, `z3ClampTile`, `z3TowerStencil` to a new `pixelworld/z3bridge.ts`; same split of
`stages/z3/pwStructures.ts` into `pwTunnel.ts` (tunnelSeg, fan, portal) and `pwBridge.ts` (bridgeSeg, cable,
bridgeLamp, tower, sandbags, flood, hazard). Also add ONE shared animated batch / material to `pixel.ts`
(8 frames at 8 fps, per chunk) next to the bay's 4-frame one: every slice needs it. In `pixel.ts` each slice
edits only its own `case` blocks and methods.

| slice | beats | files | size | shots to judge it |
|---|---|---|---|---|
| **A — Road, verge, roadside, pickup + gun** (items 3, 4, 10, 16, 18, 30, 34) | all; judged on 1, 7, 12 | `pixelworld/z3road.ts`, `stages/z3/pwRoad.ts`, `pixelworld/z3roadside.ts`, `stages/z3/pwRoadside.ts`, `pixelworld/z3truck.ts`, `stages/z3/truck.ts`, `pixel.ts` (`ground`, cases `flare`, `shore`), flora species for the verge | L | `z3:1:300`, `z3:7:300`, `z3:7:520`, `z3:12:600`, `z3:0:120` |
| **B — Vehicles and wreck FX** (items 1, 6, 17, 19, 20, 26, 27) | 1–3, 7–10, 13, 16–17 | `pixelworld/z3cars.ts`, `stages/z3/pwVehicles.ts`, `pixelworld/z3trucks.ts`, `stages/z3/pwTrucks.ts`, `pixel.ts` (`dynCar`, `dynTank`, `dynHalf`, case `car` …), `pixelworld/z3fx.ts`, `stages/z3/vfx.ts` | L | `z3:2:120`, `z3:3:60`, `z3:7:300`, `z3:8:120`, `z3:10:90`, `z3:9:40` |
| **C — City edge, outskirts, sound wall, overpass, billboard alley** (items 5, 9, 11, 12, 13, 21, 22, 23, 33) | 0–7 | `pixelworld/z3buildings.ts`, `stages/z3/pwBuildings.ts`, `pixelworld/z3structures.ts` and `stages/z3/pwStructures.ts` (after the split: sign, gantry, overpass, soundWall, graffiti) | L | `z3:0:120`, `z3:1:300`, `z3:1:600`, `z3:3:240`, `z3:5:120`, `z3:6:120`, `z3:7:90`, `z3:7:520` |
| **D — Ridge, portal, tunnel** (items 2, 7, 8) | 8 (backdrop), 10–12 | new `pixelworld/z3tunnel.ts`, `stages/z3/pwTunnel.ts`, `stages/z3/pwRock.ts`, `pixel.ts` (cases `tseg`, `tlight`, `exit`, `phone`, `fan`, `portal`, `ridge`), `pixelworld/z3bay.ts` (exit sign, SOS phone only) | L | `z3:8:120`, `z3:10:330`, `z3:10:520`, `z3:11:120`, `z3:11:420`, `z3:12:90` |
| **E — Bridge, barricade, bay, sky and boss backdrop** (items 14, 15, 24, 25, 28, 29, 32, 35) | 12–17; sky in all | new `pixelworld/z3bridge.ts`, `stages/z3/pwBridge.ts`, `pixelworld/z3bay.ts` (water, ship), `pixelworld/z3sky.ts`, `pixelworld/z3beam.ts`, `pixel.ts` (`dynGate`, `bayRoot`, cases `ship`, `checkpoint`, `barricade` parts) | L | `z3:12:450`, `z3:13:120`, `z3:14:150`, `z3:16:240`, `z3:16:900`, `z3:17:60`, `z3:4:90` (sky) |

**AUDIT SHOTS** (the six that test this stage best):

    z3:2:120:pileup,z3:6:120:under,z3:7:300:alley,z3:11:120:stall,z3:13:120:barricade,z3:16:900:boss

- `z3:2:120` — near ground + the nearest big vehicle (cruiser at 2.5–4 m) + a hold with enemies, civilian, HELP bubble.
- `z3:6:120` — big structure overhead and the sound wall, set-piece wreck, the ring zone (pair with `--noauto --hud z3:6:240`).
- `z3:7:300` — near ground, a car brushing past, empty verge and oncoming lanes, billboards.
- `z3:11:120` — the interior (tunnel hold in the dark): crushed-black and flat-plane check.
- `z3:13:120` — barricade, tower legs, bay; hold with civilian and pickups.
- `z3:16:900` — boss arena looking back: skyline panel, beacon light on the road, tower.

Extra when a slice needs it: `z3:0:120` (title), `z3:10:90` (cab and tank at 4 m), `z3:12:600` (bridge entry
plane), `z3:16:240` (gate panel at the lens), and the HUD holds `z3:2:300`, `z3:8:300`, `z3:11:360`,
`z3:13:300` with `--noauto --hud`.

---

## 6. RISKS and constraints

1. **Occluders are invisible proxies and must not move**: the sound wall (0.4 × 4.6 × 70 m at x = 11.5,
   d 182–252) and the bore (walls x = −7.7 / +9.1, ceiling y = 7.7, in 22 m pieces). `minions.ts:223` reads
   `env.occluders` for line-of-fire. New walkway kerbs, niches, abutment paving and dressing are visual only;
   keep them outside the lanes and never where something is scripted: runners leap in at x = ±6.5…7 (over
   the median / the rail), brutes land at x ≈ −1.5, z ≈ 3.2; civilians at (6.3, 9.5) pile-up, (5.6, 8) tunnel,
   (6.4, 6.5) barricade; droppers fall along the deck edge x −5.5…+4.6 and from the tunnel ceiling x ±3.
2. **Destructible tanker**: the classic meshes are the hit boxes (hidden materials); the painted tank must
   keep the cylinder's outline (r 1.35 m × 11 m + end caps). `Z3Scene.armTanker` detaches children flagged
   `userData.pixelWorld` while the Destructible registers: every new painted child of the tank group needs
   that flag. `tests/unit/pixel-world-z3.test.ts` checks the hit boxes and shootables.
3. **Moving set pieces** each own a batch in their own frame (`Z3PixelWorld.part`): blocker car (shoved and
   spun), overpass car (falls nose-down: its underside shows), its burnt wreck (on its roof), tank halves
   (tumble: inside shows), gate panels (spin: both sides show). Paint every side; +1 draw each.
4. **Boss props are not this stage's painters'**: the held / thrown cars, the slab and the lamp-post club
   are built in `boss.ts` with the classic `car()` / Kit and are HIT BOXES; check `z3:16:600…1500` to see how
   they draw beside repainted cars before scoping (PIXEL CAST work, task 7). The giant rips a real bridge lamp
   post: keep `blamp` posts where they are.
5. **RNG and signature**: builders only RECORD (`userData.pw`); CLASSIC / PIXEL CAST must build
   byte-identically (`D1_SIG_STAGE=z3 d1-sig.test.ts`, simulator in both styles). All new placement must be
   hashed from position (`hash2`, `PwRng` seeded by the stretch, as `Z3Road.decals` does) — never `ctx.rng`
   or the world RNG. No new occluders, colliders or raycast targets; PixelWorld meshes stay `noMerge`,
   raycast off.
6. **Letters**: sign tiles are recognised by key (`Z3_SIGN_KEY = /^z3(sign|graffiti|cast|bb|flammable|keepout|stencil|unit)/`
   in `pixel.ts`) for the ink levels and the sign bias; new lettered tiles must use these prefixes or extend
   the regex; the sign-fit test will fail otherwise. Hand-sprayed graffiti should NOT be ink-levelled crisp:
   give it its own prefix outside the regex.
7. **Atlas size and tests**: ≈ 9.3–10.7 M world texels will not fit one 2048 × 2048 page. Either a 4096-wide
   atlas (check `MAX_TEXTURE_SIZE` on the low-end phones) or 2–3 pages (each page = its own material: + 1 draw
   per chunk per page; today 25–63 draws, limit 250 — affordable, but keep each chunk to two pages: "road +
   vehicles" and "set"). `pixel-world-z3.test.ts:63` asserts ≤ 24 MB: raise with the new budget.
8. **Paint time** (≤ 1.2 s cold): today 1.36 M texels paint in ≈ 77 ms of tile work in node and 320 ms in the
   SwiftShader browser including pack and levels; 9–10 M texels scales to 0.6–2.2 s. Keep it in budget by:
   painting far buildings at 16; deriving the burnt car set from the clean one by a remap pass instead of
   repainting; building the four lane variants from shared stamps (blits), not four full per-texel loops; no
   per-texel hash passes over megatexel tiles. The stored atlas record grows to ≈ 25 MB (IndexedDB read during
   the card was 30–65 ms for 15–25 MB).
9. **Light** (foundation dependency): hemisphere `0xffb48a` × 1.75, sun `0xffc48a` × 1.55 and fog `0xa65a54`
   turn violet asphalt into `#3a2921` today. If the ramp-step material still multiplies light COLOUR, z3 needs
   its ramps pre-compensated or neutral stage lights in PIXEL WORLD; decide before slice A paints the road.
   In the tunnel the stage drops hemi to 38 % and sun to 8 %: with stepped light that is ≈ 2–3 tone steps —
   paint the tunnel for it and check `z3:11:120` and `z3:10:520` early. Rock and buildings use `hazeMaterial`
   (capped fog toward `Z3_HAZE` / `Z3_BLD_HAZE`): new far cards must go into the same batches (`rock()`,
   `bldg()`), or they will turn pink.
10. **Stall flicker**: `tunnelLights.visible` hides only the `lights` group's batch. Any painted lamp halo or
    pool that is not in that batch stays lit in the dark (see item 2).
11. **Animation plumbing**: one `(frames, fps)` pair per material and one draw per animated batch per chunk.
    Standardise z3 on two strips — the bay's 4 frames at 3 fps and a new 8 frames at 8 fps for everything else
    (slow loops repeat frames inside the strip). Free-standing loops (papers, birds, moths, sparks) are
    `pwSpriteMaterial` sprites in `Z3FxAtlas`. Never animate inside a calm zone of table 1.
12. **Readability traps specific to z3**: rings are WHITE and YELLOW circles — no pale discs near them
    (hubcaps, wheel faces of the tanker cab, lamp pools inside our lanes one step only, the sun disc sits at
    ≈ (410,115) in beats 12–14 right beside a pickup and a spitter: keep its bars, do not brighten); danger is
    red / orange (flares, fires, beacon) — keep new neon and brake lamps small; the gas-shop confetti and the
    skyline's fire dots behind the boss are today's worst competitors.
13. **Performance hot spots**: triangles peak ≈ 48–50 k from the alley through the tunnel (flora + bridge +
    tunnel in the 200 m cull); profile-extruded cars add ≈ 150–250 triangles each (≈ 60 cars in range at
    worst), cut-out cards are alpha-tested and two-sided (overdraw on phones: keep large cards few, never a
    full-frame card near the lens); only the seven nearest fires smoke. Chunks are 50 m and culled at 200 m:
    put dressing in the chunk it stands in (`ctx.chunk(d)`), not in the root.
14. **Bridge view swap**: past d = 768 `Z3PixelWorld.view` hides the 3D ridge and the far portal batch and
    shows the painted ridge panel (`z3RidgeTile`, slice E) — its look must follow slice D's new rock and
    portal, or the swap will pop.
15. **Flora is a shared system**: new verge plants are FLORA species (`content/pixel/floraSpecies.ts`,
    `floraBiomes.ts`), files other stages use — add species, do not change existing ones; z3's flora atlas is
    R8 and separate from the world atlas (≤ 0.17 MB today).
