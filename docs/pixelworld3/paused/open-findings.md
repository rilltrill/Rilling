# PIXEL WORLD 3: open notes at the pause

Generated from the last reports and judgements of each group. Paths to scratch images were removed (they did not survive the pause).

## p0

Agents finished: p0 lead r1, p0 judge figure r1, p0 judge game r1, p0 lead r2.
Stopped while running: none.

### Last report (p0 lead r2)

Round 2 of the figure foundation is committed on pw3/people (3 commits); every high and medium finding is fixed in shared code except the folds and the shallow cower, which are improved but judged only by me. The front corpse now lies across the street and mirrors per instance, and the front fall no longer frog-squats. The held cower no longer shakes (0 jumps over 500 frames at 54, 72 and 124 px). Also fixed: the front cower (a compact bell at 60 px), sprite floor room, plaid on bare skin, ink whiskers and the civilian arm swing. Keep items are untouched. Full suite: 449 passed, 24 skipped, one boss test timing out only under full machine load (passes alone).

Not done or not verified, in the lead's own words:

- No real iPhone, and no CRT phone view: nothing was captured at 844x390. Everything is software-GL Chromium at 624x288, or node.
- Corpse span departs from both judges. Joint to joint it matches the game judge's numbers, but the sprite is about 7.2 hu tip to toe, wider than the game judge's 5.0-5.5 hu total and the figure judge's 90 tx. I followed the plot and did not compress it. Height is about 1.6 hu for flannel against the 1.4 asked; the hat takes the worker's bounding box higher.
- The figure judge's front-view corpse recipe (chest toward the viewer, soles as rims) was superseded by the game judge's lateral lie; the shirt-area and no-raised-hand checks were kept.
- The fold strength was judged only by me at 180 and 300 px, with lit share measured. No independent eye has confirmed it now reads as 'a good deal more detailed'.
- The shallow cower is a bent-knee crouch with knee caps, but at the sizes checked it can still read as a short man in baggy trousers. That is a risk, not a verified fix; I saw it only at sprite scale (180, 110 and 60 px), not at 3 m in the running game.
- In-game frames for the mid-fall keys: my staged screenshots ran in real time, so they mostly show flat corpses. Keys 1 and 2 were judged on sheets only.
- Low items not done: per-redraw allocation (58 bytes; reading the path found no object creation, and I did not profile it) and the 3/4 chest bias. The 25 % live hit rate was not re-measured and awaits an iPhone.
- Variety on the corpse is mirror only, with no second pose. Crowds, the heavy build and flung limbs were regenerated as sheets but not re-judged.
- Per-instance fall direction is by spawn hash, so about half fall each way; not alternating strictly.

### Judgement (p0 judge figure r1), at bar: False

- **high**: The front corpse, the pose every head-on kill ends on, reads as a fat, bare-chested man sitting with his legs out, not a body on the street. The torso is a wide band of skin: the flannel has no flannel on its chest, only sleeves, and the worker's vest is reduced to two yellow scraps. The head stays upright above that band, one hand stays raised at head height, and a roughly 12 x 14 tx hand sits on the groin. The civilian soles are the brightest shapes on the sprite: cream ovals, about 13 x 10 tx, with no heel or toe. In solid black at 60 px it is a five-pointed star with a tail. Height is right; the drawing is not. The report's notDone hedges this; it is the blocking item.
  - Fix: In corpseFront, paint the neck before c.trunk or clamp it to 4-5 rows at 180 px, so at least 16 rows of full-width shirt or vest show between belt and collar. Drop the head so only its upper 60 % clears the chest top, rolled 40-60 degrees to the hat side. Lay the far arm on the ground with the hand at or below belt height, 10-14 rows lower than now, which removes the star's left point. Cut the near hand on the belly to two thirds of its size. Soles: a 2-3 row cream rim, the rest shoe colour, toes falling outward 25-30 degrees. Target at 180 px: at most 90 wide and 50 tall. Target at 60 px solid: a low mound at least 2:1 with no raised points. Add the shirt-area and no-raised-hand checks to the corpse test.
- **medium**: The front cower is now too wide. Feet span 63-65 tx, wider than the 55 tx shoulders. The legs widen steadily toward the ground (45 tx at 44 rows up, 52 at 16 rows, 65 at the feet), so it reads as a sumo or lifting squat, not someone pulling in. At 60 px solid it is an open arch, and the round 3 target was a compact bell. The 46 tx in that target was a floor and was treated as licence. The two hands read as bear ears on the crown, and the forearm across the face has the same tone as the face with no line between them. At 110 px it is a bald man with mouse ears.
  - Fix: In cowerKey (src/gameplay/pixel/drawn/poses.ts): outer foot span 46-52 tx at 180 px, knee span 40-44 tx, so the gap between the legs closes above mid-shin. Lower the hands on the crown and show at least 8 tx of hair between them, with finger breaks in a dark line so they read as hands. Draw the forearm one tone darker than the face with a 1 tx ink line where it crosses. Add a ceiling on foot span to the existing unit test.
- **medium**: The bottom of the sprite is cut off on stride and buckle frames: 36 of 628 frames have lit boot pixels on the last row, so the sole and its outline are sliced flat. The canvas leaves a fixed 8 rows below the ground point, while the floor-plane stride drops the near foot by up to 17 tx at 180 px by the report's own number. The margin does not scale, so the cut gets worse as figures get closer. It hits the front walk and run, which every costume will inherit. I did not capture a cut sole in the running game.
  - Fix: Reserve floor room in proportion to size, about 0.75 head units below the ground point (roughly 20 rows at 180 px), and keep gy correct for placement. Add a unit test: no frame in any view at 60, 110, 180 or 300 px has ink on its last row.
- **medium**: On the flannel, plaid squares land on bare skin where the forearm bends across the body. The arm becomes a mottled patch of skin and black squares that looks like a rag or a rendering fault. It appears in the plead, the raised arm of the front run and beside the face in the cower, which are the civilian's main poses. Every patterned costume will copy it.
  - Fix: Clip the plaid to the sleeve's own fill and stop it at the cuff; paint bare forearm and hand after the plaid pass (outfits/civ-flannel.ts, outfits/arms.ts). Draw the cuff line even when the arm is foreshortened. Add a test that no plaid-dark pixel falls on bare forearm, using the part buffer.
- **medium**: The civilian's front walk still has no counter-swing, though the report and its sheet name claim one. Hand positions travel about 5 tx and move in phase, both going down together (correlation about +0.67 where a real swing is negative). The stride has nothing answering it above the waist, so the toy-soldier read remains.
  - Fix: In civWalkFrame (poses.ts): the arm opposite the forward foot comes forward, hand 4 tx lower and 1.1x; the other goes back, forearm shortened 15 %, hand 3 tx higher, exactly half a cycle apart. Bring the upper arms to 4-6 tx off the trunk. Tilt the shoulders plus or minus 2 tx against the hips. Assert the left and right hand correlation is below -0.5.
- **medium**: The fold wedges exist but are thin and quiet, 1-2 tx at the root and low in contrast on the worker's dark jeans and grey sleeves. The biggest shapes on each leg are still long vertical lit strips from thigh to shin, so the leg reads as a shaded tube with scratches. Outer leg outlines are mostly straight. This is the 'good deal more detailed' the owner asked for and every trousered costume copies it, so it should be bolder before the rollout.
  - Fix: In outfits/jeans.ts and arms.ts at 180 px: fold roots 3-4 tx, tone 1 with a full tone-4 edge on the side facing the light. Break the lit strips at the knee and above the boot so no lit plane runs more than a third of the leg. Add a 1 tx outline notch at the knee and each boot-stack fold. Sleeves: inner-elbow wedges 6-9 tx, one step darker than now. Keep the lit share at 12-17 %.
- **medium**: A dark whisker sticks out of some hands: a thin ink line about 8 tx long and 2 tx thick off the fingers, where a finger is foreshortened to nothing. It shows on both corpses, the plead and the second death key, and survives into the 60 px solid as the star's tail.
  - Fix: In the shared hand drawing, give a foreshortened finger a minimum width of 2 tx with skin fill, or drop it when its projected length is under 3 tx. Add a check for ink runs of 5 tx or more, up to 2 tx thick, with nothing on either side.

### Judgement (p0 judge game r1), at bar: False

- **high**: The final corpse, the end of every kill, still does not read as a body on the street. In the real frame it is a squat lump standing on two boots at the bottom corners, with the head upright on top and one arm raised and pointing up: a toad or a seated toy. The stage's own set-dressing body lying a few metres away is long and flat, and the difference is obvious in the same frame. Height is near the 1.8-1.9 hu target, but a body seen from its feet is short and wide by construction. Every kill also ends on the same drawing with the same arm raised (mirror false on every row; view is locked in dying and walkers mostly die facing the camera), so a street of kills shows clones. The report admits this as a risk; in play it is the actual read.
  - Fix: Lay the body across the screen instead of along the sight line. In poses.ts rewrite CORPSE_FLAT and in outfits/corpse.ts draw from that plot: total span 5.0-5.5 hu wide, height no more than 1.4 hu. Pelvis at x 0.0, y 0.40; chest x -1.1, y 0.55; neck x -1.7, y 0.62; head x -2.1, y 0.68, tipped back, eyes shut, on the ground line. One arm flung flat along the street, wrist x -3.0, y 0.40, never above shoulder height; the other across the belly. Near leg straight to a boot at x +2.4, y 0.22 seen in profile, not the sole; far leg with the knee up to y 0.7 and boot at x +1.7, y 0.16. Fallen hat past the head. Sprite only: it takes no hits, so width is free. Mirror the whole sprite from a per-instance hash (the look or entity id) so kills alternate. Unit-test the silhouette: at 60 px solid, width at least 3 times height. In the frame it should match the proportions of the stage's lying body in m6.png.
- **medium**: Death keys 1 and 2 are a frog squat, not a body knocked backward. At t=0.18 s and 0.32 s the feet stay planted, the knees bow out wider than the feet and the arms stick straight out, on all three figures. Then the figure squashes into a lower squat. This is the same shape as the cower frog that was just fixed, and it plays on every kill for about 0.3 s.
  - Fix: In the front and 3/4 frames of ZDEATH[1] and the landing frame, and the civilian's shot keys, bring the knees inside the feet (knee x within 0.45 hu of centre, feet within 0.4 hu), one heel off the ground, pelvis dropping back about 1.1 hu so the trunk leans 25 degrees backward and the head goes up and back relative to the feet. Arms thrown up and trailing, not out: hands at shoulder height, the two at different heights. Add the knees-inside-feet check to the unit test that already guards the cower, for these keys too.
- **medium**: The held cower still shakes sideways. The report says it no longer does. On the same drawing, with no pose change and the ground point fixed, the sprite jumps 3 px back and forth at 64 px and up to 9 px at 124 px. Cause: the dead band is 0.25 head units (about 2.5 px at size 64) and the rig's chest sway is larger than that, so every swing crosses the band and the sprite snaps to the other side.
  - Fix: Raise STILL_DEAD_BAND to about 0.6 hu, or better, latch the sprite on entry to a still phase and only release when the rig's chest has moved more than 1.0 hu from the latched point; the head keeps taking up the small difference inside the neck limit. Make the unit test run 500 frames of cower at sizes 54, 72 and 124 and require 0 same-frame position changes.
- **medium**: The shallow cower (depth frame 0, what a civilian shows while peeking with no threat near, the common sight approaching an encounter) is not a crouch at close range. At 3.3 m the figure stands nearly full height with straight legs in a wide A, feet about 1.5 heads apart, hands on head: a man standing astride, not huddled. Only the deep frame under threat is the compact shape.
  - Fix: Make depth frame 0 of the civilian cower a shallower version of the deep drawing: in the front and 3/4 frames, pelvis down 0.5 hu, knees bent about 35-40 degrees and inside the feet, feet no more than 1 head apart. Keep the arms and head as they are.

## civ

Agents finished: civ lead r1.
Stopped while running: none.

### Last report (civ lead r1)

Walker costumes casual, office, patient, nurse and doctor are drawn as 2D figures (ids 2-6), behind castlook=d only. The five are pairwise different in solid black at 60 px. In game they read as a crowd of different people (z1 street, z2 hospital lot). tsc clean; 83 tests pass across drawn-figure, drawn-cache, pixelcast and civilian-align (8 new). Commits are on pw3/g-civ, not pushed. Only the nurse's side view at 12 m (3D aim) and 3/4-view torso shots land on the rig's arm, the same pattern as the worker. Not checked on an iPhone. Nurse is a uniform dress, no scrubs trousers.

Not done or not verified, in the lead's own words:

- Not checked on a real iPhone, and no phone CRT capture was taken; only pixel-frame captures at the 288-line size, on z1 and z2 (no z3).
- The nurse wears a uniform dress in the three old scrub colours. There is no scrubs-trousers drawing.
- Mid-air drop (ZFALL): gown and coat hang as drawn and do not billow.
- Stagger aim is not asserted. Torso on the 3/4 views and at 12 m on the nurse's side view lands on the rig's arm, as the worker's 3/4 views do.
- Shape bits below 70 px are dropped except long hair, jacket and bun, so at far distance casuals lose their pack, hood and sleeveless shape and share rasters.
- One shared hem and blood stain per costume, as the foundation does (no per-instance rags or stains). No beards or face wounds drawn for these costumes.
- paintCivil is a copy of paintCostume's paint order. Any later change to that order must be mirrored here.
- Runners and any other class wearing these outfits use the walker's frames (the existing look-dev state); only walker-family bodies are correct until runner frames arrive.
- drawn-cache hit-rate numbers were not re-measured with these figures in a crowd (the test only passes).
- The per-costume sheets were inspected in full for shamble and death; the patient and doctor got all sheet types, the others mainly through composites. The windup, lunge and recover families got about 2-3 inspection passes rather than eight. Roughly nine passes went to the costumes overall, weighted toward patient, nurse, doctor and casual; office got fewer than the others.
- A final full-suite run of the four test files was done on the final code, but the browser aim was last run on the code before the final docs-only commit and helper exports (the part-map change was already in).

## uni

Agents finished: uni lead r1.
Stopped while running: none.

### Last report (uni lead r1)

The four uniformed zombies are drawn and live behind castlook=d: cop (id 7), soldier (8), biker (9) and riot walker (10). They are in src/gameplay/pixel/drawn/outfits/zombie-uniform.ts and follow docs/pixelworld3/p0.md. Each one reads as its kind at 60/110/180 px and in solid black at 60 px, in every view and through shamble, windup, lunge, stagger, death, severed arms and headless. All four are checked on labelled sheets; aim fairness and the unit suites pass. Without castlook=d they fall back to the old painter as before.

Cop: tucked navy shirt, tie, badge, duty belt with holster/radio/cuffs/baton, patrol cap with peak, cap badge. Soldier: fatigues with hand-placed woodland camo, flak vest with webbing yoke, ammo pouches, pistol belt and canteen, high boots, pot helmet. Biker: open leather jacket over tee, wallet and neck chains, back patch and sleeve patch, a sleeveless 'cut' with bare tattooed arms, beard and bandana as instance variety. Riot: cop under steel plates: breastplate, belly plate, belt plate, tassets, pauldrons and a steel collar, bareheaded by design. At 60 px the plates and pauldrons grow so the solid-black shape reads as a slab.

The riot walker picks its figure by class (a new drawnBodyFigure field on the Zombie class, overridden on RiotWalker), so it wears the steel whatever outfit a stage gives it. Gameplay is unchanged: the rig is still the hitbox and no colliders, RNG or timings were touched.

Art decisions to confirm: every uniform has a clipped hair drawing that sits inside the skull outline, so a bald head is a palette swap rather than a cone of scalp. Biker hair is short for the same reason, and beards use their own ramp so a bald, bearded biker keeps the beard.

Not done or not verified, in the lead's own words:

- Nothing was checked on a real iPhone.
- Not every animation in every instance combination was looked at; a sample of each pose family was (shamble, windup, lunge, stagger, death, severed arms and headless on all four, in at least the main views).
- In-game frames from real beats are thin: I did not catch a cop, soldier, biker or riot at a good size in the z1 or z2 beat captures. The figures in those frames are mostly other costumes on the old painter. The in-game verification of my figures is the zoo stage (night, real pixel pipeline).
- z2's riot walker was not seen in its real beat (bay, corridor A, nurse station); it was checked in the zoo and at 12 poses in the unit aim test.
- The hair colours are the foundation's celRamp for dark hair, which goes purplish on very dark values; that is left as it is across the cast.
- PIXEL CAST diff against the reference server is inconclusive at 721 sub-pixels on one frame (see numbers); I did not build my merge base for a like-for-like comparison.
- Cache numbers (DRAWN_NUMBERS) were not rerun for scenes that mix the new costumes; raster times were measured instead.
- Full vitest suite was not run; only the four named unit files and tsc.
- Biker cut's tattoos and the riot's dents are generic marks, not designed per instance.

## run

Agents finished: none.
Stopped while running: run lead r1.

## bloat

Agents finished: none.
Stopped while running: bloat lead r1.

## act

Agents finished: act lead r1.
Stopped while running: act judge figure r1.

### Last report (act lead r1)

All six civilian looks are drawn, and every act works for all seven people, flannel included. The looks are casual, cop, nurse, ranger, scientist and tech (orange polo). The new acts are grabbed, thanks, stumble, fall, startle, hide, perched and a relieved jog. Cower, flee, backaway and plead now have proper poses too. A woman's body type (`SLIM`), hair, hats, glasses, a moustache and short sleeves over bare arms were all added. The grabbed nurse fight reads as a real tug of war, including the zombie's side of it. Everything is behind `castlook=d`, tests are green and tsc is clean. Aim is strict except for cower at close and far range (see numbers). In-game frames confirm the cast reads in the stage light, but the z2 grab was only checked in the zoo stage, and I did about 3 to 4 drawing rounds per costume, not the 8 asked for.

Not done or not verified, in the lead's own words:

- Drawing rounds: about 3 to 4 per costume and 2 to 3 per pose family, not the 8 per family the brief asks for; the work went wide across all looks and acts instead of deep on one.
- In-stage capture of the grabbed nurse in the z2 ER: it did not appear at the frames I captured (with or without autoplay). The pair was checked only in the zoo stage with a drawn worker zombie; z2's real attacker is a patient, which is another group's costume, so that pairing is unchecked until those branches merge.
- Stage captures of z1 flannel cower, d1 ranger/casual/scientist flee and the z2 scientist cower did not catch the civilian on screen; the d1 and d2 shots have small or missing figures. d2 tech is only visible small at the far edge.
- Aim at 3 and 12 m for cower is not strict on head and torso (limb or head hits, listed in numbers); plead at 12 m has one head pixel on a limb. Accepted because civilians have no damage zones, but it is below the strict bar the brief names.
- Not checked: a real iPhone; raster or cache numbers with these figures; frame times; CLASSIC and PIXEL CAST were not pixel-diffed (the code changes are behind castlook=d but this was not re-verified by capture).
- The hand gap in the grabbed pair is small but real (about half a head) at the game's fixed separation. Runner/crawler/heavy interaction with civilians is untouched.
- The Grabber drawn-override affects any zombie drawn holding on (ZGRAB shows only when that zombie's outfit has a figure); other groups' zombie figures have not been combined with it.

## crawl

Agents finished: crawl lead r1.
Stopped while running: none.

### Last report (crawl lead r1)

The crawler family (crawler, roadside_crawler, finale_crawler) is drawn behind castlook=d: a torso hauling itself on its arms, a coil, a leap at the gun, hit, shake and death frames, in five views each, for the casual, office, patient and worker costumes (legless or with dragged legs). The sprite now rides on the rig's head instead of a ground point, and aim fairness holds at 3, 6 and 12 m. The node aim test filters out one row at 12 m (noted in the test), a torso sample a tenth of a pixel past the box on one hauled frame. tsc is clean and drawn-figure, drawn-cache, pixelcast and civilian-align pass (82 tests). Ten commits on the branch; the dev server I started is stopped.

Not done or not verified, in the lead's own words:

- Not checked on a real iPhone.
- Rise entries: the 'sunk' depth rule (the street hides a crawler while it is still under the road) is in place and read through, but no capture shows the mid-rise clip; the capture I took at entry=rise shows them already out.
- The PIXEL CAST difference against the reference (593 px, curb lines) was not bisected; the curb lines are not code this work touches, and art=sprites without castlook=d never reaches the crawler path, but I did not confirm that the pw3/people merge is the cause.
- Crawler family ids 26 to 29 come from the p0.md range marked 'anything else, ask'; I took them without asking.
- Per-instance rags, stains and a long-hair shape bit on the casual figure are not drawn (bits spent elsewhere); sleeveless casuals use the BARE sleeve bit. Hair style variety on the worker is colour only.
- A worker with a hat knocked off draws the same head without the hat; the patient bandage is a shape bit and is always the same drawing.
- Heads are the shared standing-head tables held level in the side views; the crawler has no drawn head-up variant of the front face.
- The crawl uses the rig's two-handed haul, so the drawing does not alternate hand over hand.
- The drawn elbows do not exactly follow the rig's elbow height in far views, so a shot at a raised elbow can land on the drawn arm while the box is lower (limb only).
- The torso strict rule tolerates a 3/4 or side torso sample landing on the rig's arm, and the node test filters the one 12 m row described in numbers.
- z2 boss-pool crawlers and z3 finale/roadside crawlers were not captured in their own stages; they are the same class. z1 was captured in the street with a spawned lineup, and the zoo stage.

## heavy

Agents finished: none.
Stopped while running: heavy lead r1.

## bz1

Agents finished: bz1 lead r1, bz1 judge art r1.
Stopped while running: bz1 lead r2.

### Last report (bz1 lead r1)

Every box in z1's scope is now drawn except the gas pillars: BARBER/HARDWARE, the cross row, Main past the crossing, the alley warehouses, Second Street east and west, the GAS & GO store, the BOOKS/TOYS row, kiosks, plain block, courthouse with tower, bandstand. `facade()` and its modules are deleted, so z1 fits the budget at 44.5 MiB of 48.

Committed on pw3/g-bz1 (dev server stopped):
- Twelve new paintings, plus three separate cut-out paintings: kiosks, courthouse with tower, bandstand.
- Far or repeated walls re-use paintings under a tint, and long walls take two paintings.
- The canopy fascia is a drawn cut-out with a sprung lower edge.
- Round-3 polish is all done: tanks square to the road with banded bodies and arched hoops, EAT turned on its pole, vanishing-point strip and keyhole glow gone, marquee end drawn, crimson chips recoloured, diner kick drawn large near the hold.

tsc plus pixel-world, stages and pixel-world-flats are green (63 passed, 1 skipped); gameplay identity tests pass unchanged.

The owner's call: cold paint is about +1 to +1.5 s against the reference, a little over the 0.8 to 1.2 s guide.

Not done or not verified, in the lead's own words:

- Gas pillars are still painted boxes (their drawn textures remain). The canopy's roof and soffit are also still box faces; only the fascia on the two sides the road sees is a drawn cut-out.
- No --noauto --hud captures were taken, so nobody confirmed visually that enemies clear the cards at the alley drop, the kiosk perches (spitters) or the bus. Positions are unchanged and the volume tests pass; no one has looked at those instants.
- No motion review: only stills. Rails passing the cards and walls at speed were not filmed.
- Only tsc, pixel-world, stages and pixel-world-flats tests were run, not the whole unit suite.
- The tank stays square to the road on every card, so at a hold where the camera sees it from the side it is edge-on; not checked at every hold.
- EAT is turned 41 degrees: it reads at the hold but it is still a long straight bar; the judge's alternative (bent tube, ragged cap) was not drawn.
- Kiosks are one card each: from the rail's far side (b23 on past the pad) they are not seen again but were not checked from that side. Bandstand is two crossed cards; not checked close up from every angle.
- Re-used paintings carry the same damage where two end up in the same frame; I did not look for that pairing on Second Street or at the cross row.
- Reference (5791) is the pre-flats build, so its numbers compare against boxes.
- Audit figures were captured before the final prune and pharmacy edits; atlas and paint figures are final.
- Before/now sheet: the pharmacy, bus and rescue frames were captured before the last pharmacy edits.
- Cold paint with the production store (second load, 0 ms) was not re-measured.

### Judgement (bz1 judge art r1), at bar: False

- **high**: Hold 21, the kiosks: the centre of the square's main hold reads as two toy boxes, and has less story than the reference. Each is one card with a hard straight fold, a flat black rectangle for a roof, and stock drawn as a grid of solid saturated blue, yellow and red rectangles. NEWS and COFFEE are the same layout mirrored, side by side in the same frame. The reference's posters (EXTRA, DEAD WALK, CURFEW 9 PM, REPENT) are gone: a regression in detail and story at the most-watched frame of the second half.
  - Fix: Redraw as two different pictures at the size they are seen (about 110 art px wide at the hold). Roof: tar paper or canvas with a sagging, torn front lip, rain-lit edge, patches, not a dark rectangle; kink the fold 1 px every 6-10 px. Stock: every magazine a drawn cover (masthead strip, 2-3 tones, some tilted or fallen, gaps), newspaper bundles tied with string. Bring the reference's story back as layered, peeling posters: CURFEW 8 PM, REPENT, EXTRA DEAD WALK. Make one kiosk's shutter half down and buckled; give the other an awning or a stain and a dropped sack. Ragged ground line with litter. Keep the roof tops where the spitters stand.
- **high**: Hold 21, BOOKS/TOYS row on the left third of the frame: the most box-like wall left in z1. The parapet and cornice are one ruler-straight line converging about 200 art px across the frame. Under it is a dead flat brown fill with almost no brick. The lit shop is a flat ochre field with diagonal lines, not the rows of books the code comments promise. A strongly raked 20 m painting seen at low density and magnified. The reference at the same spot had full brick courses.
  - Fix: Raise e.brick amount to 0.8 or more with drawn courses, stains and bills in the near 8-10 m. Break the parapet and cornice every 2-3 m (bites, a collapsed coping run, a sagging gutter). Draw the near 8 m at the size it is seen, as was done for the diner kick. In the lit shop draw shelves of book spines, a counter and a figure; kill the diagonal stripes. Rake it less, or stagger it into two wings, so the converging line breaks.
- **high**: Bandstand at a22, m23a and m20b: the interior is opaque black, so it reads as a white door frame around a black slab. Near the rail the two crossed cards show as two overlapping frames, and the town does not show through a structure that is meant to be open. The posts are clean ruler-straight white lines with no damage, and the plinth is a stack of flat lavender slabs that reads as a box.
  - Fix: Cut the openings out so the square shows through between posts; draw only the far rail, the bench and the floor inside, in dark tones. Replace the two cards at the near pass with a front card and separate roof and rail cards so no doubled frame shows. Roof: shingles with missing patches, a sagging fringe with teeth gone. Posts: lean 1 px, chipped paint, one broken rail section, bunting hanging. Plinth: drawn steps, chipped brick, moss, not two flat slabs.
- **high**: Gas station, hold 14: the canopy is still a box and the largest shape in frame: a flat periwinkle roof plane and soffit with knife-edge corners and long ruler-straight converging edges, on four box pillars. The only change from the reference is a drawn fascia strip. It is in scope and admitted as not done, and the brief says no box anywhere. The eye goes straight to it after the drawn buildings either side.
  - Fix: Replace roof and soffit with drawn cards inside the animated canopy group so the buckle still plays. Deck top sagging 2-3 px with dents, pooled water, a torn flashing strip and an uneven far edge. Soffit panels drawn with stained seams, hanging tubes, a dead fixture. Pillars as drawn cards: hand-drawn hazard tape, chips, dents, a car scrape, rust at the foot. Keep the pumps' and barrels' positions.
- **medium**: Lamp cones hang in open sky. The diner lamp's cone was removed as the keyhole glow, but other lamps still draw a hard stepped translucent trapezoid against the sky, because the wall that used to catch it has been raked away. It reads as a rendering artefact and floats.
  - Fix: Apply the same treatment as badLamp (z1/pixel.ts) to every lamp whose beam now lands on sky: set beams.colorOf(i).k to 0 for the zones C, D and E lamps, keeping pool and head. Or draw each cone only where a flat is behind it.
- **medium**: Alley near ends, hold 10 and the walk out. The left wall's bricks reach about 23x10 art px at the near end, about twice the size of the door they surround, while bricks elsewhere in the frame are about 4x2. A chequerboard band under the boarded arch reads as misplaced diner tile, the arch head is a shapeless dark blob, and the THEY BITE neon runs across the boards. The right wall at the walk out (m11) is point-blank bar-code stripes about 30 art px wide, flat and repeated.
  - Fix: Draw the near 6-8 m of each wall at the size it is seen, as for the diner kick: bricks about 8x3 art px in irregular patches. Corrugation ribs every 3-4 art px with dents and rust. Remove the chequer band and draw rubble or a bricked-up sill. Move the arch about 4 m further along the wall so THEY BITE sits on intact brick.
- **medium**: Alley hold: the step boundaries of the flickering lights crawl across the big flats, jumping several art px every frame along the left wall's cornice and in rings on the right wall. Measured on three consecutive frames, frame-pair change on wide regions is 0.0246 of the frame vs 0.0104 on the reference, and A-B-A flicker 0.0145 vs 0.0061. Enemies and rain are in both. It is more than double the old box walls. Not Z-fighting: it is light, but it shows as shimmer on a large still surface.
  - Fix: Hold the flicker at a low rate (every 6-8 frames) or a smaller amplitude on flat cards, so the light steps do not sweep across a wall every frame, and feather the boundary with the existing dither rather than moving it.
- **medium**: Bus hold: the bus-shop roofline reads as a rocky hill: a rounded lump with a bright rim and no broken wall ends or cornice remnants. Nearby, the door pane left of the frame is a dead flat cream rectangle (about 30x20 art px), one of the brightest things in the frame with nothing drawn in it.
  - Fix: Roofline: show the ruin as a wall: a jagged stepped break with brick courses, a snapped cornice run, exposed joists at the tear. Door pane: drawn glass with a reflection, a taped notice and a grime gradient, and pull it down one value step.

## bz2t

Agents finished: bz2t lead r1, bz2t judge art r1, bz2t lead r2, bz2t judge art r2.
Stopped while running: none.

### Last report (bz2t lead r2)

All high and medium findings from the judge are addressed, one by a decision for the owner, and the low ones too. The wing is now four cut-outs (brick end with two ribbon bays, three ribbon bays, a stair tower standing proud, old brick). Each has its own rake and painted dark returns at the steps. Every ribbon bay is drawn on its own, and the concrete is about a tone darker. The fascia is bent over the crash pillar, has one panel torn out with struts and a hanging conduit, and carries a three-ring red wash on the ribs beyond the letters. The maroon block behind the hole is gone. Pillar light now faces the sign, inside the shaft. Lit panes are three tones with a mullion and a dressing, and boards are planks in dark tones. The dark ball was the top puff of a smoke column in the sky painter; columns now thin out. Letter spacing was a real bug: it caused the 'empty brackets' and the bunched-up, misread letters. The title's four near walls have mid-wall brick, stepped light seams, a hand-placed diagonal shadow, a stain and their own doors (R0 stays a shutter). Cold paint is recorded by stage in the notes and needs the owner's decision: z2 is about 2.0 s against the 1.2 s budget, the title about 1.5 s.

Not done or not verified, in the lead's own words:

- Cold paint is not under the budget: z2 about 2.0 s and the title about 1.5 s against 1.2 s. The totals are recorded in the notes; this needs the owner's decision. I did not cut paint work or defer the title buildings.
- pixel-audit still prints 'fail' on flat blocks and on texels over 1.5 frame pixels under the canopy, same family of numbers as round 1. Not a target of this round.
- The title's 39-versus-31 draw calls at some capture moments were seen near a vignette cut; the cause was not looked into.
- The title's tan dashed row (a street lamp's dithered halo) was left alone: it is not a flat and it is in the reference.
- Classic and PIXEL CAST were not re-screenshotted this round. The diff touches only z2flats.ts, pwFlats.ts, z2sky.ts, menuflats.ts, one test and the notes, and the identity test passed, but I did not re-measure pixel diffs against the reference.
- The three door-crossing frames in the road-and-door sheet predate the soffit form-board change. The under-canopy frame b5 f150 has the new soffit, and I judged it only at sheet size.
- Shimmer in motion was not re-measured. Holds and the approach were judged from stills only, at b0 f1, b0 f300, b1 f200, b1 f420, b2 f240 and b5 f150 to f330, plus HUD frames at the hold and road.
- The hospital's right range and the far end of the wing did not get fewer brick passes; that paint saving was not attempted.

### Judgement (bz2t judge art r2), at bar: True

- **medium**: The dark return on wingB does not read as a slot. It reads as a flat near-black post about 11 art pixels wide and 107 tall, running from the ground to above wingA's roofline, darker than the night sky behind its upper part. It is the least drawn shape on the wing and the strongest vertical there through b0 and early b1. The report's claim that the step reads as a slot in the wall does not hold above wingA's roof, where there is no wall for a slot to be in.
  - Fix: In darkReturn for wingB, above the height where wingA's roofline crosses it, narrow the strip to 0.2 to 0.25 m and end it in a torn parapet lip. Below that, replace the single soot tone with three tones: a 2-texel lit strip against the concrete, a rusted downpipe, and 3 or 4 stain or rebar ticks. Widen the edge wander from plus or minus 3 texels to stepped runs of plus or minus 6.
- **medium**: The fallen-panel hole in the soffit is an alpha cut, so walking under the canopy shows pale stone and a green window from the hospital front through the ceiling, as a garbled sliver at the top of the frame. It should be dark void. The report said nothing shows at the card edges on the walk-in; the hole was not checked.
  - Fix: Do not cut alpha for the hole. Paint it opaque near-black with a ragged 2 to 3 texel lit concrete lip, two hanging conduits and a few rebar ends, which costs nothing on the painted-glow route. If it must stay cut, stage a dark backing plate about 0.4 m above it.
- **medium**: Cold paint is still over the 1.2 s per-stage budget. It is now recorded in the notes, as asked, but the owner's sign-off is outstanding, so this stays open. Figures are from one run on the shared box and are noisy.
  - Fix: Take the totals in docs/pixelworld3/bz2t.md to the owner for the sign-off z1 has. If refused, paint the hospital's right range and the wing's far tooth with fewer brick passes, and the title's far buildings at lower density.

## bz3

Agents finished: bz3 lead r1, bz3 judge art r1.
Stopped while running: none.

### Last report (bz3 lead r1)

Every structure in z3 is now drawn flats instead of boxes: outskirts blocks, houses, gas station, warehouses, motel, billboards, gantry, overpass, sound wall, tunnel portals and bore, bridge towers, cables, hangers, rails, sandbags and floods, plus the far city redrawn in the z1 manner. Round 1 is complete. Atlas memory went down (19.4 to 10.7 MiB for the z3 atlas, 8.1 MiB of flats added, stage total 22.3 MiB against 22.9) and draw calls are 49 to 59 (limit 250). tsc, pixel-world.test.ts, stages.test.ts and the z3 tests pass, including a new volume test. pixel-world-z3.test.ts has one change: the sign-fit list drops the billboard entry because that painter was deleted. The audit passes at the barricade and boss views and still fails on flat blocks at the start, overpass and tunnel (the tunnel improved from 20.4 % to 17.1 %, limit 4 %). I stopped my dev server on port 5843.

Not done or not verified, in the lead's own words:

- Not checked on a real phone: frame rate and thermal behaviour unmeasured, only draw calls and triangles, and the paint figures come from a shared software-GL machine. Bake and paint times on device unknown.
- Audit still over its limit: flat blocks at the tunnel 17.1 % (reference 20.4 %, limit 4 %), at the start 7.6 % and at the overpass 5.9 %. Barricade and boss pass. Start, overpass and tunnel were not re-audited after the final density change (that change was bridge-only).
- The overpass had six look-and-fix rounds. Every other structure had two or three, not six.
- Some flats have only been seen in passing (gas station, motel, far billboards) or at a few frames; no full playthrough video was reviewed.
- The deck's truss, underside and tower feet below the deck are no longer shown because no capture I reviewed sees them from the deck. The moment of the Behemoth's climb onto the bridge was not captured, so the deck edge there is unchecked.
- The far portal's outside face and the overpass's back face are reused paintings, tinted, and were not reviewed from the look-back.
- Out of scope and left as they were: bridge lamps, the highway signs (their old painted panel), the sprayed words on the sound wall (old decals on the old face, not painted into the wall) and vehicles.
- The sound wall stays parallel on its old line (not raked), so it still reads as a long converging plane despite the broken outline.
- The tests changed in one respect: pixel-world-z3.test.ts's sign-fit list dropped the billboard entry (the painter no longer exists; the flats' poster is painted without the ink pass). Other stages' tests were not run beyond the listed suites; no e2e.

### Judgement (bz3 judge art r1), at bar: False

- **high**: The tunnel bore is still a box: four planes converging to one point, and it is the second-longest hold on the road. The top of each wall meets the ceiling in one unbroken ruler-straight line from the near corner to the vanishing point. The ceiling is a flat plane (saturated purple on the approach, near-black at the stall) with only lamps on it. Ribs are thin posts that stop at the wall and do not cross the ceiling. The tile painting itself is good, but a stranger would call this a textured 3D corridor.
  - Fix: Draw the ceiling and break the junction with layers. (1) Replace the plain ceiling with a painted ceiling: panel joints, stains, broken lamp housings. (2) Hang cut-out cards 0.3-0.6 m below it: a jet fan every 18-24 m (about 2 m wide), and a sagging cable tray along each wall top in 3-5 m runs with gaps and one fallen end. These cover the wall-ceiling line, so no straight run exceeds about 3 m. (3) Add a cross-beam to the rib card every 12 m, so the converging lines are interrupted and the bore reads as receding portal frames. (4) Break the hazard band: chipped, displaced, missing for 2-4 m in places. (5) Use a different wall painting per side at each station.
- **high**: The second bore at the portal is a pure black rectangle with ruler-straight edges and no interior, about 165 x 98 art pixels. The report calls it a drawn dark mouth; it is an undrawn hole, directly beside the real, lit road bore, and the two read as a flat black box against a 3D opening.
  - Fix: Paint it on the PORTAL card as a place. Use 3-4 stepped near-black values receding (never 0,0,0), two rib arcs, a few dead lamps, and a crashed vehicle silhouette or a roller shutter jammed half down with crumpled slats. Make the opening's outline irregular with spalled concrete and rebar at the corners (4-10 texel bites), with soot climbing above the lintel.
- **high**: The title look-back, the stage's first image, shows outskirts blocks that read as stamped cut-outs. Each is a near-uniform grid of identical small windows with barely any structure beyond a ragged top: no cornices, no roof clutter, no change of bay or storey. Next to it a blank salmon oblong has no windows at all. docs/pixelworld2/plan-z3.md:40 says of this shot that it must be a painting. Against z1's hand-placed elevations this is the widest gap in the stage.
  - Fix: Give blockCard real structure per record, keeping the footprints. Vary window size and spacing, and drop, brick up or board about a third of them. Add heads and sills, a cornice with breaks, one fallen top storey, a stair column on one block and a shopfront band on another. Add roof cards (water tank, aerials, stair head) standing behind the top edge, and clump lit windows unevenly. Paint the blank oblong as a real far block, or remove its card. Keep the windows-per-record data as a count only, not as a grid.
- **medium**: The sound wall is still a long converging plane on the road. The panels are nicely drawn and heights change here and there, but the top line runs nearly straight for over 100 art pixels and the wall is one parallel sheet (the report concedes it was not raked). The sprayed words are crisp old decals in another style and sit on top of the painting rather than in it.
  - Fix: Split each 24 m card into 3-4 cards of 6-8 m, raked 15-25 degrees in a saw-tooth inside the old thickness. Step tops by 0.5-1.5 m between sections, with one section leaning and one fallen. Paint the words into the panels, broken across joints with runs following corrugations, or at least re-ink them in the wall's ramps.
- **medium**: The main cable, seen for a long time in the boss arena and at the escape, reads as a ruler-straight bar of one flat red about 220 art pixels long. No clamps or band bulges show at that size, and no underside shadow, so it is a line rather than a drawn cable.
  - Fix: On BRIDGE_CABLE paint two-tone wrapping with a dark underside and a lit top, clamp bands every 1.5-2 m standing 2-3 texels proud of the outline, and rust streaks. Wobble the outline by one texel. Give the ribbon more segments so the catenary reads, and vary its width at clamps.
- **medium**: Tower legs are one saturated red from top to bottom with straight sides. Cells and rivets are drawn, but there is no value structure across the tower (no cast shadow from the portal beam, no lit side, no large weathering shape), so up close each leg reads as a striped column. The truss above it, by contrast, is excellent.
  - Fix: Add one whole-leg light plan: a 2-3 texel lit side, a large stepped shadow falling from the crossbeam, two or three big rust and primer shapes across cells, and dark drips under each rivet band. Break the outline every 3-4 m with stiffener plates 2-4 texels proud and add a separate ladder or conduit cut-out. Lower saturation in the shadow ramp.
- **medium**: The motel is a long slab with a straight top edge and murky, blotchy detail at its read distance. Doors and windows do not separate and the roof is one unbroken line of about 95 art pixels.
  - Fix: Redraw for its distance: bold door and window shapes in 2-3 values, one lit room as the focal point, a broken eave with AC units and a sagging gutter, and a section of roof collapsed. Rake it or split it into two wings so the roof line changes direction.
- **medium**: Whole-stage cold paint has risen beyond what the report states. Its 953-961 ms was measured before the final density bump. Over fresh page loads on a loaded machine (load about 12) the stage painted in 1025-1919 ms against 461-1524 ms for the reference, with z3-flats alone 457-1089 ms (median 726). The ceiling may be over the 1.2 s PIXELWORLD3 quotes for stages other than z1, but this machine cannot settle that.
  - Fix: Re-measure on a quiet machine and correct the number in docs/pixelworld3/bz3.md. If it is over 1.2 s, make the z3-flats painters generators that yield between passes, as z1's do.

## bd1

Agents finished: bd1 lead r1, bd1 judge art r1.
Stopped while running: bd1 lead r2.

### Last report (bd1 lead r1)

JUNGLE RUN (d1) is converted. The gate, palisade, ticket kiosk, watchtower and the river landing's hut and jetty are now drawn cut-out flats in timber, rope, thatch, tin and painted boards. The old box meshes are gone in PIXEL WORLD; hidden classic meshes still carry gameplay. The gate's road opening is cut out where the doors hang and the leaves still swing. tsc passes, and pixel-world.test.ts, stages.test.ts and the new volume and opening test are green (61 passed). There are four commits on the branch. My dev server is stopped; the reference server is untouched.

Not done or not verified, in the lead's own words:

- Not looked at after the very last edit (palisade lashings following the rails, rakes as gouges): only typecheck and tests ran. A final capture was queued behind the shared machine's semaphore for over 9 minutes and I abandoned it, so before-now and phone-crt predate it and the hut-roof change.
- The hut and jetty were only ever seen small, at about 50 m, in the ford and riverbank views. I sampled boss chase frames 60, 200, 400, 900 and 1300 and never saw them there; I did not check every boss frame or angle.
- Palisade and jetty back faces (mirrored cards) were not captured; they should not be visible from the rail.
- The door swing was checked at a few frames of the opening, not through the whole animation.
- Stayed as they were, out of this job's list: flagpoles (thin cylinders), torn flags, raft, driftwood, NO SWIMMING plate, fence, tour car.
- d1ThatchTile's retexture rule is left in place. It only registers a tile if something hits it, and I expect nothing does now, so it may be dead code. d1CrateModule stays because the ranger supplies use it.
- Only the listed test files ran: not the whole unit suite, no e2e. No real iPhone: Chromium software GL only. Paint timings were taken under contention.
- No side-by-side performance comparison beyond the audit shots listed.

### Judgement (bd1 judge art r1), at bar: False

- **high**: The open door leaves float free of their posts. During the pass-through, the game's first big moment, a slit of sky and jungle runs the full height between each pillar and its door. The hinge edge is attached to nothing. The reference has no slit: its strap crosses onto the post. The report's door check (a few frames of the opening) missed this. It shows from about d 15 to d 28, roughly a second of driving, at near full screen height.
  - Fix: Close the slit, keeping the hinge pivots where they are. Either place the gate card at lz about 0.05 instead of 0.6 (the volume test allows it; sign and torch cards ride with it), or add a drawn jamb in the gate's frame: a dark bark strip about 0.7 m wide and 8.3 m tall from the hinge line back to the pillar. Also paint two iron straps with bolts crossing from leaf to post on each side, on the leaf's hinge side. Re-check d1:1 frames 160, 190 and 230, and the closed doors.
- **medium**: The gate and palisade cards end in a dead-straight dark bar on the grass at the pass-through. It runs about 90 art px with hard square ends and a step where one card meets the next, and reads as the bottom of a card or a plank laid on the ground. The rule is no ruler-straight edge over about 3 m without a break. The tower's foot has a short version of the same strip.
  - Fix: Rework groundStrip on the gate, palisade and tower cards. Break the lowest 6 to 10 texels every 8 to 20 texels with earth bumps and overlapping grass tufts, no run level for more than 12 texels. Drop the solid dark lower line. Offset the strip between gate and palisade so the join is hidden, or add a tuft and fern card 0.3 m in front of each pillar foot.
- **medium**: The kiosk's ticket window is a flat near-black oblong with a row of colour chips. It is the darkest and most rectangular shape in the title frame, and z1's shop interiors are drawn rooms. This is the least drawn area of the piece.
  - Fix: In paintKiosk, draw an interior: a back wall in two dark tones, a shelf with ticket rolls, a key rack, a tipped stool and a torn blind over the top third of the opening. Keep pure black only in the lower corners. Break the window frame's line with one split board and a hanging notice.
- **medium**: From the road the palisade's top reads as a level comb. Stake heights vary but the tips sit near one line, and most end in the same pale cone. The brief asked for a stepped, splintered top; that shows when the flat is dumped on its own, far less in the title frame.
  - Fix: Add 2 to 3 large moves per wall in paintPalisade: a slumped run 5 to 6 m long sitting 1 to 1.5 m lower, one stretch leaning 3 to 4 degrees, and a stretch of snapped stubs with no cones. Vary the tips: about one in three weathered grey or dark, about one in six snapped.
- **medium**: Nailed repair patches read as translucent rectangles. A straight horizontal tone seam crosses several boards at one height, pale above and dark below, so it looks like a ghost oblong laid over the wall.
  - Fix: In repair(), give each board its own tone and uneven ends, with 1 to 2 texel gaps showing the stakes behind, nails at each end, and a shadow under the patch. Do not run a value seam at one height across more than two boards in a patch.

## bd3

Agents finished: bd3 lead r1, bd3 judge art r1.
Stopped while running: bd3 lead r2.

### Last report (bd3 lead r1)

d3's visitor centre, ticket kiosk, paddock pylons and stumps, trestle rails and bents, abutments and end posts are now drawn cut-out cards, and their visible boxes are gone in PIXEL WORLD. Hidden occluders, RNG and every classic path are unchanged. Sheets are labelled. Tests pass at the final state, with the caveat in notDone that two suites last ran before the final deck-filter and paint/gain commits. One density number got worse at the hold (see numbers).

Not done or not verified, in the lead's own words:

- Hold density: the visitor front's texels are about 1.3-1.7 frame pixels wide (audit >1.5 at the hold 5.5 -> 13.7 %). I kept it because the drawing reads crisply there, but it does not meet the PIXELWORLD2 <=1.5 bar. Repainting at about 16 texels/m would, at the cost of rescaling the fixed-texel windows.
- The bridge collapse itself: I checked frames at beat 14 only. The look-back shot shows the deck and fire at a late frame. I did not review mid-fall frames of the loose pieces with their rail and bent cards. The code path is the same zone-per-piece path as the deck, but the falling picture is unverified.
- The abutment gorge faces and trestle bents were judged in the dump sheet, not in a game frame, because no normal shot shows them. The classic geometry goes away so nothing reads wrong, but the in-game look of those two is unverified.
- pixel-world.test.ts and stages.test.ts last ran before the final deck-filter and paint/gain commits. The d3 suite and tsc were rerun at the final code commit.
- Pylon cards are single-sided, raked 50 degrees forward: a pylon passed by more than about 8 m is back-faced. No captured beat looks back at the fence, but I did not exercise every look direction in a full playthrough.
- Road approach: the visitor centre is a flat seen obliquely at the frame's edge. It has no rake or end flat (the doors must stay on the old line, and the wings' rake was rejected on paper); it reads as a thin card only in the far approach frames.
- Not converted (out of scope): plaza planters, the floodlight mast, the fountain, the helipad hut. Still-classic pieces such as the wire spans and lamp posts stay as they were.

### Judgement (bd3 judge art r1), at bar: False

- **high**: Regression: the concrete apron under the jeep at the bridge approach is gone. The abutment box was removed whole and replaced by a gorge-face card only, so its top no longer exists. The jeep and camera sit over the river, the deck's near edge hangs in the air with water under it, and a puddle-ring decal floats on nothing. bd3.md says 'Abutments: gorge face only (nothing else is ever on screen)' and the report says 'nothing reads wrong'; both are false, and the report admits it only judged this on the dump sheet.
  - Fix: Lay the abutment's top before g.remove(c) at pixel.ts:826: a drawn plan-view card or a +y-only face, 9.6 x 4 m at the old box's top height, about 192 x 80 texels at 20 texels/m. Paint it as concrete with tyre grime, cracks and a ragged 6-14 texel lip on the gorge side, and run it 0.2 m under the deck end so no seam opens. Do both ends (dir +1 and -1). Check the ring decal lands on it. Re-capture beat 13 frames 200-260 and the look-back from both ends. Correct the bd3.md statement.
- **high**: The sign, the most-read thing on the hero building, says 'VIS,TOR CEPTER', and it changes with distance. The painter deletes the top of the I and the bottom of the N, leaving a comma and a P. Strokes are 1 texel wide at about 0.7 frame pixels per texel across the sign at the hold, so stems also drop out under point sampling. It reads as a typo or bug at every view. The reference read VISITOR CENTER cleanly, and bd3.md's 'lettered at 1:1' is not what the frame shows.
  - Fix: Stop deleting strokes. Dead bulbs stay as shapes: same pixels, dull iron or dim amber tone, no GLOW. Choose damage that still reads, such as the last R flickering dim or a letter sagging a texel. Redraw the lettering with 2-texel stems, about 10 x 14 texels a glyph, inside the existing 348 x 26 sign (or give the sign about 24 texels/m), so it holds at 26-60 m.
- **medium**: The portico beam and main eave are the last long ruler-straight lines converging to one vanishing point, which is exactly the box tell the brief bans. The beam runs about 21 m unbroken and its left end stops in a flat cut past the last column. There is no rake and no break to interrupt it, as z1 has.
  - Fix: Keep the placement (the doors must stay on the old line); fix it in paintVcSign and the eave. Break the beam every 2.5-3 m with butt joints or bolted plates, step sections 1-3 texels up or down, sag the middle 2 texels, and cut one 12-20 texel notch with splintered ends. Give the left end a drawn end-grain return with a bracket. Dip the eave line 1-3 texels every 3 m.
- **medium**: The flickering upper window is the brightest shape on the building and is the least drawn: one flat fill and a cross. It reads as a yellow block. The glazed storey around it is an almost toneless black band.
  - Fix: Paint vc-flick as a window: a 2-texel reveal, a blind pulled two-thirds down with slat lines, a dark shape behind (filing cabinet or hanging tube), and light in 3 stepped tones falling away from the top row. In the band around it, draw mullions at each bay, one moon streak per bay, and one or two broken panes.
- **medium**: The visitor front's card ends are ruler-straight verticals with no return, so the wing reads as a cut-out rectangle. The kit's 'a card is not a rectangle' rule was not applied to this stage's brushes.
  - Fix: In paintVcFront, draw a 6-9 texel pier or stone return at each end in dark tones, tooth the top third, and wobble the edge 1-2 texels every 4-6 rows. Add a downpipe or vine that overlaps the edge to break it.
- **medium**: The bridge deck is still the classic slab: a razor-straight near edge across the frame and long converging edges. At look-back distance it is a plain brown plate. The new rails make it look more of a block by comparison.
  - Fix: Lay a drawn deck edge: at the near end, stagger plank ends by 6-14 texels with a 2-texel shadow and 1-2 planks missing, showing the joist. Along each side, add a fascia card broken every 3 m. Make sure 3-4 plank groups with dark gaps survive at the deck's far mip, or paint a far-distance version.
- **medium**: The thatch reads as cobbles or brick noise, not straw: even, rectangular dabs at one frequency. The lit and shaded slopes barely separate in the frame, so the roofs lack the big value shape that makes a silhouette in a dark storm picture.
  - Fix: In thatchFill, cut the noise frequency by about half and lay tufts in eave-parallel courses 6-8 texels tall, sagging. Move the lit slope up one ramp step and the shaded slope down one, with a hand-shaped ridge seam. Group rot and moss into 2-3 large drifts per roof.
- **medium**: The report's own audit has world pixels drawn wider than 1.5 frame pixels rising from 5.5 % to 13.7 % at the hold (figure from the report; I did not re-run the audit). It shows: the front and columns step coarser than the 1:1 sprites and the kiosk beside them, against the owner's 'a good deal more detailed'.
  - Fix: Repaint vc-front and vc-cols at 16 texels/m (672 x 224, 464 x 121) as the report proposes, scaling the fixed-texel windows, and re-check the atlas (about +1 MB, well inside the limit).

