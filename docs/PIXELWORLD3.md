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
  lays the flat and its cards, and for `raked` flats turns the group about the flat's far end (25°, the near end swinging
  back inside the old footprint: `FLAT_RAKE`), floors the wedge of sidewalk that opens, and darkens the wall glows that
  have nothing to land on. Placements are chosen per building in `AT`; `&pwflats=parallel` or `&pwflats=<degrees>` overrides
  for look-dev. The RIALTO stays `parallel` (its marquee is a real box with animated chase bulbs on the old facade), the boss
  square's PRIME MEATS and bank stand square to the camera (`facing`).
- One atlas (`z1-flats`, skyline-packed: `PwAtlas(..., { skyline: true })`) and one draw call a zone; lit `Z1_FLAT_GAIN`
  (2.6; 1.7 in the square, zone E) so a wall lands on the mood's pivot and shows as painted.
- A new building: add a painter in `z1flats.ts` (or `<stage>flats.ts`), an entry in `Z1_FLATS`, and its world position in `AT`.

