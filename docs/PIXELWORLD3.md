# PIXEL WORLD 3 — real 2D people, real 2D buildings

The owner, after playing the build at `de7004b`: *"The people still dont look like people at all -
shape is all wrong. Trash all the blocky buildings and redraw as 2-d. I know it's a lot but do it."*

Earlier briefs still apply where they don't conflict: docs/PIXELWORLD2.md (pixel density, ramps,
painting rules, the game reads first). Gameplay never changes: hitboxes, occluders, RNG, timing.

## People

### Why they don't look like people
Four attempts hung shapes on the hidden 3D gameplay rig, seen through the game's perspective camera.
Whatever the shading, the SHAPE is the rig's: legs about 60 % of the height and strip-thin, a short narrow
trunk with no ribcage / waist / pelvis, small heads, stick arms held out straight, tiny hands, feet
together, and perspective stretching near figures. Patching that has failed; it is replaced.

### What replaces it: figure drawings
A person is DRAWN in a canonical 2D sprite space, from drawn shapes with real anatomy, and shown as a
flat sprite: no perspective on the figure, 1 sprite texel = 1 frame pixel at every distance.
- **Canon** (arcade-heroic, Metal Slug 3 / House of the Dead 2 / SF III crowds): 6–6.5 heads tall; crotch at
  mid-height; shoulders 2–2.3 head-widths (women about 1.8), waist narrower, hips 1.5–1.7; wrist reaches the crotch
  line, elbow the waist; knee halfway from crotch to sole; hands and feet about 15 % over life size.
- **Mass, not tubes.** Ribcage and pelvis are separate masses joined by a waist. Every limb outline is
  asymmetrical: deltoid, biceps, the forearm swell below the elbow, the thin wrist; the outer thigh, knee, the
  calf bulging high on the back. Neck, jaw, ears, nose in the outline.
- **Gesture.** Nobody stands straight: spine in a curve, shoulders and hips tilted against each other, head
  forward, knees and elbows always bent, weight on one leg, feet apart and splayed. Zombies shamble: one shoulder
  dropped, an arm dragging, the head lolling.
- **Clothes are shapes**, drawn over the body: collars, lapels, sagging sleeves, folds that notch the
  outline, hems, torn cloth, boots with heels.
- **Views**: front, three-quarter, side, three-quarter back, back (mirrored for the rest). Each view is drawn;
  a view is not a rotation of another.
- **Silhouette test**: filled solid black at 60 px tall it must read at once as a person, and as which kind.
- Finish as in PIXELWORLD2 §9: flat tones with designed shadow shapes, ink on the outer silhouette of the
  union (never round each part: no paper doll), lighter interior lines, drawn faces, hands with fingers, costume detail.
  Same ramps and step lighting as the backgrounds: one medium, people and places.

## Buildings

### Why they look like blocks
A building is a 3D box wearing a texture: ruler-straight parapets and corners, flat faces meeting at knife edges,
long converging roof lines, side faces, quoins like stacked cubes. Paint alone cannot fix a box.

### What replaces it: drawn flats
In PIXEL WORLD the visible boxes are deleted (the hidden boxes stay for gameplay). A building is a
**2D illustration on a flat card**, like stage scenery or a Metal Slug background layer:
- One painting per building: a drawn elevation, with its own light and value structure across the whole picture, not
  tiled modules. No side faces.
- **The outline is drawn.** A cut-out silhouette: broken and uneven rooflines, cornices, chimneys, water tanks,
  aerials, signs, parapets with damage. No ruler-straight edge longer than about 3 m without a break; lines lean and
  sag a pixel here and there. It is the end of the world: cracks, holes, boarded windows, hanging wires, scorch.
- **Depth is layers**, not boxes: awnings, marquees, fire escapes, signs, lamp posts, trees as separate cut-out cards in
  front; dark gaps and lit interiors behind.
- **Staging** breaks the long converging box lines: flats may be raked toward the oncoming camera in a saw-tooth (theatre
  wings), stay parallel to the street, or face the camera at the end of a street. Chosen by how the frame looks, per place.
- Where enemies come out of a building (doors, windows, the diner), the opening stays where the gameplay has it.

## Buildings as built (round 1: z1 Main Street, beats 0–5, and the boss square)

- `pixelworld/elevation.ts`: the illustration kit. An `Elev` over a `PwCanvas` draws one building as one picture: `parapet`,
  `curvedGable`, `steppedGable`, `bite` (the drawn outline, `top[]`); `fill` / `courses` (brick in patches, thinning out,
  never a grid) / `patch` / `bareBrick`; `cornice`, `coping`, `band`, `pilaster`, every long line through `sag()` / `lean()`;
  `window` (kinds: dark, moon, lit, curtain, blind, figure, tv, boarded, broken, bricked, ac) with heads and sills;
  `shutters`, `drainpipe`, `wire`, `poster` / `bills`, `tag` (spray lettering), `sheet` (HELP on a bedsheet), `clothesline`,
  `fixture`, `shopfront` + `room` (a shop interior drawn in one-point perspective, per bay), `scorch`, `pocks`, `crack`,
  `value` (whole-tone value structure with hand-shaped seams), `pool`, `footGrime`, `ink`. 32 texels a metre (FLAT_TPM).
- `pixelworld/z1flats.ts`: the z1 buildings (`Z1_FLATS`): each a hand-placed picture plus cards: awnings, fire escapes,
  the pawnbroker's balls, a rooftop billboard, and each building's roof clutter (chimneys, tanks, aerials, vents) as
  separate cut-out cards standing a little behind the wall (parallax, and no painted sky in the atlas).
- `stages/z1/pwFlats.ts`: staging. `Z1Flats.stage()` deletes a building's visible meshes (the hidden occluders stay),
  lays the flat and its cards, and for `raked` flats turns the group about the flat's far end (35°, the near end swinging
  back inside the old footprint: `FLAT_RAKE`), floors the wedge of sidewalk that opens, and darkens the wall glows that
  have nothing to land on. Placements are chosen per building in `AT`; `&pwflats=parallel` or `&pwflats=<degrees>` overrides
  for look-dev. The RIALTO stays `parallel` (the marquee's animated chase bulbs stand on the old facade; since round 2 the marquee is cards, not a box), the boss
  square's PRIME MEATS and bank stand square to the camera (`facing`).
- One atlas (`z1-flats`, skyline-packed: `PwAtlas(..., { skyline: true })`) and one draw call a zone; lit `Z1_FLAT_GAIN`
  (2.6; 1.7 in the square, zone E) so a wall lands on the mood's pivot and shows as painted.
- A new building: add a painter in `z1flats.ts` (or `<stage>flats.ts`), an entry in `Z1_FLATS`, and its world position in `AT`.

### Round 2 (what the judges asked for, as built)

Rules the kit now enforces, so every later stage inherits them:

- **A card is not a rectangle.** `Elev.sides('pier' | 'stone', …)` gives each end a drawn pier or stone return (a 12 to 19 texel face with its side in dark tones), brick toothing up the top third (courses stepping 4 to 10 texels), and an edge that wobbles 1 to 3 texels every 6 to 10 rows. `lift` (stretches of roofline a course or more up or down, built in steps), `cornerBite` (20–60 texels of a corner gone) and `collapse` (a storey fallen in, joists left sticking out) are how a roofline is drawn; every building takes at least two height changes away from its gable.
- **No long line survives.** `cornice` and `band` are broken every 80–110 texels (2.5–3.5 m) by a pier block, a 6–14 texel drop, or 20–40 texels gone with raw brick showing (`breaks(salt)`). Bites and collapses cut the cornice automatically. The shopfront fascia gets the same treatment, as do the chrome bands of the diner.
- **Brick is drawn where the eye goes.** `brick({ amount })` records the wall's share of drawn brick (30–40 %); `finish()` places coursed groups of 3–8 bricks (lit top, shadowed foot and joint) by a coarse attention grid: the corners, along the top, under the sills, round the damage. The rest of the wall stays two flat tones. `courses` remains only for patches of bare brick inside a hole.
- **Damage cuts.** `breach(cx, cy, rx, ry, { lintel, rubble })` is decided brick by brick (the outline is the bricks that went), drawn over the architecture so it breaks the cornice and takes window heads with it, leaves a ragged inner edge of raw brick, charred joists, a lit lip and rubble stains running down. `bite`/`collapse` draw a torn edge along their outline (`dressBites`).
- **Windows.** Night glass is near black with one low moon streak on one pane; about one in four has a crack, in three different shapes; more blinds and curtains in the upper rows.
- **Metal is a thing.** `rollerShutter`: 7-texel slats in three tones, dented, per-bay value, guide rails, heavy bottom rail with padlocks, `raised` for a bay stuck half up on a black interior. `tag(..., { metal: true })` takes the slat's own light, runs step at each slat. `bars` for security grilles (fewer, heavier, cross-rails, one bent, one gone).
- **Foot grime** is per building and climbs under what feeds it: downpipes, doors, breaches and scorches each record a splash; `footGrime` no longer lays one band along every wall.
- **Roof cards are seen to land**: tanks and the billboard have 5–6 texel rim-lit steel legs and braces on a drawn strip of roof; `ROOF` cards stand 0.6 m lower so a dropped stretch of roofline never shows a card's foot.
- Painters are generators: `yield` between passes (`light`, `value`) so no paint slice runs long (`PwPainter` may return a generator).

The set, round 2:

- The two buildings past the crossing are flats (`'-9,-110'`, `'10,-110'` in `AT`): the street side raked (a re-used painting, tinted: only seen in passing), the end wall `end: {...}` square to the crossing, one a broken parapet with a tank and a big ghost sign, one with a stepped parapet climbing to a round corner turret. No box faces at the crawlers hold.
- The diner is a cut-out front (`z1dinerflat.ts`): `Z1Flats.stageDiner` lays one card with holes where the glass and door are; the room behind it, the panes and burst openings are the classic ones, untouched. Chrome bands and enamel step 1–2 texels panel by panel, panels missing, a neon tube dead in stretches; the "Diner" sign is a shaped sheet on struts with bent tubes (`paintDinerBacking`, same layout as the buzzing r's overlay).
- The Rialto's marquee is three cards (`stageMarquee`): a shaped face with a stepped crest and scalloped valance, a tin soffit in three tones with rows of little bulbs, a flared end. The chase bulbs animate on the old rows, on the face.
- The boss square's hotel box is gone (no side wall beside PRIME MEATS), its flat re-using the hotel painting; the bank is a real pediment with dentils, columns on steps and a clock in a stone round.
- Structure varies by building: recessed centre bay (pawn), bay window column (cafe), tall narrow house jammed against a lower range (w4), stair windows stepping up one end (w6), top storey half fallen (liquor), a carriage arch through the shutters (the shuttered block), three tall arched lights instead of window rows (Rialto).
- The rake is 35 degrees (`FLAT_RAKE`; the 22 m hotel's near end still sits inside its old 14 m footprint, and at 35 each wing reads nearer square-on than at 25). Three narrower teeth at 50 degrees were tried on the same paintings and dropped: at those angles each tooth hides most of the next, so a shopfront is seen as slices and the single painting is lost.
- Budgets: `wall glows` are dropped only on the stretch of old facade that actually swung back (`swungAt` is a span, not a circle).

