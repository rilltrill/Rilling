import * as THREE from 'three';
import { PART, PF, type PixelFigure } from '../../gameplay/pixel/figure';
import { Mat, PAT } from '../../gameplay/pixel/materials';
import { BOX, box, castMat, castView, cylinder, enamelMat, hash01, hoop, line, paint, scaleOf, screenOff, sparkle, woodMat } from './castKit';

/**
 * ─── PixelCast thrown things ───────────────────────────────────────────────
 *
 * Everything that flies at the camera (Projectile) drawn as pixel art, from the
 * projectile's own tumbling mesh frame, so the sprite turns and covers the
 * hitbox exactly like the 3D mesh would:
 *
 *   glob    spat goo (spitter acid, dilo venom, Patient Zero's bile): a wobbling
 *           wet blob round a glowing core, a highlight speck, a teardrop tail and
 *           droplets trailing back along the flight path, drips hanging off it;
 *   hook    the Butcher's meat hook: a steel J with a barbed point, an eye and a
 *           swinging stub of chain, a ragged hunk of marbled meat on it, blood;
 *   barrel  red oil drum: exact cylinder silhouette, banded shading, rims, the
 *           glowing hazard band with black chevrons, a warning label, dents;
 *   door    a torn-off police-car door: white panel, red / blue stripes, a dark
 *           cracked window with a reflection, handle, star badge, a torn hinge;
 *   car     the Behemoth's car (sedan / hatch / SUV from the mesh's size, its
 *           paint from the mesh's colours): body, glasshouse with reflections,
 *           roof, pillars, bumpers, grille, lit head / tail lights, plates,
 *           door seams, wheel arches, tyres with hubs — crumpled and scratched;
 *   slab    a concrete slab: grainy faces, cracks, stains, rusty rebar;
 *   rock    a lumpy mottled boulder with cracks and a grass tuft (Carnotaur,
 *           Tyrant), crumbs trailing;
 *   palm    a snapped palm trunk: ringed bark, splintered stump, frond fan;
 *   panel   a wrecked car door / fence panel: beige metal, red stripe, window;
 *   branch  a burning branch: bark, twigs, a leafy clump and a flickering
 *           flame + embers at the burning end;
 *   chunk   anything else: a lumpy chunk in the projectile's colour.
 *
 * Kinds come from the projectile options (`ProjectileOptions.pixel`, or
 * recognised from the thrower's options and mesh: see `thrownKind`).
 */

export type ThrownKind = 'glob' | 'hook' | 'barrel' | 'door' | 'car' | 'slab' | 'rock' | 'palm' | 'panel' | 'branch' | 'chunk';

/** What a thrown-thing painter gets (owned by the projectile, filled once + per redraw). */
export interface ThrownState {
  kind: ThrownKind;
  /** The projectile's mesh (tumbles) — painted in its frame. */
  mesh: THREE.Object3D;
  color: number;
  size: number;
  /** Flight direction (world, unit) — trails go the other way. */
  vel: THREE.Vector3;
  /** Seconds in flight. */
  time: number;
  /** Per-projectile variety (0..1, from its id — never the world RNG). */
  seed: number;
  /** Car: 0 sedan, 1 hatch, 2 SUV, its paint, and size. */
  car: { kind: number; paint: number; len: number; w: number; bodyH: number; cabH: number; cabLen: number; cabZ: number; wheelR: number; y0: number };
  /** Rock: centre and radii (mesh frame) of the main lump, tuft offset. */
  rock: { r: number; tx: number; ty: number; tr: number };
}

export function thrownState(mesh: THREE.Object3D, color: number, size: number, seed: number): ThrownState {
  return {
    kind: 'chunk',
    mesh,
    color,
    size,
    vel: new THREE.Vector3(0, 0, 1),
    time: 0,
    seed,
    car: { kind: 0, paint: 0x2a5a8a, len: 4.4, w: 1.82, bodyH: 0.62, cabH: 0.52, cabLen: 2.2, cabZ: -0.25, wheelR: 0.34, y0: -0.7 },
    rock: { r: 0.45, tx: 0.15, ty: 0.25, tr: 0.22 },
  };
}

// ─── Recognising what was thrown ────────────────────────────────────────────

const _box = new THREE.Box3();
const _mb = new THREE.Box3();
const _col = new THREE.Color();

/** Bounding box of every mesh under `root`, in `root`'s own frame. */
function localBox(root: THREE.Object3D, out: THREE.Box3): THREE.Box3 {
  out.makeEmpty();
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const m = new THREE.Matrix4();
  root.traverse((o) => {
    const g = (o as THREE.Mesh).geometry;
    if (!(o as THREE.Mesh).isMesh || !g) return;
    if (!g.boundingBox) g.computeBoundingBox();
    _mb.copy(g.boundingBox!).applyMatrix4(m.multiplyMatrices(inv, o.matrixWorld));
    out.union(_mb);
  });
  return out;
}

/** Geometry types under `root` (e.g. 'IcosahedronGeometry'). */
function hasGeo(root: THREE.Object3D, type: string): boolean {
  let hit = false;
  root.traverse((o) => {
    const g = (o as THREE.Mesh).geometry as THREE.BufferGeometry | undefined;
    if (g && g.type === type) hit = true;
  });
  return hit;
}

/** sRGB hex of the vertex colour at the highest vertex under `root` (a car's roof = its paint), or −1. */
function topColour(root: THREE.Object3D): number {
  let best = -Infinity;
  let hex = -1;
  const v = new THREE.Vector3();
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    const g = m.geometry as THREE.BufferGeometry | undefined;
    const c = g?.attributes.color as THREE.BufferAttribute | undefined;
    const p = g?.attributes.position as THREE.BufferAttribute | undefined;
    if (!m.isMesh || !c || !p) return;
    const mat = m.material as THREE.MeshBasicMaterial;
    if (mat && (mat as THREE.MeshBasicMaterial).isMeshBasicMaterial) return; // lamps
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i);
      if (v.y > best) {
        best = v.y;
        _col.setRGB(c.getX(i), c.getY(i), c.getZ(i), THREE.LinearSRGBColorSpace);
        hex = _col.getHex(THREE.SRGBColorSpace);
      }
    }
  });
  return hex;
}

/** The Behemoth's car colours (z3 boss): snap a sampled roof colour to the nearest. */
const CAR_PAINTS = [0x2a5a8a, 0x7a1c1c, 0x9a9a9a, 0x3a5a3a];

function nearestPaint(hex: number): number {
  if (hex < 0) return CAR_PAINTS[0];
  const r = (hex >> 16) & 255;
  const g = (hex >> 8) & 255;
  const b = hex & 255;
  let best = CAR_PAINTS[0];
  let bd = Infinity;
  for (const c of CAR_PAINTS) {
    const d = (r - ((c >> 16) & 255)) ** 2 + (g - ((c >> 8) & 255)) ** 2 + (b - (c & 255)) ** 2;
    if (d < bd) {
      bd = d;
      best = c;
    }
  }
  return bd < 90 * 90 ? best : hex;
}

export interface ThrownOpts {
  color: number;
  size: number;
  burst: 'goo' | 'debris' | 'explode';
  source: string;
  /** Explicit kind (the thrower knows best). */
  pixel?: ThrownKind;
  hasMesh: boolean;
}

/**
 * What a projectile is, from its options and mesh (runs once per projectile,
 * at its first paint): the thrower may say (`pixel`); otherwise its burst,
 * size, colour and mesh tell — every thrown thing in the game is listed here.
 */
export function thrownKind(st: ThrownState, o: ThrownOpts): ThrownKind {
  const mesh = st.mesh;
  let kind: ThrownKind;
  if (o.pixel) kind = o.pixel;
  else if (!o.hasMesh || o.burst === 'goo') kind = 'glob';
  else if (o.burst === 'explode') kind = o.size >= 1.1 ? 'car' : 'barrel';
  else {
    localBox(mesh, _box);
    const sx = _box.max.x - _box.min.x;
    const sy = _box.max.y - _box.min.y;
    const sz = _box.max.z - _box.min.z;
    if (o.color === 0x8a8f96) kind = 'hook';
    else if (o.color === 0xe8e8e0) kind = 'door';
    else if (o.size >= 0.95 && sx > 2) kind = 'slab';
    else if (hasGeo(mesh, 'IcosahedronGeometry') && Math.max(sx, sy, sz) < 1.6) kind = 'rock';
    else if (sz > 1.2 && hasGeo(mesh, 'ConeGeometry')) kind = 'branch';
    else if (sz > 2.2) kind = 'palm';
    else if (sx > 1.1 && sz < 0.3) kind = 'panel';
    else kind = 'chunk';
  }
  st.kind = kind;
  if (kind === 'car') {
    localBox(mesh, _box);
    const len = _box.max.z - _box.min.z;
    const c = st.car;
    c.kind = len < 4.3 ? 1 : len > 4.75 ? 2 : 0;
    c.len = c.kind === 1 ? 3.8 : c.kind === 2 ? 4.7 : 4.4;
    c.w = c.kind === 2 ? 1.95 : 1.82;
    c.bodyH = c.kind === 2 ? 0.85 : 0.62;
    c.cabH = c.kind === 2 ? 0.62 : 0.52;
    c.cabLen = c.kind === 1 ? 2.0 : c.kind === 2 ? 3.0 : 2.2;
    c.cabZ = c.kind === 1 ? -0.35 : c.kind === 2 ? -0.45 : -0.25;
    c.wheelR = c.kind === 2 ? 0.42 : 0.34;
    c.y0 = _box.min.y;
    c.paint = nearestPaint(topColour(mesh));
  } else if (kind === 'rock') {
    localBox(mesh, _box);
    // Carnotaur boulder (r 0.45 + tuft 0.22) vs Tyrant rock (0.55 × (1, 0.8, 1.1) + tuft 0.25).
    const big = _box.max.x - _box.min.x > 1.0;
    const r = st.rock;
    r.r = big ? 0.55 : 0.45;
    r.tx = big ? 0.2 : 0.15;
    r.ty = big ? 0.35 : 0.25;
    r.tr = big ? 0.25 : 0.22;
  }
  return kind;
}

// ─── Materials ───────────────────────────────────────────────────────────────

interface TM {
  ready: boolean;
  steel: number;
  steelDark: number;
  rust: number;
  meat: number;
  fat: number;
  bone: number;
  blood: number;
  drumRed: number;
  drumRim: number;
  hazard: number;
  ink: number;
  label: number;
  doorWhite: number;
  glass: number;
  glassHi: number;
  blue: number;
  red: number;
  gold: number;
  trim: number;
  tyre: number;
  hub: number;
  head: number;
  tail: number;
  plate: number;
  concrete: number;
  stain: number;
  chassis: number;
  rebar: number;
  rock: number;
  rockDark: number;
  grass: number;
  grassDark: number;
  bark: number;
  splinter: number;
  frond: number;
  frondDark: number;
  panel: number;
  panelRed: number;
  ember: number;
  flame: number;
  flameHot: number;
  smoke: number;
  shine: number;
}

const TMS: TM = {
  ready: false, steel: 0, steelDark: 0, rust: 0, meat: 0, fat: 0, bone: 0, blood: 0, drumRed: 0, drumRim: 0, hazard: 0, ink: 0, label: 0, doorWhite: 0, glass: 0, glassHi: 0,
  blue: 0, red: 0, gold: 0, trim: 0, tyre: 0, hub: 0, head: 0, tail: 0, plate: 0, concrete: 0, rebar: 0, rock: 0, rockDark: 0, grass: 0, grassDark: 0, bark: 0, splinter: 0, frond: 0,
  frondDark: 0, panel: 0, panelRed: 0, stain: 0, chassis: 0, ember: 0, flame: 0, flameHot: 0, smoke: 0, shine: 0,
};

function tm(): TM {
  const M = TMS;
  if (M.ready) return M;
  M.ready = true;
  M.steel = Mat.plate(0x9aa0aa);
  M.steelDark = Mat.plate(0x4a4e58);
  M.rust = castMat(0x8a4a2a, PAT.CAMO, { scale: 0.05, strength: 0.6 });
  M.meat = castMat(0xb04848, PAT.ROT, { light: 0.5, sat: 1.2, strength: 0.6, scale: 0.05, secondary: Mat.flat(0x7a1a1e, 'meatdark') });
  M.fat = enamelMat(0xeadcc4, 0.6, 0.5);
  M.bone = Mat.bone();
  M.blood = Mat.blood(0x8a0c0c);
  M.drumRed = castMat(0xc22a20, PAT.GLOSS, { light: 0.6, strength: 0.4, spec: 0.6, dither: 0.06 });
  M.drumRim = Mat.plate(0x6a1810);
  M.hazard = Mat.glow(0xffb020);
  M.ink = enamelMat(0x1a1612, 0.3, 0.5);
  M.label = Mat.glow(0xffd23a);
  M.doorWhite = castMat(0xe8e8e0, PAT.GLOSS, { light: 0.75, dark: 0.45, strength: 0.4, spec: 0.5, dither: 0.05 });
  M.glass = castMat(0x223044, PAT.NONE, { light: 0.6, dark: 0.5, dither: 0 });
  M.glassHi = enamelMat(0x9ab8d0, 0.6, 0.5);
  M.blue = Mat.glow(0x3a6aff);
  M.red = Mat.glow(0xff2a2a);
  M.gold = Mat.gloss(0xd8b040);
  M.trim = Mat.leather(0x1e1e22);
  M.tyre = castMat(0x1a1a1c, PAT.NONE, { light: 0.45, dark: 0.6, dither: 0.05 });
  M.hub = Mat.plate(0x9a9a9a);
  M.head = Mat.glow(0xfff2b0);
  M.tail = Mat.glow(0xff3020);
  M.plate = enamelMat(0xe8e4d8, 0.6, 0.5);
  M.concrete = castMat(0x8a847c, PAT.WEAVE, { light: 0.5, strength: 0.9, scale: 0.15, dither: 0.12, secondary: Mat.flat(0x6a6058, 'stain') });
  M.stain = castMat(0x6a6058, PAT.WEAVE, { strength: 0.8, scale: 0.15 });
  M.chassis = castMat(0x2a2a2e, PAT.WEAVE, { light: 0.4, strength: 0.7, scale: 0.2 });
  M.rebar = castMat(0x8a4a2a, PAT.PLATE, { strength: 0.5, spec: 0.3 });
  M.rock = castMat(0x7d7262, PAT.CAMO, { light: 0.5, dark: 0.4, scale: 0.14, strength: 0.6, dither: 0.12 });
  M.rockDark = castMat(0x5a5248, PAT.CAMO, { scale: 0.12, strength: 0.5 });
  M.grass = Mat.hide(0x5f8a30, { scale: 0.08 });
  M.grassDark = Mat.flat(0x3a5a20, 'grassdk');
  M.bark = castMat(0x7a6650, PAT.HAIR, { light: 0.45, dark: 0.4, strength: 0.7 });
  M.splinter = woodMat(0xc8a878);
  M.frond = Mat.hide(0x4a7b42, { scale: 0.1 });
  M.frondDark = Mat.flat(0x2e5228, 'frond');
  M.panel = castMat(0xcfc8b4, PAT.PLATE, { light: 0.6, strength: 0.6, spec: 0.5 });
  M.panelRed = castMat(0xb8302a, PAT.GLOSS, { strength: 0.3, spec: 0.4 });
  M.ember = Mat.glow(0xff8a30);
  M.flame = Mat.glow(0xffb040);
  M.flameHot = Mat.glow(0xfff0a0);
  M.smoke = castMat(0x5a5650, PAT.NONE, { light: 0.4, dark: 0.6, dither: 0.3 });
  M.shine = Mat.glow(0xffffff);
  return M;
}

/** Goo materials per colour: wet body, glowing core, pale highlight, dark skin. */
const gooCache = new Map<number, { body: number; core: number; hot: number; spec: number; skin: number }>();
function gooMats(color: number) {
  let g = gooCache.get(color);
  if (!g) {
    const c = new THREE.Color(color);
    const hsl = { h: 0, s: 0, l: 0 };
    c.getHSL(hsl);
    const deep = new THREE.Color().setHSL(hsl.h, Math.min(1, hsl.s * 0.95), hsl.l * 0.42).getHex();
    const hot = new THREE.Color().setHSL(hsl.h, Math.min(1, hsl.s * 0.8), Math.min(0.93, hsl.l * 0.4 + 0.58)).getHex();
    const skin = new THREE.Color().setHSL(hsl.h + 0.02, Math.min(1, hsl.s * 0.7), hsl.l * 0.28).getHex();
    g = {
      body: castMat(color, PAT.WET, { light: 0.42, dark: 0.3, sat: 1.3, strength: 0.8, spec: 0.8, dither: 0.08 }),
      core: Mat.glow(color),
      hot: Mat.glow(hot),
      spec: Mat.glow(0xfafff0),
      skin: castMat(skin, PAT.WET, { light: 0.4, dark: 0.45, strength: 0.6, spec: 0.6 }),
    };
    void deep;
    gooCache.set(color, g);
  }
  return g;
}

// ─── The painters ────────────────────────────────────────────────────────────

/** Paint a thrown thing (ART: SPRITES). `cam` = the main camera. */
export function paintThrown(f: PixelFigure, st: ThrownState, cam: THREE.Camera): boolean {
  const g = st.mesh;
  if (!g.visible) return false;
  castView(cam);
  const M = tm();
  const s = scaleOf(g);
  f.maxTexels = 150;
  switch (st.kind) {
    case 'glob':
      glob(f, st, s);
      break;
    case 'hook':
      hook(f, g, M, s, st);
      break;
    case 'barrel':
      barrel(f, g, M, s, st);
      break;
    case 'door':
      door(f, g, M, s, st);
      break;
    case 'car':
      car(f, g, M, s, st);
      break;
    case 'slab':
      slab(f, g, M, s, st);
      break;
    case 'rock':
      rock(f, g, M, s, st);
      break;
    case 'palm':
      palm(f, g, M, s, st);
      break;
    case 'panel':
      panel(f, g, M, s, st);
      break;
    case 'branch':
      branch(f, g, M, s, st);
      break;
    default:
      chunk(f, g, M, s, st);
  }
  return true;
}

const _p = new THREE.Vector3();

/** Point `back` metres behind world point p along the flight (plus a sideways wobble) — scratch vector. */
function behind(f: PixelFigure, p: THREE.Vector3, st: ThrownState, back: number, wobX = 0, wobY = 0): THREE.Vector3 {
  const v = f.vec().copy(p).addScaledVector(st.vel, -back);
  return wobX || wobY ? screenOff(f, v, wobX, wobY) : v;
}

/** A small closed ring (eye loops, links) round (cx, cy, cz) in `obj`'s XY plane. */
function ring(f: PixelFigure, obj: THREE.Object3D, cx: number, cy: number, cz: number, r: number, w: number, mat: number, n: number) {
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2;
    const a1 = ((i + 1) / n) * Math.PI * 2;
    f.cone(f.at(obj, cx + Math.cos(a0) * r, cy + Math.sin(a0) * r, cz), f.at(obj, cx + Math.cos(a1) * r, cy + Math.sin(a1) * r, cz), w, w, mat).min(0.5);
  }
}

// ── Goo ──

function glob(f: PixelFigure, st: ThrownState, s: number) {
  const g = st.mesh;
  const G = gooMats(st.color);
  const t = st.time;
  const bile = g.children.length >= 2 && st.size >= 0.33;
  const venom = g.children.length >= 3;
  // Body radius: the core sphere (spitter 0.28, dilo 0.17, bile 0.3 inside a 0.36 skin).
  const R = (venom ? 0.17 : bile ? 0.33 : st.size) * s;
  const c = f.at(g, 0, 0, 0);
  // Wobble: three lobes orbiting the centre, squashing and stretching the blob.
  const w = R * 0.16;
  f.layer(R * 0.45, PART.TORSO);
  if (bile) {
    // The membrane: a dark, wet skin round the glowing core (veins drawn on it below).
    f.ball(c, R * 1.04, G.skin);
  }
  f.ball(screenOff(f, c, Math.sin(t * 9.1) * w, Math.cos(t * 7.3) * w), R * 0.86, bile ? G.skin : G.body);
  f.ball(screenOff(f, c, Math.cos(t * 8.3 + 1) * w * 1.4, Math.sin(t * 10.1 + 2) * w), R * 0.72, bile ? G.skin : G.body);
  f.ball(screenOff(f, c, -Math.sin(t * 6.7 + 4) * w, -Math.cos(t * 9.7 + 1) * w * 1.3), R * 0.7, bile ? G.skin : G.body);
  // Teardrop tail + trailing droplets (back along the flight path, a little wobble).
  const t1 = behind(f, c, st, R * 1.5, Math.sin(t * 11) * w, Math.cos(t * 9) * w);
  f.cone(c, t1, R * 0.62, R * 0.24, bile ? G.skin : G.body);
  // Drips hanging off the bottom (they stretch and snap back).
  const dl = R * (0.45 + 0.25 * Math.abs(Math.sin(t * 5 + st.seed * 6)));
  const d0 = screenOff(f, c, R * 0.25, -R * 0.62);
  f.cone(d0, screenOff(f, d0, R * 0.05, -dl), R * 0.2, R * 0.1, bile ? G.skin : G.body);
  // Venom: the two satellite blobs of the 3D glob, where the spinning mesh has them.
  if (venom) {
    f.ball(f.at(g, 0.13, 0.07, 0.04), 0.09 * s, G.body);
    f.ball(f.at(g, -0.11, -0.08, -0.05), 0.07 * s, G.body);
  }
  // Loose droplets further back (their own little layer: they don't melt into the blob).
  f.layer(R * 0.05, PART.TORSO);
  for (let i = 0; i < 3; i++) {
    const back = R * (2.2 + i * 0.95);
    const r = R * (0.3 - i * 0.07);
    f.ball(behind(f, c, st, back, Math.sin(t * 13 + i * 2.1) * w * 1.6, Math.cos(t * 11 + i * 1.3) * w * 1.6 - R * 0.15 * i), r, i === 0 ? G.core : G.body).min(0.6);
  }
  // Glowing core (the goo's own colour, a hot heart), offset toward the light, and a wet highlight speck.
  f.layer(R * 0.2, PART.TORSO, 0, -R * 1.35);
  const core = screenOff(f, c, -R * 0.08, R * 0.06);
  f.ball(core, R * (bile ? 0.6 : 0.46), G.core).flag(PF.GLOW | PF.NO_OUTLINE);
  f.ball(screenOff(f, core, -R * 0.06, R * 0.04), R * (bile ? 0.3 : 0.22), G.hot).flag(PF.GLOW | PF.NO_OUTLINE).min(0.6);
  f.ball(screenOff(f, c, -R * 0.42, R * 0.4), R * 0.11, G.spec).flag(PF.GLOW | PF.NO_OUTLINE).min(0.6);
  if (bile) {
    // Veins across the membrane (decals on the skin layer below would be hidden by the core: draw them dark on top).
    f.layer(R * 0.02, PART.TORSO, 0, -R * 1.5);
    for (let i = 0; i < 3; i++) {
      const a = st.seed * 6 + i * 2.1 + Math.sin(t * 2 + i) * 0.2;
      const p0 = screenOff(f, c, Math.cos(a) * R * 0.85, Math.sin(a) * R * 0.85);
      const p1 = screenOff(f, c, Math.cos(a + 0.6) * R * 0.35, Math.sin(a + 0.6) * R * 0.35);
      f.cone(p0, p1, R * 0.05, R * 0.03, G.skin).flag(PF.NO_OUTLINE).min(0.5);
    }
  }
}

// ── The Butcher's hook ──

function hook(f: PixelFigure, g: THREE.Object3D, M: TM, s: number, st: ThrownState) {
  const t = st.time;
  // Chain stub swinging off the eye (behind everything).
  f.layer(0.01 * s, PART.TORSO, 0, 0.05);
  const eye = f.at(g, -0.33, 0.52, 0);
  let prev = eye;
  for (let i = 1; i <= 3; i++) {
    const sw = Math.sin(t * 6 + i) * 0.04 * i;
    const p = behind(f, eye, st, 0.09 * i, sw, 0.02 * i);
    f.cone(prev, p, 0.026 * s, 0.026 * s, i % 2 ? M.steelDark : M.steel).min(0.6);
    prev = p;
  }
  // The hook: shank up the left, a J round the bottom, up to a barbed point.
  f.layer(0.025 * s, PART.TORSO);
  f.cone(f.at(g, -0.221, -0.011, 0), f.at(g, -0.323, 0.491, 0), 0.066 * s, 0.06 * s, M.steel);
  const N = 9;
  let px = 0;
  let py = 0;
  for (let i = 0; i <= N; i++) {
    const a = ((153 + (i / N) * 245) * Math.PI) / 180;
    const x = 0.02 + Math.cos(a) * 0.32;
    const y = Math.sin(a) * 0.32;
    if (i > 0) {
      const r0 = 0.07 - (0.045 * (i - 1)) / N;
      const r1 = i === N ? 0.012 : 0.07 - (0.045 * i) / N;
      f.cone(f.at(g, px, py, 0), f.at(g, x, y, 0), r0 * s, r1 * s, M.steel);
    }
    px = x;
    py = y;
  }
  // Barb (the 3D cone), the eye loop at the top of the shank.
  f.cone(f.at(g, 0.36, 0.01, 0), f.at(g, 0.27, 0.22, 0), 0.07 * s, 0.01 * s, M.steel).min(0.5);
  ring(f, g, -0.33, 0.55, 0, 0.055, 0.018 * s, M.steel, 7);
  // Rust and blood on the curve.
  line(f, g, -0.2, -0.22, 0.06, 0.1, -0.31, 0.06, 0.03, -0.25, M.steel);
  paint(f, g, 0.25, -0.12, 0.05, 0.3, -0.04, 0.05, 0.035, M.blood);
  // A hunk of meat on the hook: ragged, marbled with fat, a bone end, dripping.
  f.layer(0.05 * s, PART.TORSO, 0, -0.03);
  f.ellipsoid(g, 0.02, -0.12, 0, 0.245, 0.2, 0.17, M.meat).rag(0.022);
  f.ellipsoid(g, -0.08, -0.03, 0.02, 0.14, 0.12, 0.12, M.meat).rag(0.02);
  // The fat strip (the 3D's pale bar across the chunk).
  f.cone(f.at(g, -0.12, -0.16, 0.02), f.at(g, 0.16, -0.04, 0.02), 0.04 * s, 0.04 * s, M.fat).k(0.01 * s);
  f.cone(f.at(g, 0.14, -0.2, 0.04), f.at(g, 0.26, -0.27, 0.05), 0.045 * s, 0.05 * s, M.bone).k(0.01 * s);
  paint(f, g, -0.06, -0.2, 0.13, 0.1, -0.23, 0.1, 0.016, M.fat);
  line(f, g, -0.1, -0.15, 0.15, 0.08, -0.1, 0.14, 0.01, -0.3, M.meat);
  // Blood drops streaming off the meat.
  f.layer(0.004 * s, PART.TORSO);
  for (let i = 0; i < 3; i++) {
    const ph = (t * 1.7 + i * 0.37 + st.seed) % 1;
    const p = behind(f, f.at(g, 0.02 + (i - 1) * 0.08, -0.28, 0.05), st, ph * 0.5, 0, -ph * 0.1);
    f.ball(p, (0.035 - i * 0.006) * s, M.blood).min(0.6);
  }
  // Steel glint.
  if (Math.sin(t * 9 + st.seed * 9) > 0.55) sparkle(f, f.at(g, -0.29, 0.3, 0.05), 0.09 * s, M.shine, 0.5);
}

// ── Oil drum ──

function barrel(f: PixelFigure, g: THREE.Object3D, M: TM, s: number, st: ThrownState) {
  const R = 0.34;
  const H = 0.475;
  f.layer(0.01 * s, PART.TORSO);
  const cap = cylinder(f, f.at(g, 0, -H, 0), f.at(g, 0, H, 0), R * s, M.drumRed, M.drumRed, 1.1, 0.01 * s);
  // Rolling hoops (raised) and the lids' lips.
  hoop(f, g, 1, 0.25, R + 0.008, 0.024, M.drumRim, false, 12);
  hoop(f, g, 1, -0.25, R + 0.008, 0.024, M.drumRim, false, 12);
  hoop(f, g, 1, H - 0.01, R - 0.005, 0.018, M.drumRim, true, 12);
  hoop(f, g, 1, -H + 0.01, R - 0.005, 0.018, M.drumRim, true, 12);
  // The glowing hazard band with black chevrons (front half).
  hoop(f, g, 1, 0.05, R, 0.045, M.hazard, true, 12);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 + 0.2;
    const x = Math.cos(a) * R;
    const z = Math.sin(a) * R;
    _p.set(x, 0.05, z).applyMatrix4(g.matrixWorld);
    if (f.facing(_p, f.dir(g, x, 0, z)) < 0.15) continue;
    const a2 = a + 0.13;
    line(f, g, x, 0.01, z, Math.cos(a2) * R, 0.09, Math.sin(a2) * R, 0.012, -0.9, M.drumRed);
  }
  // Warning label (front): yellow plate, black triangle with a '!'.
  _p.set(0, -0.1, R).applyMatrix4(g.matrixWorld);
  if (f.facing(_p, f.dir(g, 0, 0, 1)) > 0.2) {
    paint(f, g, -0.08, -0.1, R, 0.08, -0.1, R, 0.08, M.label);
    line(f, g, -0.07, -0.16, R, 0.07, -0.16, R, 0.008, -0.9, M.label);
    line(f, g, -0.07, -0.16, R, 0, -0.03, R, 0.008, -0.9, M.label);
    line(f, g, 0.07, -0.16, R, 0, -0.03, R, 0.008, -0.9, M.label);
    line(f, g, 0, -0.07, R, 0, -0.12, R, 0.008, -0.9, M.label);
  }
  // Dents and chipped paint.
  line(f, g, -0.2, 0.33, 0.26, -0.12, 0.38, 0.3, 0.02, -0.25, M.drumRed);
  line(f, g, 0.24, -0.35, 0.22, 0.29, -0.3, 0.17, 0.015, 0.3, M.drumRed);
  if (cap !== 0) {
    // The lid seen end-on: a bung and a seam ring.
    const y = cap > 0 ? H : -H;
    hoop(f, g, 1, y, R * 0.72, 0.01, M.drumRim, true, 10, true);
    paint(f, g, 0.14, y, 0.1, 0.14, y, 0.1, 0.035, M.drumRim);
  }
  void st;
}

// ── Police-car door ──

function door(f: PixelFigure, g: THREE.Object3D, M: TM, s: number, st: ThrownState) {
  f.layer(0.006 * s, PART.TORSO);
  // Window frame: top bar and posts (white), then the panel.
  box(f, g, 0.05, 0.55, 0, 0.5, 0.03, 0.04, M.doorWhite, 0.005);
  box(f, g, 0.55, 0.3, 0, 0.04, 0.25, 0.04, M.doorWhite, 0.005);
  box(f, g, -0.47, 0.3, 0, 0.04, 0.25, 0.04, M.doorWhite, 0.005);
  box(f, g, 0, -0.2, 0, 0.575, 0.325, 0.04, M.doorWhite, 0.008, 1.2);
  const mask = BOX.mask;
  for (let k = 0; k < 2; k++) {
    const fi = 4 + k;
    if (!(mask & (1 << fi))) continue;
    const z = k === 0 ? 0.041 : -0.041;
    // Red and blue stripes, the handle, a star badge, dents.
    paint(f, g, -0.575, -0.3, z, 0.575, -0.3, z, 0.04, M.blue);
    paint(f, g, -0.575, -0.4, z, 0.575, -0.4, z, 0.02, M.red);
    paint(f, g, -0.29, -0.05, z, -0.11, -0.05, z, 0.025, M.steelDark);
    paint(f, g, 0.25, -0.12, z, 0.25, -0.12, z, 0.05, M.gold);
    line(f, g, -0.1, -0.5, z, 0.2, -0.42, z, 0.012, -0.3, M.doorWhite);
    line(f, g, 0.35, 0.02, z, 0.48, -0.08, z, 0.01, -0.25, M.doorWhite);
    line(f, g, -0.575, 0.12, z, 0.575, 0.12, z, 0.006, -0.35, M.doorWhite);
  }
  // Torn hinge edge: ragged dark metal along the front.
  f.cone(f.at(g, -0.585, -0.5, 0), f.at(g, -0.585, 0.08, 0), 0.02 * s, 0.025 * s, M.steelDark).rag(0.015, PF.SPIKY);
  // The window: dark glass, a sky reflection, cracks.
  f.layer(0.004 * s, PART.TORSO, 0, 0.01);
  box(f, g, 0.05, 0.31, 0, 0.47, 0.21, 0.025, M.glass, 0.004, 0.6);
  for (let k = 0; k < 2; k++) {
    if (!(BOX.mask & (1 << (4 + k)))) continue;
    const z = k === 0 ? 0.026 : -0.026;
    paint(f, g, -0.3, 0.16, z, -0.08, 0.48, z, 0.03, M.glassHi);
    paint(f, g, -0.16, 0.14, z, 0.0, 0.4, z, 0.012, M.glassHi);
    line(f, g, 0.25, 0.3, z, 0.42, 0.45, z, 0.006, 0.45, M.glass);
    line(f, g, 0.25, 0.3, z, 0.4, 0.15, z, 0.006, 0.45, M.glass);
    line(f, g, 0.25, 0.3, z, 0.08, 0.36, z, 0.006, 0.45, M.glass);
  }
  void st;
}

// ── The Behemoth's car ──

function car(f: PixelFigure, g: THREE.Object3D, M: TM, s: number, st: ThrownState) {
  const C = st.car;
  const paintM = carPaint(C.paint);
  const base = C.y0 + C.wheelR * 0.9;
  const hw = C.w / 2;
  const hl = C.len / 2;
  const top = base + C.bodyH;
  // Wheels (own layers: they overlap the body with contours).
  const wz = hl - 0.85;
  for (let i = 0; i < 4; i++) {
    const sx = i & 1 ? -1 : 1;
    const z = i & 2 ? -wz : wz;
    const x = sx * (hw - 0.08);
    const y = C.y0 + C.wheelR;
    f.layer(0.004 * s, PART.TORSO);
    cylinder(f, f.at(g, x - 0.13, y, z), f.at(g, x + 0.13, y, z), C.wheelR * s, M.tyre, M.tyre, 0.6);
    // Hub on the outer face.
    _p.set(x + sx * 0.14, y, z).applyMatrix4(g.matrixWorld);
    if (f.facing(_p, f.dir(g, sx, 0, 0)) > 0.1) {
      f.layer(0.002 * s, PART.TORSO, 0, -0.01);
      const hp = f.at(g, x + sx * 0.14, y, z);
      f.ball(hp, C.wheelR * 0.5 * s, M.hub).flag(PF.FLAT);
      f.ball(hp, C.wheelR * 0.16 * s, M.steelDark).flag(PF.FLAT).z(-0.01);
    }
  }
  // Body.
  f.layer(0.02 * s, PART.TORSO);
  box(f, g, 0, base + C.bodyH / 2, 0, hw, C.bodyH / 2, hl, paintM, 0.04, 1.15, paintM, paintM, M.chassis);
  const bm = BOX.mask;
  // Bumpers (dark trim).
  f.cone(f.at(g, -hw - 0.02, base + 0.12, hl + 0.03), f.at(g, hw + 0.02, base + 0.12, hl + 0.03), 0.09 * s, 0.09 * s, M.trim);
  f.cone(f.at(g, -hw - 0.02, base + 0.12, -hl - 0.03), f.at(g, hw + 0.02, base + 0.12, -hl - 0.03), 0.09 * s, 0.09 * s, M.trim);
  // Body details per visible face.
  for (let i = 0; i < 6; i++) {
    if (!(bm & (1 << i))) continue;
    if (i === 0 || i === 1) {
      const x = i === 0 ? hw : -hw;
      // Door seams, wheel arches, a handle, the swage line, scrapes.
      line(f, g, x, base + 0.05, C.cabZ + 0.25, x, top - 0.02, C.cabZ + 0.25, 0.008, -0.35, paintM);
      line(f, g, x, base + 0.05, C.cabZ - 0.75, x, top - 0.02, C.cabZ - 0.75, 0.008, -0.35, paintM);
      line(f, g, x, top - 0.16, -hl + 0.1, x, top - 0.16, hl - 0.1, 0.008, 0.2, paintM);
      paint(f, g, x, top - 0.22, C.cabZ - 0.05, x, top - 0.22, C.cabZ + 0.08, 0.018, M.trim);
      for (let k = -1; k <= 1; k += 2) {
        const z = k * wz;
        f.decal(f.at(g, x, base - 0.02, z - C.wheelR * 1.05), f.at(g, x, base + C.wheelR * 0.75, z), C.wheelR * 0.16 * s, C.wheelR * 0.16 * s, M.trim).flag(PF.FLAT).min(0.5);
        f.decal(f.at(g, x, base + C.wheelR * 0.75, z), f.at(g, x, base - 0.02, z + C.wheelR * 1.05), C.wheelR * 0.16 * s, C.wheelR * 0.16 * s, M.trim).flag(PF.FLAT).min(0.5);
      }
      line(f, g, x, base + 0.25, hl - 1.2, x, base + 0.15, hl - 0.4, 0.02, 0.35, paintM);
    } else if (i === 4 || i === 5) {
      const z = i === 4 ? hl : -hl;
      const lamp = i === 4 ? M.head : M.tail;
      // Lamps, grille / boot line, number plate.
      for (let k = -1; k <= 1; k += 2) paint(f, g, k * (hw - 0.3), top - 0.18, z, k * (hw - 0.18), top - 0.18, z, 0.06, lamp);
      if (i === 4) paint(f, g, -0.38, top - 0.18, z, 0.38, top - 0.18, z, 0.05, M.trim);
      else line(f, g, -hw + 0.1, top - 0.05, z, hw - 0.1, top - 0.05, z, 0.008, -0.35, paintM);
      paint(f, g, -0.14, base + 0.28, z, 0.14, base + 0.28, z, 0.055, M.plate);
      line(f, g, -0.1, base + 0.28, z, 0.1, base + 0.28, z, 0.008, -0.8, M.plate);
    } else if (i === 3) {
      // Underside: axles, exhaust, a sump — greasy dark chassis.
      paint(f, g, -hw + 0.15, base, wz, hw - 0.15, base, wz, 0.07, M.steelDark);
      paint(f, g, -hw + 0.15, base, -wz, hw - 0.15, base, -wz, 0.07, M.steelDark);
      paint(f, g, 0.35, base, hl - 0.4, 0.35, base, -hl + 0.2, 0.05, M.rust);
      paint(f, g, -0.25, base, 0.6, 0.15, base, 0.9, 0.16, M.steelDark);
      line(f, g, 0, base, hl - 0.3, 0, base, -hl + 0.3, 0.05, -0.3, M.chassis);
    } else if (i === 2) {
      // Bonnet / boot lids.
      line(f, g, -hw + 0.12, top, C.cabZ + C.cabLen / 2 + 0.05, hw - 0.12, top, C.cabZ + C.cabLen / 2 + 0.05, 0.008, -0.3, paintM);
      line(f, g, -0.3, top, hl - 0.3, 0.1, top, C.cabZ + C.cabLen / 2 + 0.2, 0.008, 0.25, paintM);
    }
  }
  // Glasshouse: glass block, pillars and roof in the body paint.
  if (C.cabH > 0) {
    f.layer(0.02 * s, PART.TORSO);
    const gy = top + C.cabH / 2;
    box(f, g, 0, gy, C.cabZ, hw * 0.86, C.cabH / 2, C.cabLen / 2, M.glass, 0.03, 0.7);
    const gm = BOX.mask;
    box(f, g, 0, top + C.cabH + 0.0, C.cabZ - 0.05, hw * 0.88, 0.05, (C.cabLen * 0.82) / 2, paintM, 0.02, 1.15);
    for (let k = -1; k <= 1; k += 2) {
      const x = k * hw * 0.84;
      f.cone(f.at(g, x, top, C.cabZ + C.cabLen / 2 - 0.05), f.at(g, x, top + C.cabH, C.cabZ + C.cabLen / 2 - 0.25), 0.05 * s, 0.05 * s, paintM);
      f.cone(f.at(g, x, top, C.cabZ - C.cabLen / 2 + 0.07), f.at(g, x, top + C.cabH, C.cabZ - C.cabLen / 2 + 0.3), 0.06 * s, 0.06 * s, paintM);
      f.cone(f.at(g, x, top, C.cabZ - 0.1), f.at(g, x, top + C.cabH, C.cabZ - 0.1), 0.035 * s, 0.035 * s, paintM);
    }
    // Reflections streaking across the glass + a crack web.
    for (let i = 0; i < 6; i++) {
      if (!(gm & (1 << i)) || i === 2 || i === 3) continue;
      const ax = i >> 1;
      const sg = i & 1 ? -1 : 1;
      const x = ax === 0 ? sg * hw * 0.86 : 0;
      const z = ax === 2 ? C.cabZ + sg * (C.cabLen / 2) : C.cabZ;
      const u = ax === 0 ? 1 : 0;
      const w = ax === 0 ? C.cabLen * 0.35 : hw * 0.6;
      paint(f, g, x - (1 - u) * w * 0.6, top + 0.06, z - u * w * 0.6, x - (1 - u) * w * 0.15, top + C.cabH - 0.06, z - u * w * 0.15, 0.05, M.glassHi);
      paint(f, g, x + (1 - u) * w * 0.05, top + 0.06, z + u * w * 0.05, x + (1 - u) * w * 0.3, top + C.cabH - 0.1, z + u * w * 0.3, 0.02, M.glassHi);
      if (ax === 2 && sg > 0) {
        const cx = 0.3;
        const cy = top + C.cabH * 0.55;
        line(f, g, cx, cy, z, cx + 0.3, cy + 0.15, z, 0.008, 0.5, M.glass);
        line(f, g, cx, cy, z, cx - 0.25, cy + 0.2, z, 0.008, 0.5, M.glass);
        line(f, g, cx, cy, z, cx + 0.1, cy - 0.22, z, 0.008, 0.5, M.glass);
        line(f, g, cx, cy, z, cx - 0.3, cy - 0.1, z, 0.008, 0.5, M.glass);
      }
    }
  }
  // Glints off the chrome / glass as it tumbles.
  if (Math.sin(st.time * 7 + st.seed * 5) > 0.6) sparkle(f, f.at(g, hw * 0.7, top + C.cabH, C.cabZ + C.cabLen * 0.4), 0.22, M.shine, 0.5);
}

const carCache = new Map<number, number>();
function carPaint(hex: number): number {
  let m = carCache.get(hex);
  if (m === undefined) {
    m = castMat(hex, PAT.GLOSS, { light: 0.62, dark: 0.36, sat: 1.15, strength: 0.4, spec: 0.7, dither: 0.06 });
    carCache.set(hex, m);
  }
  return m;
}

// ── Concrete slab ──

function slab(f: PixelFigure, g: THREE.Object3D, M: TM, s: number, st: ThrownState) {
  // Rusty rebar first (behind the slab where it sinks into it).
  f.layer(0.01 * s, PART.TORSO);
  // The 3D bar: 1.2 m along a rotated Y at (0.8, 0.3, 0.5), plus two bent stubs out of the broken end.
  f.cone(f.at(g, 0.8 + 0.18, 0.3 - 0.47, 0.5 - 0.32), f.at(g, 0.8 - 0.18, 0.3 + 0.47, 0.5 + 0.32), 0.05 * s, 0.045 * s, M.rebar).min(0.6);
  f.cone(f.at(g, -1.05, 0.15, -0.4), f.at(g, -1.4, 0.32, -0.45), 0.035 * s, 0.03 * s, M.rebar).min(0.6);
  f.cone(f.at(g, -1.4, 0.32, -0.45), f.at(g, -1.55, 0.25, -0.62), 0.03 * s, 0.025 * s, M.rebar).min(0.6);
  f.cone(f.at(g, -1.05, -0.1, 0.35), f.at(g, -1.38, -0.18, 0.42), 0.035 * s, 0.03 * s, M.rebar).min(0.6);
  // The slab.
  f.layer(0.02 * s, PART.TORSO);
  box(f, g, 0, 0, 0, 1.1, 0.3, 0.8, M.concrete, 0.03, 1.15);
  const bm = BOX.mask;
  for (let i = 0; i < 6; i++) {
    if (!(bm & (1 << i))) continue;
    const ax = i >> 1;
    const sg = i & 1 ? -1 : 1;
    if (ax === 1) {
      // Big face: a crack running across, a stain, form-board lines.
      const y = sg * 0.3;
      line(f, g, -0.6, y, -0.8, -0.35, y, -0.3, 0.012, -0.4, M.concrete);
      line(f, g, -0.35, y, -0.3, -0.45, y, 0.1, 0.012, -0.4, M.concrete);
      line(f, g, -0.45, y, 0.1, -0.15, y, 0.55, 0.01, -0.4, M.concrete);
      line(f, g, -0.35, y, -0.3, 0.05, y, -0.15, 0.008, -0.35, M.concrete);
      line(f, g, 0.3, y, -0.8, 0.3, y, 0.8, 0.006, -0.18, M.concrete);
      line(f, g, 0.7, y, -0.8, 0.7, y, 0.8, 0.006, -0.18, M.concrete);
      paint(f, g, 0.45, y, 0.25, 0.6, y, 0.4, 0.12, M.stain);
    } else if (ax === 0) {
      const x = sg * 1.1;
      line(f, g, x, -0.3, -0.2, x, 0.05, 0.1, 0.012, -0.4, M.concrete);
      line(f, g, x, 0.05, 0.1, x, 0.3, 0.05, 0.01, -0.4, M.concrete);
    } else {
      const z = sg * 0.8;
      line(f, g, -0.5, 0.3, z, -0.3, -0.05, z, 0.012, -0.4, M.concrete);
      line(f, g, -0.3, -0.05, z, -0.42, -0.3, z, 0.01, -0.4, M.concrete);
      line(f, g, 0.4, -0.3, z, 0.55, 0.0, z, 0.01, -0.4, M.concrete);
    }
  }
  // Crumbs trailing off the broken end.
  f.layer(0.004 * s, PART.TORSO);
  for (let i = 0; i < 3; i++) {
    const ph = (st.time * 1.3 + i * 0.33) % 1;
    f.ball(behind(f, f.at(g, -1.1, 0, (i - 1) * 0.4), st, 0.2 + ph * 0.6, (i - 1) * 0.1, -ph * 0.25), (0.06 - i * 0.012) * s, M.concrete).min(0.6);
  }
}

// ── Rocks ──

function rock(f: PixelFigure, g: THREE.Object3D, M: TM, s: number, st: ThrownState) {
  const R = st.rock;
  const r = R.r;
  // The rock mesh's own frame (the Tyrant's is turned and squashed inside the group).
  const b = g.children[0] ?? g;
  // A lumpy, mottled boulder: a main mass + knobs (all inside the jittered hull).
  f.layer(0.09 * s, PART.TORSO);
  f.ellipsoid(b, 0, 0, 0, r * 1.0, r * 0.97, r * 0.99, M.rock);
  f.ellipsoid(b, r * 0.35, r * 0.22, r * 0.3, r * 0.6, r * 0.55, r * 0.55, M.rock);
  f.ellipsoid(b, -r * 0.42, -r * 0.1, -r * 0.2, r * 0.58, r * 0.6, r * 0.6, M.rock);
  f.ellipsoid(b, r * 0.1, -r * 0.42, r * 0.25, r * 0.55, r * 0.45, r * 0.55, M.rockDark);
  f.ellipsoid(b, -r * 0.15, r * 0.45, -r * 0.35, r * 0.45, r * 0.4, r * 0.5, M.rock);
  // Cracks on the side facing us.
  for (let i = 0; i < 2; i++) {
    const a = st.seed * 5 + i * 2.4;
    const cx = Math.cos(a) * r * 0.3;
    const cy = Math.sin(a) * r * 0.3;
    _p.set(cx, cy, r * 0.9).applyMatrix4(b.matrixWorld);
    const z = f.facing(_p, f.dir(b, 0, 0, 1)) > 0 ? r * 0.9 : -r * 0.9;
    line(f, b, cx - r * 0.3, cy + r * 0.25, z, cx, cy, z, 0.012, -0.45, M.rock);
    line(f, b, cx, cy, z, cx + r * 0.1, cy - r * 0.35, z, 0.01, -0.45, M.rock);
    line(f, b, cx, cy, z, cx + r * 0.32, cy + r * 0.05, z, 0.008, -0.4, M.rock);
  }
  // The grass tuft (the 3D's green lump, its own mesh): a ragged clump with blades sticking up.
  const tf = g.children[1] ?? g;
  const tx = tf === g ? R.tx : 0;
  const ty = tf === g ? R.ty : 0;
  f.layer(0.03 * s, PART.TORSO);
  f.ellipsoid(tf, tx, ty, 0, R.tr * 0.95, R.tr * 0.85, R.tr * 0.95, M.grass).rag(0.035, PF.SPIKY);
  f.ellipsoid(tf, tx - R.tr * 0.3, ty + R.tr * 0.2, R.tr * 0.2, R.tr * 0.55, R.tr * 0.5, R.tr * 0.55, M.grassDark).rag(0.03, PF.SPIKY);
  const tip = f.at(tf, tx, ty + R.tr * 0.5, 0);
  for (let i = 0; i < 4; i++) {
    const a = i * 1.6 + st.seed * 3;
    f.cone(tip, f.at(tf, tx + Math.cos(a) * R.tr * 0.9, ty + R.tr * (1.25 + 0.2 * (i & 1)), Math.sin(a) * R.tr * 0.9), 0.025 * s, 0.006 * s, i & 1 ? M.grassDark : M.grass).min(0.5);
  }
  // Dirt crumbs trailing.
  f.layer(0.004 * s, PART.TORSO);
  for (let i = 0; i < 3; i++) {
    const ph = (st.time * 1.6 + i * 0.33) % 1;
    f.ball(behind(f, f.at(g, 0, 0, 0), st, r * (1.2 + ph * 1.6), (i - 1) * r * 0.4, -ph * r * 0.5), r * (0.13 - i * 0.025) * s, M.rockDark).min(0.6);
  }
}

// ── Palm trunk (the Tyrant's debris) ──

/** The Tyrant's palm fronds: the 3D's four 1.4 m boards round the crown (directions in the debris frame). */
const FRONDS: readonly (readonly [number, number, number])[] = [
  [0, -0.479, 0.878],
  [1, 0, 0],
  [0, 0.479, -0.878],
  [-1, 0, 0],
];

function palm(f: PixelFigure, g: THREE.Object3D, M: TM, s: number, st: ThrownState) {
  // Fronds round the crown (z 1.2): along the 3D boards, each a serrated blade with a
  // pale midrib, arching and swaying; two short young fronds between them.
  f.layer(0.03 * s, PART.TORSO);
  for (let i = 0; i < 6; i++) {
    const d = FRONDS[i % 4];
    const len = i < 4 ? 0.72 : 0.42;
    const sw = Math.sin(st.time * 5 + i * 1.7) * 0.05;
    const dx = i < 4 ? d[0] : i === 4 ? 0.7 : -0.7;
    const dy = i < 4 ? d[1] : i === 4 ? 0.34 : -0.34;
    const dz = i < 4 ? d[2] : 0.62;
    const base = f.at(g, 0, 0, 1.2);
    const mid = f.at(g, dx * len * 0.55, dy * len * 0.55 + sw, 1.2 + dz * len * 0.55);
    const tip = f.at(g, dx * len, dy * len - 0.12 + sw, 1.2 + dz * len);
    const m = i & 1 ? M.frondDark : M.frond;
    f.cone(base, mid, 0.13 * s, 0.2 * s, m).rag(0.06, PF.SPIKY).seed(i * 3);
    f.cone(mid, tip, 0.2 * s, 0.03 * s, m).rag(0.06, PF.SPIKY).seed(i * 3 + 1);
    f.decal(base, tip, 0.012 * s, 0.006 * s, M.frond).flag(PF.FLAT | PF.SHADE_ONLY | PF.NO_OUTLINE).tone(0.3).min(0.5);
  }
  // Trunk: ringed bark, wider at the snapped foot.
  f.layer(0.02 * s, PART.TORSO);
  f.cone(f.at(g, 0, 0, -1.15), f.at(g, 0, 0, 1.15), 0.25 * s, 0.2 * s, M.bark);
  for (let i = 0; i < 9; i++) {
    const z = -1.0 + i * 0.25;
    hoop(f, g, 2, z, 0.25 - (i / 9) * 0.05, 0.02, M.bark, true, 8, false, -0.35);
  }
  // Splintered stump: pale spikes.
  f.layer(0.01 * s, PART.TORSO);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + 0.4;
    const l = 0.12 + 0.1 * hash01(i + st.seed * 7);
    f.cone(f.at(g, Math.cos(a) * 0.14, Math.sin(a) * 0.14, -1.12), f.at(g, Math.cos(a) * 0.12, Math.sin(a) * 0.12, -1.12 - l), 0.07 * s, 0.01 * s, M.splinter).min(0.5);
  }
}

// ── Wrecked panel (the Tyrant's debris) ──

function panel(f: PixelFigure, g: THREE.Object3D, M: TM, s: number, st: ThrownState) {
  f.layer(0.006 * s, PART.TORSO);
  box(f, g, 0, 0, 0, 0.65, 0.5, 0.05, M.panel, 0.01, 1.2);
  const bm = BOX.mask;
  for (let k = 0; k < 2; k++) {
    if (!(bm & (1 << (4 + k)))) continue;
    const z = k === 0 ? 0.051 : -0.051;
    paint(f, g, -0.66, -0.2, z, 0.66, -0.2, z, 0.08, M.panelRed);
    // Window (dark, cracked, a reflection).
    paint(f, g, -0.32, 0.25, z, 0.52, 0.25, z, 0.2, M.glass);
    paint(f, g, -0.2, 0.08, z, -0.02, 0.42, z, 0.025, M.glassHi);
    line(f, g, 0.2, 0.25, z, 0.42, 0.4, z, 0.006, 0.45, M.glass);
    line(f, g, 0.2, 0.25, z, 0.35, 0.1, z, 0.006, 0.45, M.glass);
    // Rivets, rust streaks, a dent.
    for (let i = -2; i <= 2; i++) paint(f, g, i * 0.28, -0.42, z, i * 0.28, -0.42, z, 0.012, M.steelDark);
    paint(f, g, 0.45, -0.3, z, 0.5, -0.48, z, 0.03, M.rust);
    paint(f, g, -0.5, -0.05, z, -0.46, -0.3, z, 0.02, M.rust);
    line(f, g, -0.2, -0.35, z, 0.1, -0.28, z, 0.02, -0.3, M.panel);
  }
  void st;
}

// ── Burning branch (storm hazard) ──

function branch(f: PixelFigure, g: THREE.Object3D, M: TM, s: number, st: ThrownState) {
  const t = st.time;
  // Leafy clump round the crown end (the 3D cone: base at z 0.6, tip at z 1.8).
  f.layer(0.08 * s, PART.TORSO);
  f.ellipsoid(g, 0, 0, 1.1, 0.42, 0.4, 0.55, M.frond).rag(0.06, PF.SPIKY);
  f.ellipsoid(g, 0.12, 0.15, 1.5, 0.3, 0.28, 0.36, M.frond).rag(0.05, PF.SPIKY);
  f.ellipsoid(g, -0.15, -0.1, 0.8, 0.32, 0.3, 0.3, M.frondDark).rag(0.05, PF.SPIKY);
  // Bough + twigs.
  // (The bough mesh is tilted in the group: its own frame, axis = local Y, burning end at −Y.)
  const tr = g.children[0] ?? g;
  f.layer(0.02 * s, PART.TORSO);
  f.cone(f.at(tr, 0, -0.85, 0), f.at(tr, 0, 0.85, 0), 0.18 * s, 0.13 * s, M.bark);
  f.cone(f.at(tr, 0.05, 0.1, 0.08), f.at(tr, 0.32, 0.35, 0.38), 0.05 * s, 0.015 * s, M.bark).min(0.5);
  f.cone(f.at(tr, -0.05, -0.3, -0.06), f.at(tr, -0.3, -0.15, -0.3), 0.045 * s, 0.012 * s, M.bark).min(0.5);
  for (let i = 0; i < 5; i++) hoop(f, tr, 1, -0.6 + i * 0.3, 0.17 - i * 0.008, 0.012, M.bark, true, 8, false, -0.3);
  // Charred end.
  f.ball(f.at(g, 0, 0, -0.85), 0.19 * s, M.steelDark).k(0.05 * s);
  // Fire: an ember core and flame tongues licking back along the fall, sparks.
  f.layer(0.04 * s, PART.TORSO, 0, -0.05);
  const fire = f.at(g, 0, 0, -0.85);
  f.ball(fire, 0.2 * s, M.ember).flag(PF.GLOW | PF.NO_OUTLINE);
  for (let i = 0; i < 3; i++) {
    const fl = 0.7 + 0.3 * Math.sin(t * (13 + i * 3) + i * 2);
    const tipP = behind(f, fire, st, (0.2 + 0.1 * i) * fl, Math.sin(t * 9 + i * 2) * 0.07 + (i - 1) * 0.11, (0.3 + 0.12 * (1 - Math.abs(i - 1))) * fl);
    f.cone(fire, tipP, (0.15 - i * 0.03) * s, 0.01 * s, i === 1 ? M.flame : M.ember).flag(PF.GLOW | PF.NO_OUTLINE).min(0.5);
  }
  f.ball(screenOff(f, fire, -0.03, 0.03), 0.09 * s, M.flameHot).flag(PF.GLOW | PF.NO_OUTLINE).min(0.6);
  // Smoke puffs and sparks trailing.
  f.layer(0.004 * s, PART.TORSO, 0, 0.05);
  for (let i = 0; i < 3; i++) {
    const ph = (t * 1.4 + i * 0.33) % 1;
    f.ball(behind(f, fire, st, 0.5 + ph * 0.9, Math.sin(i * 2.3) * 0.15, 0.1 + ph * 0.35), (0.1 + ph * 0.12) * s, M.smoke).flag(PF.NO_OUTLINE).min(0.6);
  }
  for (let i = 0; i < 3; i++) {
    const ph = (t * 2.3 + i * 0.41) % 1;
    f.ball(behind(f, fire, st, 0.2 + ph * 0.7, Math.sin(i * 4.1 + t * 3) * 0.25, ph * 0.3), 0.022 * s, i & 1 ? M.flameHot : M.flame).flag(PF.GLOW | PF.NO_OUTLINE).min(0.5);
  }
}

// ── Anything else ──

const chunkCache = new Map<number, number>();
function chunk(f: PixelFigure, g: THREE.Object3D, M: TM, s: number, st: ThrownState) {
  const r = Math.max(0.12, st.size * 0.85);
  let mat = chunkCache.get(st.color);
  if (mat === undefined) chunkCache.set(st.color, (mat = castMat(st.color, PAT.CAMO, { scale: 0.1, strength: 0.5 })));
  f.layer(r * 0.25 * s, PART.TORSO);
  f.ellipsoid(g, 0, 0, 0, r, r * 0.85, r * 0.9, mat);
  f.ellipsoid(g, r * 0.4, r * 0.3, 0, r * 0.55, r * 0.5, r * 0.55, mat);
  f.ellipsoid(g, -r * 0.35, -r * 0.25, r * 0.2, r * 0.55, r * 0.5, r * 0.5, mat);
  void M;
}
