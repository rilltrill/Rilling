# What is still to convert (scouted from the code; file:line were correct at the time of the scout)

## Humanoids
Zombie bodies (src/content/enemies/zombies.ts:2727-32). Outfits: ZOMBIE_VARIANTS, zombieKit.ts:177: civilian (casual look), cop, nurse, doctor, worker, office, patient, soldier, biker.
- walker (:1126), z1 x39, z2 x3, any outfit. straggler (z1/straggler.ts), z1 x8, walker body. runner (:1250), z1 x10, z2 x25, sprint/lunge/leap.
- crawler (:1640), z1 x10, z2 x20 plus boss pool (z2/boss.ts:1230), legless torso, pounce; outfits civilian/patient/office/worker.
- spitter (:2411), z1 x2, z2 x4, glowing throat sac (weak point), veins; civilian/patient/office/nurse. bloater (:2551), z1 x2, z2 x4, belly, pustules (weak), bursts.
- brute (:2172), z1 x1, 2.4 m, shirtless, riot trousers, armour plates, stagger. brute_z2 x1 (z2/brute.ts, same body). riot_z2 x1 (z2/riot.ts, default cop, steel vest and belt, armour).
- z3 (z3/minions.ts:665-675) reuse the above: pack_runner x39, truck_runner x27, tail_runner x1, finale_walker x37, roadside_walker x9, finale_crawler x10, roadside_crawler x2, finale_bloater x4, finale_spitter x3, deck_spitter x4, riot_brute x5 (adds a glowing split skull, :489).
- Any zombie: severed forearm or arm, headless, entry drop/leap, stagger, windup, lunge, dying. No zombies in d1-d3.
Bosses (all use paintPixels, no drawnFigure):
- butcher (z1, z1/boss.ts:29): 3.2 m, cleaver arm and apron armour, apron rip adds 3 pustules, exposed heart, pustules, roaring head, meat hook.
- patient_zero (z2): fused mass, tentacles, 8 eyes, rib cage opens to heart. Barely humanoid: stays on its current path.
- behemoth (z3, z3/boss.ts:20): 7.6 m worker, hard hat, rebar, arm guard armour, chest wound and head weak, lamp-post club.
Civilians (src/gameplay/Civilian.ts:72): z1 cop backaway, worker cower. z2 nurse grabbed (attacker patient), scientist cower. z3 default plead, nurse cower, cop cower. d1 ranger, default, scientist (all flee). d2 tech x2 flee (outfit 'scientist', orange polo). d3 scientist flee, ranger backaway, worker perched (d3/index.ts:386). Worker wears flannel, default wears casual. Acts: cower, hide, flee, backaway, grabbed, plead, plus fall, stumble, thanks.
drawnFigure today: set at zombies.ts:214 (Zombie base) and Civilian.ts:1400. Only WORKER and FLANNEL exist (src/gameplay/pixel/drawn/outfits.ts:1103,1300). states.ts:33 has no crawl, run, spit or bloat frames; grabbed maps to CIVPLEAD[0].
Dismemberment: q.flags (zombies.ts:222; layout figure.ts:76) is baked into the atlas key (DrawnCast.ts:266); civilians always pass 0. Drawn in outfits.ts: stump() :589, neckStump :969, headless :1070, :1114. Flung limbs are NOT drawn figures: the branch is root-only (SpriteArt.ts:1790), so looseParts go through the old paintPart/paintLooseArm (zombies.ts:237). Head pop is fx.gibs plus the headless flag (zombies.ts:669).
Title screen: MENU_HORDE (src/gameplay/pixel/castMenu.ts:412), 9 looks: office, worker, nurse, cop, flannel, biker, soldier, patient, doctor; backlit PixelCast silhouettes, walking/reaching (src/ui/MenuBackdrop.ts:799-802).

## Buildings still boxes
z1 (z1/town.ts, record z1/props.ts:236). Already flats (pwFlats.ts AT): pawn, laundry, rialto, boarded, liquor, billblock, cornerE, hotel, cafe, w4, w6, bar, cornerW, meats, bank, grand, shutterblock, the diner. NOT yet: BARBER (:345, beat 0). Cross-street row, 8 boxes (:377). Main past the corners, beat 8 on: PHARMACY (:320), fire-escape (:340), shutter (:341), plain (:342), GUNS (:371), tank (:372), boarded (:373), plain (:374). Alley warehouses, brick and corrugated (:583-589; raw boxes, no pwBuilding). Second Street east, 6 including MOTEL and the bus storefront (~:640); west, 5 including POLICE (~:656). Gas station canopy, pillars, GAS & GO (:713-766). Square: BOOKS/TOYS row (:906), kiosks (:927), plain 3-storey (:1015), courthouse with clock tower (:1016), bandstand (:1062).
z2: hospital facade, wing, canopy (z2/pwBay.ts:100-122, z2/shell.ts:48). Everything else is interior rooms and stays.
z3 (z3/pwBuildings.ts, z3/pwStructures.ts, painted boxes): outskirts blocks (:305), houses (:71), gas (:145), warehouses (:184), motel (:226), billboards (:274); gantry (:103), overpass (:120), sound wall (:179), tunnel/portals (:204,:244), bridge deck (:275), towers (:334), sandbags/floods (:397,:413). Boss arena is the suspension bridge: deck, towers, cables.
d1: gate pillars and palisade (d1/props.ts:161, d1/pixel.ts:362,402), kiosk (pixel.ts:456), river jetty and ticket hut (pixel.ts:633-659), watchtower (d1/env.ts:884). Boss road: the landing and hut dress it (env.ts:1000).
d2: no exterior buildings, the whole stage is interior rooms; nothing to convert.
d3 (d3/props.ts): visitor centre (:232), paddock pylons (:74), ticket kiosk (env.ts:1073), trestle bridge (:360, d 339-383, before the boss), abutments (plan-d3 #12). Boss road has no buildings; the helipad is a slab with edge lights.
Title: city street blocks both sides (MenuBackdrop.ts:493-552, menuPixel.ts:213 building, :251 roofBox). The jungle backdrop has fence posts only.
