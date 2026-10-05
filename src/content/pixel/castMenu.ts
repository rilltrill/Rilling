import * as THREE from 'three';
import { PixelFigure } from '../../gameplay/pixel/figure';
import { PixelCast, type CastEnv } from '../../gameplay/pixel/PixelCast';
import type { HumanoidRig } from '../kit/humanoid';
import { humanLook, paintHuman, type HumanLook, type HumanPose } from './human';
import { buildPtero, buildTheropod, poseTheroLeg, type Palette, type PteroRig, type TheroRig, type TheroSpec } from '../enemies/dinoKit';
import { paintTheropod, theroMem, type TheroPose } from './theropod';
import { paintPtero } from './beasts';

/**
 * ─── PixelCast on the title screen ─────────────────────────────────────────
 *
 * The attract-mode backdrop (ui/MenuBackdrop) has no World and no SpriteArt,
 * so it gets this small stand-alone cast: actors are joint-only rigs (a zombie
 * horde, the raptor on its crag, pterosaurs round the volcano) posed by the
 * backdrop each frame and painted by the SAME painters as the game's cast
 * (`paintHuman`, `paintTheropod`, `paintPtero`) about 12×/s into small render
 * targets, shown as pixel-snapped billboards that write per-texel depth (so
 * the wreck and the crag still occlude them). It runs from the scene's
 * `onBeforeRender` (the renderer, camera and target of the shot's own draw),
 * restores the render target afterwards, allocates nothing per frame.
 */

const MENU_FPS = 12;
const MAX_PAINTS = 4;

const SHOW_VERT = /* glsl */ `
  uniform vec2 uTarget;
  uniform vec2 uPx;
  varying vec2 vUv;
  varying float vViewZ;
  varying vec2 vProj;
  void main() {
    vUv = uv;
    vec4 mv = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
    vViewZ = mv.z;
    vProj = vec2(projectionMatrix[2][2], projectionMatrix[3][2]);
    vec4 cc = projectionMatrix * mv;
    vec2 pc = (cc.xy / cc.w * 0.5 + 0.5) * uTarget;
    vec2 corner = floor(pc - 0.5 * uPx + 0.5);
    vec2 ndc = (corner + uv * uPx) / uTarget * 2.0 - 1.0;
    gl_Position = vec4(ndc * cc.w, cc.z, cc.w);
  }
`;

const SHOW_FRAG = /* glsl */ `
  precision highp float;
  uniform sampler2D map;
  uniform vec2 uSize;
  uniform vec2 uRt;
  uniform vec4 uDepth;
  uniform float uExp;
  varying vec2 vUv;
  varying float vViewZ;
  varying vec2 vProj;
  vec3 invAces(vec3 y) {
    const float a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14;
    y = clamp(y, 0.0, 0.985);
    vec3 A = a - c * y;
    vec3 B = b - d * y;
    vec3 C = -e * y;
    return (-B + sqrt(B * B - 4.0 * A * C)) / (2.0 * A);
  }
  void main() {
    vec2 t = min(floor(vUv * uSize), uSize - 1.0) + 0.5;
    vec4 c = texture2D(map, t / uRt);
    if (c.a < 0.5 / 255.0) discard;
    vec3 rgb = invAces(pow(c.rgb, vec3(2.2))) / uExp;
    float d = mix(uDepth.x, uDepth.y, (c.a * 255.0 - 1.0) / 254.0);
    float z = vViewZ - (d - uDepth.z) - uDepth.w;
    z = min(z, -0.06);
    gl_FragDepth = ((vProj.x * z + vProj.y) / -z) * 0.5 + 0.5;
    gl_FragColor = vec4(rgb, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

interface Actor {
  paint: (f: PixelFigure) => boolean;
  mesh: THREE.Mesh;
  mat: THREE.ShaderMaterial;
  rt: THREE.WebGLRenderTarget | null;
  next: number;
  k: number;
  ready: boolean;
  /** Texel rect + grid it was painted on. */
  tw: number;
  th: number;
  gw: number;
  gh: number;
}

/** Stage light for the cast of one shot (display space). */
export interface MenuLight {
  tint: THREE.Color;
  rim: THREE.Color;
  rimAmount: number;
}

const _v = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _buf = new THREE.Vector2();
const _c = new THREE.Color();

function sizeClass(n: number): number {
  let s = 16;
  while (s < n) s *= 2;
  return s;
}

/** Scene-linear → the display colour the tone-mapped frame shows (ACES × exposure, gamma). */
function toDisplay(c: THREE.Color, exposure: number, out: THREE.Color): THREE.Color {
  const f = (x: number) => {
    x *= exposure;
    const y = Math.min(1, Math.max(0, (x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14)));
    return Math.pow(y, 1 / 2.2);
  };
  return out.setRGB(f(c.r), f(c.g), f(c.b), THREE.LinearSRGBColorSpace);
}

export class MenuCast {
  readonly group = new THREE.Group();
  private actors: Actor[] = [];
  private cast: PixelCast | null = null;
  private renderer: THREE.WebGLRenderer | null = null;
  private f = new PixelFigure();
  private quad = new THREE.PlaneGeometry(1, 1);
  private showMat: THREE.ShaderMaterial;
  private targetU = { value: new THREE.Vector2(1, 1) };
  private expU = { value: 1 };
  private env: CastEnv = { tint: new THREE.Color(1, 1, 1), rim: new THREE.Color(0.55, 0.7, 1), rimAmount: 0, fog: new THREE.Color(), fogAmount: 0 };
  private targets: THREE.WebGLRenderTarget[] = [];
  /** Animation time (seconds) — painters animate secondary motion from it. */
  time = 0;
  /** Lightning (0..1): the cast lights up with the sky. */
  flash = 0;

  constructor(private light: MenuLight) {
    this.group.name = 'menu-cast';
    this.showMat = new THREE.ShaderMaterial({
      vertexShader: SHOW_VERT,
      fragmentShader: SHOW_FRAG,
      uniforms: {
        map: { value: null },
        uSize: { value: new THREE.Vector2(1, 1) },
        uRt: { value: new THREE.Vector2(1, 1) },
        uDepth: { value: new THREE.Vector4(1, 1, 1, 0) },
        uExp: this.expU,
        uTarget: this.targetU,
        uPx: { value: new THREE.Vector2(1, 1) },
      },
      fog: false,
    });
  }

  /** A painted actor: `paint` adds its primitives (from its posed rig) to the figure. */
  add(paint: (f: PixelFigure) => boolean) {
    const mat = this.showMat.clone();
    mat.uniforms.uTarget = this.targetU;
    mat.uniforms.uExp = this.expU;
    const mesh = new THREE.Mesh(this.quad, mat);
    mesh.matrixAutoUpdate = false;
    mesh.frustumCulled = false;
    mesh.visible = false;
    this.group.add(mesh);
    this.actors.push({ paint, mesh, mat, rt: null, next: 0, k: 1, ready: false, tw: 1, th: 1, gw: 1, gh: 1 });
  }

  /** Hook the cast into `scene` (painted right before each of its draws). */
  attach(scene: THREE.Scene) {
    scene.add(this.group);
    scene.onBeforeRender = (renderer, sc, camera, target) => {
      if (this.group.visible) this.render(renderer, camera as THREE.PerspectiveCamera, target as unknown as THREE.WebGLRenderTarget | null, sc as THREE.Scene);
    };
  }

  /** Re-paint every actor on the next draw (a shot starts, the art style changed). */
  invalidate() {
    for (const a of this.actors) {
      a.ready = false;
      a.mesh.visible = false;
    }
  }

  private render(renderer: THREE.WebGLRenderer, cam: THREE.PerspectiveCamera, target: THREE.WebGLRenderTarget | null, scene: THREE.Scene) {
    if (!this.cast || this.renderer !== renderer) {
      this.cast?.dispose();
      this.cast = new PixelCast(renderer);
      this.renderer = renderer;
    }
    // Retro grid: the low-res target the shot draws into, or ~300 lines of the canvas.
    let gw: number;
    let gh: number;
    let tw: number;
    let th: number;
    if (target) {
      gw = tw = target.width;
      gh = th = target.height;
    } else {
      renderer.getDrawingBufferSize(_buf);
      tw = _buf.x;
      th = _buf.y;
      const k = Math.max(1, Math.round(th / 300));
      gw = Math.round(tw / k);
      gh = Math.round(th / k);
    }
    this.targetU.value.set(tw, th);
    this.expU.value = renderer.toneMappingExposure;
    cam.updateMatrixWorld();
    // Light, rim and fog for this frame.
    const L = this.light;
    const fl = 1 + this.flash * 0.9;
    this.env.tint.copy(L.tint).multiplyScalar(fl);
    this.env.rim.copy(L.rim);
    this.env.rimAmount = L.rimAmount;
    const fog = scene.fog as THREE.FogExp2 | null;
    if (fog) toDisplay(fog.color, this.expU.value, this.env.fog);
    let paints = 0;
    const prev = renderer.getRenderTarget();
    const prevAlpha = renderer.getClearAlpha();
    renderer.getClearColor(_c);
    try {
      for (let i = 0; i < this.actors.length; i++) {
        const a = this.actors[i];
        const due = !a.ready || this.time >= a.next || a.gh !== gh || a.gw !== gw;
        if (!due || (paints >= MAX_PAINTS && a.ready)) continue;
        a.next = Math.max(a.next + 1 / MENU_FPS, this.time + 0.5 / MENU_FPS);
        if (this.paintOne(a, cam, gw, gh, fog)) paints++;
      }
    } finally {
      renderer.setRenderTarget(prev);
      renderer.setClearColor(_c, prevAlpha);
    }
    for (let i = 0; i < this.actors.length; i++) {
      const a = this.actors[i];
      if (!a.ready) continue;
      (a.mat.uniforms.uPx.value as THREE.Vector2).set((a.tw * a.k * tw) / a.gw, (a.th * a.k * th) / a.gh);
    }
  }

  private paintOne(a: Actor, cam: THREE.PerspectiveCamera, gw: number, gh: number, fog: THREE.FogExp2 | null): boolean {
    const f = this.f;
    f.begin(cam, gw, gh);
    f.time = this.time;
    f.night = 0.5;
    f.kHint = a.k;
    if (!a.paint(f) || f.count === 0 || f.minDepth < cam.near * 1.5 || !f.layout(a.k, 24, 256)) {
      a.ready = false;
      a.mesh.visible = false;
      return false;
    }
    a.k = f.kpx;
    const W = f.W;
    const H = f.H;
    const cw = sizeClass(W);
    const ch = sizeClass(H);
    // Reuse the target while it holds the sprite and isn't 4× too big (no thrash at a size-class edge).
    if (!a.rt || a.rt.width < cw || a.rt.height < ch || a.rt.width * a.rt.height > cw * ch * 4) {
      if (a.rt) {
        this.targets.splice(this.targets.indexOf(a.rt), 1);
        a.rt.dispose();
      }
      a.rt = new THREE.WebGLRenderTarget(cw, ch, {
        type: THREE.UnsignedByteType,
        minFilter: THREE.NearestFilter,
        magFilter: THREE.NearestFilter,
        depthBuffer: false,
        stencilBuffer: false,
        generateMipmaps: false,
      });
      a.rt.scissorTest = true;
      this.targets.push(a.rt);
    }
    // Fog at the actor's distance (painted sprites get half, as in the game).
    this.env.fogAmount = 0;
    if (fog) {
      _v.copy(f.foot.min).add(f.foot.max).multiplyScalar(0.5);
      const dd = fog.density * f.depth(_v);
      this.env.fogAmount = (1 - Math.exp(-dd * dd)) * 0.5;
    }
    this.renderer!.setClearColor(0x000000, 0);
    this.cast!.paint(f, a.rt, this.env);
    // Billboard over the texel rectangle at the figure's nearest depth.
    const P = cam.projectionMatrix.elements;
    const k = f.kpx;
    const rx0 = (f.ox / gw) * 2 - 1;
    const ry0 = (f.oy / gh) * 2 - 1;
    const rx1 = ((f.ox + W * k) / gw) * 2 - 1;
    const ry1 = ((f.oy + H * k) / gh) * 2 - 1;
    const D = Math.max(f.d0, cam.near * 4);
    const m = a.mesh;
    m.position.set((((rx0 + rx1) / 2 + P[8]) * D) / P[0], (((ry0 + ry1) / 2 + P[9]) * D) / P[5], -D).applyMatrix4(cam.matrixWorld);
    m.quaternion.copy(cam.getWorldQuaternion(_q));
    m.scale.set(((rx1 - rx0) * D) / P[0], ((ry1 - ry0) * D) / P[5], 1);
    m.updateMatrix();
    m.matrixWorld.copy(m.matrix);
    m.visible = true;
    const u = a.mat.uniforms;
    u.map.value = a.rt.texture;
    (u.uSize.value as THREE.Vector2).set(W, H);
    (u.uRt.value as THREE.Vector2).set(a.rt.width, a.rt.height);
    (u.uDepth.value as THREE.Vector4).set(f.d0, f.d1, D, ((f.d1 - f.d0) / 254) * 0.5 + 0.015);
    a.tw = W;
    a.th = H;
    a.gw = gw;
    a.gh = gh;
    a.ready = true;
    return true;
  }

  dispose() {
    for (const rt of this.targets) rt.dispose();
    this.targets.length = 0;
    for (const a of this.actors) a.mat.dispose();
    this.showMat.dispose();
    this.quad.dispose();
    this.cast?.dispose();
    this.cast = null;
  }
}

// ─── Actors ──────────────────────────────────────────────────────────────────

/** A joint-only humanoid skeleton (the `buildHumanoid` pivots, no meshes): what `paintHuman` reads. */
export function menuHumanoid(bulk = 1, armLen = 1): HumanoidRig {
  const g = (parent: THREE.Object3D | null, x: number, y: number, z: number) => {
    const o = new THREE.Group();
    o.position.set(x, y, z);
    parent?.add(o);
    return o;
  };
  const root = g(null, 0, 0, 0);
  const hips = g(root, 0, 0.95, 0);
  const leg = (side: number) => {
    const hip = g(hips, side * 0.1 * bulk, -0.06, 0);
    const knee = g(hip, 0, -0.44, 0);
    return { hip, knee } as unknown as HumanoidRig['legL'];
  };
  const spine = g(hips, 0, 0.06, 0);
  const chest = g(spine, 0, 0.44, 0);
  const neck = g(chest, 0, 0.04, 0);
  const head = g(neck, 0, 0.07, 0);
  const arm = (side: number) => {
    const shoulder = g(chest, side * (0.2 * bulk + 0.04), -0.04, 0);
    shoulder.rotation.z = side * 0.08;
    const elbow = g(shoulder, 0, -0.3 * armLen, 0);
    return { shoulder, elbow } as unknown as HumanoidRig['armL'];
  };
  return {
    root,
    hips,
    spine,
    chest,
    neck,
    head,
    armL: arm(1),
    armR: arm(-1),
    legL: leg(1),
    legR: leg(-1),
  } as unknown as HumanoidRig;
}

/** The title-screen horde: nine dead in work clothes, nightwear and uniforms. */
export const MENU_HORDE: readonly Partial<HumanLook>[] = [
  { outfit: 'office', skin: 0x9aa88a, shirt: 0xd8d4c8, sleeveColor: 0xd8d4c8, jacket: 0x2a2e3a, tie: 0x8a1a1a, pants: 0x2a2e3a, pantsPat: 'cloth', hair: 0x2a2018, chestBlood: true, rags: 1, bite: 1 },
  { outfit: 'worker', skin: 0x8e9c7c, shirt: 0x5a5e66, sleeveColor: 0x5a5e66, vest: 0xd8f020, hat: 0xe0b020, pants: 0x2e3d5c, hair: null, armWound: 1 },
  { outfit: 'nurse', skin: 0xb4b89c, shirt: 0x5aa8a0, sleeveColor: 0x5aa8a0, sleeves: 'short', pants: 0x5aa8a0, pantsPat: 'cloth', hair: 0x6a4a2a, longHair: true, chestBlood: true, bellyWound: 1 },
  { outfit: 'cop', skin: 0x8c9478, shirt: 0x1e2a4a, sleeveColor: 0x1e2a4a, hat: 0x1a2238, badge: 0xd8b040, belt: 0x161414, pants: 0x1a2238, pantsPat: 'cloth', hair: 0x1a1414, faceWound: 1 },
  { outfit: 'flannel', skin: 0xa0aa86, shirt: 0x8a2a24, sleeveColor: 0x8a2a24, shirtPat: 'plaid', inner: 0xd8d0c0, pants: 0x34486a, hair: 0x5a3a20, beard: 0x4a3018, rags: 2, ribs: 1 },
  { outfit: 'biker', skin: 0x949e84, shirt: 0x2a2a2c, sleeveColor: 0x1a1a1c, jacket: 0x1a1a1c, shirtPat: 'leather', pants: 0x2a3a58, hair: 0x1a1410, legWound: 1 },
  { outfit: 'soldier', skin: 0x8a967a, shirt: 0x5a6a3a, sleeveColor: 0x5a6a3a, shirtPat: 'camo', pants: 0x5a6a3a, pantsPat: 'camo', hat: 0x4a5a30, belt: 0x2a2418, hair: null, chestBlood: true },
  { outfit: 'patient', skin: 0xb8bca4, shirt: 0xa8c0d0, sleeveColor: 0xa8c0d0, sleeves: 'short', shirtPat: 'gown', pants: 0xb8bca4, pantsPat: 'gown', bareLegs: true, hair: 0x8a8070, rags: 2, bellyWound: 1 },
  { outfit: 'doctor', skin: 0x9ca48c, shirt: 0x3a6ab0, sleeveColor: 0xe8e8e0, jacket: 0xe8e8e0, tie: 0x1a2a4a, pants: 0x3a3e48, pantsPat: 'cloth', hair: 0x3a3028, chestBlood: true, armWound: 1 },
];

export interface MenuZombie {
  rig: HumanoidRig;
  look: HumanLook;
  pose: HumanPose;
}

export function menuZombie(i: number): MenuZombie {
  const o = MENU_HORDE[i % MENU_HORDE.length];
  const look = humanLook({ dead: true, eyes: 0xc4d878, blood: 0x6a0c0c, mouthOpen: true, drool: (i & 1) === 0, seed: 101 + i * 37, ...o });
  return {
    rig: menuHumanoid(o.outfit === 'soldier' ? 1.1 : 1, 1.04),
    look,
    pose: { severed: [0, 0], headless: false, jaw: 0.3, face: 'zombie', squash: 0, time: 0, speed: 0, smear: 0 },
  };
}

/**
 * Pose a menu zombie's rig (a shamble or an idle sway, arms reaching), place it,
 * and update its matrices (the rig is not in any scene).
 */
export function poseMenuZombie(z: MenuZombie, x: number, zz: number, yaw: number, scale: number, ph: number, walking: boolean, reach: number, lean: number) {
  const r = z.rig;
  const bob = walking ? Math.abs(Math.cos(ph)) * 0.04 : 0;
  r.root.position.set(x, 0, zz);
  r.root.rotation.set(0, yaw + Math.sin(ph * 0.5) * 0.08, 0);
  r.root.scale.setScalar(scale);
  r.hips.position.y = 0.95 - bob;
  r.hips.rotation.z = walking ? Math.sin(ph) * 0.06 : Math.sin(ph * 0.7) * 0.04;
  r.spine.rotation.x = lean + (walking ? 0.05 : Math.sin(ph * 0.5) * 0.04);
  r.spine.rotation.z = walking ? Math.sin(ph) * 0.05 : Math.sin(ph * 0.7) * 0.05;
  r.head.rotation.x = 0.12 + Math.sin(ph * 0.6) * 0.06;
  r.head.rotation.z = Math.sin(ph * 0.45 + 1) * 0.16;
  r.head.rotation.y = Math.sin(ph * 0.3) * 0.12;
  for (let side = 0; side < 2; side++) {
    const sgn = side === 0 ? 1 : -1;
    const leg = side === 0 ? r.legL : r.legR;
    const sw = walking ? Math.sin(ph + side * Math.PI) * 0.34 : 0.02 * sgn;
    leg.hip.rotation.x = sw;
    leg.knee.rotation.x = walking ? Math.max(0, -Math.cos(ph + side * Math.PI)) * 0.5 + 0.05 : 0.06;
    const arm = side === 0 ? r.armL : r.armR;
    arm.shoulder.rotation.x = -reach + Math.sin(ph * (walking ? 1 : 0.6) + side * 1.7) * (walking ? 0.12 : 0.08);
    arm.shoulder.rotation.z = sgn * (0.12 + (walking ? 0.05 : 0.02));
    arm.elbow.rotation.x = -0.25 - Math.max(0, Math.sin(ph * 0.8 + side)) * 0.2;
  }
  r.root.updateMatrixWorld(true);
  const p = z.pose;
  p.time = ph;
  p.speed = walking ? 0.8 : 0;
  p.jaw = 0.12 + 0.3 * Math.max(0, Math.sin(ph * 0.9 + scale * 7)) + 0.06 * Math.max(0, Math.sin(ph * 9));
}

export function paintMenuZombie(f: PixelFigure, z: MenuZombie): boolean {
  return paintHuman(f, z.rig, z.look, z.pose);
}

/** The crag raptor: the game's raptor build in a dusk palette. */
const MENU_RAPTOR_PAL: Palette = {
  key: 'menu',
  base: 0x8a6a42,
  back: 0x4e3824,
  belly: 0xc8b088,
  stripe: 0x3a2614,
  accent: 0xc0501e,
  accent2: 0x6a2a10,
  claw: 0x1e1812,
  teeth: 0xf2ead2,
  mouth: 0x7a2424,
  eye: 0xffd040,
};

export const MENU_RAPTOR_SPEC: TheroSpec = {
  key: 'raptor',
  pal: MENU_RAPTOR_PAL,
  hipGap: 0.16,
  thigh: 0.46,
  shin: 0.52,
  meta: 0.3,
  toe: 0.2,
  legR: 1.15,
  footH: 0.045,
  hips: [0.23, 0.29, 0.38],
  torso: { len: 0.8, r0: [0.24, 0.31], r1: [0.19, 0.25], rise: 0.12 },
  neck: { lens: [0.34, 0.27], r0: [0.125, 0.145], r1: [0.092, 0.11], rest: [-1.0, 0.55] },
  headRest: 0.5,
  skull: { len: 0.22, r: [0.112, 0.125] },
  snout: { len: 0.36, r1: [0.05, 0.055], drop: 0.03 },
  jaw: { len: 0.53, r0: [0.085, 0.05], r1: [0.038, 0.028] },
  tail: { lens: [0.42, 0.4, 0.36, 0.34], r0: [0.18, 0.21], taper: 0.66, rest: [-0.03, -0.02, 0, 0.02] },
  arm: { upper: 0.22, fore: 0.24, r: 0.05, claw: 0.1 },
  stripes: 2.3,
  teeth: 8,
  sickle: true,
  quills: 1.1,
  eyeSize: 0.038,
  texDensity: 1.3,
};

export interface MenuRaptor {
  model: THREE.Group;
  rig: TheroRig;
  pose: TheroPose;
}

export function menuRaptor(): MenuRaptor {
  const model = new THREE.Group();
  const rig = buildTheropod(model, MENU_RAPTOR_SPEC);
  for (const leg of rig.legs) poseTheroLeg(MENU_RAPTOR_SPEC, leg, 0, 0, 0, 0);
  return { model, rig, pose: { jaw: 0, squash: 0, time: 0, quills: MENU_RAPTOR_SPEC.quills, sickle: true, breath: 1, mem: theroMem(), dorsal: 1 } };
}

/**
 * Pose the crag raptor like the 3D one (breathing, tail sway, looking round,
 * the screech `sc` 0..1 thrusting the head up with the jaws wide).
 */
export function poseMenuRaptor(R: MenuRaptor, x: number, y: number, z: number, scale: number, t: number, sc: number) {
  const r = R.rig;
  const s = MENU_RAPTOR_SPEC;
  R.model.position.set(x, y, z);
  R.model.rotation.set(0, -1.7 + Math.sin(t * 0.4) * 0.08, 0);
  R.model.scale.setScalar(scale);
  r.pelvis.rotation.x = -0.06 + Math.sin(t * 2.2) * 0.02 - sc * 0.14;
  r.torso.scale.set(1 + Math.sin(t * 2.2) * 0.02, 1 + Math.sin(t * 2.2) * 0.03, 1);
  r.neck[0].rotation.x = s.neck.rest[0] - sc * 0.3 + Math.sin(t * 1.1) * 0.05;
  r.neck[0].rotation.y = 0.45 * Math.sin(t * 0.6) * (1 - sc) + sc * 0.3;
  if (r.neck[1]) r.neck[1].rotation.x = s.neck.rest[1] - sc * 0.2;
  r.head.rotation.x = s.headRest - sc * 0.45;
  r.head.rotation.z = Math.sin(t * 3.3) * 0.08 * (1 - sc);
  if (r.jaw) r.jaw.rotation.x = sc * 0.75 + Math.max(0, Math.sin(t * 9)) * 0.08 * sc;
  for (let i = 0; i < r.tail.length; i++) {
    r.tail[i].rotation.y = Math.sin(t * 1.4 - i * 0.6) * (0.12 + i * 0.05);
    r.tail[i].rotation.x = (s.tail.rest[i] ?? 0) + (i === 0 ? 0.08 + Math.sin(t * 0.9) * 0.04 : 0);
  }
  R.model.updateMatrixWorld(true);
  const p = R.pose;
  p.time = t;
  p.jaw = sc;
  p.breath = r.torso.scale.y;
}

export function paintMenuRaptor(f: PixelFigure, R: MenuRaptor): boolean {
  return paintTheropod(f, R.rig, MENU_RAPTOR_SPEC, R.pose);
}

/** Pterosaurs circling the volcano: dusk silhouettes with the game's ptero build. */
const MENU_PTERO_PAL: Palette = {
  key: 'menu',
  base: 0x5c4c40,
  back: 0x2e2620,
  belly: 0xa08a6c,
  stripe: 0x241c16,
  accent: 0xc0461c,
  accent2: 0x6a1e10,
  claw: 0x1a1612,
  teeth: 0xe8dfc8,
  mouth: 0x6a2a26,
  eye: 0xffa030,
};

export interface MenuPtero {
  model: THREE.Group;
  rig: PteroRig;
}

export function menuPtero(): MenuPtero {
  const model = new THREE.Group();
  return { model, rig: buildPtero(model, MENU_PTERO_PAL) };
}

/** Place a circling pterosaur and flap its wings (`flap` = wing phase). */
export function poseMenuPtero(P: MenuPtero, pos: THREE.Vector3, yaw: number, bank: number, scale: number, flap: number) {
  const r = P.rig;
  P.model.position.copy(pos);
  P.model.rotation.set(0, yaw, bank);
  P.model.scale.setScalar(scale);
  const f = Math.sin(flap);
  const stroke = f > 0 ? f : f * 0.75;
  for (let i = 0; i < 2; i++) {
    const side = i === 0 ? 1 : -1;
    r.shoulders[i].rotation.z = side * (0.1 + stroke * 0.75);
    r.wrists[i].rotation.z = side * Math.sin(flap - 0.9) * 0.45;
  }
  r.body.position.y = -stroke * 0.09;
  P.model.updateMatrixWorld(true);
}

export function paintMenuPtero(f: PixelFigure, P: MenuPtero): boolean {
  return paintPtero(f, P.rig, MENU_PTERO_PAL);
}
