# d3 TYRANT CHASE — PIXEL WORLD 2 repaint work-list (scout report)

Scouted read-only from the reference server (first-pass look, `http://localhost:5791`), 44 art frames (624 × 288, every frame pixel
3 × 3, no CRT) in `/tmp/pw2/scout/d3/frames/<label>-pixel.png`, enlarged crops in `/tmp/pw2/scout/d3/crops/`, contact sheet
`/tmp/pw2/scout/d3/sheet.png`. Crop boxes below are `(x, y, w, h)` in ART-FRAME pixels of the named frame (× 3 in the PNG);
`python3 /tmp/pw2/scout/d3/tools/crop.py <label> x y w h [scale] [name]` re-cuts one. Baseline audit numbers are the foundation's
(`/tmp/pw2/audit-v1.txt` and the `mag` / `flat` maps in `/tmp/pw2/audit-v1/d3-*.png`; shots `d3:4:240`, `d3:8:200`, `d3:12:200`,
`d3:16:240`). Capture stats per batch: `/tmp/pw2/scout/d3/stats1.json` … `stats7.json`. Nothing in the repository was changed.

## The verdict in six lines

1. **The stage is a first-person view over a jeep, and the jeep is the blockiest thing in it.** A flat navy slab (the folded
   windscreen, a CLASSIC flat-colour mesh 195 × 38 px), a camo slab with 1.7–2.9 px texels, white square "rain drops", a gun with
   3–6 px texels, and in the 60–90 s boss fight two flat bars (the roll hoop) and two red cubes (the jerry cans). It is in the bottom
   third of every frame of the stage. Nothing else matters as much.
2. **Every place the jeep stops is a big flat plane**: the plaza (60 % of the hold frame: fat pavers for 6 m, then one tone under a
   smooth light gradient), the bridge deck (a brown trapezium with a smooth headlight gradient: the calm-level trick deleted the
   planks), the helipad slab, the mud (3–4 px texels, a flat blue slab for a puddle).
3. **Every man-made thing is a box with a picture on each face**: the truck, the lodge and its kiosk, the pylons (a grid of 0.5 m
   "blocks" with a seam down the corner), the abutment posts (four stacked cubes), the tour cars, the helicopter (a white box and a
   tube), the bridge rails.
4. **The light is 3D light**: lamp pools are a screen-door Bayer discard of an additive orange disc (the largest "dithered" area in
   the stage, 150–260 px wide), the headlight and the accent point light are smooth gradients, glow sources are flat untextured
   polygons (lamp bulbs, the fountain's yellow disc, the pad's green cubes).
5. **Between the set pieces there is nothing to look at**: about 27 s of the stage is road + (good) jungle billboards + a lamp
   post every 26 m. Apart from two direction boards there is no story dressing on d 122–160, 205–236, 262–294, 320–338.
6. What already works and must be kept: the storm panorama (heaps, ridges, moon), the FLORA billboards at 6 m+, the sign boards'
   lettering method, the lightning flash plumbing. The repaint is of the ground, the props, the lodge, the vehicles and the jeep.

Baseline audit (first pass): d3-visitor 20.9 % of world pixels > 1.5 px/texel (14.2 % > 2), 12.9 % flat blocks; d3-roadblock 9.1 % /
9.9 % flat; d3-mud 22.9 % (10.9 % > 2 in the middle of the frame), d3-boss 16.8 % (13.6 % > 2 in the middle: the roll hoop and the
gun), 8.5 % flat; "tiny" (smooth-gradient pairs) 65–69 % in all four.
## 1. BEATS

24 beats (`stages/d3/index.ts`). Rig distance `d` in metres along `RAIL`. Screen zones are art-frame pixels (x 0–623 left→right,
y 0–287 top→bottom). HUD (from the `--hud` shots h02 / h04 / h08 / h12 / h16): score x 10–155 y 5–50; progress / boss bar x 175–450
y 8–50; pause x 570–615 y 8–52; hearts x 10–130 y 250–278; bomb slot x 145–198 y 230–280; weapon panel x 420–612 y 222–278; prompt
text band y 180–200 across x 95–525. Telegraph rings are 60–95 px across (yellow → orange → red), drawn round the attacker.
The jeep hood covers x 150–410 y 205–288 looking forward (it slides right when the camera turns left, see b04).

| # | kind · label | d | the scene | best shot(s) | where the game is on screen (keep the background calm there) |
|---|---|---|---|---|---|
| 0 | banner · title | 0 | road start, camera turned to the paddock fence on the right: 8 pylons in a row, DANGER board, lamp pool left | `d3:0:120:b00` | banner text across y 90–170; no enemies |
| 1 | move · paddock road | 0→42 at 8 m/s | wet road, pylons right at 10.5 m, jungle left | `d3:1:90:b01a`, `d3:1:300:b01b` | 2 compys leap out of the left ferns to x 200–300 y 150–195; pickup x 270–300 y 95–120 |
| 2 | hold · torn fence | 42 | fence gap 11–23 m ahead-right: snapped stumps, hanging cables, sparks, crushed tour car, prints across the road | `d3:2:120:b02` (`--noauto --hud`: h02) | compys / raptors come out of the gap: x 330–560 y 120–205; road centre x 230–330 y 150–205; a raptor from the left verge x 150–225 y 140–195; pickup x 420–450 y 110–130 |
| 3 | move · raptor pack | 42→168 at 12 m/s | rest of the paddock (to d 122), then plain jungle road, plaza appears left at d 145 | `d3:3:90:b03a`, `d3:3:300:b03b`, `d3:3:600:b03c` | flanking raptors both sides at 10–13 m: x 60–210 and x 420–560, y 120–235; compys centre; a ptero x 370–430 y 25–85; ambush trio mid-frame x 190–430 y 120–200 |
| 4 | hold · visitor centre | 168 | camera 42° left: plaza (pavers, emblem mosaic, fountain), kiosk left, lodge behind at 28–45 m, moon | `d3:4:120:b04` (hud: h04) | scientist flees across x 170–250 y 150–205; compys x 225–400 y 170–255 (rings there); dilo / raptors on the far plaza x 280–480 y 125–170; health pickup x 385–425 y 120–140 |
| 5 | action · doors burst | 168 | the lodge doors fly off, red lobby glow | `d3:5:60:b05` | doorway x 245–300 y 120–165 |
| 6 | hold · raptors burst out | 168 | same view, lodge more frontal | `d3:6:150:b06` | alpha + 2 pack raptors charge from the doorway down the plaza's middle to x 230–420 y 150–250; dilo x 330–420 y 130–160; compys x 280–380 y 150–190 |
| 7 | move · storm road | 168→238 at 10 m/s | plaza slides away left, jungle road, lamp posts, lightning splits a palm at d 222 (left), roadblock comes into view | `d3:7:90:b07a`, `d3:7:260:b07b`, `d3:7:400:b07c` | pteros in the sky x 180–450 y 20–95; compys centre; pack trio x 190–440 y 120–200; burning branches (rings) from x 225–265 y 75–115 toward the camera |
| 8 | hold · roadblock | 238 | 15 m ahead: overturned tour car, 2 sawhorses, 3 fuel drums, palm log; lamp + pool left; ranger right | `d3:8:150:b08` (hud: h08) | dilos behind the block x 175–330 y 130–175, their spit rings up to x 175–265 y 60–150; raptors on the left verge x 60–210 y 130–205; ranger x 520–585 y 140–205 (right verge: keep it clear); drums (targets) x 215–245, 385–415 y 155–185; bomb pickup x 220–260 y 112–135 |
| 9 | action · blast the roadblock | 238 | explosion, the car tumbles right, sawhorses fly, fire | `d3:9:40:b09` | — |
| 10 | wait · debris settles | 238 | fire and smoke on the road (a direct load at 10 skips the blast: use `d3:9:40`, `d3:11:90:b11a`) | `d3:11:90:b11a` | — |
| 11 | move · jungle road | 238→307 at 10 m/s | through the fire, plain jungle road, the truck appears at d 285 | `d3:11:90:b11a`, `d3:11:300:b11b` | flanking raptors x 60–210 / 420–560 y 120–235; compys centre; ptero x 180–250 y 20–90; pack trio mid-frame; burning branches from x 365–400 y 75–115 |
| 12 | hold · stuck in the mud | 307 (≥ 13 s) | mud lane with pools, stuck truck left at 7–10 m with the worker on its bed, BRIDGE board and the bridge end 25–30 m ahead | `d3:12:150:b12` (hud: h12) | worker x 90–125 y 95–140 (HELP! bubble y 80–100); raptors x 130–245 y 150–230 and x 325–520 y 145–200; compys x 300–400 y 175–245; dilo x 440–500 y 150–190; pteros x 330–490 y 20–185; branches from x 390–420 y 60–100; health pickup x 345–385 y 110–135 |
| 13 | move · bridge | 307→395 at 9 m/s | out of the mud, BRIDGE board, abutment posts, 44 m of deck over the gorge, far abutment | `d3:13:120:b13a`, `d3:13:230:b13d`, `d3:13:330:b13b`, `d3:13:520:b13c` | pteros dive out of the whole sky: x 150–480 y 10–135; bomb pickup upper centre |
| 14 | action · bridge collapse | 395 | camera turns 180°: road behind, the bridge 12–56 m away, lightning, it falls in a chain | `d3:14:120:b14` | none (set piece); the jeep's rear deck is now the foreground: x 100–520 y 215–288 |
| 15 | wait · watch it fall | 395 | same look-back view (a direct load at 15 faces forward: `d3:15:120:b15` shows the boss road ahead) | `d3:14:200` | — |
| 16 | boss · THE TYRANT | 395→548 (creeps, sprints in phase 3) | look-back view between the roll-hoop bars: road, lamp pools, treeline fence, flares, EVACUATE boards; phase 2 looks forward; phase 3 at the pad entrance with the fuel tank | `d3:16:150:b16a`, `d3:16:480:b16b`, `d3:16:1100:b16c`, `d3:16:2400:b16d` (hud: h16) | Tyrant x 230–400 y 60–250, weak points (eyes, throat) and its ring x 280–360 y 80–160; pack-mates x 150–260 / 380–470 y 170–260; flung debris (rings) through the middle; pickups x 180–230 y 135–160; phase 3: fuel tank (the target) x 400–480 y 150–205, barrels on both verges |
| 17 | move · to the chopper | →548 | helipad ahead: slab, H, ring, edge lights, helicopter at 21 m, windsock right | `d3:17:120:b17a` | — |
| 18 | action · chopper spins up | 548 | same; rotor blur disc | `d3:18:60:b18` | — |
| 19 | hold · last of the pack | 548 | same | `d3:19:120:b19` | raptors leap in at the pad's edges: x 145–195 y 100–165 and x 395–445 y 125–205; helicopter x 265–405 y 115–170 |
| 20 | move · board | 548→557 | closer to the helicopter (12 m) | `d3:20:60:b20` | — |
| 21 | action · lift-off | 566 | swap to the helicopter cabin: door posts left / right, hazard sill at the bottom, the pad and the parked jeep below | `d3:21:40:b21` | — |
| 22 | action · escape | 566→625 climbing | cabin view, the pad shrinking; ESCAPED! banner | `d3:21:150:b22x` (a direct load at 22 / 23 skips `board()` and shows the jeep's rear deck: b22, b23) | banner y 90–170 |
| 23 | wait · fly away | →625 | cabin floor and sill, the island below in fog | `d3:21:330:b23x` | — |

Capture stats over all shots: 28–60 draw calls (77 while the bridge falls: `b14`), 27–33 k triangles, world atlas 1024 × 1056 with
155 tiles, sky 2048 × 352 with 3, jeep 256² with 25.
## 2. OFFENDERS (ranked by how loudly each says "Minecraft / Roblox")

Paths: `S/` = `src/content/stages/d3/`, `P/` = `src/content/pixelworld/`. "Passes (a)–(f)" are the bible's §4.1 (base, value
structure, construction, wear, dressing, contact). Effort: S ≤ ½ day, M ≈ 1 day, L ≥ 2 days of a painter.

### 1. The jeep's hood, folded windscreen and wings — on screen in every forward frame — **L**
- **What**: the bottom-centre third of the frame is (i) a flat navy rectangle, 195 × 38 px, one colour: the folded windscreen's
  glass, a CLASSIC flat-colour mesh; (ii) the bonnet: camo-like blobs of fat texels, the "RANGER 12" stencil an illegible smear;
  (iii) white 5 px squares (rain "splashes": instanced boxes); (iv) the wings and side rails: untextured dark-green boxes.
- **Where**: every forward beat. `b01a` (150, 200, 220, 88) → `crops/b01a_hood.png`; `b03a` (215, 205, 200, 83); turned view
  `b04` (400, 225, 224, 63); mag map `/tmp/pw2/audit-v1/d3-visitor-mag.png` (all red).
- **Anti-pattern**: fat texels at 1.7–2.9 px (48 texels/m at 1.9–3.3 m) + flat empty plane + textured box + straight box
  silhouette + wrap tile repeat (one 64² olive tile over the whole body).
- **Code**: built by `S/jeep.ts:buildJeepBody` (shared with CLASSIC: do not change its meshes; add PIXEL-WORLD-only geometry in
  the `jp` branch), painted by `S/jeepPixel.ts:D3JeepPixel.paintBody` through one material → tile rule; tiles
  `P/d3Jeep.ts:d3JeepPaintTile` (64² wrap), `d3JeepMudTile`, `d3HoodMarking` (48²), `d3TubeTile`. Rain squares:
  `S/jeep.ts:JeepViewModel` (`drops`, `update`).
- **Treatment**: repaint natively at **128** as modules, not wrap tiles.
  - ONE hood painting 256 × 432 (1.94 × 3.3 m, seen from the gunner's seat), laid with `pwDecal` on the tub top + bonnet panel:
    (a) olive drab, tone 3; (b) a crown band two steps lighter down the centre-line with hand-shaped dither bands 6 texels wide,
    a step darker toward the cowl and the right edge, a 2-texel moon-lit line on the left arris, a 2-texel shadow line on the
    right; (c) the raised bonnet panel with a 3-texel bevel (lit left / top, dark right / bottom), a piano hinge down the middle
    (knuckles every 12 texels), two T-handle bonnet latches with their rubber straps, four louvre slots (dark slot 8 × 40, lit
    lower lip), the two sand recognition stripes with chipped triangular edges showing primer, a blackout lamp, the aerial's
    spring base; "RANGER 12" in the bold font at ×3 (6-texel strokes: 4 px on screen, legible); (d) three parallel claw rakes
    60 texels long on the right half (bright steel in the gouge, a curl of paint at each end), a dent with a crescent highlight,
    mud fans thrown back from both wheel arches as shaped lumps 10–40 texels (lit top, dark underside), scuffs to primer along
    the front lip; (e) rain: beads (2 × 2 lit over 1 dark) strung along every seam and edge, runs trailing aft, two sheets of
    standing water mirroring the sky ramp in broken horizontal dashes; a pioneer shovel and axe strapped on the right wing;
    (f) a 3-texel occlusion step where the bonnet meets the tub, under the windscreen frame, under each latch.
  - The folded windscreen as a 4-frame strip 208 × 64 (8 fps): steel frame with a rubber gasket and two wing nuts, the glass
    reflecting the storm in three tones as hand-drawn diagonal bands, a wiper arm and its swept fan, a spider crack in one corner;
    over the frames beads grow, merge and run. Never one colour.
  - Rain splashes: keep the `InstancedMesh`, its count and every `world.rng` draw (see RISKS); swap its box geometry / glow
    material for a 3-frame painted crown card (5 px: a tick with two flecks), storm blue not white.
  - Wings: replace each tilted box by an extruded mudguard profile (5 segments over the wheel, `profileStrip` of
    `stages/z3/pwShapes.ts`) with caked mud 48 × 160; side rails get a rolled lit edge, a canvas door strap, a footman loop.
  - Silhouette: a cut-out card across the hood's far edge (bull bar loops, winch drum with its hook, two headlamp guards, the whip
    aerial at the far left): the hood must not end in a ruler line. Height ≤ 6 px above today's outline (aerial: 1 px wide).

### 2. The mounted gun — locked to the camera, right of centre in every frame — **M**
- **What**: a striped dark tube and boxes; each texel is a 3–6 px block (48 texels/m at 0.9–1.8 m); the rings on the barrel are
  two-colour bands.
- **Where**: all beats, x 340–400 y 205–288; `b08` (345, 210, 70, 78); mag map `d3-boss-mag.png` (red).
- **Anti-pattern**: fat texels at 3–6 px, textured box / cylinder.
- **Code**: `S/jeep.ts:JeepViewModel.buildGun` (pedestal, `gunKick` group, `heatParts`, `flash`), painted by
  `S/jeepPixel.ts:D3JeepPixel.paint(body)` with `P/d3Jeep.ts:d3SteelTile` ×3 and an olive `d3JeepPaintTile`.
- **Treatment**: it never changes distance, so it is a SPRITE: paint it at screen density (**256** texels/m) as two crossed
  profile cards in the `gunKick` frame (side profile 96 × 496, top profile 64 × 496; recoil and pitch keep moving them): a
  perforated barrel shroud (two rows of oval holes with lit rims), flash hider, front sight post, receiver with charging handle
  and a hinged feed cover, an olive ammunition box stencilled "7.62 · 200", eight brass rounds of belt (3 × 6 px each with a
  highlight), the cradle with its elevation knob, the pintle yoke, spade grips; worn edges bare steel, rain beads, one selective
  dark-blue outline against the road. The heat-glow barrel tip (`heatParts`: barrel + brake) stays two small classic meshes or
  becomes 5 painted variants switched the same way; the muzzle `flash` group and the shell-casing origin stay where they are.

### 3. The jeep's rear in the look-back view — the foreground of the whole boss fight — **M**
- **What**: the roll hoop is two flat near-black bars (12–16 px wide, 288 px tall) and a top bar framing the view; the tailgate
  a flat dark-green band across the bottom; the spare wheel a black half-disc; the jerry cans two saturated red cubes with an
  embossed X and 5–6 px texels (the most saturated red on screen, right under the Tyrant's feet).
- **Where**: beats 14–16 (60–90 s). `b14` (100, 215, 420, 73) → `crops/b14_jeeprear.png`; `b16b` bars at x 90–130 and
  x 455–495; `b22` / `b23` (rear deck at full size); `/tmp/pw2/audit-v1/d3-boss-mag.png`.
- **Anti-pattern**: fat texels at 3.2–4.9 px, straight box silhouette, flat empty plane; colour: a danger red that belongs to
  telegraphs.
- **Code**: `S/jeep.ts:buildJeepBody` (roll hoop cylinders, tailgate, spare, bed floor, jerry cans, kit bag);
  `S/jeepPixel.ts:D3JeepPixel.paintBody` / `takeTubes` / `tubes`; `P/d3Jeep.ts:d3TubeTile`, `d3JerryTile`, `d3TyreTile`,
  `d3TreadPlateTile`, `d3CanvasTile`.
- **Treatment**: **128**. Roll hoop: keep the tubes' screen footprint exactly (they frame, never cover the centre) but paint
  them as tubes with a moon-side highlight line, a core shadow, weld beads, a padded wrap with lacing on the lower half, a
  clamp with a wing nut, rain running down (2-frame shimmer is enough); a cut-out card at the top corner for the beacon bracket
  and a coiled tow strap. Tailgate 240 × 72: pressed ribs, a stencilled unit number, two chain hooks, mud spray; spare wheel
  104²: knobbly tread drawn as lugs with packed mud, a steel rim with five nuts and a hub cap; bed floor 232 × 320: diamond
  plate with worn-smooth lanes, spent brass rolling in the corners, an ammunition box, a coiled rope; jerry cans as proper
  20-litre cans (three handles, pressed X, cap with a chain) in **olive / dull ochre**, not red; the kit bag with straps and
  a first-aid cross patch (small, desaturated).

### 4. The maintenance truck — biggest prop of the 13 s mud hold — **L**
- **What**: a yellow box. The windscreen is a flat black rectangle 105 × 40 px (CLASSIC glass), the roof a smooth-lit yellow
  plane, the fender arches black bricks, the bed a corrugated box, the crane arm a hazard-striped box beam.
- **Where**: beat 12 (and approaching in 11 / leaving in 13). `b12` (0, 90, 200, 150) → `crops/b12_truck.png`; h12.
- **Anti-pattern**: textured box, straight box silhouette, flat empty plane (the glass), smooth 3D light gradient (roof).
- **Code**: `S/props.ts:maintenanceTruck` (classic), `S/pixel.ts:D3PixelWorld.truck`; tiles `P/d3Vehicles.ts:d3TruckDoorModule`
  (64 × 52), `d3TruckFrontModule` (70 × 52), `d3EnamelTile`, `d3CraneTile`, `d3BumperModule`, `P/surfaces.ts:corrugatedTile`,
  `P/d1Props.ts:d1TreadTile` / `d1WheelModule`.
- **Treatment**: replace the boxes by an **extruded profile at 64** (the method of `stages/z3/pwVehicles.ts:profileBody`): a
  cab-forward utility truck side 432 × 192 — raked windscreen, a roof with a beacon bar and a ladder rack, the door with a
  mirror on a tube arm, three wheel arches cut over the axles, a stake-sided flatbed with a tool locker under it, mud to the
  hubs. Paint the glass (no classic mesh): the cab's dome light on, a hard hat and a thermos on the dash, the steering wheel,
  a cracked corner, a wiper stopped mid-sweep, rain beads outside the fans. Front 160 × 176: slatted grille with a badge, one
  headlamp weakly lit (GLOW, 3 × 3), the other smashed, a bent bumper with a winch and a snapped cable trailing into the mud,
  plate "PI-03". The crane as a cut-out card 288 × 48 (knuckle boom, hydraulic ram, sheave) with the hook and chain as a small
  swinging part (4-frame strip). On the bed (silhouette pieces): a toolbox, three stacked cones, a coil of hose, a tarpaulin
  corner flapping (4 frames). A painted mud bow-wave cut-out round the sunk wheels. The flatbed top stays at local y 1.76 under
  `mudPerch` (the worker stands on it) and the amber hazard lamps keep their classic blinkers; add painted amber pools for them.

### 5. The plaza — 60 % of the visitor-centre holds (beats 4–6, ~35 s) — **L**
- **What**: near the camera, pavers as fat 20 × 8 px bricks with 2 px texels; from 10 m on the calm levels flatten everything
  into one grey-violet tone carrying a smooth warm gradient (the accent point light). The emblem mosaic is a red-brown smear.
- **Where**: `b04` (0, 150, 520, 138) → `crops/b04_pavers.png`; `b05` and `b06` (0, 150, 480, 138); `b07a` (0, 150, 240, 138).
- **Anti-pattern**: flat empty plane, fat texels at 1.8–2 px, visible tile repeat (64² = 2 m), smooth 3D light gradient.
- **Code**: `S/pixel.ts:D3PixelWorld.plaza` (`b.rect(… 46, 21, pav)`), `P/d3Visitor.ts:d3PaverTile` (64² wrap, registered in
  `calmTiles` → `P/d2levels.ts:d2CalmLevels`), `d3MosaicModule` (96²); the gradient is `S/env.ts:ParkEnv.update` (`this.point`).
- **Treatment**: **64**, one 512² (8 m) paver painting instead of the 2 m tile: (a) wet stone, tone 3; (b) broad value
  structure — a herringbone field with two straight soldier-course bands leading from the kerb to the lodge steps, darker
  toward the lodge, long puddle shapes in the dips mirroring the sky in broken dashes; (c) each paver with a lit top / left
  edge and a shadowed joint, 6 % of them a step lighter or darker, a few sunk, cracked or missing (bedding sand showing);
  (d) moss in the joints near the planters, tyre scuffs at the drop-off, a dark drag smear from the doors toward the road;
  (e) see §4 for the dressing; (f) contact shadows under kiosk, planters, fountain, kerb. The middle lane (doors → road, where
  the fight is) stays at two neighbouring tones only. The mosaic 384² in **stone colours** (grey-green, ochre, bone: no red),
  the park emblem with a tesserae border, cracked across by one Tyrant print. A kerb strip 512 × 32 between road and plaza
  (granite blocks, a yellow no-parking line, a storm drain with water running in — 4-frame strip). Light: paint the fixed pools
  (§4) into decals as tone shifts; the stage point light must arrive as ramp steps (foundation §5) — check there is no gradient
  left in `d3:4:240`.

### 6. The bridge deck and its rails — the emptiest 10 s of the stage — **M**
- **What**: the deck is one flat brown trapezium filling the middle 40 % of the frame with a smooth orange headlight gradient on
  it; the calm material (level bias 1.5) removed every plank. The rails are brown box posts and box beams. Both sides of the
  frame are empty navy bands: nothing of the gorge is visible.
- **Where**: beat 13. `b13b` (150, 130, 330, 110) → `crops/b13b_deck.png`; `b13d`; `b13c` (0, 190, 624, 98); `b14` (190, 100,
  240, 70) → `crops/b14_bridge.png`.
- **Anti-pattern**: flat empty plane, smooth 3D light gradient, textured box, straight box silhouette.
- **Code**: `S/props.ts:bridgeSegment` / `trestle`, `S/env.ts:buildBridge`, `S/pixel.ts:bridgeRule` / `paintBridge` /
  `bridgePiece` / `bridgeWhole` (deck faces on the `calm` material, `finish`: `calmMat` bias 1.5), `P/d3Bridge.ts:d3DeckTile`
  (64², three tones), `d3TimberTile`.
- **Treatment**: **64**. Deck 512² wrap (7.6 × 8 m, u across): 30 planks of uneven width (22–34 texels) running ACROSS the
  road, each with its own tone (three neighbouring steps), end grain and a lit leading edge; two polished wheel lanes a step
  lighter with wet streaks along them (the long forms run WITH the travel, so nothing crawls); nail-head pairs at the stringers;
  three planks split, one missing (a black gap with a far glint of the river), one replaced in fresh pale timber; kerb timbers
  (wheel guards) bolted down both edges with painted chevrons worn off; puddles in the cupped boards. Give the hand-made far
  levels this calm instead of forcing a level bias. Rails: one cut-out card per 4 m segment 256 × 96 (posts with chamfered tops
  and iron straps, two rails, a diagonal brace, rope lashings; three variants: sound, a rail snapped and hanging, a storm
  lantern hung on a post). Keep the classic `broken` segment (i = 4) broken. The loose pieces and the whole bridge must map the
  same texels (see RISKS). The gorge: see offender 26 and §4.

### 7. The visitor centre — boxes under pyramids — **L**
- **What**: at 28–45 m the lodge is two flat grey boxes and a taller one with dark triangles on top. Stucco reads as one tone;
  the thatch is a flat dark shape with a ruler-straight ridge and eave; the columns are plain shafts with specks; the atrium
  glass is black (the rex skeleton inside is a few stray pixels); the marquee letters break up; the lit windows are orange
  rectangles with blots.
- **Where**: `b04` (100, 20, 240, 150) → `crops/b04_facade.png`; `b05` (20, 30, 340, 150); `b06` (20, 30, 340, 150).
- **Anti-pattern**: textured box, straight box silhouette, flat planes, detail painted below what the distance can show (the
  façade is minified 3.5–5×: every form under 4 texels is lost), muddy colour.
- **Code**: `S/props.ts:visitorCentre` (classic shell = the bullet occluder), `S/pixel.ts:D3PixelWorld.visitorCentre`;
  `P/d3Visitor.ts:d3StuccoTile`, `d3WingWindowModule`, `d3AtriumModule` (16 texels/m), `d3ThatchTile`, `d3FringeTile`,
  `d3ColumnTile`, `d3FasciaTile`, `d3MarqueeModule`, `d3BannerModule`, `d3LodgeDoorModule`, `d3LobbyModule`, drip / foot bands.
- **Treatment**: paint it as a BACKDROP PAINTING at 32, designed for ¼-scale viewing (forms ≥ 4 texels, tone steps ≥ 2
  between neighbours, because banded fog eats one):
  - one module per wing 400 × 288 (mirrored for the other): a timber-and-stucco park lodge — a heavy dark timber frame (posts,
    rails, diagonal braces 6 texels wide) dividing the stucco into bays, deep window reveals with louvred storm shutters (one
    hanging by a hinge), a shingled pent roof over the ground floor, a rubble-stone plinth, gutters and two downpipes (one
    spouting: 4-frame strip), rain-stain curtains under every sill, the lit rooms as stepped warm pools with silhouettes ≥ 6
    texels (a ceiling fan, a shelf of plush dinosaurs, a toppled chair);
  - the atrium 480 × 416: the glass wall divided by a timber A-frame; behind it the mounted rex skeleton as a BIG clear
    silhouette (skull 60 texels long) against a dim red emergency glow that pulses in two steps; one pane smashed outward,
    shards hanging; the stopped clock in the gable; the stucco flanks with the park map case and a torn notice board;
  - roofs: thatch drawn as overlapping shaggy courses 12–16 texels deep, a ridge roll with crossed ridge poles sticking up,
    ragged eaves — and the roofline carries cut-out cards: carved finials, a lightning rod with its cable, a satellite dish, a
    radio aerial with a blinking lamp, a weather vane, palm fronds from behind (kept), a flagpole with a shredded flag (4 frames);
  - portico: carved timber posts on stone bases instead of plain cylinders (a carved band every 2 m, brackets under the beam),
    hanging lanterns between them (three lit: warm stepped pools on the portico floor and the steps), the marquee kept but its
    letters redrawn with whole bulbs on a 4-texel pitch, a neon "OPEN" tube dead beside the doors; the doors with iron straps
    and porthole glass; the lobby behind them deeper (a reception desk, the red beacon's glow, a turnstile).
  Everything stays within 0.2 m of the classic shell's planes (it stops bullets), cut-outs only above the eaves.

### 8. The paddock pylons — a row of block towers for the first 20 s — **M**
- **What**: each pylon is a 0.9 m square box 9.5 m tall; the paint is a grid (a lift line every 16 texels, board bands every
  4, a seam where two faces meet), dark "tie-hole" pixels, rust drips hanging from square plates; a fat hazard band; a box
  plinth and a box cap. The snapped ones in the gap are the same box, tilted.
- **Where**: beats 0–3. `b01a` (400, 20, 200, 170) → `crops/b01a_pylons.png`; `b01b` (380, 0, 244, 220) →
  `crops/b01b_pylon_near.png`; `b02` (470, 0, 154, 200); stumps `b03a` (535, 120, 89, 80).
- **Anti-pattern**: textured box, straight box silhouette, visible repeating grid (it reads as stacked blocks).
- **Code**: `S/props.ts:pylon`, `S/env.ts:buildPaddock`, `S/pixel.ts:D3PixelWorld.pylon` / `rebar`;
  `P/d3Park.ts:d3PylonFaceModule` (29 × 304), `d3StumpFaceModule`, `d3ConcreteTile`, `d3InsulatorModule`, `d3RubbleTopModule`.
- **Treatment**: 32, repainted natively as a CUT-OUT front module 48 × 320 (two variants) + a side module, on crossed cards
  or on the box with cut-out edge cards: a tapering precast pylon (wider foot, a chamfered arris drawn as a lit line on the
  left and a 2-texel shadow on the right), form-tie cones and one pour joint only (no grid), a spalled corner showing rebar,
  a galvanised cable tray and a conduit running up one face to a junction box at 1.6 m, the insulators as stacks of five
  brown discs standing out both sides of the silhouette, a steel cap with a lamp cage and a lightning spike, a loudspeaker horn
  or a floodlight bracket on every third one, the hazard band as worn paint (40 % gone, stripes 6 texels), a stencilled
  number "P-07", lichen and a splash skirt at the foot, a poured footing with a rain puddle round it; vines break the edge
  (kept). Stumps 64 × 128: a jagged break with rebar hooks and hanging lumps of concrete, the top third lying beside it as a
  boulder billboard with a hazard-band fragment.

### 9. Lamp light pools — the biggest "dither" in the stage is a screen door — **M**
- **What**: under every lit lamp post an orange-pink film 150–260 px wide whose edge is a per-screen-pixel Bayer discard: a
  checker of single frame pixels that swims over the road as the camera moves and wipes out the road paint under it.
- **Where**: `b01b` (0, 215, 175, 73) → `crops/b01b_pool_road.png`; `b03c` (380, 205, 244, 83); `b07b` (60, 185, 260, 70);
  `b08` (115, 185, 165, 50); `b14` (0, 195, 240, 93); `b16c` (150, 215, 170, 50) — i.e. inside the boss arena too.
- **Anti-pattern**: checker dither as a screen-door over a whole surface; smooth additive gradient; not palette colours.
- **Code**: `S/env.ts:buildLamps` → `commitPools` (classic discs, `poolGeo` / `poolMat`), `S/retro.ts:ditherPool`
  (`gl_FragCoord` Bayer discard), kept in PIXEL WORLD.
- **Treatment**: in PIXEL WORLD do not add the classic pool meshes (`flickers` still needs an object to toggle: give it the
  painted decal's batch). Paint each pool into the ground as TONE SHIFTS: a decal 4.5 × 5.5 m at 32 (144 × 176) laid over road
  and verge, three stepped rings (+2 / +1 / +½ tone toward a warm ramp) with hand-shaped dither bands 3–4 texels wide in TEXEL
  space, pulled into streaks along the road's wet wheel lanes (broken horizontal dashes), the lamp post's own shadow as a dark
  wedge; a 5-px halo ring and falling-rain glints as a small card round the lamp head. Flickering lamps: toggle the decal.
  Same for the truck's amber hazards, the sawhorse lamps and the flares (offender 22).

### 10. The road — the largest surface of the stage — **L**
- **What**: at the bottom corners 2 px texels (horizontal streak blocks, `crops/b07c_roadcorner.png`); in the middle a wide
  dark plane with one dash every 5 m, a few specks and puddles; every 10 m the same patch and pothole come round.
- **Where**: all move beats. `b07c` (0, 180, 240, 108); `b03b` (130, 150, 370, 138); `b11b` (120, 150, 400, 138).
- **Anti-pattern**: fat texels at 2 px, flat empty plane with specks, visible tile repeat (8 × 10 m), smooth headlight gradient.
- **Code**: `S/env.ts:buildRoad`, `S/pixel.ts:D3PixelWorld.road` (ribbons per 60 m chunk, `v0` continuous);
  `P/d3Ground.ts:d3RoadTile` / `paintRoad` (256 × 320), `d3VergeTile` (160 × 256).
- **Treatment**: **64**, 512 × 1280 (8 × 20 m, two different halves) — a night-rain road is painted with REFLECTIONS, not
  specks: (a) blue-black asphalt; (b) value structure along the travel direction: two polished wheel lanes per carriageway
  holding the sky (a step lighter, broken into long dashes 12–40 texels), the crown darker and matt, a dithered band toward
  each shoulder; (c) aggregate drawn as clusters only on the matt parts, patched trenches with a tar outline and a lit lip,
  tar snakes, a transverse joint every 20 m; (d) alligator cracking in one wheel lane, a pothole full of water, edge break-up
  with weeds, paint worn to ghosts (the dashes chipped into 3–4 pieces, edge lines interrupted); (e) storm debris painted in
  the tile (a palm frond, leaf drifts along the left edge, gravel washed across in a fan from the verge), cat's-eye studs
  beside every third dash (2 × 2 glint); (f) a darker wet margin where verge mud runs onto the asphalt. Unique 64-density
  decals over it every 15–25 m, placed by hash (no RNG): a drain grating with water swirling in (4 frames), a manhole,
  locked-wheel skids, a crushed fern smear, a spill of feed pellets, a dropped hard hat, a hub cap, a rainbow oil sheen.
  Verge 320 × 1024: ruts as shapes with standing water and a lit berm, kerb-less edge with grass tussocks drawn as fans
  6–10 texels, fallen fronds, stones, a culvert headwall every 60 m with water pouring out (4 frames). Middle lanes stay at
  two neighbouring tones where the fights are (15–25 m ahead): put the unique decals in the first 12 m and on the shoulders.

### 11. The mud stretch and its pools — **M**
- **What**: brown and blue blocks: 3–4 px texels under the sunk jeep, the big pool a flat blue slab with a staircase outline and
  square glints, ruts as straight brown stripes.
- **Where**: beat 12. `b12` (180, 150, 330, 138) → `crops/b12_mud.png`; `/tmp/pw2/audit-v1/d3-mud.png`.
- **Anti-pattern**: fat texels (2.3 px and more: the view model sinks 0.2 m), flat plane, muddy colour.
- **Code**: `S/env.ts:buildMud`, `S/pixel.ts:D3PixelWorld.road(…, mud)` / `puddle`; `P/d3Ground.ts:d3MudRoadTile` (256 × 128),
  `d3MudTile` (128²), `d3PuddleDecal` (64 × 48 a frame).
- **Treatment**: **64**; the 13 m ahead of the hold as one painting 512 × 832: churned mud modelled in three tones with wet
  highlights on every ridge (crisp, hand-placed), two deep ruts swerving to where the jeep sits, the truck's own ruts curving
  off to the left, duckboards laid by the crew (four planks, one snapped), pack footprints (three-toed, 8 texels) crossing,
  drowned grass, floating leaves; pools as WATER — the storm sky and the palm crowns mirrored in broken horizontal dashes, a
  lit meniscus round each island of mud, rain as 3–4 px crown ticks (not rings); ochre-to-umber ramp with violet shadows
  (no black). Puddle decals 128 × 96 a frame, two shapes, irregular lobed outlines.

### 12. Abutments and their posts — literally stacked cubes — **S**
- **What**: each bridge-end post is four grey blocks one on another (the concrete tile's lift line every 0.5 m), with dark
  specks; the abutment is a grey slab with dashes.
- **Where**: `b13c` (90, 150, 180, 100) → `crops/b13c_post.png`; `b13a` (245, 140, 135, 30); `b14` (195, 120, 235, 45).
- **Anti-pattern**: textured box, repeating grid, speckle as texture.
- **Code**: `S/env.ts:buildBridge` (boxes), `S/pixel.ts:D3PixelWorld.gorge` (`paintIn` with `P/d3Park.ts:d3ConcreteTile`).
- **Treatment**: **64**: a post module 48 × 112 — a battered rubble-stone pier (irregular stones with lit tops and shadowed
  joints, no courses lining up), a capstone with a reflector and an iron ring, moss on the weather side, a "3 T · ONE VEHICLE"
  plate; the abutment face 288 × 192 as coursed masonry with a weep hole dribbling (4 frames) and ferns in the joints; a
  cut-out fern / vine card over each top edge.

### 13. Smooth 3D light on flat ground — headlight, accent light, flashes — **foundation + S**
- **What**: the jeep's spot light is a soft oval gradient on the asphalt / deck / pad; the accent `PointLight` a soft pool on
  the plaza, the grass by the sparks, the truck roof; all with dozens of in-between colours ("tiny" 65–69 %).
- **Where**: `b02` (150, 160, 230, 70); `b04` (150, 150, 330, 70); `b13b` (230, 150, 170, 60); `b17a` (240, 195, 150, 35).
- **Anti-pattern**: smooth 3D light gradient; colours outside the ramps.
- **Code**: `S/jeep.ts:JeepViewModel` (`head` SpotLight), `S/env.ts:ParkEnv.update` (`this.point`), `P/material.ts`.
- **Treatment**: the foundation's ramp-step lighting must cover spot and point lights (whole tone steps, band edges dithered in
  TEXEL space). Painter's part: every surface the headlight sweeps (road, deck, pad, plaza) needs four clearly separated tones
  in its ramp so the steps read as drawn pools; verify on `d3:13:330` and `d3:4:240` that "tiny" falls.

### 14. The tour cars — white bricks with a stripe — **M**
- **What**: the crushed car by the fence gap, the overturned roadblock car (it also flies through the air, slowly tumbling, in
  full view) and the wreck on the boss road are a box body + a box cabin with one module a face.
- **Where**: `b08` (190, 120, 250, 80) → `crops/b08_roadblock.png`; `b09` (365, 80, 85, 45); `b11a` (500, 90, 124, 70);
  `b02` (240, 140, 60, 20).
- **Anti-pattern**: textured box, straight box silhouette.
- **Code**: `S/props.ts:tourCar`, `S/pixel.ts:paintTourCar` / `staticCar` / `followCar` (a follower mesh copies the hidden
  occluder's matrix), tiles of `P/d1Props.ts` (`d1CarSideModule` 148 × 32 …) — shared with d1.
- **Treatment**: a d3 fork (new `P/d3Cars.ts`), **64**, extruded profile (as offender 4): bonnet slope, raked screen, roof
  rack with a spotlight bar, arches, bull bar; the park livery with a door number and the emblem; crushed variant: roof
  stoved in as a notch in the profile, glass gone, a door hanging as a separate card, claw rakes down the flank; the underside
  (the roadblock car shows it to the camera): chassis rails, exhaust, propshaft, diff, a ruptured fuel line dripping (4-frame
  strip, with a rainbow sheen decal under it). The painted body must stay inside the occluder's box (RISKS).

### 15. FX: smoke discs, the explosion blob, flame cones, mud spray — **M (cross-stage owner for `Fx.ts`)**
- **What**: fire smoke is a pile of translucent grey circles 60–90 px across, each a screen-door checker; the explosion a soft
  orange airbrush blob; the fire a row of yellow spikes (cards on a cone silhouette); the wheel-spin mud two black dither discs.
- **Where**: `b11a` (240, 0, 220, 170) smoke, (270, 150, 85, 65) flames; `b09` (270, 85, 110, 80); `b12` (120, 210, 100, 60)
  and (400, 195, 110, 75).
- **Anti-pattern**: smooth gradient, screen-door dither over a large area, primitive silhouettes.
- **Code**: `src/fx/Fx.ts:dust` / `explosion` (`soft` sprites, own `FxRng`), `S/fire.ts:Fire` (`world.fx.dust` every 0.35 s),
  `S/pixel.ts:flameCard`, `P/d3Park.ts:d3FireModule` (32 × 48 a frame).
- **Treatment**: d3 side — repaint the fire strip at 64 (64 × 96 a frame, two variants): a wide ragged base, tongues that
  split and curl, a white-yellow core, orange body, red-brown tips, loose embers; lay 3 cards per fire in a fan (not on cones).
  In PIXEL WORLD give `Fire` a painted smoke column instead of `fx.dust` (FX has its own RNG: no gameplay draw moves): 3 billow
  cards 96 × 128 a frame, cauliflower lobes in three violet-grey tones with an orange under-light, rising and thinning. Add a
  scorch decal, a burning tyre and glowing debris cards after the blast. Raise with the FX owner: `PF.SMOKE` and the explosion
  need hand-drawn frames with hard clusters, no per-pixel checker.

### 16. The jungle floor beyond the verges — a dark green void — **M**
- **What**: between the verge and the first trees (lat 8–20 m) the terrain is one near-black green with faint horizontal
  streaks; hills are flat silhouettes; from the helicopter (b23x) the whole island is one navy plane.
- **Where**: `b03a` (0, 110, 190, 110); `b07c` (0, 130, 170, 60); `b08` (440, 150, 184, 80); `b23x` (60, 60, 500, 150).
- **Anti-pattern**: flat empty plane, muddy colour (crushed toward black: below the bible's #14122a floor).
- **Code**: `S/env.ts:buildTerrain` → `pixelTerrain` (per-vertex tint clamped 0.45–1), `S/pixel.ts:terrainCell`;
  `P/d3Ground.ts:d3FloorTile` (128², a fine sward of 3–7 texel clumps that vanishes at 10 m+).
- **Treatment**: 32 is right, the SCALE of the forms is wrong: repaint 256² (8 m) ×2 variants with big readable shapes —
  buttress roots snaking 60–120 texels with a lit ridge, leaf-litter drifts as light patches, fern rosettes seen from above
  (30 texels), puddles holding the sky, fallen fronds and a rotting log with bracket fungus, dark soil between; contrast two
  full tone steps so it survives the fog bands; hill cells get a "canopy from above" variant instead of a flat tint. Add
  FLORA-style prop billboards placed by hash (no RNG) in the empty band: termite mounds, fallen trunks with a root plate,
  boulders with ferns, heliconia clumps, a strangler-fig base.

### 17. The ticket kiosk and the planters — a plank cube and two brick cubes — **S**
- **Where**: `b04` (0, 90, 240, 110) → `crops/b04_kiosk.png`; `b05` (75, 100, 95, 85); `b03c` (0, 100, 80, 80).
- **Anti-pattern**: textured box (0.25 m horizontal planks = the wood-block look), straight silhouette, pyramid roof.
- **Code**: `S/env.ts:buildVisitorCentre` (kiosk group), `S/pixel.ts:D3PixelWorld.plaza` (`planksTile` box,
  `P/d3Visitor.ts:d3KioskWindowModule`, `d3BrickTile` planters).
- **Treatment**: 32, front and side modules 128 × 144 / 96 × 144 as cut-outs: a tiki ticket booth — bamboo corner posts lashed
  with rope, a woven-palm skirt, a deep shaggy thatch brow overhanging the hatch, the lit hatch with a brass grille, a roll of
  tickets, a rate board ("ADULT 45 · CHILD 30 · NO REFUNDS"), a rotating-postcard rack knocked into the counter, a CLOSED
  shutter half down, a string of four bulbs under the eave (two lit: 2 px glows); TICKETS as a carved, hanging board that
  swings (a pivot part). Planters: a low stone ring with a carved rim and a palm (FLORA, exists), not a cube.

### 18. The fallen palm log — a banded tube — **S**
- **Where**: `b11a` (0, 170, 270, 40); `b08` (110, 160, 110, 14).
- **Anti-pattern**: textured cylinder with uniform rings.
- **Code**: `S/flora.ts:brokenPalm`, `S/pixel.ts:D3PixelWorld.palmLog`; `P/d3Park.ts:d3PalmBarkTile` (32²), `d3FrondModule`.
- **Treatment**: 64 (the jeep passes within 3–5 m after the blast): a side-profile card 64 × 256 along the trunk crossed with
  the cylinder — leaf-scar diamonds, a splintered butt end with long pale fibres (cut-out), a crushed middle where the Tyrant
  stepped, the crown as five drooping frond cards 192 × 64 with a clump of coconuts.

### 19. The fountain — a ring of boxes and a flat yellow disc — **S**
- **Where**: `b04` (245, 125, 80, 50) (the disc at x 275–290 y 133–148); `b06` (290, 125, 85, 50).
- **Anti-pattern**: textured boxes; a flat untextured glow polygon; ring-shaped and bright in the fight zone.
- **Code**: `S/props.ts:visitorCentre` (fountain in `plaza`), `S/pixel.ts:D3PixelWorld.plaza` (ring boxes with `stoneTile`,
  `d3WaterTile`, the classic lamp sphere kept).
- **Treatment**: one cut-out billboard 224 × 128 × 4 frames at 32, crossed with a low basin card: a stone basin with a moulded
  lip overflowing in the rain, a bronze raptor-skeleton statue rearing on a rock (a silhouette that tells the park's theme),
  two weak jets and falling water (the 4 frames), two underwater lamps as cyan 2 px glows with a stepped cyan pool on the
  basin wall; drop the yellow sphere (keep an invisible object if a flicker list needs it).

### 20. Lamp posts — sticks with a box foot and a blob — **S**
- **Where**: `b07b` (60, 0, 180, 220) → `crops/b07b_lamp.png`; `b15` (40, 0, 30, 240); `b08` (140, 10, 70, 190).
- **Anti-pattern**: straight silhouette, fat texels at 1.6 px (5 m), flat glow polygon for the bulb.
- **Code**: `S/props.ts:lampPost`, `S/pixel.ts:D3PixelWorld.lampPost`; `P/d3Park.ts:d3PoleTile` (16 × 32), `d3LampHeadModule`.
- **Treatment**: one cut-out card 112 × 400 at 64, crossed at the foot: a park lamp with a cast base (bolts, a hatch), a
  tapering fluted pole with flaking green paint and rust blooms, a bracket with a scroll, a caged lantern with a glass bowl
  (GLOW core 3 × 3, a pale ring, then the cage drawn over it), a park pennant bracket with a torn pennant (4 frames), a
  loudspeaker on some, creeper to 1.5 m; dead variant: bowl smashed, wiring hanging. The classic bulb mesh goes (flicker
  toggles the lit card).

### 21. The helipad slab and its lights — **M**
- **What**: the last arena is a 26 m flat blue-grey slab with speckle and black blots, a fat-texel H, a saturated yellow ring
  and hazard border, and "edge lights" that are flat pale-green and yellow squares (cubes).
- **Where**: beats 17–23. `b17a` (0, 160, 360, 128) → `crops/b17a_pad.png`; `b19`; `b21` (70, 130, 500, 130); `b23x`.
- **Anti-pattern**: flat empty plane with specks, fat texels at 2 px, flat glow polygons, a bright ring under the enemies.
- **Code**: `S/props.ts:helipad`, `S/env.ts:buildHelipad`, `S/pixel.ts:D3PixelWorld.helipad`; `P/d3Vehicles.ts:d3PadTile`
  (128² wrap), `d3PaintStripeTile`, `d3PadLettersModule`, `P/surfaces.ts:hazardTile`; edge lights stay classic boxes.
- **Treatment**: **64**. Slab 512² wrap: poured bays 4 × 4 m with tar-filled joints, broom-finish drawn as long faint strokes,
  tie-down rings in recessed cups, rust weeps, hairline cracks with moss — and WATER: shallow sheets in the bay corners
  mirroring the edge lights as broken green / amber streaks and the sky as dashes. Markings as decals: the H 384 × 448 with
  rubber skid scuffs and paint worn through in the wheel paths, the ring as worn ochre (60 % coverage, tone 2–3: it must not
  out-shout a telegraph), "PARK RESCUE" letters, a painted wind arrow. Under the helicopter: hydraulic stains and a drip tray.
  Edge lights: a small dome fitting card (base, lens with a 2 px GLOW core, a 5 px halo) + a reflection streak on the slab;
  keep the classic blinkers' groups for the on / off timing but make their meshes these cards. A floodlight tower's stepped
  white pool painted over a third of the slab gives the plane a value structure.

### 22. Flare pools — flat red quads on the boss road — **S**
- **Where**: `b15` (420, 180, 70, 20); `h16` (185, 210, 50, 12).
- **Anti-pattern**: flat one-colour polygon; danger red on the ground next to the Tyrant's lanes.
- **Code**: `S/pixel.ts:D3PixelWorld.bossDressing`; `P/d3Park.ts:d3FlarePoolDecal` (64²), `d3FlareDecal` (16²),
  `d3FlarePlumeModule` (8 × 16).
- **Treatment**: 64: the pool as three stepped rings of TONE SHIFT toward a dull magenta-red ramp (never brighter than tone 3),
  dithered in texel space, broken by the verge's ruts; the flare itself a 4-frame plume 16 × 32 (white core, pink body,
  sparks dropping), smoke drifting downwind as a low card; keep them on the verges at lat ≥ 5.

### 23. Fence and wire cut-outs painted at 16 texels a metre — **S**
- **Where**: boss road `b15` (0, 120, 180, 60) and (440, 120, 184, 60), `b16b` (0, 170, 100, 60); paddock `b02` (540, 20, 84, 150).
- **Anti-pattern**: fat texels at 1.55–1.66 px, ruler-straight grey lines.
- **Code**: `S/pixel.ts:bossDressing` / `wireSpan`; `P/d3Park.ts:d3TornFenceModule` (96 × 48 for 6 × 3 m), `d3WireSpanModule`
  (96 × 144 for 6 × 9 m).
- **Treatment**: 32 (192 × 96, 192 × 288), drawn: sagging cables with a catenary per span, steel I-posts between the pylons
  with porcelain stand-offs, a torn span curling to the ground, warning plates, creeper and a strangler vine taking a post,
  rain glints as 2-texel dashes; five variants instead of three so the boss-road run does not repeat every 18 m.

### 24. Rain splash rings — grey "0" and "8" all over the ground — **S**
- **Where**: `b14` (200, 180, 290, 60); `b17b` (180, 195, 260, 80); `b21` (215, 195, 240, 60); `b07c` (0, 235, 60, 30).
- **Anti-pattern**: smooth geometric rings (not pixel shapes); ring-shaped and light, beside telegraph rings.
- **Code**: `S/weather.ts:Storm` (`splash`: 48 instanced `RingGeometry`, its own RNG).
- **Treatment**: keep the instancing and timing; in PIXEL WORLD swap the ring for a 3-frame painted crown (a 5 px tick, then
  two flecks, then a 3 px dash) in storm blue; the same shape as offender 1's hood splashes.

### 25. Snapped stumps, DANGER boards and far lettering — **S**
- **What**: the stumps in the gap are tilted boxes; "HIGH VOLTAGE" on the DANGER board, "BRIDGE" from the mud hold and half
  of the marquee are unreadable mush.
- **Where**: `b03a` (535, 120, 89, 80); `b01a` (420, 115, 55, 40); `b12` (245, 125, 35, 15); `b04` (185, 80, 90, 25).
- **Anti-pattern**: textured box; text drawn below the size the distance allows.
- **Code**: `S/pixel.ts:pylon` (stump branch) / `dangerBoard` / `roadSign`; `P/d3Park.ts:d3StumpFaceModule`,
  `d3DangerBoardModule` (3 × 5 font second line), `d3SignBoardModule`; `P/d3Visitor.ts:d3MarqueeModule`.
- **Treatment**: stumps: see 8. DANGER board: second line in the 5 × 7 bold font at ≥ 3 px a stroke at 12 m or replace it by a
  big bolt pictogram and "10 000 V"; hang the board at d 69 by one bolt (a pivot part swinging). BRIDGE: add a second, larger
  board with an arrow at d 322 where it reads from the hold. Marquee: letters on a 4-texel bulb pitch, 3 dead letters, not
  scattered dead bulbs.

### 26. The gorge — two navy bands — **M**
- **Where**: `b13b` (0, 140, 150, 148) and (480, 140, 144, 148); `b13d`; `b14` (0, 100, 190, 70) and (430, 100, 194, 70).
- **Anti-pattern**: flat empty plane (the fog wall hides the drop the bridge exists for).
- **Code**: `S/env.ts:terrainHeight` (gorge band), `buildBridge`, `S/pixel.ts:gorge`; `P/d3Ground.ts:d3RockTile`,
  `d3GravelTile`, `d3WaterTile`, `P/d3Bridge.ts:d3FoamModule`.
- **Treatment**: give the sides something painted to fall into (cut-out cards, no fog-proof geometry): on each side, 12–25 m
  out, two layers of rim silhouettes (leaning palms, hanging lianas, a rock prow) a fog step apart; rising mist as three wide
  low cards per side (96 × 48, 4 frames, drifting, two tones near the fog colour); upstream (left) a thin white waterfall
  down the far wall (24 × 160, 4 frames) with a spray card at its foot; pterosaur nests on a ledge (sticks, bones, two eggs)
  — this is where the bridge's fliers come from; rock strata repainted at 256² with ledges and ferns for the look-back view.

### 27. The helicopter — a white box and a tube — **M**
- **Where**: `b17a` (240, 100, 200, 80) → `crops/b17a_heli.png`; `b20` (255, 105, 175, 65); `b19`.
- **Anti-pattern**: textured box, straight silhouette, smooth light gradient on the boom.
- **Code**: `S/props.ts:helicopter`, `S/pixel.ts:D3PixelWorld.helicopter` (`paintIn` + side / nose / soot panels);
  `P/d3Vehicles.ts:d3HeliSideModule` (116 × 64), `d3HeliNoseModule`, `d3LiveryTile`, `d3RotorDiscModule`.
- **Treatment**: one whole-profile cut-out per flank at **48** (560 × 208: nose to tail rotor) on the body's centre plane
  offsets, crossed with a top-profile card: a light utility helicopter — bubble canopy with frame and a storm highlight, a
  sliding door open on a lit cabin (a stretcher, a winch, the pilot's helmeted silhouette turning), engine cowl with exhaust
  and soot, a tapering boom with a stabiliser, fin, tail-rotor guard and a white strobe, skids with steps and a rescue basket,
  the cheat line and "PARK RESCUE" in 5 × 7, rivet lines, rain sheeting off the belly; drooping blades when still, the blur
  disc (128², 3 tones) when spinning; rotor-wash rings of spray on the slab under it (4-frame card) once it spins.

### 28. The helicopter cabin (beats 21–23, the campaign's last image) — **M**
- **What**: two flat black slabs left and right, a "handle" of fat orange blocks, a hazard sill of 5 px staircase stripes, a
  floor of 8 px diamonds; outside, the pad in a flat navy void.
- **Where**: `b21` (0, 0, 60, 288), (570, 0, 54, 288), (75, 262, 480, 26); `b23x` (0, 200, 624, 88) and the whole frame.
- **Anti-pattern**: fat texels at 4–9 px, flat planes, flat empty world.
- **Code**: `S/jeep.ts:JeepViewModel.buildCabin`, `S/jeepPixel.ts:paintCabin` / `bar` / `sill`; `P/d3Jeep.ts:d3BarTile`,
  `d3SillTile`, `d3TreadPlateTile`, `d3SteelTile`.
- **Treatment**: **128** modules: door posts 32 × 336 as dark silhouettes with a rubber seal line, a rivet row and a moon-side
  edge (calm: 2 tones); a header with a stencilled "EXIT · PULL" and a dome lamp; the sill with hazard chevrons 8 texels wide,
  scuffed to steel in the middle; the floor's tread pattern at 4 texels a lozenge, worn smooth by the door; the grab handle a
  yellow tube with knurling; one swinging part: a cargo strap with a carabiner (4 frames). Outside: offender 16's canopy-
  from-above terrain, the pad's light pools, the burning tank and the Tyrant's carcass, far lodge lights.

### 29. The control hut, the masts, the parked jeep — **S**
- **Where**: hut `b21` (330, 105, 65, 40), `b22` (495, 75, 129, 65); plaza mast `b07a` (40, 20, 60, 140), `b06` (395, 70, 30,
  85); parked jeep `b21` (70, 85, 120, 110).
- **Anti-pattern**: textured box; straight sticks; fat texels on the parked jeep.
- **Code**: `S/pixel.ts:helipad` (hut, mast), `plaza` (mast), `S/index.ts:board` → `buildJeepBody(env.baker)` (a second
  `D3JeepPixel`, see RISKS).
- **Treatment**: hut 128 × 112 + 112²: a prefab radio shack on blocks — ribbed panels, a lit window with a radio set (two
  blinking LEDs) and a mug, a door ajar, an aerial with guy wires and a spinning anemometer (4 frames), a fire point (red
  box, two extinguishers), fuel-hazard placards. Masts: lattice floodlight towers as cut-out cards (64 × 304), the plaza's
  bent over with its head hanging by cables. The parked jeep: a 64-density three-card stand-in (side, top, rear profile),
  not the 128 view-model tiles.

### 30. Sawhorses, drums and the roadblock as a whole — thin for a set piece — **S**
- **Where**: `b08` (190, 120, 250, 80); `b10`.
- **Anti-pattern**: flat cards / plain cylinders at 32 that the jeep later passes at 3–5 m; a set piece that fills 6 % of the frame.
- **Code**: `S/env.ts:buildRoadblock` / `spawnRoadblockDrums`, `S/pixel.ts:sawhorse` / `drum` / `drumTiles`;
  `P/d3Park.ts:d3BarrierBoardModule` (84 × 10), `d3DrumTile` (64 × 32), `d3DrumLidModule`.
- **Treatment**: 64: sawhorse as one cut-out card 176 × 88 crossed with its A-frames (boards with reflective chevrons, a
  sandbag on the foot rail, the lamp housing); drums 128 × 64: rolled hoops with highlights, a dented side, a flammable
  diamond, a bung, fuel weeping from a seam (they are the target: keep them the brightest props). Dressing: §4.

### 31. The lightning fork — a 3 px staircase — **S**
- **Where**: `b07c` (170, 0, 95, 130); `/tmp/pw2/audit-v1/d3-boss.png` (500, 0, 80, 170).
- **Anti-pattern**: fat texels (64 × 192 texels stretched over 42 × 126 m).
- **Code**: `P/d3Sky.ts:d3BoltModule`, `S/pixel.ts:boltGeometry`, `S/weather.ts:Storm.usePixelSky`.
- **Treatment**: 192 × 576 per fork, three forks: a 2 px core with a 1 px pale-violet fringe, branching at acute angles into
  hair-thin (1 px) feelers, a glow knot where it enters the cloud.

### 32. Direction and EVACUATE boards seen from behind / too close — **S**
- **Where**: `b15` (200, 130, 62, 35) (plank back with ruler stripes); `b16d` (540, 135, 60, 110); `h16` (470, 170, 70, 35).
- **Anti-pattern**: flat striped rectangle; mirrored / unreadable text in the look-back view.
- **Code**: `S/pixel.ts:roadSign` / `bossDressing`; `P/d3Park.ts:d3SignBoardModule`, `d3PoleTile` back.
- **Treatment**: a painted back (battens, bolt heads, a wasp nest, creeper) and silhouette (a pitched cap board, a broken
  corner); make sure each boss-road board faces the camera of the phase it is seen in, and keep it at lat ≥ 6.

### 33. The fuel tank, pad barrels and trailer — **S**
- **Where**: `b16d` (400, 150, 85, 60); `b23` (325, 60, 55, 40).
- **Anti-pattern**: plain cylinder with one enamel tile; the finale's target has no story round it.
- **Code**: `S/props.ts:fuelTank`, `S/env.ts:spawnTank` / `armFinale`, `S/pixel.ts:fuelTank`; `P/d3Vehicles.ts:d3EnamelTile`,
  `d3TankPlateModule`, `d3CapModule`.
- **Treatment**: 64 profile card 336 × 224 over the cylinder: a bowser on a trailer — dished ends with weld seams, a manhole
  with a ladder, a hose reel and nozzle, "AVGAS" and a flame diamond, a grounding cable, a drip tray, an amber beacon (the
  classic `warn` stays); the hit volume is unchanged. Depot dressing in §4.

### 34. Glow sources as flat polygons — **S**
- **What**: lamp bulbs (white blobs), the lodge's red beacon box, pylon lamps, the truck's hazards, the sawhorse lamps, the
  helicopter's nav lights, the spark glows: untextured `Kit.glow` meshes kept classic.
- **Where**: `b07b` (175, 15, 25, 15); `b05` (265, 115, 10, 8); `b12` (115, 138, 12, 8); `b17a` (30, 165, 180, 20).
- **Code**: `S/props.ts` (every `Kit.glow`), `S/env.ts` (`blinkers`, `flickers`, `sparkGlows`).
- **Treatment**: each becomes a small GLOW card (core 2–3 px of the lightest tone, one ring of the ramp's next tone, 4 corner
  pixels of halo) toggled by the same blinker / flicker object; sparks get a 4-frame burst strip.

### 35. Vegetation billboards closer than 6 m (boss view) — **raise with the FLORA owner**
- **Where**: `/tmp/pw2/audit-v1/d3-boss-mag.png` (yellow / orange palms at both edges and bottom corners); `b16a` (430, 0, 194, 288).
- **Anti-pattern**: fat texels at 1.5–2 px on the nearest palms and ferns.
- **Code**: `S/env.ts:buildVegetation` / `floraPut`, `content/pixel/floraSpecies.ts` (not a d3 painter).
- **Treatment**: a 2× atlas for the species within 7 m of the rail, or a near-variant per species; not this stage's painters.
## 3. DENSITY MAP

How the distances were worked out. The rig is in `drive` mode: eye 2.05 m above the rail (`RailRig` `EYE.drive`), pitch −0.03 rad,
58° vertical / 100° horizontal field of view at 624 × 288. The lowest ray at the bottom-centre of the frame meets the ground 3.45 m
ahead (slant 4.0 m); at the bottom corners 5.9 m. So **flat ground along the rail is first seen at 4.0 m** (2.0 frame px per texel at
the first pass's 32 texels a metre) whatever the look direction; anything standing `lat` metres beside the rail is nearest at about
`sqrt(lat² + 1)` m when it slides out at the frame edge. The fog is linear 7 → 80 m (`FOG_NEAR` / `FOG_FAR`, env.ts), fog culling at
86 m: at 30 m a surface is already 31 % fog, at 45 m 52 %. The jeep is measured from the eye at (0, 2.05, 0) in the body frame of
`buildJeepBody`. `px/tx now` = 260 / (density × distance) at the nearest normal view.

### 3a. The jeep atlas (`d3-jeep`, its own atlas; `D3_JEEP_TPM` = 48 today, every tile a 32² / 64² wrap)

| surface | nearest view | px/tx now | tier | painted today | new native tile (texels) |
|---|---|---|---|---|---|
| mounted gun: pedestal, receiver, feed box, shroud, barrel (camera-locked, x 340–400 y 205–288 of EVERY frame) | 0.9–1.8 m | 6.0–3.0 | **screen-space sprite, 256** | `d3SteelTile` 32² ×3, `d3JeepPaintTile` 64² | 2 crossed profile cards 0.34 × 1.9 m: 96 × 496 ×2 = 95 k |
| hood top, bonnet panel, sand stripes, vents, clips | 1.9–3.3 m | 2.9–1.6 | **128** | `d3JeepPaintTile` 64² wrap, `d3HoodMarking` 48² | ONE hood module 1.94 × 3.3 m: 256 × 432 = 111 k |
| folded windscreen: frame + glass 1.62 × 0.5 m (the flat navy slab 195 × 38 px at the bottom-centre) | 1.9–2.3 m | CLASSIC flat colour | **128**, 4-frame strip | none (`clean(0x26323c)`) | 208 × 64 × 4 = 53 k |
| front wings / mudguards, headlamp pods, bull bar | 2.6–3.4 m | 2.1–1.6 | **128** | `d3JeepMudTile` 32², `d3TubeTile` 16 × 128 | wing 48 × 160; bull-bar card 240 × 64: 23 k |
| body side rails (the green boxes in the bottom corners when the body counter-rotates) | 1.3–2.0 m | 4.2–2.7 | **128** | `d3JeepPaintTile` | 336 × 64 = 22 k |
| rear deck in the look-back (boss) view: tailgate, spare wheel, bed floor, jerry cans, kit bag, seat backs | 1.1–1.7 m | 4.9–3.2 | **128** | `d3JeepPaintTile`, `d3TyreTile`, `d3TreadPlateTile`, `d3JerryTile`, `d3CanvasTile` (32² each) | tailgate 240 × 72, wheel 104², floor 232 × 320, cans 32 × 56 ×3, bag 64 × 48, seats 80²: 118 k |
| roll hoop (frames the whole boss fight), beacon, clamps | 1.6 m | 3.4 | **128** | `d3TubeTile` 16 × 128 | tube 32 × 256 + bracket / beacon card 64²: 12 k |
| helicopter cabin (beats 21–23): door posts, header, sill hazard edge, floor, skid, struts, grab handle | 0.6–1.4 m | 9.0–3.9 | **128** (posts are silhouettes: keep them near-black and calm) | `d3BarTile` 16 × 64, `d3SillTile` 32 × 16, `d3SteelTile`, `d3TreadPlateTile` | posts 32 × 336 ×2, header 352 × 56, floor 352 × 208, sill 352 × 16, skid 16 × 464: 125 k |

Jeep atlas: 43 776 texels today → ≈ 0.56 M (a 1024 × 1024 page, 2.8 MB at two bytes a texel with levels; 1024 × 512 if packed tight).

### 3b. Ground (world atlas `d3`)

| surface | nearest view | px/tx now | tier | painted today | new native tile (texels) |
|---|---|---|---|---|---|
| road carriageway (ribbon 8 m wide) | 4.0 m | 2.0 | **64** | `d3RoadTile` 256 × 320 wrap (8 × 10 m) | 512 × 1280 wrap (8 × 20 m: two different 10 m halves) = 655 k |
| verges (ribbons 5 m wide, lat 3.4–8.4) | 4.0 m | 2.0 | **64** | `d3VergeTile` 160 × 256 wrap | 320 × 1024 wrap (5 × 16 m) = 328 k |
| mud stretch road (d 295–320; the hold stands on it) | 3.6 m (the jeep sinks 0.2 m) | 2.3 | **64** | `d3MudRoadTile` 256 × 128 wrap | 512 × 832 (8 × 13 m, the 13 m ahead of the hold unique; wraps behind) = 426 k |
| mud terrain cells beside it (lat < 13) | 4.5 m | 1.8 | **64** | `d3MudTile` 128² planar | 256² = 66 k |
| jungle floor beyond the verges (lat > 8.4), hills | 8.6 m | 0.94 | **32** | `d3FloorTile` 128² planar (4 m) | 256² (8 m) = 66 k + a second "root & litter" variant 256² |
| gorge walls (strata) | 10 m+ | 0.8 | **32** | `d3RockTile` 64² | 256² = 66 k |
| gorge bed gravel, river | 17 m+ | 0.5 | **32** (fallback) | `d3GravelTile` 64², `d3WaterTile` 64 × 256 | 2× fallback: 16 k + 66 k |
| puddles on the road / mud pools | 4.0 m | 2.0 | **64** | `d3PuddleDecal` 64 × 192 (4 frames) ×2 | 128 × 384 × (2 kinds × 2 shapes) = 197 k |
| Tyrant prints, skids | 4.0 m | 2.0 | **64** | `d3FootprintDecal` 64 × 80 ×2, `d3SkidDecal` 32 × 192 | 128 × 160 ×2 + 64 × 384 = 66 k |
| NEW road / verge story decals (see §4) | 4.0 m | — | **64** | — | ≈ 200 k |
| lamp light pools (painted, 4.5 × 5.5 m) | 4.5 m | CLASSIC screen-door disc | **32** (soft shapes: tone shifts only) | none (`ditherPool`) | 144 × 176 ×2 = 51 k |

### 3c. Paddock stretch (d 6–122)

| surface | nearest view | px/tx now | tier | painted today | new native tile (texels) |
|---|---|---|---|---|---|
| pylons (lat 10.5, 9.5 m tall) | 10.3 m | 0.79 | **32** | `d3PylonFaceModule` 29 × 304 ×2, `d3ConcreteTile` 32 × 64, `d3InsulatorModule` 42 × 8 | cut-out front 48 × 320 ×2 + side 32 × 320 = 41 k |
| snapped stumps in the gap | 10.3 m | 0.79 | **32** | `d3StumpFaceModule` 29 × 102 ×2, `d3RubbleTopModule` 32² | cut-out 64 × 128 ×2 = 16 k |
| wire spans (cut-out panels 6 × 9 m) | 10.5 m | **1.55** (painted at 16) | **32** | `d3WireSpanModule` 96 × 144 ×3 | 192 × 288 ×3 = 166 k |
| DANGER boards (lat 9.5) | 9.6 m | 0.42 (already 64) | **64** kept, repainted | `d3DangerBoardModule` 240 × 116 | same size = 28 k |
| crushed tour car by the gap (d 73, lat 6.6) | 6.2 m | 1.3 | **64** | d1 car modules (side 148 × 32, cabin 96 × 28, front / back 64 × 32, under 64 × 148, paint 64²) | profile side 304 × 128 ×2, ends 128 × 96 ×2, roof / belly 128 × 304 ×2 = 180 k (shared by the 3 tour cars) |
| lamp posts (lat ±5), fallen lamp | 5.2 m | 1.56 | **64** | `d3PoleTile` 16 × 32 wrap, `d3LampHeadModule` 24 × 12 | cut-out card 112 × 400 (lit) + head variants = 60 k |
| direction boards (lat ±5.8), EVACUATE boards | 5.9 m | 1.0 (painted at 4 texels a glyph pixel = 36–57 texels/m) | **64** (6 texels a glyph pixel; keep the whole-letter levels and `D3_SIGN_FITS`) | `d3SignBoardModule` | ≈ 2.2× today: 60 k for the 6 boards |

### 3d. Visitor centre (hold at d 168; the lodge front is 31 m off the rail)

| surface | nearest view | px/tx now | tier | painted today | new native tile (texels) |
|---|---|---|---|---|---|
| plaza pavers (lat −4 … −25) | 4.5 m | 1.8 | **64** | `d3PaverTile` 64² wrap + calm levels | 512² wrap (8 m) = 262 k |
| plaza emblem mosaic (6 × 6 m, lat −9.6) | 9.8 m | 0.83 | **64** (unique, the eye rests on it) | `d3MosaicModule` 96² | 384² = 147 k |
| kerb between road and plaza, plaza dressing cut-outs | 4.5–12 m | — | **64 / 32** | — | ≈ 200 k |
| ticket kiosk (d 169, lat −17) | 17 m | 0.48 | **32** | `planksTile` wrap box, `d3KioskWindowModule` 64 × 40, `d3ThatchTile` | front 128 × 144 + side 96 × 144 = 32 k |
| fountain (lat −18) | 24 m | 0.34 | **32** | `stoneTile` boxes, `d3WaterTile` | cut-out 224 × 128 × 4 frames = 115 k |
| lodge wings (stucco, 8 windows each) | 28–45 m | 0.29–0.18 | **32** (design every form ≥ 4 texels: it is seen at ¼ scale) | `d3StuccoTile` 64² wrap, `d3WingWindowModule` 80 × 84 ×4, drip / foot bands | ONE module per wing 400 × 288 ×2 = 230 k |
| atrium front | 31–36 m | 0.52–0.45 (glass painted at 16) | **32** | `d3AtriumModule` 192 × 144, stucco | 480 × 416 = 200 k |
| thatch roofs, eaves, finials (silhouette against the sky) | 33–50 m | 0.24 | **32** | `d3ThatchTile` 64² wrap, `d3FringeTile` 64 × 32 | wing roof 512 × 256, centre 512 × 320, ridge / eave cut-outs 512 × 64 = 328 k |
| portico: fascia, marquee, columns, doors, lobby | 27–31 m | 0.30 | **32** | `d3FasciaTile`, `d3MarqueeModule` 416 × 45, `d3ColumnTile`, `d3LodgeDoorModule` 72 × 156, `d3LobbyModule` 80 × 84 | fascia 896 × 32, marquee 416 × 48, column 64 × 256, doors 72 × 160 ×2, lobby 160 × 176 = 116 k |

### 3e. Roadblock, mud truck, bridge, boss road, helipad

| surface | nearest view | px/tx now | tier | painted today | new native tile (texels) |
|---|---|---|---|---|---|
| roadblock car (hold 15 m; then it flies and lands beside the road) | 6–15 m | 1.3–0.54 | **64** | d1 car modules | shared with the paddock car |
| sawhorses, drums, palm log (hold 11–14 m; driven through / past after the blast) | 3–5 m | 2.7–1.6 | **64** | `d3BarrierBoardModule` 84 × 10, `d3DrumTile` 64 × 32, `d3PalmBarkTile` 32², `d3FrondModule` 96 × 32 | horse card 176 × 88 ×2, drums 128 × 64 ×2, log 64 × 256 + crown cards 192 × 64 ×2 = 82 k |
| fire, smoke column, scorch, debris | 5–15 m | 1.6–0.54 | **64 / 32** | `d3FireModule` 32 × 192 ×2 | fire 64 × 384 ×2, smoke 96 × 512, decals = 140 k |
| maintenance truck (d 314, lat −6.6; the hold's biggest prop for 13 s+) | 5–7 m | 1.6–1.2 | **64** | `d3TruckDoorModule` 64 × 52, `d3TruckFrontModule` 70 × 52, `d3EnamelTile` 32², `d3CraneTile` 32 × 16, `corrugatedTile`, CLASSIC glass | profile side 432 × 192, front 160 × 176, rear 160 × 128, bed top 152 × 256, crane card 288 × 48, wheels 64² = 190 k |
| bridge deck (7.6 m wide, 44 m long) | 4.0 m | 2.0 (levels forced a step and a half down: flat) | **64** | `d3DeckTile` 64² + calm levels + bias 1.5 | 512² wrap (7.6 × 8 m) = 262 k |
| bridge rails (lat ±3.9) | 4.0 m | 2.0 | **64** | `d3TimberTile` 32 × 64 on boxes | cut-out span card 256 × 96 ×3 = 74 k |
| abutments and their posts | 4.6 m | 1.8 | **64** | `d3ConcreteTile` 32 × 64 | post 48 × 112 ×2, abutment face 288 × 192 = 66 k |
| trestle towers, falling pieces | 12 m+ | 0.68 | **32** | `d3TimberTile` | 64 × 128 = 8 k |
| gorge mist banks / far rim (new) | 15 m+ | — | **32** | — | ≈ 150 k |
| boss-road fence (lat ±9.7) | 9.8 m | **1.66** (painted at 16) | **32** | `d3TornFenceModule` 96 × 48 ×3 | 192 × 96 ×3 = 55 k |
| flares, EVACUATE boards, leaning pole, new wrecks (§4) | 5.5–9 m | 1.5–0.9 | **64** | `d3FlareDecal` 16², `d3FlarePlumeModule` 8 × 16, `d3FlarePoolDecal` 64² | ≈ 200 k |
| helipad slab (26 × 26 m; the jeep drives onto it) | 4.0 m | 2.0 | **64** | `d3PadTile` 128² wrap, `d3PaintStripeTile` 16 × 64, `d3PadLettersModule` | slab 512² wrap + H 384 × 448 + ring 32 × 256 + letters = 460 k |
| control hut, floodlight mast, windsock | 15–18 m | 0.5 | **32** | `corrugatedTile`, `d3HutWindowModule` 64 × 48, `d3FloodheadModule`, `d3WindsockModule` 84 × 26 | hut 128 × 112 + 112², mast card 64 × 304, sock 96 × 32 × 4 = 57 k |
| helicopter (12 m at BOARD, 21 m at HELI_STOP; 11.6 m long: the last hero prop) | 12 m | 0.68 | **48** (between tiers on purpose: it fills a third of the frame's width) | `d3HeliSideModule` 116 × 64, `d3HeliNoseModule` 100 × 68, `d3LiveryTile` 32², `d3RotorDiscModule` 64² | whole-profile card 560 × 208 ×2 + rotor disc 128² = 249 k |
| fuel tank (lat −6.8; 17 m in the final lunge) | 5.7 m | 1.4 | **64** | `d3EnamelTile`, `d3TankPlateModule` 48 × 36, `d3CapModule` 32² | profile 336 × 224 + cap 152² = 98 k |

### 3f. The bill

| group | texels today | texels after |
|---|---|---|
| ground (3b) | ≈ 0.25 M | 2.27 M |
| paddock (3c) | ≈ 0.16 M | 0.49 M |
| visitor centre (3d) | ≈ 0.15 M | 1.63 M |
| roadblock + truck + bridge + boss road + helipad (3e) | ≈ 0.16 M | 2.09 M |
| small shared tiles left on the 2× fallback (concrete, pole, steel, enamel, planks, stone, corrugated, hazard, cable, vines, fronds, banners …) | ≈ 0.12 M | 0.48 M |
| **world atlas `d3`** | **0.844 M (1024 × 1056, 155 tiles, 5.8 MB RGBA with levels)** | **≈ 7.0 M → one 4096 × 2048 page (8.4 M slots, 83 % full): 22.4 MB at two bytes a texel × 1.33** |
| sky `d3-sky` (one level) | 0.72 M (2.9 MB RGBA) | 0.72 M (1.4 MB indexed) |
| jeep `d3-jeep` | 0.044 M (0.35 MB) | 0.56 M (2.8 MB as a 1024² page) |
| FLORA (`d3`, `d3-stones`, R8) | ≈ 0.9 MB | ≈ 1.2 MB (prop species added) |
| **total** | **≈ 9.9 MB** | **≈ 27.8 MB allocated — inside the 48 MB budget with 20 MB to spare** |

**Memory does not force anything onto the fallback. Paint time might**: the stage paints 1.6 M texels today in ≈ 110–120 ms of
node CPU (305 + 225 + 17 ms in this capture's loaded browser); 8.3 M texels at the same cost per texel is 0.57–0.62 s of CPU, and
illustrated modules are dearer per texel than today's wrap tiles. Keep a ledger per slice (`D3_BENCH=1 … d3-lab.test.ts`) against
the 1.2 s budget. If it overruns, leave on the 2× fallback, in this order: (1) the shared small tiles above; (2) gorge gravel,
river, trestle towers; (3) the helipad hut, mast and windsock; (4) the lodge roofs and wing façades (seen at ¼ scale through
30–50 % fog: there the upscaled tile and a native one differ least — but still add the roofline cut-outs); (5) the boss-road
fence. Never on the fallback: the jeep, the road / verge / mud ribbons, the plaza pavers, the bridge deck, the helipad slab, the
truck. A 4096-wide page is at the size limit of older phones: if the foundation caps pages at 2048, split the world atlas in two
by rail distance (d < 300 / d ≥ 300: +1 draw call per material in the chunk that straddles it).
## 4. SCENE BY SCENE — what a Metal Slug / Street Fighter III background artist would have painted here

Positions are `(d, lat)`: rail distance and metres right of the rail (negative = left). Everything below is paint only
(batches, cut-out cards, FLORA-style billboards, decals): no occluder, collider, raycast target or RNG draw; new props are
placed by constants or `hash2`, as `bossDressing` already does. "4 f" = a 4-frame strip on the stage's shared animated
material (`D3_ANIM_FRAMES` = 4 at 8 fps: every strip is a 0.5 s loop — slower motion is a pivot part or a visibility toggle,
see RISKS). Tall things stay at |lat| ≥ 8.5, small things at |lat| ≥ 5, flat decals anywhere at ± 1 tone.

### A. Paddock road and the torn fence (beats 0–3, d 0–125)
- **Story**: it is a T-rex paddock and nothing says so. Between the pylons, steel I-posts with stand-off insulators every 2 m
  (in the wire-span cut-outs) so the row reads as a FENCE, not a colonnade. A keepers' service gate at d 30–36 (double steel
  gate, keypad pedestal, chain, "AUTHORISED KEEPERS ONLY", a red FENCE FAULT lamp box on the pylon). A feeding crane inside
  the paddock at (84, 13): a lattice jib with the goat cage hanging at 6 m, its chain snapped, the door open. By the gap at
  (50, 7.5): a keeper's electric cart on its side, a dart-rifle case burst open, darts in the mud, a hard hat in a puddle, a
  torch still lit on the ground. In the gap (d 53–65, lat 9–12): the cables curled on the ground, the top third of a pylon
  lying across the verge with its hazard band, the DANGER board on its face with three rakes through it. On the left
  (d 60–75, lat −9 … −16, where the prints lead): a swathe of flattened ferns, two palms snapped at 3 m with splintered
  tops either side of the trail. At the crushed tour car (73, 6.6): its torn-off door 3 m away, a child's backpack, a
  souvenir cup. At (110, 9.6): a tilted billboard "T-REX PADDOCK · FEEDING 15:00" with a painted rex.
- **Light**: the sparking cable ends (cold blue-white: the stage light flickers; paint a fixed cyan rim on the stump edges and
  two rings of wet glints on the verge); the torch's long cold beam along the ground (stepped, 3 m); the cart's amber beacon
  (4 f, with a 2 × 2 m pool); a 3 px red halo on every pylon lamp and a red glint down the wet arris; the lamp posts' pools
  (offender 9); the billboard's failing lamp.
- **Silhouettes against the sky**: pylon caps with lamp cages, loudspeaker horns, insulator discs; the crane jib and cage;
  wire catenaries carrying vines and a shredded tarpaulin; palm fronds through the wires.
- **Loops**: spark burst (4 f); a torn cable end swinging (pivot); the cage swaying (pivot); tarpaulin / warning tape
  flapping (4 f); cart beacon (4 f); the DANGER board at d 69 hanging by one bolt (pivot); FENCE FAULT blink (toggle).
- **Remove**: the concrete block grid, the box plinths and caps, the hazard band's full saturation (wear it on every pylon,
  drop it on every second), the uniform vine panel on the spans.
- **Calm**: the road, the gap's mouth and the right verge between d 50 and d 66 (x 230–560, y 120–205 at the hold).

### B. The jungle roads (beats 3, 7, 11, 13; d 122–160, 205–236, 262–294, 320–338)
- **Story** — a park road kit, one item every 18–30 m on alternating sides: (128, −6.5) a species board
  "DILOPHOSAURUS ENCLOSURE →" under a small thatched cap; (150, 6.5) a tram-stop shelter (bamboo posts, bench, timetable, a
  bin on its side, two abandoned suitcases); (156) a welcome banner strung across the road at 5.5 m between two poles, torn
  in the middle; (208, −7) an ice-cream barrow tipped over, its parasol inside-out, cones on the verge; (214, 7.5) a fallen
  trunk with its root plate; (216, −16) a rangers' watch-tower on stilts with a dead searchlight; (228, 6) a folding "ROAD
  CLOSED AHEAD" sign and two cones; (266, −7) a staff quad bike, headlamp on, an indicator blinking; (276, 7) a culvert
  headwall in flood, a marker post "KM 3"; (286, −6.5) a utility pole with a transformer, wires running on to the mud
  truck; (292, 6.5) "FLOODING · SLOW" half under water; (330, 6) a ranger's poncho snagged on a branch, a storm lantern
  dropped under it, still lit. Plus offender 10's road decals and offender 16's forest-floor forms and prop billboards.
- **Light**: the quad's headlamp (cold stepped beam on the verge), the lantern (warm 1.5 m pool), the shelter's bulb, the
  lamp posts' painted pools, the banner poles' dead floodlights.
- **Silhouettes**: watch-tower, utility poles and their sagging wires, shelter roof, banner halves, the root plate.
- **Loops**: culvert torrent (4 f); banner halves (two pivots); poncho (4 f); quad indicator (toggle); shelter bulb
  (flicker list); pennants on lamp posts (4 f).
- **Remove**: the verge ruts as ruler stripes; the terrain's black-green.
- **Calm**: the road and both verges to |lat| 5 from 8 m ahead of the jeep; keep the banner dull (two dark reds) and ≥ 5.5 m
  up: the ambush packs land under it.

### C. The visitor centre (beats 4–6, hold at d 168; the lodge root at (184, −30), its +z toward the road)
- **Story**, in three belts round a calm middle. *Kiosk corner* (d 162–173, lat −10 … −22): six rope-queue stanchions (three
  fallen), an A-board "PARK CLOSED · STORM WARNING", a souvenir barrow on its side — plush dinosaurs, sun hats, a postcard
  carousel, postcards plastered to the wet pavers —, two café tables with parasols (one inside-out), a bin spilling cups, a
  bunch of balloons snagged on a stanchion. *Lodge steps and portico*: a luggage trolley with suitcases, a dropped camera, wet
  footprints and a drag smear from the doors, glass shards under the smashed window, two benches, potted palms either side of
  the doors (one toppled, soil fanned out), an "EVACUATION ASSEMBLY POINT" sign with an arrow. *Kerb* (lat −4 … −6, outside
  local x −12 … +14): bollards with a chain (two knocked flat), "TOUR VEHICLES ONLY" lettered on the asphalt of the drop-off
  bay (d 176–190, low contrast), and at d 206–218 a parked tour tram (three open cars, striped canopies) with one door open.
  Centre: the fountain's bronze skeleton (offender 19). Rim: six twin-globe plaza lamps at local (±18, 8), (±18, 22),
  (±8, 24.5) — two lit, one flickering, three smashed. The bent lattice floodlight tower at local (15, 12).
- **Light** (this is the scene's structure — today it is one smooth pool): the marquee's bulbs thrown down the wet steps and
  pavers as broken warm streaks 8 m long toward the camera; three hanging portico lanterns with stepped pools; lit rooms with
  a warm sill and a pool on the portico floor; the red beacon as a two-ring pool on lintel and steps only; the fountain's two
  cyan lamps; the kiosk hatch's warm pool (2 × 1.5 m) on the pavers; the two lit plaza lamps (3 m pools at the kiosk corner
  and the far kerb); the tram's cabin light; a moon-side pale-blue edge line on every roof ridge.
- **Silhouettes**: the roofline kit (finials, lightning rod, dish, aerial with a red lamp, weather vane, shredded flag), the
  bent tower, the statue, parasols, the kiosk's thatch brow, the tram canopies.
- **Loops**: one buzzing marquee letter (toggle) with three dead ones; fountain water (4 f); a spouting downpipe (4 f); the
  roof flag (4 f); banners (pivots, exist); the red beacon (blinker, exists); balloons bobbing (pivot); tram light flicker.
- **Remove**: the red-brown mosaic colour, the calm-level flattening of the pavers, the plank cube, the brick cubes, the
  yellow sphere, the horizontal drip-band stripes, the stick mast.
- **Calm**: local x −8 … +12, z 5 … 24 (doors → fountain → kerb): pavers at two neighbouring tones, no props, no pool
  brighter than +1 step; in frame x 170–480, y 125–255.

### D. The roadblock (beats 8–10, hold at d 238, the block at d 253)
- **Story**: spilled luggage in front of the car at d 250–252, lat 0 … 3 (two burst suitcases, clothes plastered to the road,
  a cooler, a souvenir umbrella: all ≤ 0.4 m high); "ROAD CLOSED" on the right sawhorse; warning tape from sawhorse to drum
  to sawhorse, one end loose; three flares in a diagonal on the right shoulder edge (d 244, 246.5, 249, lat 3.3); behind
  the block on the RIGHT (nothing spawns there): an arrow-board trailer at (257, 4.8) and a staff pick-up nose-down in the
  ditch at (263, 8), tail up, tailgate open, sandbags and cones spilled; on the car: claw rakes down the flank, a handprint
  on a window, a ruptured fuel line and its sheen pool (it explains the prompt).
- **Light**: sawhorse lamps (amber blinkers) with painted amber pools; flares (offender 22); the arrow board's chasing
  chevrons; one of the car's headlamps still lit at its left end (a 2 px glow and a small pool, no beam across the lane); the
  left lamp post's pool; after the blast the fire with a painted scorch, a burning tyre and embers.
- **Silhouettes**: wheels in the air, a bent roof rack, the palm crown at the log's end, the arrow board's frame, the
  pick-up's raised tail.
- **Loops**: lamp blink (exists); flare plumes (4 f); tape whipping (4 f); fuel drip (4 f); one wheel still turning (4 f);
  arrow chevrons (4 f, 20 × 10 px).
- **Remove / simplify**: take the hazard yellow of the boards down one step so the drums (the target) and the rings lead.
- **Calm**: the left verge d 244–256 (dilos, raptors), the lane, and the cleared right verge d 243–250, lat 3 … 10.5 where
  the ranger stands (x 500–590, y 135–210): nothing taller than the flares there.

### E. Stuck in the mud (beat 12, hold at d 307; truck at (314, −6.6))
- **Story**: the crew was mending a wash-out. Left, round the truck (d 309–318, lat −4 … −9): stacked duckboards, a sandbag
  wall two courses high along the lane's left edge, a diesel pump with a lay-flat hose spewing into the ditch, a tripod
  work-light (one head lit, one knocked over shining along the ground), shovels stuck upright, a tipped wheelbarrow, three
  cones half sunk, a "ROAD FLOODED" board, the truck's winch cable snapped short of a stump at (322, −9). Right (lat 9–13):
  a drowned fence line, a leaning utility pole at (318, 9.5), a mile post; reed beds ≤ 0.9 m tall at lat 5.5–8 on both sides
  (the script's ambush "out of the reeds" has no reeds). In the lane: planks under the jeep's wheels, a lost boot, the jeep's
  own ruts. Far: the BRIDGE board and two lanterns glowing at the bridge end (the goal, x 290–360, y 135–150).
- **Light**: truck hazards (amber, blinking) with painted pools and their reflections in the water; the cab's dome light; the
  work-light's cold white stepped pool on the LEFT half of the lane only; the bridge lanterns.
- **Silhouettes**: crane boom, sheave and hook; the tripod; shovels; the leaning pole and wires; reed plumes; the worker.
- **Loops**: hook and chain (pivot); pump water (4 f); hazards (exist); tarpaulin (4 f); reeds (FLORA wind); pool crowns
  (puddle strip).
- **Remove**: the flat blue slab, ruler ruts, black fender bricks, the black glass.
- **Calm**: the lane's centre and right half 10–20 m ahead and the right verge to lat 9 (x 180–520, y 140–245); the sky
  right of centre for the pteros.

### F. The trestle bridge and the gorge (beats 13–15, d 339–383; then looked back at from d 395)
- **Story**: this should be the stage's postcard. Storm lanterns on four rail posts (two lit); a string of park pennants on
  the right rail, torn; "3 T · ONE VEHICLE" plates; the broken rail section hanging; a tour-car wheel and a suitcase wedged
  against the kerb timber; claw gouges across four planks; a coil of wet rope; on the far abutment a carved park totem
  (2.5 m) and a post "HELIPAD 150 m →". Off the sides (offender 26): mist, rim palms and lianas, the waterfall, pterosaur
  nests with bones on a ledge, white water round the boulders, a wrecked tram car on the rocks (seen as the bridge falls).
- **Light**: the lanterns' warm pools on the deck (stepped, 1.5 m) and their halos in the rain; the headlight in steps;
  after the strike the deck fire and embers.
- **Silhouettes**: rail posts with lanterns, pennants, the totem, leaning rim palms, lianas below the deck line, the
  trestles' X-bracing in the look-back view.
- **Loops**: two lanterns swinging (pivots); pennants (pivot); waterfall (4 f); mist (4 f); foam and river (exist).
- **Remove**: the calm material's level bias on the deck, box rails, cube posts.
- **Calm**: the whole sky between x 150 and 480 (five pteros dive through it): nothing above rail height there.

### G. The boss road (beat 16, d 395–548; 60–90 s on screen, looking back, then forward, then back at the pad entrance)
- **Story**: (398–404, −8 … −16) where it burst out: three palms snapped mid-trunk, flattened ferns, a fence span dragged on
  to the verge. (414–432, 9.6) the park tram — three open cars, canopies shredded, one car on its side — in place of three
  fence spans. (455, −11) a billboard "SEE THE TYRANT · FEEDING DAILY 15:00", 6 × 3.5 m on two timber legs, facing the
  look-back camera. (466, −8.6) the overturned tour car (exists) with burst feed sacks. (478, 8.8) an animal-transport crate
  trailer on its side, bars bent OUTWARD, "LIVE ANIMAL", a chain trailing. A line of utility poles on the left every 28 m
  from d 408 to 520 (the leaning one exists), a transformer at d 464. On the asphalt: stamped craters with radial cracks
  and lifted slabs every 9 m along the Tyrant's path (decals at ± 1 tone), a dropped rifle and an ammunition tin, lamp glass.
  The fuel depot for phase 3 (526–536, −5 … −10): a low bund kerb with hazard paint round the tank, a pump unit with gauges
  and a hose reel, an extinguisher trolley, "NO SMOKING · AVGAS", a short floodlight mast; opposite (lat 6–9): supply crates
  under a cargo net and a baggage cart.
- **Light**: flares (offender 22); the lamp posts' painted pools; the tram's headlamp; the billboard's two lamps (one
  flickering); the transformer's sparks (cold, two rings); the depot floodlight — a white stepped pool on the tank's flank
  and the ground so the target is found at once; for the first 20 s the burning bridge as a small fogged orange dome behind
  the treeline at d 383.
- **Silhouettes**: billboard, tram canopies, poles and wires, bent crate bars, snapped palms, the depot mast.
- **Loops**: four flare plumes (4 f); transformer sparks (4 f); billboard lamp (toggle); the tram's bell (pivot); tape on an
  EVACUATE board (4 f).
- **Remove**: flat red pools, ruler fence lines, the flat roll-hoop bars (offender 3).
- **Calm**: the road and both verges to |lat| 5 for the whole stretch (Tyrant, pack-mates, debris rings): decals only, no
  red above tone 3, nothing ring-shaped; the Tyrant's head band (y 80–160) must only ever have sky, cloud and far canopy
  behind it — no board, pole top or billboard between x 250 and 380.

### H. The helipad and the escape (beats 17–23, pad centred at d 558, helicopter at d 569)
- **Story**: an evacuation was under way. A lattice floodlight tower at pad-local (15, 11); the radio shack (offender 29);
  an aerial mast with guy wires and an anemometer; the windsock with an obstruction lamp; a chain-link fence with
  "HELIPORT · KEEP CLEAR" plates along the back and left edges, the jungle pressing over it; supply crates under a net, a
  baggage cart, two stretchers leaning on the hut; a fuel hose run across one corner; a fire point; three flush lights in
  line with the H; a painted wind arrow; the helicopter (offender 27) with the pilot's silhouette waving a torch.
- **Light**: edge lights (green / amber blinkers) each with a streak on the wet slab; the tower's white stepped pool over
  the right third; the hut window's pool; cabin light and nav lights with their reflections; a small red stepped pool on
  the engine cowl for the beacon.
- **Silhouettes**: tower, aerial, windsock, the hut's roof kit (vent, horn), fence and jungle, drooping rotor blades.
- **Loops**: windsock (pivot, exists); anemometer (4 f); rotor blur (exists); rotor-wash spray on the slab (4 f); edge
  lights (exist); the torch (toggle).
- **Escape view**: a cargo strap swinging in the door (pivot); below, the pad as islands of light, the burning tank, the
  carcass; a third backdrop layer (near canopy line, two radio masts with red lamps, a cluster of four warm pixels where the
  lodge is) so the last image is an island, not a navy plane.
- **Remove**: the saturated ring, cube lights, the slab's speckle and black blots.
- **Calm**: the pad's left and right edges at mid-height (x 145–195 and x 395–445, y 100–205) where the last two raptors land.

### I. Sky and backdrop (all beats) — keep, three additions
The heaps, the moon, the two ridge layers and the fog-matched horizon are the best painting in the stage. Add (1) a third
cut-out layer at ≈ 150 m (elevation −2 … 6°): a near canopy line with emergent trees, a hint of the lodge roofs and two masts
— it closes the flat band between the fogged billboards and the ridges (`b13b`, `b23x`); (2) the forks at three times the
resolution (offender 31); (3) nothing else: clouds above 10° stay mid-toned (pteros).
## 5. SLICES

Effort tally of §2 (S = 1, M = 2, L = 4) is 62 units, the dressing of §4 about 25 more: ≈ 17 a slice in five slices.

**Step 0 (one mechanical commit before anyone paints, no visual change)** — every slice edits `S/pixel.ts` (1 410 lines), so split
it by section the way z3 is (`pwRoad.ts`, `pwVehicles.ts` …): `pwGround.ts` (today's lines 267–343), `pwPaddock.ts` (345–439 and
1205–1239), `pwSetPieces.ts` (441–560, 813–957), `pwVisitor.ts` (562–785), `pwHelipad.ts` (959–1089), `pwBossRoad.ts` (1091–1203);
the atlas, batches, `finish` and `update` stay in `pixel.ts` (owner: slice 2). Move the roadblock painters (`d3DrumTile`,
`d3DrumLidModule`, `d3BarrierBoardModule`, `d3PalmBarkTile`, `d3FrondModule`, `d3FireModule`) out of `P/d3Park.ts` into a new
`P/d3Roadblock.ts`, the truck modules out of `P/d3Vehicles.ts` into `P/d3Truck.ts`, and fork the d1 car modules into `P/d3Cars.ts`.

| slice | offenders / scenes | beats | files (after step 0) | effort | shots to judge it on |
|---|---|---|---|---|---|
| **1. JEEP AND FINALE** — the player's vehicle in its three states (hood, rear deck, helicopter cabin), the helipad, the helicopter, the fuel depot | 1, 2, 3, 28, 29, 21, 27, 33; scene H | all (hood); 14–16 (rear); 17–23 | `S/jeep.ts` (PIXEL-WORLD branches only), `S/jeepPixel.ts`, `P/d3Jeep.ts`, `P/d3Vehicles.ts` (pad, helicopter, tank), `S/pwHelipad.ts` | ≈ 19 | `d3:1:90`, `d3:4:120`, `d3:12:150`, `d3:14:120`, `d3:16:480`, `d3:16:2400`, `d3:17:120`, `d3:19:120`, `d3:20:60`, `d3:21:40`, `d3:21:150`, `d3:21:330` |
| **2. GROUND AND LIGHT** — road, verges, mud, forest floor, puddles, painted light pools, rain crowns, sky additions | 10, 11, 9, 13, 16, 24, 31; scene I; the flat decals of scenes B, G | 1, 3, 7, 11, 12, 15, 16 | `P/d3Ground.ts`, `P/d3Sky.ts`, `S/weather.ts` (PIXEL-WORLD branch of the splashes), `S/env.ts` (`buildLamps` / `commitPools` hook), `S/pwGround.ts`, `S/pixel.ts` (`finish`, `update`, backdrop) | ≈ 17 | `d3:1:300`, `d3:3:300`, `d3:7:260`, `d3:7:400`, `d3:11:300`, `d3:12:150`, `d3:15:120`, `d3:16:1100` |
| **3. PADDOCK, ROADSIDE KIT, BOSS ROAD** — pylons, wires, fences, lamp posts, signs, flares, glow cards, every standing story prop along the roads | 8, 20, 22, 23, 25, 32, 34; scenes A, B, G | 0–3, 7, 11, 15, 16 | `P/d3Park.ts`, new `P/d3Roadside.ts` (prop billboards / cut-outs), `S/pwPaddock.ts`, `S/pwBossRoad.ts` | ≈ 17 | `d3:0:120`, `d3:1:90`, `d3:2:120`, `d3:3:90`, `d3:3:300`, `d3:7:260`, `d3:11:300`, `d3:15:120`, `d3:16:480`, `d3:16:1100`; hud `d3:2:260`, `d3:16:420` |
| **4. VISITOR CENTRE** — plaza, lodge, kiosk, fountain, their light and dressing | 5, 7, 17, 19; scene C | 3 (end), 4–6, 7 (start) | `P/d3Visitor.ts`, `S/pwVisitor.ts` | ≈ 15 | `d3:3:600`, `d3:4:120`, `d3:5:60`, `d3:6:150`, `d3:7:90`; hud `d3:4:270` |
| **5. SET PIECES** — tour cars, roadblock, fire, the mud truck and its work site, the bridge and the gorge | 14, 15, 18, 30, 4, 6, 12, 26; scenes D, E (props), F | 2 (car), 8–15 | `P/d3Cars.ts`, `P/d3Roadblock.ts`, `P/d3Truck.ts`, `P/d3Bridge.ts`, `S/fire.ts`, `S/pwSetPieces.ts` | ≈ 21 | `d3:8:150`, `d3:9:40`, `d3:11:90`, `d3:12:150`, `d3:13:120`, `d3:13:230`, `d3:13:330`, `d3:13:520`, `d3:14:120`; hud `d3:8:260`, `d3:12:330` |

Order if only one painter: 1 → 2 → 5 → 4 → 3 (by seconds on screen × how blocky it is today).
Shared seams to agree on first: the mud lane (slice 2 paints the ground, slice 5 the truck's ruts and work site: slice 5 only adds
cut-outs and decals over it); lamp posts (slice 3) and their pools (slice 2); the fuel depot (slice 1) on the boss road (slice 3).

### Audit shots (six: three keep the baseline's spec so the numbers compare)

```
node scripts/pixel-audit.mjs --base http://localhost:<port> --out /tmp/pw2/audit-d3 \
  --shots "d3:12:200:d3-mud,d3:4:240:d3-visitor,d3:16:240:d3-boss,d3:13:330:d3-bridge,d3:2:120:d3-fence,d3:21:40:d3-cabin"
```

| shot | tests | first-pass baseline |
|---|---|---|
| `d3:12:200:d3-mud` | near ground (mud, pools) + the biggest vehicle + the sunk hood | 22.9 % > 1.5 px, 10.9 % > 2 px mid-frame, 5.6 % flat |
| `d3:4:240:d3-visitor` | plaza ground + building "wall" + kiosk, turned hood | 20.9 % > 1.5 px, 14.2 % > 2 px, 12.9 % flat, 68.6 % tiny |
| `d3:16:240:d3-boss` | boss arena, the jeep's rear deck and roll hoop, lamp pools | 16.8 % > 1.5 px, 13.6 % > 2 px mid-frame, 8.5 % flat |
| `d3:13:330:d3-bridge` | near "floor" (deck) + rails + gorge emptiness + headlight steps | not measured (expect the worst flat share of the stage) |
| `d3:2:120:d3-fence` | pylons, wire cut-outs, crushed car, spark light | not measured |
| `d3:21:40:d3-cabin` | interior at arm's length (cabin), the pad from above | not measured |

Also judge motion (three consecutive frames, e.g. `d3:13:330`, `:331`, `:332`): the deck, the road and the pavers must not crawl.
## 6. RISKS AND CONSTRAINTS

**Gameplay shapes that must not move**
1. **Bullet occluders** (`environment.occluders`, `S/env.ts`): the lodge's classic shell (`visitor.shell.children`: walls, the
   atrium box, columns, portico slab, roof cones, the doorway's dark box — hidden, still raycast) and the roadblock car group.
   Paint must cover them: no painted hole where the shell is solid (the open doorway shows the lobby PAINTED on the shell's
   doorway box), and painted walls within ≈ 0.2 m of the shell planes. Cut-outs that stick out (roofline kit, lanterns) are
   fine only where no enemy can be behind them. The kiosk, fountain, planters, plaza and everything of §4 are NOT occluders and
   must stay non-raycast (`userData.pixelWorld`, `raycast` off).
2. **The roadblock car** is occluder, set piece and follower at once: the hidden classic body (2.0 × 1.45 × 4.6 m, scaled 1.05 /
   0.92, upside-down) flies and tumbles at the blast, and the painted mesh copies its matrix every frame (`followCar` / `follow`).
   An extruded profile must stay inside that box, be closed on all sides (it is seen from every angle while it spins) and live in
   ONE follower batch.
3. **Destructibles**: 3 roadblock drums, 3 pad barrels (spawned in play: tiles must be registered up front, `drumTiles`), and the
   fuel tank (`FuelTank`, armed only for the finale; its `warn` lamp stays). Their classic meshes are the hit volume (invisible
   material); what is painted must match what can be hit, and the tank must remain the most readable object of phase 3.
   `tests/unit/pixel-world-d3.test.ts` checks "painted props not hit boxes".
4. **Moving set pieces**: the lodge doors (pivots flung off), sawhorses and palm log (thrown by the blast), banners, windsock,
   rotor and its blur disc, the helicopter hidden at boarding; the bridge exists twice — `bridgeWhole` (one baked copy, shown
   until the collapse) and 11 deck segments + 5 towers as loose pieces (`bridgePiece`, shown from the collapse on). Both must show
   the SAME texels or the swap pops: a deck painting wider than one 4 m segment needs its `v0` derived from the segment index in
   both paths; rail cards belong to their segment; the `broken` segment (i = 4) keeps its missing rail.
5. **`mudPerch`** (the worker's feet) is the truck's flatbed top at local (−0.55, 1.76, −2.2) with the truck's tilt: the painted
   bed must be there. The HELP! bubble sits above him: keep the crane card out of x 80–130, y 75–100 at the hold.
6. **RNG and identity**: the hood's rain splashes draw from `world.rng` (`JeepViewModel.update` and its constructor): keep the
   instance count and every draw; only the geometry / material may change. `buildVegetation`, `buildRoad` (puddle draws are
   consumed even when a puddle is skipped), `buildLamps`, `buildMud` use local seeded RNGs whose draw order CLASSIC shares: add
   nothing to them; place new props by constants / `hash2`. Storm and FX have their own RNGs (safe). CLASSIC and PIXEL CAST must
   build byte-identically (`D1_SIG=1 D1_SIG_STAGE=d3 … d1-sig.test.ts`): `buildJeepBody`, `P.*` builders and `Fire` are shared —
   new geometry only inside `pixelWorld` / `jp` / `card` branches. `D3_SIGN_FITS` is checked: a re-drawn board must still record
   its fit.
7. **Framing**: the hood hides the bottom-centre, the roll hoop frames the look-back view "at the edges, never the centre"
   (jeep.ts). Silhouette additions: ≤ 6 px above today's hood outline, no widening of the hoop bars, nothing in the cabin door
   opening. The view model also sinks 0.2 m and pitches in the mud, bumps on the planks, and the body counter-rotates under a
   camera-locked gun: check the hood painting at the turned angle (`d3:4:120`) as well as straight on.

**Readability (the game reads first)**
8. Telegraph rings are yellow → orange → red circles 60–95 px across; spit and debris projectiles carry a red ring with a filled
   disc. Nothing ring-shaped and light may sit in the zones of §1: today the rain splash rings, the fountain, the mosaic's ring,
   the helipad's yellow circle and the puddle arcs all are. Danger colours on scenery today: red jerry cans under the Tyrant, the
   red-brown mosaic under the compys, flat red flare pools on the boss verges, the lodge's red banners and lobby glow behind the
   door burst, hazard yellow on pylons / boards / sills. Keep scenery reds at or below ramp tone 3 and a step less saturated than
   the rings; verify every hold with `--noauto --hud`.
9. The puddles' glow gain (`PUDDLE_GLOW`, flaring with the lightning) and the splash opacity were tuned by hand against the
   Tyrant's feet: re-tune after the road repaint, and with the foundation's ramp-step light.
10. **Reduced flashing** (`settings.reduceFlashes`, WCAG 2.3.1 notes in weather.ts): flicker goes through `flickers` /
    `blinkers`, which hold steady in that mode. New flickering things (marquee letter, strobe, billboard lamp, sparks, arrow
    board) must use those lists or stay small and low-contrast; an animated strip plays regardless.

**Pipeline**
11. **One animated material**: every strip shares `D3_ANIM_FRAMES` = 4 at 8 fps (`animMat`; puddles have a second with the same
    clock). All loops are 0.5 s. Longer or slower loops need a second animated material (+1 draw call per batch using it) —
    decide once, in slice 2. Large high-contrast animated areas are forbidden anyway (bible §4.7).
12. **Calm levels**: the deck and the pavers are on `d2CalmLevels` + a level bias of 1.5 because plank and joint lines across
    the travel direction crawled. At 64 texels a metre the crawl comes back unless the long forms run with the travel and the
    hand-made far levels are painted calm. Test in motion, not in stills.
13. **Light is the foundation's**: ramp-step lighting for the jeep's `SpotLight`, the accent `PointLight` (it jumps between
    sparks, beacon, fires, hazards — see `ParkEnv.update`) and the lightning flash (`Storm.flash` raises hemisphere, moon and
    fog together). Painted fixed pools must not double with a stage light that already lights the same spot (the red beacon,
    the hazards): paint the pool, then lower or drop that light's contribution in PIXEL WORLD only if it does not change what
    gameplay reads (the accent light also lifts compys at night: keep that).
14. **Fog**: linear 7 → 80 m; chunks and culled parts disappear at 86 m by bounding sphere (`culled`). Big cut-outs (mist,
    gorge rims, the third backdrop layer) need to be in a culled batch or in the backdrop; the lodge at 28–45 m sits in 30–52 %
    fog: paint it with wide value steps. Unlit GLOW texels are how lit windows survive.
15. **Budgets**: memory is fine (§3f: ≈ 28 MB of 48). Paint time is the real limit (≈ 8.3 M texels against 1.6 M today; 1.2 s
    cold); a 4096-wide atlas page may exceed what the foundation allows. Draw calls today 28–60 (77 while the bridge falls,
    102 geometries: every loose piece is two batches); each pivot part or follower adds one — §4 asks for about 16 new pivots,
    still far under 250, but keep the collapse frame under 100. Triangles 27–33 k; profiles and cards add ≈ 8 k. Mist and beam
    cards are alpha-tested, not blended: keep any one below a quarter of the frame.
16. **The parked jeep**: `index.ts:board` calls `buildJeepBody(env.baker)` during play, which builds a second `D3JeepPixel`
    (a second `d3-jeep` atlas). With a 0.56 M-texel jeep atlas that is a paint or a 2.8 MB upload mid-game unless the session
    cache returns the first: hand it the view model's painter, or give it its own small stand-in (offender 29).
17. **Shared code**: `P/d1Props.ts` (cars, wheels, treads: d1 uses them), `P/surfaces.ts`, `P/d2levels.ts`,
    `stages/d1/pwShapes.ts`, `stages/z3/pwShapes.ts` (`profileStrip`), `content/pixel/flora*` and `P/d1Species.ts` (boulders):
    fork or coordinate, never edit in place. FLORA and `src/fx/Fx.ts` belong to other work-lists (offenders 15, 35).
18. **Tests and gates**: `tests/unit/pixel-world-d3.test.ts` (occluders, hit proxies, entities, ground, RNG, sign fits, the
    atlas budget it asserts — sized for 24 MB — and the full-stage simulator), `d3-lab.test.ts` (dumps, `D3_CPU=1`,
    `D3_BENCH=1`), the e2e smoke; `npm run build:single` fails on > 64 KB growth of the single file until
    `SINGLE_SIZE_UPDATE=1`: the painters of this plan are code and will add a few hundred KB — agree the new baseline first.
19. **Capture traps**: a direct load at beat 10 skips the blast, at 15 skips the look-back, at 17 the rig is already on the
    pad, at 22 / 23 `board()` has not run (you get the jeep's rear deck, not the cabin). Use the shot specs of §1.
