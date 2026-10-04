import * as THREE from 'three';
import type { World } from './World';
import type { Entity } from './Entity';
import { Enemy } from './Enemy';
import { Civilian } from './Civilian';
import { Projectile } from './Projectile';
import { Pickup } from './Pickup';

/**
 * ART: SPRITES — every character (enemies, bosses, civilians) is drawn as a
 * 2D pixel-art sprite, like the pre-rendered sprites of 90s light-gun games.
 *
 * Live impostors: about 12 times a second (round-robin, capped per frame) each
 * visible character is re-rendered from the main camera into a small offscreen
 * image — a crop of the main camera's projection around its on-screen bounds,
 * lit by mirrors of the stage's own lights and fog — at ~1.5 retro screen pixels
 * per texel. A bake pass turns that into pixel art (crisp alpha, a 1-px dark
 * outline, luminance posterisation with ordered dithering, a restricted colour
 * palette) and packs each texel's depth into its alpha, so the screen-aligned
 * billboard that shows it writes per-pixel depth: scenery occludes sprites (and
 * sprites each other) exactly like the 3D models would.
 *
 * Gameplay is untouched: the real 3D models keep updating, animating and being
 * raycast (hitboxes, aim assist, AutoPlayer, the simulator); they are only hidden
 * for the main camera's draw (`beginFrame` … render … `endFrame`).
 */

/** Sprite animation rate (bakes per character per second of game time). */
export const SPRITE_FPS = 12;
/** Most character re-renders in one frame (never-drawn characters may exceed it). */
const MAX_BAKES_PER_FRAME = 6;
const MAX_FIRST_BAKES = 18;
/** Retro screen pixels per sprite texel (chunkiness), before the size caps. */
const PX_PER_TEXEL = 1.5;
/** Sprite size caps in texels (beyond them texels grow: close-ups get chunkier). */
const MAX_TEX = 224;
const MAX_TEX_BOSS = 448;
/** Scratch target (raw bake: HDR colour + depth). Must hold the biggest sprite. */
const SCRATCH = 512;
/** NDC margin kept beyond the screen edge, so a sprite moving in between bakes doesn't show a cut edge. */
const EDGE = 0.12;
/** Encoded colour range (linear HDR / RANGE is stored gamma-encoded in 8 bits). */
const RANGE = 2;

const _box = new THREE.Box3();
const _mb = new THREE.Box3();
const _v = new THREE.Vector3();
const _c = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _crop = new THREE.Matrix4();
const _clear = new THREE.Color();

/** Tunable look (exposed for the debug console / A-B tests). */
export interface SpriteLook {
  /** Posterised shading: luminance bands per stop of exposure. 0 = off. */
  bands: number;
  /** Ordered-dither strength between bands (0..1). */
  dither: number;
  /** Per-channel colour levels (restricted palette). 0 = off. */
  levels: number;
  /** Outline darkness (0 = black, 1 = neighbour colour). */
  outline: number;
  /** 1 = the outline is the silhouette's own edge texels (no bloat), 0 = drawn around it, 2 = auto by size. */
  outlineIn: number;
  /** Inner contour lines where a part stands in front of another (0 = off, 1 = as dark as the outline). */
  inner: number;
  /** Silhouette rim: top edges brighten, bottom edges darken (0 = off). */
  rim: number;
  /** Saturation multiplier (pixel-art palettes are punchier). */
  saturation: number;
  pxPerTexel: number;
  /** Supersampling (1 or 2): bake at 2× and filter down, like pre-rendered sprites. */
  ss: number;
  /** Blob shadow strength under sprites (0 = off). */
  shadows: number;
}

export const DEFAULT_LOOK: SpriteLook = { bands: 2, dither: 0, levels: 0, outline: 0.16, outlineIn: 2, inner: 0.6, rim: 0.25, saturation: 1.1, pxPerTexel: PX_PER_TEXEL, ss: 2, shadows: 1 };

/** Parse `bands:8,dither:0.3,k:1` (debug URL `&spriteLook=`) over a look. */
export function parseLook(spec: string | null | undefined, base: SpriteLook = DEFAULT_LOOK): SpriteLook {
  const out = { ...base };
  if (!spec) return out;
  for (const part of spec.split(',')) {
    const [k, v] = part.split(':');
    const n = Number(v);
    if (!Number.isFinite(n)) continue;
    const key = (k === 'k' ? 'pxPerTexel' : k === 'sat' ? 'saturation' : k) as keyof SpriteLook;
    if (key in out) out[key] = n;
  }
  return out;
}

const FULL_VERT = /* glsl */ `
  void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

/** Raw bake → pixel-art sprite texel (colour gamma-encoded; alpha = 0 empty, else packed depth). */
const BAKE_FRAG = /* glsl */ `
  precision highp float;
  uniform sampler2D tColor;
  uniform sampler2D tDepth;
  uniform vec2 uSize;        // sprite size in texels
  uniform int uSS;           // supersampling: raw texels per sprite texel (per axis)
  uniform vec2 uDepthRange;  // view distance mapped to alpha 1/255 … 1
  uniform vec2 uProj;        // projection elements [10], [14] (depth → view distance)
  uniform float uBands;
  uniform float uDither;
  uniform float uLevels;
  uniform float uOutline;
  uniform float uOutlineIn;  // 1 = outline drawn on the silhouette's own edge texels (no bloat)
  uniform float uInner;
  uniform float uRim;
  uniform float uSat;
  uniform float uRange;

  float bayer4(ivec2 p) {
    int i = (p.x & 3) + (p.y & 3) * 4;
    int m[16] = int[16](0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5);
    return (float(m[i]) + 0.5) / 16.0 - 0.5;
  }
  float dist(ivec2 q) {
    float z = texelFetch(tDepth, q, 0).r * 2.0 - 1.0;
    return uProj.y / (z + uProj.x);
  }
  // One sprite texel: mean colour of the covered raw samples, coverage, nearest depth.
  vec4 px(ivec2 p, out float d) {
    d = 1e9;
    if (p.x < 0 || p.y < 0 || p.x >= int(uSize.x) || p.y >= int(uSize.y)) return vec4(0.0);
    vec3 sum = vec3(0.0);
    float a = 0.0;
    for (int j = 0; j < 2; j++) {
      for (int i = 0; i < 2; i++) {
        if (i >= uSS || j >= uSS) continue;
        ivec2 q = p * uSS + ivec2(i, j);
        vec4 c = texelFetch(tColor, q, 0);
        if (c.a >= 0.5) {
          sum += c.rgb;
          a += 1.0;
          d = min(d, dist(q));
        }
      }
    }
    return vec4(a > 0.0 ? sum / a : vec3(0.0), a / float(uSS * uSS));
  }
  float packDepth(float d) {
    float t = clamp((d - uDepthRange.x) / max(uDepthRange.y - uDepthRange.x, 1e-4), 0.0, 1.0);
    return (1.0 + floor(t * 254.0 + 0.5)) / 255.0;
  }
  vec3 encode(vec3 c) { return pow(clamp(c / uRange, 0.0, 1.0), vec3(1.0 / 2.2)); }

  void main() {
    ivec2 p = ivec2(gl_FragCoord.xy);
    float dC, dR, dL, dU, dD;
    vec4 c = px(p, dC);
    vec4 nR = px(p + ivec2(1, 0), dR);
    vec4 nL = px(p - ivec2(1, 0), dL);
    vec4 nU = px(p + ivec2(0, 1), dU);
    vec4 nD = px(p - ivec2(0, 1), dD);
    bool sR = nR.a >= 0.5, sL = nL.a >= 0.5, sU = nU.a >= 0.5, sD = nD.a >= 0.5;
    if (c.a < 0.5) {
      // 1-px outline around the silhouette, in a dark shade of what it borders.
      float n = float(sR) + float(sL) + float(sU) + float(sD);
      if (n < 0.5 || uOutlineIn > 0.5) {
        gl_FragColor = vec4(0.0);
        return;
      }
      vec3 edge = (nR.rgb * float(sR) + nL.rgb * float(sL) + nU.rgb * float(sU) + nD.rgb * float(sD)) / n;
      float d = min(min(sR ? dR : 1e9, sL ? dL : 1e9), min(sU ? dU : 1e9, sD ? dD : 1e9));
      float l = dot(edge, vec3(0.2126, 0.7152, 0.0722));
      edge = mix(vec3(l), edge, 0.6) * uOutline;
      gl_FragColor = vec4(encode(edge), packDepth(d));
      return;
    }
    vec3 rgb = c.rgb;
    float shade = 1.0;
    bool rim = !(sR && sL && sU && sD);
    if (uOutlineIn > 0.5 && rim) {
      // Inner outline: the silhouette's own edge texels, darkened (keeps gaps between limbs open).
      float l0 = dot(rgb, vec3(0.2126, 0.7152, 0.0722));
      rgb = mix(vec3(l0), rgb, 0.6) * uOutline;
      gl_FragColor = vec4(encode(rgb), packDepth(dC));
      return;
    }
    if (uInner > 0.0) {
      // Inner contours: a nearer part's edge against something well behind it.
      float gap = 0.12 + dC * 0.02;
      bool edge = (sR && dR - dC > gap) || (sL && dL - dC > gap) || (sU && dU - dC > gap) || (sD && dD - dC > gap);
      if (edge) shade = 1.0 - uInner * (1.0 - uOutline);
    }
    if (uRim > 0.0) {
      // Light from above: top silhouette edges catch it, bottom edges fall into shadow.
      if (!sU) shade *= 1.0 + uRim;
      else if (!sD) shade *= 1.0 - uRim * 0.6;
    }
    rgb *= shade;
    // Punchier palette.
    float l = dot(rgb, vec3(0.2126, 0.7152, 0.0722));
    rgb = max(mix(vec3(l), rgb, uSat), 0.0);
    float th = bayer4(p) * uDither;
    if (uBands > 0.0) {
      // Posterised shading: luminance snaps to bands of equal exposure steps
      // (uBands per stop), so dark stages get as many shades as bright ones; hue kept.
      float lg = log2(max(l, 1e-4));
      float q = exp2(floor(lg * uBands + 0.5 + th) / uBands);
      rgb *= q / max(l, 1e-4);
    }
    vec3 e = encode(rgb);
    if (uLevels > 0.5) e = clamp(floor(e * uLevels + 0.5 + th * 0.5) / uLevels, 0.0, 1.0);
    gl_FragColor = vec4(e, packDepth(dC));
  }
`;

const SHOW_VERT = /* glsl */ `
  varying vec2 vUv;
  varying float vViewZ;
  varying vec2 vProj;
  void main() {
    vUv = uv;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vViewZ = mv.z;
    vProj = vec2(projectionMatrix[2][2], projectionMatrix[3][2]);
    gl_Position = projectionMatrix * mv;
  }
`;

const SHOW_FRAG = /* glsl */ `
  precision highp float;
  uniform sampler2D map;
  uniform vec2 uSize;     // used texels
  uniform vec2 uRt;       // texture size
  uniform vec3 uDepth;    // bake: near, far (alpha range), quad plane distance
  uniform vec4 uFlash;    // rgb, amount
  uniform float uRange;
  varying vec2 vUv;
  varying float vViewZ;
  varying vec2 vProj;
  void main() {
    vec2 t = min(floor(vUv * uSize), uSize - 1.0) + 0.5;
    vec4 c = texture2D(map, t / uRt);
    if (c.a < 0.5 / 255.0) discard;
    vec3 rgb = pow(c.rgb, vec3(2.2)) * uRange;
    rgb = mix(rgb, uFlash.rgb, uFlash.a);
    // Per-texel depth: offset from the quad plane, carried into the current view.
    float d = mix(uDepth.x, uDepth.y, (c.a * 255.0 - 1.0) / 254.0);
    float z = vViewZ - (d - uDepth.z);
    z = min(z, -0.06);
    gl_FragDepth = ((vProj.x * z + vProj.y) / -z) * 0.5 + 0.5;
    gl_FragColor = vec4(rgb, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

/** Blob shadows under sprites (one instanced draw): a two-tone pixel ellipse that fades with height and distance. */
const SHADOW_VERT = /* glsl */ `
  varying vec2 vUv;
  varying float vAlpha;
  void main() {
    vUv = uv;
    vAlpha = instanceColor.r;
    vec4 mv = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
    vAlpha *= 1.0 - smoothstep(22.0, 40.0, -mv.z);
    gl_Position = projectionMatrix * mv;
  }
`;
const SHADOW_FRAG = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  varying float vAlpha;
  void main() {
    // Chunky: snap to a 12x12 grid like a sprite of its own.
    vec2 q = (floor(vUv * 12.0) + 0.5) / 12.0 * 2.0 - 1.0;
    float r = length(q);
    float a = r < 0.62 ? 0.5 : r < 1.0 ? 0.28 : 0.0;
    a *= vAlpha;
    if (a < 0.01) discard;
    gl_FragColor = vec4(0.0, 0.0, 0.0, a);
  }
`;
const MAX_SHADOWS = 48;
const _m4 = new THREE.Matrix4();
const _sq = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
const _ss = new THREE.Vector3();
const _sc = new THREE.Color();

interface Sprite {
  /** What is drawn: an entity's root, or a part it threw into the world (a severed limb). */
  obj: THREE.Object3D;
  /** The entity it belongs to (hit flashes, shadows, lifetime). */
  e: Entity;
  mesh: THREE.Mesh;
  mat: THREE.ShaderMaterial;
  rt: THREE.WebGLRenderTarget | null;
  rtKey: string;
  /** World time of the next bake. */
  next: number;
  /** Has a valid image. */
  ready: boolean;
  /** Billboard centre minus root world position at bake time. */
  offset: THREE.Vector3;
  /** root.visible before the main-camera hide (restored in endFrame). */
  hidden: boolean;
  /** Last frame the entity was seen in the world (GC). */
  seen: number;
  /** Ground shadow radius (m, smoothed). */
  shadowR: number;
  /** Last bake found it off screen / empty: re-check on the normal schedule, not every frame. */
  away: boolean;
}

export interface SpriteStats {
  sprites: number;
  /** Sprites drawn (billboards visible) this frame. */
  drawn: number;
  bakes: number;
  /** CPU ms spent in beginFrame (bakes + placement), smoothed. */
  cpuMs: number;
  /** Peak CPU ms of a frame in the last second. */
  cpuPeakMs: number;
  /** CPU ms of the last beginFrame. */
  lastMs: number;
  /** Render-target memory (bytes): sprite images + scratch. */
  rtBytes: number;
  bakesPerSec: number;
}

function sizeClass(n: number): number {
  let s = 16;
  while (s < n) s *= 2;
  return s;
}

/** Characters (they get ground shadows). */
export function isCharacter(e: Entity): boolean {
  return e instanceof Enemy || e instanceof Civilian;
}

/** Everything drawn as a sprite: characters plus the things they throw and the pickups they drop. */
export function isSpriteEntity(e: Entity): boolean {
  return isCharacter(e) || e instanceof Projectile || e instanceof Pickup;
}

/** Parts an entity has flung into the world (zombie limbs tumbling away) — sprites of their own. */
function looseParts(e: Entity): readonly { obj: THREE.Object3D }[] | null {
  const fl = (e as unknown as { flyers?: { obj: THREE.Object3D }[] }).flyers;
  return Array.isArray(fl) && fl.length ? fl : null;
}

/**
 * The sprite renderer for one World. Created by Game in ART: SPRITES (needs a
 * WebGL renderer, so never in the headless simulator).
 */
export class SpriteArt {
  readonly group = new THREE.Group();
  private shadows: THREE.InstancedMesh;
  look: SpriteLook = { ...DEFAULT_LOOK };
  readonly stats: SpriteStats = { sprites: 0, drawn: 0, bakes: 0, cpuMs: 0, cpuPeakMs: 0, lastMs: 0, rtBytes: 0, bakesPerSec: 0 };

  private sprites = new Map<THREE.Object3D, Sprite>();
  private free = new Map<string, THREE.WebGLRenderTarget[]>();
  private scratch: THREE.WebGLRenderTarget;
  private bakeScene = new THREE.Scene();
  private bakeCam = new THREE.PerspectiveCamera();
  private postScene = new THREE.Scene();
  private postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private postMat: THREE.ShaderMaterial;
  private showMat: THREE.ShaderMaterial;
  private quad = new THREE.PlaneGeometry(1, 1);
  private srcLights: THREE.Light[] = [];
  private mirrors: THREE.Light[] = [];
  private frame = 0;
  private due: Sprite[] = [];
  private secT = 0;
  private secBakes = 0;
  private secPeak = 0;
  private flashWhite = new THREE.Color(0xffffff);
  private flashRed = new THREE.Color(0xff3020);

  constructor(
    private renderer: THREE.WebGLRenderer,
    private world: World,
    /** Retro pixel grid size (width, height) the texel size is measured in. */
    private grid: () => { width: number; height: number },
  ) {
    const hdr = renderer.extensions.has('EXT_color_buffer_half_float') || renderer.extensions.has('EXT_color_buffer_float');
    this.scratch = new THREE.WebGLRenderTarget(SCRATCH, SCRATCH, {
      type: hdr ? THREE.HalfFloatType : THREE.UnsignedByteType,
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      depthBuffer: true,
      stencilBuffer: false,
      generateMipmaps: false,
    });
    this.scratch.texture.colorSpace = THREE.LinearSRGBColorSpace;
    this.scratch.depthTexture = new THREE.DepthTexture(SCRATCH, SCRATCH, THREE.UnsignedIntType);
    this.scratch.scissorTest = true;

    this.postMat = new THREE.ShaderMaterial({
      vertexShader: FULL_VERT,
      fragmentShader: BAKE_FRAG,
      uniforms: {
        tColor: { value: this.scratch.texture },
        tDepth: { value: this.scratch.depthTexture },
        uSize: { value: new THREE.Vector2() },
        uSS: { value: 1 },
        uDepthRange: { value: new THREE.Vector2() },
        uProj: { value: new THREE.Vector2() },
        uBands: { value: 0 },
        uDither: { value: 0 },
        uLevels: { value: 0 },
        uOutline: { value: 0 },
        uOutlineIn: { value: 0 },
        uInner: { value: 0 },
        uRim: { value: 0 },
        uSat: { value: 1 },
        uRange: { value: RANGE },
      },
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });
    const pq = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.postMat);
    pq.frustumCulled = false;
    this.postScene.add(pq);

    this.showMat = new THREE.ShaderMaterial({
      vertexShader: SHOW_VERT,
      fragmentShader: SHOW_FRAG,
      uniforms: {
        map: { value: null },
        uSize: { value: new THREE.Vector2(1, 1) },
        uRt: { value: new THREE.Vector2(1, 1) },
        uDepth: { value: new THREE.Vector3(1, 1, 1) },
        uFlash: { value: new THREE.Vector4(1, 1, 1, 0) },
        uRange: { value: RANGE },
      },
      fog: false,
    });

    this.bakeScene.matrixWorldAutoUpdate = false;
    this.bakeCam.matrixAutoUpdate = false;
    this.bakeCam.matrixWorldAutoUpdate = false;
    this.group.name = 'sprite-art';
    // A hidden template billboard keeps the display program in the scene for shader warm-up.
    const tpl = new THREE.Mesh(this.quad, this.showMat);
    tpl.visible = false;
    this.group.add(tpl);
    const shMat = new THREE.ShaderMaterial({
      vertexShader: SHADOW_VERT,
      fragmentShader: SHADOW_FRAG,
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
      fog: false,
    });
    this.shadows = new THREE.InstancedMesh(this.quad, shMat, MAX_SHADOWS);
    this.shadows.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX_SHADOWS * 3), 3);
    this.shadows.frustumCulled = false;
    this.shadows.count = 0;
    this.shadows.renderOrder = -1;
    this.shadows.name = 'sprite-shadows';
    this.group.add(this.shadows);
    world.scene.add(this.group);
  }

  /**
   * Compile what the bakes need (character materials drawn into the scratch
   * target, the bake pass) so the first sprite of each type doesn't hitch.
   * `objects` = the warm-up set (or any subtree) — compiled with the stage lights.
   */
  precompile(objects: THREE.Object3D) {
    const r = this.renderer;
    const prev = r.getRenderTarget();
    try {
      r.setRenderTarget(this.scratch);
      r.compile(objects, this.world.camera, this.world.scene);
      r.compile(this.postScene, this.postCam);
    } finally {
      r.setRenderTarget(prev);
    }
  }

  // ─── Frame ────────────────────────────────────────────────────────────────

  /** Before the main render: bake due sprites, place billboards, hide the 3D characters. */
  beginFrame() {
    const t0 = performance.now();
    const w = this.world;
    this.frame++;
    if (this.frame % 20 === 1) this.scanLights();
    this.syncEntities();
    w.scene.updateMatrixWorld();
    // Nothing moves until the main render: it can skip its own matrix pass (restored in endFrame).
    w.scene.matrixWorldAutoUpdate = false;
    const cam = w.camera;
    cam.updateMatrixWorld();

    // Due bakes: never-drawn first, then the most overdue.
    const due = this.due;
    due.length = 0;
    let firsts = 0;
    for (const s of this.sprites.values()) {
      if (!s.obj.visible || this.modelHidden(s)) continue;
      if (this.flashing(s) > 0 && s.ready) continue; // keep the frame; the billboard flashes instead
      if (!s.ready && !s.away) {
        due.push(s);
        firsts++;
      } else if (w.time >= s.next) due.push(s);
    }
    let bakes = 0;
    if (due.length) {
      due.sort((a, b) => (a.ready === b.ready ? a.next - b.next : a.ready ? 1 : -1));
      const cap = Math.min(due.length, Math.max(MAX_BAKES_PER_FRAME, Math.min(firsts, MAX_FIRST_BAKES)));
      this.syncLights();
      const r = this.renderer;
      const prevTarget = r.getRenderTarget();
      r.getClearColor(_clear);
      const prevAlpha = r.getClearAlpha();
      r.setClearColor(0x000000, 0);
      try {
        for (let i = 0; i < cap; i++) {
          const s = due[i];
          // Spread the next bakes over the interval (phase kept, never bunching up).
          s.next = Math.max(s.next + 1 / SPRITE_FPS, w.time + 0.5 / SPRITE_FPS);
          if (s.away) s.next = w.time + 0.5 / SPRITE_FPS; // off-screen re-checks at 24 Hz
          this.bake(s, cam);
          bakes++;
        }
      } finally {
        r.setRenderTarget(prevTarget);
        r.setClearColor(_clear, prevAlpha);
      }
    }

    // Place billboards and hide the real models from the main camera.
    let drawn = 0;
    let shadows = 0;
    for (const s of this.sprites.values()) {
      const root = s.obj;
      s.hidden = false;
      if (!root.visible) {
        s.mesh.visible = false;
        continue;
      }
      if (!s.ready || this.modelHidden(s)) {
        // No image (off screen, or not baked yet): the 3D model stays as a fallback — never invisible.
        s.mesh.visible = false;
        continue;
      }
      root.visible = false;
      s.hidden = true;
      _v.setFromMatrixPosition(root.matrixWorld).add(s.offset);
      s.mesh.position.copy(_v);
      s.mesh.updateMatrix();
      s.mesh.matrixWorld.copy(s.mesh.matrix);
      s.mesh.visible = true;
      const f = this.flashing(s);
      const u = s.mat.uniforms.uFlash.value as THREE.Vector4;
      if (f > 0) {
        const c = f === 2 ? this.flashRed : this.flashWhite;
        u.set(c.r, c.g, c.b, 1);
      } else u.w = 0;
      drawn++;
      if (shadows < MAX_SHADOWS && this.look.shadows > 0 && s.shadowR > 0 && s.obj === s.e.root && isCharacter(s.e)) this.placeShadow(s, shadows++);
    }
    this.shadows.count = shadows;
    if (shadows) {
      this.shadows.instanceMatrix.needsUpdate = true;
      this.shadows.instanceColor!.needsUpdate = true;
    }

    const ms = performance.now() - t0;
    const st = this.stats;
    st.sprites = this.sprites.size;
    st.drawn = drawn;
    st.bakes = bakes;
    st.cpuMs = st.cpuMs * 0.9 + ms * 0.1;
    st.lastMs = ms;
    this.secPeak = Math.max(this.secPeak, ms);
    this.secBakes += bakes;
    this.secT += 1;
    if (this.secT >= 60) {
      st.bakesPerSec = this.secBakes;
      st.cpuPeakMs = this.secPeak;
      this.secT = 0;
      this.secBakes = 0;
      this.secPeak = 0;
    }
    st.rtBytes = this.rtBytes();
  }

  /** Re-bake every sprite on the next frame (look changes, debug captures). */
  invalidate() {
    for (const s of this.sprites.values()) {
      s.ready = false;
      s.away = false;
    }
  }

  /** After the main render: show the real models again (raycasts, AI and tools see them as usual). */
  endFrame() {
    this.world.scene.matrixWorldAutoUpdate = true;
    for (const s of this.sprites.values()) {
      if (s.hidden) {
        s.obj.visible = true;
        s.hidden = false;
      }
    }
  }

  // ─── Internals ────────────────────────────────────────────────────────────

  private flashing(s: Sprite): number {
    return s.e instanceof Enemy && s.obj === s.e.root ? s.e.flashKind : 0;
  }

  /** The entity hides its model (blinking pickup, a boss off stage) while the root stays visible. */
  private modelHidden(s: Sprite): boolean {
    if (s.obj !== s.e.root) return false;
    const m = (s.e as unknown as { model?: unknown }).model;
    return m instanceof THREE.Object3D && !m.visible;
  }

  private syncEntities() {
    const f = this.frame;
    for (const e of this.world.entities) {
      if (e.removed || !isSpriteEntity(e)) continue;
      this.track(e.root, e, f);
      const parts = looseParts(e);
      if (parts) for (const p of parts) if (p.obj.parent) this.track(p.obj, e, f);
    }
    for (const [obj, s] of this.sprites) {
      if (s.seen !== f) this.release(obj, s);
    }
  }

  private track(obj: THREE.Object3D, e: Entity, f: number) {
    let s = this.sprites.get(obj);
    if (!s) {
      const mat = this.showMat.clone();
      mat.uniforms.uFlash.value = new THREE.Vector4(1, 1, 1, 0);
      const mesh = new THREE.Mesh(this.quad, mat);
      mesh.matrixAutoUpdate = false;
      mesh.matrixWorldAutoUpdate = false;
      mesh.visible = false;
      mesh.name = 'sprite';
      this.group.add(mesh);
      s = { obj, e, mesh, mat, rt: null, rtKey: '', next: 0, ready: false, offset: new THREE.Vector3(), hidden: false, seen: f, shadowR: 0, away: false };
      this.sprites.set(obj, s);
    }
    s.seen = f;
  }

  private release(obj: THREE.Object3D, s: Sprite) {
    if (s.hidden) obj.visible = true;
    this.group.remove(s.mesh);
    s.mat.dispose();
    if (s.rt) this.giveBack(s.rtKey, s.rt);
    this.sprites.delete(obj);
  }

  private takeTarget(w: number, h: number): { rt: THREE.WebGLRenderTarget; key: string } {
    const key = `${w}x${h}`;
    const list = this.free.get(key);
    const rt =
      list?.pop() ??
      new THREE.WebGLRenderTarget(w, h, {
        type: THREE.UnsignedByteType,
        minFilter: THREE.NearestFilter,
        magFilter: THREE.NearestFilter,
        depthBuffer: false,
        stencilBuffer: false,
        generateMipmaps: false,
      });
    rt.scissorTest = true;
    return { rt, key };
  }

  private giveBack(key: string, rt: THREE.WebGLRenderTarget) {
    let list = this.free.get(key);
    if (!list) this.free.set(key, (list = []));
    // Keep a few spares per size (big ones: one).
    if (list.length < (rt.width * rt.height >= 256 * 256 ? 1 : 4)) list.push(rt);
    else rt.dispose();
  }

  private rtBytes(): number {
    let b = SCRATCH * SCRATCH * (8 + 4);
    for (const s of this.sprites.values()) if (s.rt) b += s.rt.width * s.rt.height * 4;
    for (const list of this.free.values()) for (const rt of list) b += rt.width * rt.height * 4;
    return b;
  }

  /** World-space bounds of the visible meshes under `root`. */
  private bounds(root: THREE.Object3D, out: THREE.Box3): boolean {
    out.makeEmpty();
    const stack: THREE.Object3D[] = [root];
    while (stack.length) {
      const o = stack.pop()!;
      if (!o.visible) continue;
      const m = o as THREE.Mesh;
      if (m.isMesh || (o as THREE.Points).isPoints || (o as THREE.Line).isLine) {
        const mat = m.material;
        const shown = Array.isArray(mat) ? mat.some((x) => x.visible) : mat?.visible !== false;
        if (shown && m.geometry) {
          if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
          _mb.copy(m.geometry.boundingBox!).applyMatrix4(m.matrixWorld);
          out.union(_mb);
        }
      }
      for (const c of o.children) stack.push(c);
    }
    return !out.isEmpty();
  }

  /** Re-render one character into its sprite image and frame its billboard. */
  private bake(s: Sprite, cam: THREE.PerspectiveCamera) {
    const e = s.e;
    const src = s.obj;
    if (!this.bounds(src, _box)) {
      s.ready = false;
      s.away = true;
      return;
    }
    // On-screen rectangle (NDC) and depth range of the bounds.
    const near = cam.near;
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    let dMin = Infinity;
    let dMax = 0;
    let behind = false;
    const inv = cam.matrixWorldInverse;
    const P = cam.projectionMatrix.elements;
    for (let i = 0; i < 8; i++) {
      _v.set(i & 1 ? _box.max.x : _box.min.x, i & 2 ? _box.max.y : _box.min.y, i & 4 ? _box.max.z : _box.min.z).applyMatrix4(inv);
      const d = -_v.z;
      if (d < near * 2) {
        behind = true;
        continue;
      }
      dMin = Math.min(dMin, d);
      dMax = Math.max(dMax, d);
      const nx = (P[0] * _v.x + P[8] * _v.z) / d;
      const ny = (P[5] * _v.y + P[9] * _v.z) / d;
      x0 = Math.min(x0, nx);
      x1 = Math.max(x1, nx);
      y0 = Math.min(y0, ny);
      y1 = Math.max(y1, ny);
    }
    if (dMax === 0) {
      s.ready = false;
      s.away = true;
      return;
    }
    if (behind) {
      // Part of it wraps around the camera: keep everything on screen.
      x0 = -1 - EDGE;
      y0 = -1 - EDGE;
      x1 = 1 + EDGE;
      y1 = 1 + EDGE;
      dMin = near * 2;
    }
    x0 = Math.max(x0, -1 - EDGE);
    y0 = Math.max(y0, -1 - EDGE);
    x1 = Math.min(x1, 1 + EDGE);
    y1 = Math.min(y1, 1 + EDGE);
    if (x1 <= x0 || y1 <= y0) {
      s.ready = false;
      s.away = true;
      return;
    }
    // Texel grid: ~pxPerTexel retro pixels per texel, snapped to the screen so still sprites don't shimmer.
    const g = this.grid();
    const cap = e instanceof Enemy && e.isBoss && src === e.root ? MAX_TEX_BOSS : MAX_TEX;
    let k = this.look.pxPerTexel;
    let tx = 0;
    let ty = 0;
    let gx0 = 0;
    let gy0 = 0;
    let W = 0;
    let H = 0;
    for (let pass = 0; pass < 3; pass++) {
      tx = (2 * k) / g.width;
      ty = (2 * k) / g.height;
      gx0 = Math.floor(x0 / tx) - 1;
      gy0 = Math.floor(y0 / ty) - 1;
      W = Math.ceil(x1 / tx) + 1 - gx0;
      H = Math.ceil(y1 / ty) + 1 - gy0;
      if (W <= cap && H <= cap) break;
      k *= Math.max(W / cap, H / cap) * 1.02;
    }
    W = Math.min(W, SCRATCH);
    H = Math.min(H, SCRATCH);
    const ss = this.look.ss >= 2 && W * 2 <= SCRATCH && H * 2 <= SCRATCH ? 2 : 1;
    const rx0 = gx0 * tx;
    const ry0 = gy0 * ty;
    const rx1 = rx0 + W * tx;
    const ry1 = ry0 + H * ty;

    // Bake camera = the main camera, projection cropped to the sprite's rectangle.
    const cx = (rx0 + rx1) / 2;
    const cy = (ry0 + ry1) / 2;
    const hx = (rx1 - rx0) / 2;
    const hy = (ry1 - ry0) / 2;
    _crop.set(1 / hx, 0, 0, -cx / hx, 0, 1 / hy, 0, -cy / hy, 0, 0, 1, 0, 0, 0, 0, 1);
    const bc = this.bakeCam;
    bc.projectionMatrix.multiplyMatrices(_crop, cam.projectionMatrix);
    bc.projectionMatrixInverse.copy(bc.projectionMatrix).invert();
    bc.matrixWorld.copy(cam.matrixWorld);
    bc.matrixWorldInverse.copy(cam.matrixWorldInverse);
    bc.near = cam.near;
    bc.far = cam.far;

    const r = this.renderer;
    // 1. Raw render of just this character (stage lights + fog) into the scratch target.
    const sc = this.scratch;
    sc.viewport.set(0, 0, W * ss, H * ss);
    sc.scissor.set(0, 0, W * ss, H * ss);
    r.setRenderTarget(sc);
    const bs = this.bakeScene;
    bs.fog = this.world.scene.fog;
    const kids = bs.children;
    const nMirrors = kids.length;
    kids.push(src); // not re-parented: matrices were computed in the stage scene
    try {
      r.render(bs, bc);
    } finally {
      kids.length = nMirrors;
    }

    // 2. Pixel-art pass into the sprite's own image.
    const cw = sizeClass(W);
    const ch = sizeClass(H);
    const key = `${cw}x${ch}`;
    if (!s.rt || s.rtKey !== key) {
      if (s.rt) this.giveBack(s.rtKey, s.rt);
      const t = this.takeTarget(cw, ch);
      s.rt = t.rt;
      s.rtKey = t.key;
    }
    const dst = s.rt;
    dst.viewport.set(0, 0, W, H);
    dst.scissor.set(0, 0, W, H);
    const pu = this.postMat.uniforms;
    pu.uSize.value.set(W, H);
    pu.uSS.value = ss;
    const d0 = Math.max(near, dMin - 0.05);
    const d1 = Math.max(d0 + 0.1, dMax + 0.05);
    pu.uDepthRange.value.set(d0, d1);
    pu.uProj.value.set(P[10], P[14]);
    const L = this.look;
    pu.uBands.value = L.bands;
    pu.uDither.value = L.dither;
    pu.uLevels.value = L.levels;
    pu.uOutline.value = L.outline;
    // Auto (2): big sprites draw the outline on their own edge (limbs keep their gaps),
    // small ones around it (readability at a distance beats a texel of bloat).
    pu.uOutlineIn.value = L.outlineIn >= 2 ? (Math.max(W, H) >= 44 ? 1 : 0) : L.outlineIn;
    pu.uInner.value = L.inner;
    pu.uRim.value = L.rim;
    pu.uSat.value = L.saturation;
    r.setRenderTarget(dst);
    r.render(this.postScene, this.postCam);

    // 3. Billboard: the crop rectangle, screen-aligned, at the nearest depth of the bounds.
    const D = Math.max(d0, near * 4);
    const qx = ((cx + P[8]) * D) / P[0];
    const qy = ((cy + P[9]) * D) / P[5];
    const m = s.mesh;
    m.position.set(qx, qy, -D).applyMatrix4(cam.matrixWorld);
    m.quaternion.copy(cam.getWorldQuaternion(_q));
    m.scale.set((2 * hx * D) / P[0], (2 * hy * D) / P[5], 1);
    // Ground shadow size from the footprint (smoothed: animation makes the bounds breathe).
    const foot = Math.max(_box.max.x - _box.min.x, _box.max.z - _box.min.z);
    const want = THREE.MathUtils.clamp(foot * 0.42, 0.22, 7);
    s.shadowR = s.shadowR > 0 ? s.shadowR + (want - s.shadowR) * 0.35 : want;
    _c.setFromMatrixPosition(src.matrixWorld);
    s.offset.subVectors(m.position, _c);
    const u = s.mat.uniforms;
    u.map.value = dst.texture;
    (u.uSize.value as THREE.Vector2).set(W, H);
    (u.uRt.value as THREE.Vector2).set(cw, ch);
    (u.uDepth.value as THREE.Vector3).set(d0, d1, D);
    s.ready = true;
    s.away = false;
  }

  /** Blob shadow under a sprite: on the floor it stands on, fading as it leaves the ground. */
  private placeShadow(s: Sprite, i: number) {
    const e = s.e;
    _c.setFromMatrixPosition(e.root.matrixWorld);
    let floor = this.world.groundAt(_c.x, _c.z);
    if (e instanceof Enemy) {
      const f = e.spawn.opts.floor;
      if (typeof f === 'number' && e.frame === 'world') floor = f;
      // Standing on something raised (a car roof, a deck): that is its floor.
      else if (e.grounded && e.state !== 'entry' && _c.y > floor && _c.y - floor < 2.5 && e.state !== 'dying') floor = _c.y;
    }
    const h = Math.max(0, _c.y - floor);
    const fade = THREE.MathUtils.clamp(1 - h / 8, 0.25, 1) * this.look.shadows;
    const r = s.shadowR * THREE.MathUtils.clamp(1 - h / 16, 0.5, 1);
    _v.set(_c.x, floor + 0.03, _c.z);
    _ss.set(r * 2, r * 2, 1);
    _m4.compose(_v, _sq, _ss);
    this.shadows.setMatrixAt(i, _m4);
    this.shadows.setColorAt(i, _sc.setRGB(fade, 0, 0));
  }

  /** Mirror the stage's lights into the bake scene (same light set → same shader programs). */
  private scanLights() {
    const found: THREE.Light[] = [];
    this.world.scene.traverse((o) => {
      if ((o as THREE.Light).isLight) found.push(o as THREE.Light);
    });
    const same = found.length === this.srcLights.length && found.every((l, i) => l === this.srcLights[i]);
    if (same) return;
    for (const m of this.mirrors) {
      this.bakeScene.remove(m);
      m.dispose();
    }
    this.srcLights = found;
    this.mirrors = found.map((l) => {
      const Ctor = l.constructor as new () => THREE.Light;
      const m = new Ctor();
      m.matrixAutoUpdate = false;
      m.castShadow = false;
      return m;
    });
    for (const m of this.mirrors) this.bakeScene.add(m);
  }

  private syncLights() {
    for (let i = 0; i < this.srcLights.length; i++) {
      const src = this.srcLights[i] as THREE.Light & {
        target?: THREE.Object3D;
        groundColor?: THREE.Color;
        distance?: number;
        decay?: number;
        angle?: number;
        penumbra?: number;
        width?: number;
        height?: number;
      };
      const m = this.mirrors[i] as typeof src;
      let vis = true;
      for (let n: THREE.Object3D | null = src; n; n = n.parent) {
        if (!n.visible) {
          vis = false;
          break;
        }
      }
      m.visible = vis;
      m.color.copy(src.color);
      m.intensity = src.intensity;
      m.matrixWorld.copy(src.matrixWorld);
      if (src.target && m.target) m.target.matrixWorld.copy(src.target.matrixWorld);
      if (src.groundColor && m.groundColor) m.groundColor.copy(src.groundColor);
      if (src.distance !== undefined) m.distance = src.distance;
      if (src.decay !== undefined) m.decay = src.decay;
      if (src.angle !== undefined) m.angle = src.angle;
      if (src.penumbra !== undefined) m.penumbra = src.penumbra;
    }
  }

  dispose() {
    for (const [obj, s] of [...this.sprites]) this.release(obj, s);
    for (const list of this.free.values()) for (const rt of list) rt.dispose();
    this.free.clear();
    for (const m of this.mirrors) m.dispose();
    this.scratch.depthTexture?.dispose();
    this.scratch.dispose();
    this.postMat.dispose();
    (this.shadows.material as THREE.Material).dispose();
    this.shadows.dispose();
    this.showMat.dispose();
    this.quad.dispose();
    this.group.parent?.remove(this.group);
  }
}
