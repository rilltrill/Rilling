import * as THREE from 'three';
import { PART, PF, type PixelFigure } from '../../gameplay/pixel/figure';
import { Mat, PAT } from '../../gameplay/pixel/materials';
import { BOX, box, camRight, camUp, castMat, castView, castWorldLight, cylinder, enamelMat, faceShown, faceTone, hash01, hoop, line, paint, scaleOf, screenOff, sparkle, woodMat } from './castKit';

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
  /** The scene's key light (hard props are partly lit by it), or null. */
  light: THREE.DirectionalLight | null;
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
    light: null,
  };
}

/**
 * Colour of the debris a shot-down thrown thing breaks into in ART: SPRITES (the
 * gib sprites take their material from it: grey concrete / stone chips, red
 * painted-metal chips with bare-steel edges, wooden splinters).
 */
export function thrownDebrisColor(st: ThrownState): number {
  switch (st.kind) {
    case 'hook':
      return 0x8a8f96;
    case 'barrel':
      return 0xc22a20;
    case 'door':
      return 0xd8d8d0;
    case 'car':
      return st.car.paint;
    case 'slab':
      return 0x8a847c;
    case 'rock':
      return st.rock.r > 0.5 ? 0x6e6a60 : 0x7d7262;
    case 'palm':
    case 'branch':
      return 0x6e5d4a;
    case 'panel':
      return 0xbfb6a0;
    default:
      return st.color;
  }
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
  chrome: number;
  oil: number;
  head: number;
  tail: number;
  plate: number;
  concrete: number;
  stain: number;
  chassis: number;
  rebar: number;
  rock: number;
  rockT: number;
  rockDark: number;
  moss: number;
  mossDark: number;
  grass: number;
  grassDark: number;
  bark: number;
  husk: number;
  splinter: number;
  frond: number;
  frondDark: number;
  panel: number;
  panelRed: number;
  ember: number;
  emberDeep: number;
  flame: number;
  flameHot: number;
  smoke: number;
  shine: number;
}

const TMS: TM = {
  ready: false, steel: 0, steelDark: 0, rust: 0, meat: 0, fat: 0, bone: 0, blood: 0, drumRed: 0, drumRim: 0, hazard: 0, ink: 0, label: 0, doorWhite: 0, glass: 0, glassHi: 0,
  blue: 0, red: 0, gold: 0, trim: 0, tyre: 0, hub: 0, chrome: 0, oil: 0, head: 0, tail: 0, plate: 0, concrete: 0, rebar: 0, rock: 0, rockT: 0, rockDark: 0, moss: 0, mossDark: 0, grass: 0, grassDark: 0, bark: 0, husk: 0, splinter: 0, frond: 0,
  frondDark: 0, panel: 0, panelRed: 0, stain: 0, chassis: 0, ember: 0, emberDeep: 0, flame: 0, flameHot: 0, smoke: 0, shine: 0,
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
  M.chrome = castMat(0xc4c8d0, PAT.GLOSS, { light: 0.75, dark: 0.3, sat: 1, strength: 0.6, spec: 0.9, dither: 0 });
  M.oil = castMat(0x141210, PAT.NONE, { light: 0.4, dark: 0.6, dither: 0 });
  M.head = Mat.glow(0xfff2b0);
  M.tail = Mat.glow(0xff3020);
  M.plate = enamelMat(0xe8e4d8, 0.6, 0.5);
  M.concrete = castMat(0x8a847c, PAT.WEAVE, { light: 0.5, strength: 0.9, scale: 0.15, dither: 0.12, secondary: Mat.flat(0x6a6058, 'stain') });
  M.stain = castMat(0x6a6058, PAT.WEAVE, { strength: 0.8, scale: 0.15 });
  M.chassis = castMat(0x2a2a2e, PAT.WEAVE, { light: 0.4, strength: 0.7, scale: 0.2 });
  M.rebar = castMat(0x8a4a2a, PAT.PLATE, { strength: 0.5, spec: 0.3 });
  M.rock = castMat(0x7d7262, PAT.CAMO, { light: 0.5, dark: 0.34, scale: 0.05, strength: 0.45, dither: 0 });
  M.rockT = castMat(0x6e6a60, PAT.CAMO, { light: 0.5, dark: 0.34, scale: 0.05, strength: 0.45, dither: 0 });
  M.moss = castMat(0x4f7a26, PAT.CAMO, { light: 0.45, sat: 1.15, scale: 0.04, strength: 0.5, dither: 0.05 });
  M.mossDark = castMat(0x35561c, PAT.CAMO, { light: 0.4, scale: 0.04, strength: 0.4, dither: 0.05 });
  M.rockDark = castMat(0x5a5248, PAT.CAMO, { scale: 0.12, strength: 0.5 });
  M.grass = castMat(0x7aa83a, PAT.NONE, { light: 0.5, dither: 0 });
  M.grassDark = Mat.flat(0x3a5a20, 'grassdk');
  M.bark = castMat(0x6e5d4a, PAT.HAIR, { light: 0.38, dark: 0.36, strength: 0.75 });
  M.husk = castMat(0x4c3f32, PAT.HAIR, { light: 0.4, dark: 0.4, strength: 0.6 });
  M.splinter = woodMat(0xc8a878);
  M.frond = castMat(0x4a7b42, PAT.HAIR, { light: 0.32, dark: 0.38, sat: 1.05, strength: 0.3, dither: 0.06 });
  M.frondDark = castMat(0x355f36, PAT.HAIR, { light: 0.3, dark: 0.4, sat: 1.0, strength: 0.3, dither: 0.06 });
  M.panel = castMat(0xbfb6a0, PAT.ROT, { light: 0.5, dark: 0.36, strength: 0.55, secondary: M.rust });
  M.panelRed = castMat(0x9a3a2e, PAT.ROT, { light: 0.42, strength: 0.5, secondary: M.rust });
  M.ember = Mat.glow(0xff6420);
  M.emberDeep = Mat.glow(0xc8301a);
  M.flame = Mat.glow(0xffd040);
  M.flameHot = Mat.glow(0xfff6c8);
  M.smoke = castMat(0x5a5650, PAT.NONE, { light: 0.4, dark: 0.6, dither: 0.3 });
  M.shine = Mat.glow(0xffffff);
  return M;
}

/**
 * Goo ramps per colour, every step UNLIT (glow): the spat warning is the
 * brightest, most saturated thing in frame by day and by night (glow texels skip
 * the stage's night tint and fog). Built from the thrower's own 3D glow colour:
 * a dark-olive edge (shadow side only), deep and base lime, a pale lime, a
 * yellow-white hot core, a white wet speck, and the bile's membrane.
 */
interface Goo {
  edge: number;
  deep: number;
  body: number;
  light: number;
  hot: number;
  spec: number;
  membrane: number;
}
const gooCache = new Map<number, Goo>();
function gooMats(color: number): Goo {
  let g = gooCache.get(color);
  if (!g) {
    const hsl = { h: 0, s: 0, l: 0 };
    new THREE.Color(color).getHSL(hsl);
    const c = (h: number, s: number, l: number) => new THREE.Color().setHSL(((h % 1) + 1) % 1, Math.min(1, Math.max(0, s)), Math.min(1, Math.max(0, l))).getHex();
    g = {
      edge: Mat.glow(c(hsl.h - 0.035, hsl.s * 0.72, hsl.l * 0.3)),
      deep: Mat.glow(c(hsl.h - 0.012, hsl.s * 0.92, hsl.l * 0.62)),
      body: Mat.glow(color),
      light: Mat.glow(c(hsl.h - 0.045, hsl.s, hsl.l + (1 - hsl.l) * 0.3)),
      hot: Mat.glow(c(hsl.h - 0.1, 1, 0.84)),
      spec: Mat.glow(0xffffff),
      membrane: Mat.glow(c(hsl.h - 0.03, hsl.s * 0.62, hsl.l * 0.42)),
    };
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

/** The sprite light's screen direction (upper left, unit): the goo's hot side. */
const GLX = -0.66;
const GLY = 0.75;
/** Goo primitives: unlit, flat, never outlined (the dark-olive edge IS the outline, on the shadow side). */
const GF = PF.GLOW | PF.FLAT | PF.NO_OUTLINE;

/**
 * One wobbling lobed goo mass round world point c: a centre ball and `n` lobes
 * orbiting it (3–5 bulges that squash and stretch), radii × `k`, shifted
 * (sx, sy) metres on screen, in `mat` at depth bias `z` (nearer wins inside the layer).
 */
function gooLobes(f: PixelFigure, c: THREE.Vector3, R: number, n: number, t: number, seed: number, k: number, sx: number, sy: number, mat: number, z: number) {
  f.ball(screenOff(f, c, sx, sy), R * 0.78 * k, mat).flag(GF).z(z);
  for (let i = 0; i < n; i++) {
    const a = seed * 6.2832 + (i / n) * 6.2832 + 0.35 * Math.sin(t * 2.7 + i * 1.9);
    const off = R * (0.27 + 0.08 * Math.sin(t * (6.3 + i * 1.7) + i * 2.3)) * k;
    const r = R * (0.68 + 0.09 * Math.sin(t * (8.1 - i * 1.1) + i)) * k;
    f.ball(screenOff(f, c, Math.cos(a) * off + sx, Math.sin(a) * off + sy), r, mat).flag(GF).z(z);
  }
}

const _gr = new THREE.Vector3();
const _gu = new THREE.Vector3();

/**
 * Spat goo: an irregular wobbling glob that GLOWS (every texel unlit, built from
 * the thrower's glow colour): a dark-olive edge on the shadow side only, the
 * lime body, a pale lime crescent, a yellow-white hot core and a wet speck,
 * bubbles drifting inside. Flying at the camera it throws a ragged splash rim
 * and drips falling off it; seen side-on, a short tapered streak that fades
 * through deeper greens to a droplet or two.
 */
function glob(f: PixelFigure, st: ThrownState, s: number) {
  const g = st.mesh;
  const G = gooMats(st.color);
  const t = st.time;
  const bile = g.children.length >= 2 && st.size >= 0.33;
  const venom = g.children.length >= 3;
  // Hitbox radius: spitter sphere = size, dilo core 0.17 (+ two satellites), bile skin 0.36 round a 0.3 core.
  const R = (venom ? 0.17 : bile ? 0.345 : st.size) * s;
  const c = f.at(g, 0, 0, 0);
  const seed = st.seed;
  const n = venom ? 3 : bile ? 5 : 4;
  // Screen-space flight: (vx, vy) on screen, `side` 0 = straight at the camera … 1 = across.
  camRight(_gr);
  camUp(_gu);
  const vx = st.vel.dot(_gr);
  const vy = st.vel.dot(_gu);
  const side = Math.min(1, Math.hypot(vx, vy));
  const lx = GLX * R;
  const ly = GLY * R;
  f.layer(R * 0.3, PART.TORSO);
  // The mass: the edge colour's silhouette, the body over it shifted toward the light
  // (the edge shows as a 1–2 texel crescent on the shadow side only). The bile: its dark
  // membrane all round, the glowing core inside, still offset toward the light.
  gooLobes(f, c, R, n, t, seed, 1, 0, 0, bile ? G.membrane : G.edge, 0);
  if (bile) gooLobes(f, c, R, n, t, seed + 0.31, 0.8, lx * 0.08, ly * 0.08, G.body, -0.01);
  else gooLobes(f, c, R, n, t, seed, 0.92, lx * 0.08, ly * 0.08, G.body, -0.01);
  // Venom: the 3D glob's two satellite blobs, where the spinning mesh has them.
  if (venom) {
    for (let i = 0; i < 2; i++) {
      const sp = i === 0 ? f.at(g, 0.13, 0.07, 0.04) : f.at(g, -0.11, -0.08, -0.05);
      const r = (i === 0 ? 0.09 : 0.07) * s;
      f.ball(sp, r, G.edge).flag(GF);
      f.ball(screenOff(f, sp, GLX * r * 0.16, GLY * r * 0.16), r * 0.84, G.body).flag(GF).z(-0.01);
      f.ball(screenOff(f, sp, GLX * r * 0.38, GLY * r * 0.38), r * 0.36, G.light).flag(GF).z(-0.02).min(0.6);
    }
  }
  // Flying at the camera: a ragged splash rim (short spikes round the silhouette) and drips.
  const rim = Math.max(0, 1 - side / 0.65);
  if (rim > 0) {
    for (let i = 0; i < 7; i++) {
      const a = seed * 5 + i * 0.8976 + 0.25 * Math.sin(t * 5 + i * 1.7);
      const dx = Math.cos(a);
      const dy = Math.sin(a);
      const len = R * (0.98 + (0.16 + 0.16 * hash01(i + seed * 13)) * rim * (0.75 + 0.25 * Math.sin(t * 11 + i * 2.1)));
      const lit = dx * GLX + dy * GLY;
      f.cone(screenOff(f, c, dx * R * 0.62, dy * R * 0.62), screenOff(f, c, dx * len, dy * len), R * 0.14, R * 0.035, lit > -0.2 ? G.body : G.deep)
        .flag(GF)
        .k(R * 0.05)
        .z(lit > -0.2 ? -0.005 : 0.001)
        .min(0.5);
    }
  }
  // Drips hanging off the bottom (they stretch and snap): more when it splashes at us.
  const nd = rim > 0.5 ? 3 : rim > 0 ? 2 : side < 0.55 ? 1 : 0;
  for (let j = 0; j < nd; j++) {
    const x = R * (nd === 1 ? 0.15 : -0.32 + (0.64 * j) / (nd - 1));
    const stretch = 0.5 + 0.5 * Math.abs(Math.sin(t * (4.3 + j) + seed * 6 + j * 1.3));
    const d0 = screenOff(f, c, x, -R * 0.62);
    f.cone(d0, screenOff(f, d0, x * 0.08, -R * (0.28 + 0.34 * stretch)), R * 0.13, R * 0.06, j === 1 ? G.deep : G.body)
      .flag(GF)
      .k(R * 0.08)
      .z(-0.004)
      .min(0.5);
  }
  // Side-on: a short streak back along the flight — three thin strands that taper and
  // fade through deep green (motion, not a balloon's knot).
  const sk = Math.min(1, Math.max(0, (side - 0.3) / 0.5));
  const bx = side > 1e-3 ? -vx / side : 0;
  const by = side > 1e-3 ? -vy / side : -1;
  let tail: THREE.Vector3 | null = null;
  if (sk > 0) {
    const L = R * (0.35 + 1.1 * sk);
    for (let k = 0; k < 3; k++) {
      const o = (k - 1) * R * 0.36;
      const len = L * (k === 1 ? 1 : 0.55 + 0.2 * k);
      const wob = Math.sin(t * 10 + seed * 4 + k * 2) * R * 0.07;
      const e0 = screenOff(f, c, bx * R * 0.62 - by * o, by * R * 0.62 + bx * o);
      const e1 = screenOff(f, c, bx * (R * 0.55 + len) - by * (o * 0.7 + wob), by * (R * 0.55 + len) + bx * (o * 0.7 + wob));
      f.cone(e0, e1, R * (k === 1 ? 0.3 : 0.2), R * 0.03, G.body)
        .mat2(G.deep, 0.5)
        .flag(GF)
        .k(R * 0.1)
        .z(-0.006)
        .min(0.5);
      if (k === 1) tail = e1;
    }
  }
  // The hot side: a pale lime crescent up toward the light, the yellow-white core, the wet speck.
  gooLobes(f, c, R, 3, t * 1.3, seed + 0.5, 0.5, lx * 0.3, ly * 0.3, G.light, -0.02);
  // Bubbles drifting inside (pale on the shadow half, deep on the lit half).
  for (let i = 0; i < 3; i++) {
    const a = seed * 9 + i * 2.3 + t * (0.9 + 0.35 * i);
    const rr = R * (0.32 + 0.14 * i);
    const dx = Math.cos(a);
    const dy = Math.sin(a);
    const lit = dx * GLX + dy * GLY;
    f.ball(screenOff(f, c, dx * rr, dy * rr), R * (0.075 + 0.025 * (i & 1)), lit > 0.1 ? G.deep : G.light)
      .flag(GF)
      .z(-0.025)
      .min(0.5);
  }
  if (bile) {
    // Veins in the membrane (dark strands reaching in over the core's edge).
    for (let i = 0; i < 3; i++) {
      const a = seed * 6 + i * 2.1 + Math.sin(t * 2 + i) * 0.2 + 2.6;
      const p0 = screenOff(f, c, Math.cos(a) * R * 0.95, Math.sin(a) * R * 0.95);
      const p1 = screenOff(f, c, Math.cos(a + 0.5) * R * 0.5, Math.sin(a + 0.5) * R * 0.5);
      f.cone(p0, p1, R * 0.045, R * 0.025, G.edge).flag(GF).z(-0.022).min(0.5);
    }
  }
  f.ball(screenOff(f, c, lx * 0.3, ly * 0.3), R * 0.18, G.hot).flag(GF).z(-0.03).min(0.8);
  f.ball(screenOff(f, c, lx * 0.58, ly * 0.58), R * 0.08, G.spec).flag(GF).z(-0.04).min(0.6);
  // Loose droplets: falling off the drips; side-on, fading off the streak's end.
  f.layer(R * 0.04, PART.TORSO);
  for (let j = 0; j < 2; j++) {
    const ph = (t * 1.25 + j * 0.5 + seed) % 1;
    if (tail && j === 0) {
      f.ball(screenOff(f, tail, bx * R * (0.35 + 0.3 * ph), by * R * (0.35 + 0.3 * ph) - R * 0.1 * ph), R * (0.15 - 0.04 * ph), G.deep).flag(GF).min(0.6);
      continue;
    }
    const x = R * (j === 0 ? -0.2 : 0.26);
    f.ball(screenOff(f, c, x, -R * (1.25 + 1.2 * ph)), R * (0.12 - 0.04 * ph), ph > 0.6 ? G.edge : G.deep).flag(GF).min(0.6);
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

const _sd = new THREE.Vector3();
const _st = new THREE.Vector3();
/** Facing of the car body's / glass faces (scratch). */
const bf = [0, 0, 0, 0, 0, 0];
const gf = [0, 0, 0, 0, 0, 0];

/** The scene's key light (brightest directional light), found once per scene. */
const keyLights = new WeakMap<THREE.Object3D, THREE.DirectionalLight | null>();
export function sceneKeyLight(scene: THREE.Object3D): THREE.DirectionalLight | null {
  const hit = keyLights.get(scene);
  if (hit !== undefined && (hit === null || hit.parent)) return hit;
  let best: THREE.DirectionalLight | null = null;
  scene.traverse((o) => {
    const d = o as THREE.DirectionalLight;
    if (d.isDirectionalLight && (!best || d.intensity > best.intensity)) best = d;
  });
  keyLights.set(scene, best);
  return best;
}

/** Blend the scene's key light into this redraw's prop faces (k by how bright it is). */
function sceneLight(st: ThrownState, k: number) {
  const L = st.light;
  if (!L || L.intensity <= 0.05) return;
  _sd.setFromMatrixPosition(L.matrixWorld).sub(_st.setFromMatrixPosition(L.target.matrixWorld));
  castWorldLight(_sd, k * Math.min(1, L.intensity / 1.2));
}

/** Chrome-and-glass details of a car face: a short drawn bar (its own material) on plane `axis` = `c`. */
function carBar(f: PixelFigure, g: THREE.Object3D, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, r: number, mat: number, tone = 0) {
  paint(f, g, x0, y0, z0, x1, y1, z1, r, mat, tone);
}

/**
 * The Behemoth's thrown car (sedan / hatch / SUV, its own paint): lit partly by
 * the scene's key light (the belly catches the sunset when it turns to the sun),
 * a beat-up paint job (dirt, scratches, rust blooms in the material), wheels
 * with treads and hubcaps, a belly of rails, axles, exhaust and muffler, fuel
 * tank, sump and oil stains, chrome bumpers, lit head / tail lights, grille,
 * plates, door seams and handles, wheel arches with the paint wrapping their
 * lips, sills, dents, wipers, a cracked windscreen with a sky band.
 */
function car(f: PixelFigure, g: THREE.Object3D, M: TM, s: number, st: ThrownState) {
  const C = st.car;
  const P = carPaint(C.paint, M);
  sceneLight(st, 0.65);
  const base = C.y0 + C.wheelR * 0.9;
  const hw = C.w / 2;
  const hl = C.len / 2;
  const top = base + C.bodyH;
  const R = C.wheelR;
  const wz = hl - 0.85;
  const fz = C.cabZ + C.cabLen / 2;
  const bz = C.cabZ - C.cabLen / 2;
  // Wheels (own layers: they overlap the body with contours): tyre, tread grooves, hubcap.
  for (let i = 0; i < 4; i++) {
    const sx = i & 1 ? -1 : 1;
    const z = i & 2 ? -wz : wz;
    const x = sx * (hw - 0.08);
    const y = C.y0 + R;
    f.layer(0.004 * s, PART.TORSO);
    cylinder(f, f.at(g, x - 0.13, y, z), f.at(g, x + 0.13, y, z), R * s, M.tyre, M.tyre, 0.7);
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2 + i;
      const cy = Math.cos(a) * R;
      const cz = Math.sin(a) * R;
      _p.set(x, y + cy, z + cz).applyMatrix4(g.matrixWorld);
      if (f.facing(_p, f.dir(g, 0, cy, cz)) < 0.25) continue;
      line(f, g, x - 0.11, y + cy, z + cz, x + 0.11, y + cy * 0.97, z + cz * 0.97, 0.014, k & 1 ? 0.22 : -0.3, M.tyre);
    }
    _p.set(x + sx * 0.14, y, z).applyMatrix4(g.matrixWorld);
    if (f.facing(_p, f.dir(g, sx, 0, 0)) > 0.1) {
      f.layer(0.002 * s, PART.TORSO, 0, -0.01);
      const hp = f.at(g, x + sx * 0.14, y, z);
      f.ball(hp, R * 0.56 * s, M.chrome).flag(PF.FLAT);
      f.ball(hp, R * 0.3 * s, M.hub).flag(PF.FLAT).z(-0.005);
      f.ball(hp, R * 0.12 * s, M.steelDark).flag(PF.FLAT).z(-0.01);
    }
  }
  // Body.
  f.layer(0.02 * s, PART.TORSO);
  box(f, g, 0, base + C.bodyH / 2, 0, hw, C.bodyH / 2, hl, P, 0.04, 1.2);
  const bm = BOX.mask;
  // Chrome bumpers (a bright bar with a highlight line along the top).
  for (let k = -1; k <= 1; k += 2) {
    const z = k * (hl + 0.03);
    f.cone(f.at(g, -hw - 0.02, base + 0.12, z), f.at(g, hw + 0.02, base + 0.12, z), 0.09 * s, 0.09 * s, M.chrome);
  }
  const shown = bf;
  for (let i = 0; i < 6; i++) shown[i] = BOX.facing[i];
  for (let i = 0; i < 6; i++) {
    if (!(bm & (1 << i)) || shown[i] < 0.2) continue;
    if (i === 0 || i === 1) {
      const x = i === 0 ? hw : -hw;
      // Door seams, handles, the swage line catching the light, a dirty sill.
      line(f, g, x, base + 0.06, fz - 0.05, x, top - 0.02, fz - 0.05, 0.009, -0.42, P);
      line(f, g, x, base + 0.06, C.cabZ - 0.1, x, top - 0.02, C.cabZ - 0.1, 0.009, -0.42, P);
      if (C.kind !== 1) line(f, g, x, base + 0.06, bz + 0.12, x, top - 0.02, bz + 0.12, 0.009, -0.42, P);
      line(f, g, x, top - 0.15, -hl + 0.12, x, top - 0.15, hl - 0.12, 0.011, 0.24, P);
      line(f, g, x, top - 0.19, -hl + 0.12, x, top - 0.19, hl - 0.12, 0.008, -0.2, P);
      carBar(f, g, x, top - 0.25, fz - 0.28, x, top - 0.25, fz - 0.16, 0.022, M.chrome);
      carBar(f, g, x, top - 0.25, C.cabZ - 0.38, x, top - 0.25, C.cabZ - 0.26, 0.022, M.chrome);
      line(f, g, x, base + 0.07, -hl + 0.1, x, base + 0.07, hl - 0.1, 0.05, -0.3, P);
      // Wheel arches: a dark well over each tyre, the paint's lip wrapping round it.
      for (let k = -1; k <= 1; k += 2) {
        const z = k * wz;
        for (let q = 0; q < 3; q++) {
          const a0 = Math.PI * (q / 3);
          const a1 = Math.PI * ((q + 1) / 3);
          const r0 = R * 1.1;
          carBar(f, g, x, base - 0.05 + Math.sin(a0) * r0, z + Math.cos(a0) * r0, x, base - 0.05 + Math.sin(a1) * r0, z + Math.cos(a1) * r0, R * 0.16, M.trim);
          line(f, g, x, base - 0.05 + Math.sin(a0) * r0 * 1.22, z + Math.cos(a0) * r0 * 1.22, x, base - 0.05 + Math.sin(a1) * r0 * 1.22, z + Math.cos(a1) * r0 * 1.22, 0.012, 0.26, P);
        }
        // Rust blooming at the arch's foot, a dent in the door.
        carBar(f, g, x, base + 0.1, z + k * R * 1.25, x, base + 0.16, z + k * R * 1.45, 0.05, M.rust);
      }
      line(f, g, x, base + 0.28, C.cabZ + 0.35, x, base + 0.2, C.cabZ + 0.7, 0.02, -0.32, P);
      line(f, g, x, base + 0.31, C.cabZ + 0.37, x, base + 0.23, C.cabZ + 0.72, 0.012, 0.28, P);
    } else if (i === 4 || i === 5) {
      const z = i === 4 ? hl : -hl;
      const lamp = i === 4 ? M.head : M.tail;
      for (let k = -1; k <= 1; k += 2) {
        carBar(f, g, k * (hw - 0.34), top - 0.17, z, k * (hw - 0.17), top - 0.17, z, 0.065, M.trim);
        carBar(f, g, k * (hw - 0.32), top - 0.17, z, k * (hw - 0.19), top - 0.17, z, 0.045, lamp);
      }
      if (i === 4) {
        // Grille: a dark slot with chrome slats, the indicator lamps.
        carBar(f, g, -0.4, top - 0.2, z, 0.4, top - 0.2, z, 0.07, M.trim);
        line(f, g, -0.38, top - 0.18, z, 0.38, top - 0.18, z, 0.012, 0.5, M.trim);
        line(f, g, -0.38, top - 0.23, z, 0.38, top - 0.23, z, 0.012, 0.45, M.trim);
        for (let k = -1; k <= 1; k += 2) carBar(f, g, k * (hw - 0.12), top - 0.28, z, k * (hw - 0.12), top - 0.28, z, 0.03, M.label);
      } else line(f, g, -hw + 0.1, top - 0.05, z, hw - 0.1, top - 0.05, z, 0.009, -0.4, P);
      carBar(f, g, -0.15, base + 0.3, z, 0.15, base + 0.3, z, 0.06, M.plate);
      line(f, g, -0.1, base + 0.3, z, 0.1, base + 0.3, z, 0.01, -0.8, M.plate);
    } else if (i === 3) {
      // Belly: chassis rails, axles, exhaust + muffler, fuel tank, sump, oil stains.
      for (let k = -1; k <= 1; k += 2) carBar(f, g, k * 0.42, base, -hl + 0.25, k * 0.42, base, hl - 0.25, 0.055, M.steelDark);
      for (let k = -1; k <= 1; k += 2) carBar(f, g, -hw + 0.12, base, k * wz, hw - 0.12, base, k * wz, 0.045, M.steelDark);
      carBar(f, g, 0.62, base, hl - 1.1, 0.62, base, -hl + 0.15, 0.035, M.chrome);
      carBar(f, g, 0.6, base, -hl + 0.95, 0.6, base, -hl + 1.45, 0.11, M.steel);
      carBar(f, g, -0.1, base, -hl + 0.65, 0.25, base, -hl + 0.65, 0.18, M.trim);
      carBar(f, g, 0, base, hl - 0.6, 0, base, hl - 1.05, 0.2, M.steelDark);
      carBar(f, g, -0.3, base, 0.2, -0.22, base, 0.35, 0.12, M.oil);
      carBar(f, g, 0.15, base, -0.6, 0.3, base, -0.55, 0.09, M.oil);
      carBar(f, g, -hw + 0.2, base, 0.9, -hw + 0.3, base, 1.3, 0.08, M.rust);
      // Pressed floor-pan ribs between the rails, grime caked along the sills.
      for (let k = -1; k <= 1; k++) line(f, g, k * 0.18, base, hl - 1.3, k * 0.18, base, -hl + 1.0, 0.016, k === 0 ? 0.2 : -0.22, P);
      for (let k = -1; k <= 1; k += 2) line(f, g, k * (hw - 0.1), base, -hl + 0.15, k * (hw - 0.1), base, hl - 0.15, 0.08, -0.32, P);
    } else if (i === 2) {
      // Bonnet and boot: seams, creases, wipers lying at the windscreen's foot.
      line(f, g, -hw + 0.12, top, fz + 0.06, hw - 0.12, top, fz + 0.06, 0.009, -0.4, P);
      for (let k = -1; k <= 1; k += 2) line(f, g, k * 0.38, top, fz + 0.15, k * 0.42, top, hl - 0.15, 0.01, k > 0 ? -0.2 : 0.22, P);
      for (let k = -1; k <= 1; k += 2) carBar(f, g, k * 0.1, top + 0.01, fz + 0.1, k * 0.1 + 0.42, top + 0.01, fz + 0.04, 0.016, M.trim);
      if (C.kind !== 1) line(f, g, -hw + 0.12, top, bz - 0.06, hw - 0.12, top, bz - 0.06, 0.009, -0.4, P);
      line(f, g, -0.3, top, hl - 0.35, 0.1, top, fz + 0.3, 0.013, 0.26, P);
    }
  }
  // Glasshouse: glass block, the roof and pillars in the body paint.
  if (C.cabH > 0) {
    f.layer(0.02 * s, PART.TORSO);
    const gy = top + C.cabH / 2;
    box(f, g, 0, gy, C.cabZ, hw * 0.86, C.cabH / 2, C.cabLen / 2, M.glass, 0.03, 0.7);
    const gm = BOX.mask;
    for (let i = 0; i < 6; i++) gf[i] = BOX.facing[i];
    box(f, g, 0, top + C.cabH, C.cabZ - 0.05, hw * 0.88, 0.05, (C.cabLen * 0.82) / 2, P, 0.02, 1.2);
    if (faceShown(2, 0.3)) {
      line(f, g, -hw * 0.8, top + C.cabH + 0.05, C.cabZ - C.cabLen * 0.38, -hw * 0.8, top + C.cabH + 0.05, C.cabZ + C.cabLen * 0.3, 0.012, 0.28, P);
      carBar(f, g, 0.2, top + C.cabH + 0.05, C.cabZ + 0.1, 0.32, top + C.cabH + 0.05, C.cabZ - 0.3, 0.06, M.rust);
    }
    for (let k = -1; k <= 1; k += 2) {
      const x = k * hw * 0.84;
      f.cone(f.at(g, x, top, fz - 0.05), f.at(g, x, top + C.cabH, fz - 0.25), 0.05 * s, 0.05 * s, P);
      f.cone(f.at(g, x, top, bz + 0.07), f.at(g, x, top + C.cabH, bz + 0.3), 0.06 * s, 0.06 * s, P);
      f.cone(f.at(g, x, top, C.cabZ - 0.1), f.at(g, x, top + C.cabH, C.cabZ - 0.1), 0.035 * s, 0.035 * s, P);
    }
    // A sky band streaking across each pane, a second thin one; the windscreen cracked.
    for (let i = 0; i < 6; i++) {
      if (!(gm & (1 << i)) || i === 2 || i === 3 || gf[i] < 0.25) continue;
      const ax = i >> 1;
      const sg = i & 1 ? -1 : 1;
      const x = ax === 0 ? sg * hw * 0.86 : 0;
      const z = ax === 2 ? C.cabZ + sg * (C.cabLen / 2) : C.cabZ;
      const u = ax === 0 ? 1 : 0;
      const w = ax === 0 ? C.cabLen * 0.35 : hw * 0.6;
      carBar(f, g, x - (1 - u) * w * 0.7, top + 0.06, z - u * w * 0.7, x - (1 - u) * w * 0.1, top + C.cabH - 0.06, z - u * w * 0.1, 0.06, M.glassHi);
      carBar(f, g, x + (1 - u) * w * 0.12, top + 0.06, z + u * w * 0.12, x + (1 - u) * w * 0.36, top + C.cabH - 0.1, z + u * w * 0.36, 0.022, M.glassHi);
      if (ax === 2 && sg > 0) {
        const cx = 0.3;
        const cy = top + C.cabH * 0.55;
        line(f, g, cx, cy, z, cx + 0.3, cy + 0.15, z, 0.009, 0.55, M.glass);
        line(f, g, cx, cy, z, cx - 0.25, cy + 0.2, z, 0.009, 0.55, M.glass);
        line(f, g, cx, cy, z, cx + 0.1, cy - 0.22, z, 0.009, 0.55, M.glass);
        line(f, g, cx, cy, z, cx - 0.3, cy - 0.1, z, 0.009, 0.55, M.glass);
        line(f, g, cx - 0.12, cy + 0.08, z, cx - 0.02, cy - 0.12, z, 0.007, 0.5, M.glass);
      }
    }
  }
  // Glints off the chrome / glass as it tumbles.
  if (Math.sin(st.time * 7 + st.seed * 5) > 0.6) sparkle(f, f.at(g, hw * 0.7, top + C.cabH, C.cabZ + C.cabLen * 0.4), 0.22, M.shine, 0.5);
}

const carCache = new Map<number, number>();
/** Car paint: the colour on a beat-up ramp — dirt mottling, scratches and rust blooms (ROT with rust as its patches). */
function carPaint(hex: number, M: TM): number {
  let m = carCache.get(hex);
  if (m === undefined) {
    m = castMat(hex, PAT.ROT, { light: 0.46, dark: 0.34, sat: 1.12, strength: 0.26, spec: 0.35, dither: 0.05, secondary: M.rust });
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

/** A rock mesh's facets (local frame, 9 floats per triangle) and each edge's neighbour face (−1 = none). */
interface Facets {
  v: Float32Array;
  nb: Int16Array;
  n: number;
}
const MAX_FACETS = 48;
const facetCache = new WeakMap<THREE.BufferGeometry, Facets>();
/** Tone step per facet this redraw (−1 = facing away). */
const facetStep = new Int8Array(MAX_FACETS);
/** Four hard tone steps for a facet by how it faces the light (shadow … lit top). */
const ROCK_TONE = [-0.3, -0.16, -0.03, 0.11];

/** The facets of `m`'s geometry (read once per geometry: the thrower's own jittered hull). */
function facetsOf(m: THREE.Object3D): Facets | null {
  const geo = (m as THREE.Mesh).geometry as THREE.BufferGeometry | undefined;
  const pos = geo?.attributes.position as THREE.BufferAttribute | undefined;
  if (!geo || !pos) return null;
  let F = facetCache.get(geo);
  if (F) return F;
  const idx = geo.index;
  const n = Math.min(Math.floor((idx ? idx.count : pos.count) / 3), MAX_FACETS);
  const v = new Float32Array(n * 9);
  for (let i = 0; i < n * 3; i++) {
    const j = idx ? idx.getX(i) : i;
    v[i * 3] = pos.getX(j);
    v[i * 3 + 1] = pos.getY(j);
    v[i * 3 + 2] = pos.getZ(j);
  }
  const same = (a: number, b: number) => Math.abs(v[a] - v[b]) < 1e-4 && Math.abs(v[a + 1] - v[b + 1]) < 1e-4 && Math.abs(v[a + 2] - v[b + 2]) < 1e-4;
  const nb = new Int16Array(n * 3).fill(-1);
  for (let i = 0; i < n; i++) {
    for (let e = 0; e < 3; e++) {
      const a = i * 9 + e * 3;
      const b = i * 9 + ((e + 1) % 3) * 3;
      for (let j = 0; j < n && nb[i * 3 + e] < 0; j++) {
        if (j === i) continue;
        for (let e2 = 0; e2 < 3; e2++) {
          if (same(a, j * 9 + ((e2 + 1) % 3) * 3) && same(b, j * 9 + e2 * 3)) {
            nb[i * 3 + e] = j;
            break;
          }
        }
      }
    }
  }
  F = { v, nb, n };
  facetCache.set(geo, F);
  return F;
}

const _fa = new THREE.Vector3();
const _fb = new THREE.Vector3();
const _fn = new THREE.Vector3();

/**
 * A thrown rock (Carnotaur boulder, Tyrant rock) drawn from the mesh's REAL
 * facets: every facet turned to the camera is a flat polygon in one of four hard
 * tone steps by how it faces the light (a chipped, angular silhouette, no
 * gradients), pale highlights along the ridges where a lit facet meets a darker
 * one, cracks down a few facet edges, grit pits and flecks; the grass tuft is
 * moss clumps clinging to the rock with blades fanning out of the crack.
 */
function rock(f: PixelFigure, g: THREE.Object3D, M: TM, s: number, st: ThrownState) {
  const R = st.rock;
  const big = R.r > 0.5;
  const rm = g.children[0] ?? g;
  const F = facetsOf(rm);
  const mat = big ? M.rockT : M.rock;
  const seed = st.seed;
  f.layer(0.005 * s, PART.TORSO);
  if (!F) {
    f.ellipsoid(rm, 0, 0, 0, R.r, R.r, R.r, mat);
    return;
  }
  const v = F.v;
  // Facets.
  for (let i = 0; i < F.n; i++) {
    const o = i * 9;
    const A = f.at(rm, v[o], v[o + 1], v[o + 2]);
    const B = f.at(rm, v[o + 3], v[o + 4], v[o + 5]);
    const C = f.at(rm, v[o + 6], v[o + 7], v[o + 8]);
    _fn.crossVectors(_fa.subVectors(B, A), _fb.subVectors(C, A));
    const l = _fn.length();
    if (l < 1e-9) {
      facetStep[i] = -1;
      continue;
    }
    _fn.divideScalar(l);
    _fa.copy(A).add(B).add(C).divideScalar(3);
    if (f.facing(_fa, _fn) <= 0.0) {
      facetStep[i] = -1;
      continue;
    }
    const t = faceTone(_fn, 1.3);
    const step = t > 0.15 ? 3 : t > -0.04 ? 2 : t > -0.2 ? 1 : 0;
    facetStep[i] = step;
    f.tri(A, B, C, mat, 0.003 * s).tone(ROCK_TONE[step]);
  }
  // Ridges and cracks along the facet edges seen from the camera.
  let cracks = 0;
  let ridges = 0;
  for (let i = 0; i < F.n; i++) {
    const si = facetStep[i];
    if (si < 0) continue;
    const o = i * 9;
    const cx = (v[o] + v[o + 3] + v[o + 6]) / 3;
    const cy = (v[o + 1] + v[o + 4] + v[o + 7]) / 3;
    const cz = (v[o + 2] + v[o + 5] + v[o + 8]) / 3;
    for (let e = 0; e < 3; e++) {
      const j = F.nb[i * 3 + e];
      if (j < 0 || facetStep[j] < 0) continue;
      const a = o + e * 3;
      const b = o + ((e + 1) % 3) * 3;
      if (si >= 2 && si >= facetStep[j] + 2 && ridges < 3) {
        // Lit ridge: a short pale line just inside the brighter facet (top edges catch the light).
        ridges++;
        const k = 0.12;
        const t0 = 0.12 + 0.2 * hash01(i * 1.7 + e + seed * 7);
        const t1 = 0.62 + 0.3 * hash01(i * 2.3 + e + seed * 5);
        const ax = v[a] + (cx - v[a]) * k;
        const ay = v[a + 1] + (cy - v[a + 1]) * k;
        const az = v[a + 2] + (cz - v[a + 2]) * k;
        const bx = v[b] + (cx - v[b]) * k;
        const by = v[b + 1] + (cy - v[b + 1]) * k;
        const bz = v[b + 2] + (cz - v[b + 2]) * k;
        line(f, rm, ax + (bx - ax) * t0, ay + (by - ay) * t0, az + (bz - az) * t0, ax + (bx - ax) * t1, ay + (by - ay) * t1, az + (bz - az) * t1, 0.012, 0.22, mat);
      } else if (i < j && cracks < 3 && hash01(i * 7.3 + e * 1.9 + seed * 31) > 0.5) {
        // A crack down the edge (part of it), forking into the facet.
        cracks++;
        const t0 = 0.15 + 0.2 * hash01(i + seed * 5);
        const t1 = 0.75 + 0.15 * hash01(j + seed * 3);
        const mx = v[a] + (v[b] - v[a]) * 0.5;
        const my = v[a + 1] + (v[b + 1] - v[a + 1]) * 0.5;
        const mz = v[a + 2] + (v[b + 2] - v[a + 2]) * 0.5;
        line(f, rm, v[a] + (v[b] - v[a]) * t0, v[a + 1] + (v[b + 1] - v[a + 1]) * t0, v[a + 2] + (v[b + 2] - v[a + 2]) * t0, v[a] + (v[b] - v[a]) * t1, v[a + 1] + (v[b + 1] - v[a + 1]) * t1, v[a + 2] + (v[b + 2] - v[a + 2]) * t1, 0.011, -0.42, mat);
        line(f, rm, mx, my, mz, mx + (cx - mx) * 0.55, my + (cy - my) * 0.55, mz + (cz - mz) * 0.55, 0.009, -0.38, mat);
      }
    }
    // Grit: a dark pit or a pale fleck somewhere on the facet.
    const h1 = hash01(i * 3.1 + seed * 17);
    const h2 = hash01(i * 5.7 + seed * 11) * (1 - h1);
    const h3 = 1 - h1 - h2;
    const px = v[o] * h1 + v[o + 3] * h2 + v[o + 6] * h3;
    const py = v[o + 1] * h1 + v[o + 4] * h2 + v[o + 7] * h3;
    const pz = v[o + 2] * h1 + v[o + 5] * h2 + v[o + 8] * h3;
    const pale = hash01(i * 9.1 + seed) > 0.6 && si >= 1;
    line(f, rm, px, py, pz, px * 1.01, py * 1.01, pz, pale ? 0.012 : 0.016, pale ? 0.26 : -0.4, mat);
  }
  // The grass tuft (its own mesh): moss clumps clinging round where it meets the rock,
  // a few blades fanning out of the crack.
  const tf = g.children[1] ?? null;
  if (tf) {
    const tc = f.at(tf, 0, 0, 0);
    const rc = f.at(rm, 0, 0, 0);
    const out = f.vec().subVectors(tc, rc);
    const ol = out.length() || 1;
    out.divideScalar(ol);
    // Two directions across the outward one (along the rock's surface there).
    const u1 = f.vec().set(-out.y, out.x, 0);
    if (u1.lengthSq() < 1e-4) u1.set(1, 0, 0);
    u1.normalize();
    const u2 = f.vec().crossVectors(out, u1);
    const tr = R.tr;
    f.layer(0.012 * s, PART.TORSO);
    for (let i = 0; i < 4; i++) {
      const a = i * 1.6 + seed * 4;
      const p = f.vec().copy(tc).addScaledVector(u1, Math.cos(a) * tr * 0.6 * s).addScaledVector(u2, Math.sin(a) * tr * 0.6 * s).addScaledVector(out, -tr * 0.3 * s);
      f.ball(p, tr * (0.34 - 0.04 * i) * s, i & 1 ? M.mossDark : M.moss).rag(0.018).seed(i * 5 + 1);
    }
    for (let i = 0; i < 5; i++) {
      const a = (i - 2) * 0.42 + Math.sin(st.time * 6 + i) * 0.08;
      const sp = u1;
      const len = tr * (0.75 + 0.3 * hash01(i + seed * 9)) * s;
      const base = f.vec().copy(tc).addScaledVector(sp, (i - 2) * tr * 0.14 * s).addScaledVector(u2, ((i & 1) - 0.5) * tr * 0.3 * s);
      const tip = f.vec().copy(base).addScaledVector(out, Math.cos(a) * len).addScaledVector(sp, Math.sin(a) * len);
      f.cone(base, tip, 0.035 * s, 0.006 * s, i & 1 ? M.grassDark : M.grass).min(0.5);
    }
  }
  // Two grit crumbs trailing (small, low-key).
  f.layer(0.004 * s, PART.TORSO);
  for (let i = 0; i < 2; i++) {
    const ph = (st.time * 1.6 + i * 0.5) % 1;
    f.ball(behind(f, f.at(g, 0, 0, 0), st, R.r * (1.2 + ph * 1.4) * s, (i - 0.5) * R.r * 0.5, -ph * R.r * 0.4), R.r * (0.09 - i * 0.025) * s, mat).tone(-0.15).min(0.6);
  }
}

// ── Palm trunk (the Tyrant's debris) ──

/**
 * The Tyrant's palm fronds: the 3D's four 1.4 × 0.5 m boards through the crown
 * (z 1.2), Euler (0.5, i·π/2, 0.6): their long (Z) and wide (Y) axes in the debris frame.
 */
const FROND_Z: number[] = [];
const FROND_Y: number[] = [];
{
  const m = new THREE.Matrix4();
  const e = new THREE.Euler();
  const v = new THREE.Vector3();
  for (let i = 0; i < 4; i++) {
    m.makeRotationFromEuler(e.set(0.5, (i / 4) * Math.PI * 2, 0.6));
    v.set(0, 0, 1).applyMatrix4(m);
    FROND_Z.push(v.x, v.y, v.z);
    v.set(0, 1, 0).applyMatrix4(m);
    FROND_Y.push(v.x, v.y, v.z);
  }
}

const _pa = new THREE.Vector3();
const _ps = new THREE.Vector3();
/** The half-frond being drawn: its long (Z) and wide (Y) axes in the debris frame, and its bow. */
const PF_ = { zx: 0, zy: 0, zz: 1, yx: 0, yy: 1, yz: 0, bow: 0 };
/** Point `a` metres out along the current half-frond, `w` across it (bowed), from the crown (scratch vector). */
function frondPt(f: PixelFigure, g: THREE.Object3D, a: number, w: number): THREE.Vector3 {
  const q = w + PF_.bow * a * a * 2;
  return f.at(g, PF_.zx * a + PF_.yx * q, PF_.zy * a + PF_.yy * q, 1.2 + PF_.zz * a + PF_.yz * q);
}
const _pe = new THREE.Vector3();

/**
 * The Tyrant's snapped palm: eight half-fronds (the 3D's four boards through the
 * crown) as long arching fronds — a dark leafy backing in the board's plane, a
 * comb of lit leaflets swept toward the tip on one side and darker ones on the
 * other, a pale rachis — in the stage's palm palette (FLORA's d3 greens, lit, so
 * the storm's night ramp applies); a trunk of irregular width with overlapping
 * chevron leaf scars, a ragged boot of dead frond bases under the crown, and a
 * splintered snapped foot of pale fibrous wood.
 */
function palm(f: PixelFigure, g: THREE.Object3D, M: TM, s: number, st: ThrownState) {
  const t = st.time;
  f.layer(0.012 * s, PART.TORSO);
  for (let i = 0; i < 8; i++) {
    const j = (i >> 1) * 3;
    const sg = i & 1 ? -1 : 1;
    const zx = FROND_Z[j] * sg;
    const zy = FROND_Z[j + 1] * sg;
    const zz = FROND_Z[j + 2] * sg;
    const yx = FROND_Y[j];
    const yy = FROND_Y[j + 1];
    const yz = FROND_Y[j + 2];
    // Arch: the frond bows in its own plane (along its board's width) and sways.
    PF_.zx = zx;
    PF_.zy = zy;
    PF_.zz = zz;
    PF_.yx = yx;
    PF_.yy = yy;
    PF_.yz = yz;
    PF_.bow = 0.09 * (i & 2 ? -1 : 1) + Math.sin(t * 5 + i * 1.7) * 0.03;
    const P = frondPt;
    const back = i & 2 ? M.frondDark : M.frond;
    // Dark leafy backing (narrower than the board: the comb sticks out past it).
    f.tri(P(f, g, 0.03, 0.1), P(f, g, 0.03, -0.1), P(f, g, 0.4, -0.2), M.frondDark, 0.01);
    f.tri(P(f, g, 0.03, 0.1), P(f, g, 0.4, -0.2), P(f, g, 0.4, 0.2), M.frondDark, 0.01);
    f.tri(P(f, g, 0.4, 0.2), P(f, g, 0.4, -0.2), P(f, g, 0.72, 0), M.frondDark, 0.01);
    // Comb of leaflets: one side lit hanging forward, the other darker, swept toward the tip.
    for (let q = 0; q < 3; q++) {
      const a = 0.14 + q * 0.18;
      const w = 0.27 * (1 - 0.1 * q * q);
      f.cone(P(f, g, a, 0), P(f, g, a + 0.15, w), 0.034 * s, 0.008 * s, back).tone(0.06).min(0.5);
      f.cone(P(f, g, a + 0.06, 0), P(f, g, a + 0.19, -w * 0.95), 0.03 * s, 0.008 * s, M.frondDark).tone(-0.1).min(0.5);
    }
    // Pale rachis.
    f.decal(P(f, g, 0.02, 0), P(f, g, 0.7, 0), 0.014 * s, 0.006 * s, M.frond).flag(PF.FLAT | PF.SHADE_ONLY | PF.NO_OUTLINE).tone(0.32).min(0.5);
  }
  // Trunk: irregular width (a few bulges), chevron leaf scars stacked up it.
  f.layer(0.03 * s, PART.TORSO);
  const z0 = -1.18;
  const z1 = 1.12;
  // (The snapped foot ends flat, like the 3D trunk: an exact cylinder there.)
  const foot = cylinder(f, f.at(g, 0, 0, -1.2), f.at(g, 0, 0, -0.3), 0.245 * s, M.bark, M.splinter, 0.8);
  f.cone(f.at(g, 0, 0, -0.32), f.at(g, 0.01, 0, 0.45), 0.235 * s, 0.215 * s, M.bark);
  f.cone(f.at(g, 0.01, 0, 0.45), f.at(g, 0, 0, z1), 0.222 * s, 0.2 * s, M.bark);
  // Side direction across the trunk as seen (for the scars).
  _pa.copy(f.dir(g, 0, 0, 1));
  _pe.subVectors(f.eye, f.at(g, 0, 0, 0));
  _ps.crossVectors(_pa, _pe);
  if (_ps.lengthSq() < 1e-8) _ps.set(1, 0, 0);
  _ps.normalize();
  for (let k = 0; k < 8; k++) {
    const z = z0 + 0.22 + k * 0.27 + (k & 1 ? 0.06 : 0);
    const r = 0.25 - (k / 8) * 0.045;
    const c = f.at(g, (k & 1 ? 0.03 : -0.03), 0, z);
    const apex = f.add(f.at(g, 0, 0, z + 0.1), _ps, (k & 1 ? 0.04 : -0.04) * r);
    const fl = PF.FLAT | PF.SHADE_ONLY | PF.NO_OUTLINE;
    f.decal(f.add(c, _ps, -r * 0.88), apex, 0.016 * s, 0.016 * s, M.bark).flag(fl).tone(-0.36).min(0.5);
    f.decal(apex, f.add(c, _ps, r * 0.88), 0.016 * s, 0.016 * s, M.bark).flag(fl).tone(-0.36).min(0.5);
    if (k & 1) f.decal(f.add(f.at(g, 0, 0, z + 0.05), _ps, -r * 0.6), f.add(f.at(g, 0, 0, z + 0.14), _ps, r * 0.1), 0.012 * s, 0.012 * s, M.bark).flag(fl).tone(0.2).min(0.5);
  }
  // A ragged boot of dead frond bases under the crown.
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + 0.6;
    f.cone(f.at(g, Math.cos(a) * 0.12, Math.sin(a) * 0.12, z1 - 0.05), f.at(g, Math.cos(a) * 0.3, Math.sin(a) * 0.3, z1 - 0.22), 0.06 * s, 0.015 * s, M.husk).min(0.5);
  }
  // Splintered snapped foot: pale fibrous wood (the end grain when it faces us), spikes of it standing out.
  if (foot < 0) {
    for (let k = 0; k < 3; k++) {
      const a = k * 2.1 + st.seed * 3;
      line(f, g, Math.cos(a) * 0.04, Math.sin(a) * 0.04, -1.21, Math.cos(a) * 0.2, Math.sin(a) * 0.2, -1.21, 0.012, -0.35, M.splinter);
    }
  }
  f.layer(0.006 * s, PART.TORSO);
  for (let k = 0; k < 7; k++) {
    const a = (k / 7) * Math.PI * 2 + 0.4;
    const l = 0.08 + 0.14 * hash01(k + st.seed * 7);
    const r0 = 0.19 + 0.04 * hash01(k * 3 + st.seed);
    f.cone(f.at(g, Math.cos(a) * r0, Math.sin(a) * r0, -1.12), f.at(g, Math.cos(a) * (r0 - 0.03), Math.sin(a) * (r0 - 0.03), -1.2 - l), 0.055 * s, 0.006 * s, k & 1 ? M.splinter : M.bark)
      .tone(k & 1 ? 0 : 0.14)
      .min(0.5);
  }
}

// ── Wrecked panel (the Tyrant's debris) ──

/**
 * A wrecked park-jeep door: sun-faded beige paint gone to rust (blooms over the
 * faded red stripe, bare grey metal where paint flaked off), dents, the window
 * smashed out to a dark hole with shards left in its corners, the front edge
 * torn jagged, a hinge with a bent strap dangling off the back edge.
 */
function panel(f: PixelFigure, g: THREE.Object3D, M: TM, s: number, st: ThrownState) {
  const t = st.time;
  // Dangling hinge strap (behind the panel's layer).
  f.layer(0.004 * s, PART.TORSO);
  const sw = Math.sin(t * 7 + st.seed * 5) * 0.06;
  f.cone(f.at(g, -0.68, 0.3, 0), f.at(g, -0.78, 0.18, 0.02), 0.025 * s, 0.022 * s, M.steelDark).min(0.6);
  f.cone(f.at(g, -0.78, 0.18, 0.02), f.at(g, -0.86 + sw, 0.0, 0.04), 0.022 * s, 0.018 * s, M.rust).min(0.6);
  f.layer(0.006 * s, PART.TORSO);
  box(f, g, 0, 0, 0, 0.65, 0.5, 0.05, M.panel, 0.01, 1.2);
  // Torn front edge: jagged metal sticking out past the frame, hinge knuckles at the back.
  f.cone(f.at(g, 0.66, -0.48, 0), f.at(g, 0.66, 0.46, 0), 0.03 * s, 0.025 * s, M.panel).rag(0.03, PF.SPIKY).seed(st.seed * 9);
  for (let k = -1; k <= 1; k += 2) f.cone(f.at(g, -0.665, k * 0.3 - 0.05, 0), f.at(g, -0.665, k * 0.3 + 0.05, 0), 0.035 * s, 0.035 * s, M.steelDark).min(0.6);
  for (let k = 0; k < 2; k++) {
    if (!faceShown(4 + k, 0.15)) continue;
    const z = k === 0 ? 0.051 : -0.051;
    const d = k === 0 ? 1 : -1;
    // The faded stripe, rust blooming over it, bare metal where paint flaked.
    paint(f, g, -0.66, -0.2, z, 0.66, -0.2, z, 0.075, M.panelRed);
    paint(f, g, d * 0.42, -0.24, z, d * 0.5, -0.36, z, 0.07, M.rust);
    paint(f, g, d * -0.3, -0.16, z, d * -0.22, -0.1, z, 0.05, M.rust);
    paint(f, g, d * 0.05, -0.42, z, d * 0.25, -0.44, z, 0.045, M.rust);
    paint(f, g, d * -0.5, 0.0, z, d * -0.44, -0.08, z, 0.045, M.steel);
    paint(f, g, d * 0.3, 0.02, z, d * 0.36, 0.0, z, 0.03, M.steel);
    // The window smashed out: a dark hole, shards left in its corners.
    paint(f, g, -0.3, 0.25, z, 0.5, 0.25, z, 0.19, M.glass);
    paint(f, g, -0.42, 0.42, z, -0.3, 0.3, z, 0.035, M.glassHi);
    paint(f, g, 0.62, 0.1, z, 0.5, 0.18, z, 0.03, M.glassHi);
    paint(f, g, 0.6, 0.42, z, 0.52, 0.36, z, 0.025, M.glassHi);
    // Dents: a dark crease and its lit lip.
    line(f, g, d * -0.2, -0.35, z, d * 0.1, -0.28, z, 0.02, -0.32, M.panel);
    line(f, g, d * -0.2, -0.32, z, d * 0.1, -0.25, z, 0.01, 0.26, M.panel);
    line(f, g, d * 0.2, -0.05, z, d * 0.34, -0.15, z, 0.014, -0.3, M.panel);
    // Rust streaks running down from the rivets.
    for (let i = -2; i <= 2; i++) {
      paint(f, g, i * 0.27, -0.42, z, i * 0.27, -0.42, z, 0.012, M.steelDark);
      if (i & 1) paint(f, g, i * 0.27, -0.44, z, i * 0.27 + 0.01, -0.5, z, 0.01, M.rust);
    }
  }
}

// ── Burning branch (storm hazard) ──

function branch(f: PixelFigure, g: THREE.Object3D, M: TM, s: number, st: ThrownState) {
  const t = st.time;
  // Leafy clump round the crown end (the 3D cone: base at z 0.6, tip at z 1.8): bumpy
  // leaf masses, light over dark, pointed leaves sticking out of the outline.
  f.layer(0.06 * s, PART.TORSO);
  f.ellipsoid(g, 0, 0, 1.1, 0.42, 0.4, 0.55, M.frondDark).rag(0.045).seed(st.seed * 7);
  f.ellipsoid(g, 0.1, 0.13, 1.42, 0.3, 0.28, 0.36, M.frond).rag(0.04).seed(st.seed * 7 + 2);
  f.ellipsoid(g, -0.13, -0.06, 0.82, 0.3, 0.28, 0.3, M.frond).rag(0.035).seed(st.seed * 7 + 4).tone(-0.05);
  for (let k = 0; k < 7; k++) {
    const a = k * 2.4 + st.seed * 6;
    const z = 0.75 + k * 0.15;
    const r0 = 0.4 * (1 - (z - 0.6) / 1.4);
    f.cone(f.at(g, Math.cos(a) * r0 * 0.6, Math.sin(a) * r0 * 0.6, z), f.at(g, Math.cos(a) * (r0 + 0.16), Math.sin(a) * (r0 + 0.16), z + 0.12), 0.06 * s, 0.005 * s, k & 1 ? M.frond : M.frondDark)
      .tone(k & 1 ? 0.08 : 0)
      .min(0.5);
  }
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
  // Fire, kept inside the 3D glow sphere's reach (the bright part stays shootable): an
  // uneven ember bed, ragged tongues that flicker every redraw, each leaning its own way
  // back from the fall — deep red outside, orange, yellow inside — a licking flame or
  // two breaking off, and a small hot heart low in the bed (no round ball).
  f.layer(0.025 * s, PART.TORSO, 0, -0.3);
  const fire = f.at(g, 0, 0, -0.85);
  const fl = PF.GLOW | PF.NO_OUTLINE | PF.FLAT;
  const fr = Math.floor(t * 14);
  for (let i = 0; i < 3; i++) {
    const a = i * 2.2 + st.seed * 4;
    f.ball(screenOff(f, fire, Math.cos(a) * 0.07, Math.sin(a) * 0.05 - 0.02), (0.11 + 0.03 * hash01(i + fr * 0.13)) * s, i === 0 ? M.emberDeep : M.ember).flag(fl).z(0.01);
  }
  for (let i = 0; i < 6; i++) {
    const layer = i < 3 ? 0 : i < 5 ? 1 : 2;
    const h = hash01(i * 7.7 + fr * 0.37 + st.seed * 3);
    const len = (layer === 0 ? 0.24 + 0.08 * ((i * 5) % 3) : layer === 1 ? 0.18 : 0.12) * (0.65 + 0.55 * h);
    const sx = layer === 0 ? (i - 1) * 0.09 + 0.02 : layer === 1 ? (i - 3.5) * 0.08 : -0.01;
    const lean = (hash01(i * 3.3 + st.seed) - 0.5) * 0.16 + (h - 0.5) * 0.06;
    const tipP = behind(f, fire, st, len * 0.3, sx * 1.3 + lean, len);
    const mat = layer === 0 ? (i === 1 ? M.ember : M.emberDeep) : layer === 1 ? M.ember : M.flame;
    f.cone(screenOff(f, fire, sx * 0.6, 0.0), tipP, (layer === 0 ? 0.1 : layer === 1 ? 0.075 : 0.055) * s, 0.006 * s, mat)
      .flag(fl)
      .z(-0.012 * layer)
      .min(0.5);
  }
  // A lick of flame breaking off above the tongues.
  const lk = (t * 2.7 + st.seed) % 1;
  f.cone(behind(f, fire, st, 0.1, 0.05 - lk * 0.04, 0.26 + lk * 0.12), behind(f, fire, st, 0.12, 0.03 - lk * 0.04, 0.34 + lk * 0.14), 0.03 * s * (1 - lk), 0.005 * s, M.ember)
    .flag(fl)
    .min(0.5);
  f.cone(screenOff(f, fire, -0.03, -0.03), screenOff(f, fire, 0.02, 0.05), 0.045 * s, 0.03 * s, M.flameHot).flag(fl).z(-0.05).min(0.6);
  // A dark smoke wisp and a couple of embers trailing (low contrast: the fire stays the target).
  f.layer(0.004 * s, PART.TORSO, 0, 0.05);
  for (let i = 0; i < 2; i++) {
    const ph = (t * 1.2 + i * 0.5) % 1;
    f.ball(behind(f, fire, st, 0.35 + ph * 0.7, Math.sin(i * 2.3 + t) * 0.1, 0.12 + ph * 0.3), (0.08 + ph * 0.08) * s, M.smoke).flag(PF.NO_OUTLINE).tone(-0.1).min(0.6);
  }
  for (let i = 0; i < 2; i++) {
    const ph = (t * 2.1 + i * 0.5) % 1;
    f.ball(behind(f, fire, st, 0.2 + ph * 0.5, Math.sin(i * 4.1 + t * 3) * 0.18, ph * 0.25), 0.016 * s, M.ember).flag(PF.GLOW | PF.NO_OUTLINE).min(0.5);
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
