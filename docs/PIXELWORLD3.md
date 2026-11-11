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
