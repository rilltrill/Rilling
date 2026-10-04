import * as THREE from 'three';
import { ATLAS_COLS, ATLAS_ROWS } from './textures';
import { newRange, uploadRange } from './upload';

/**
 * Pooled projected-quad decals (blood pools, bullet holes, scorch marks) in one
 * instanced draw call. Each decal is a flat quad oriented to a surface normal.
 * Spawn/fade animation runs in the vertex shader from the decal's birth time, so
 * the CPU only writes a decal once when it is spawned. When the pool is full the
 * oldest decal is recycled.
 */

const G = 16;

const VERT = /* glsl */ `
  attribute vec4 iPosSize;
  attribute vec4 iNrmAng;
  attribute vec4 iColor;
  attribute vec4 iTime;
  uniform vec2 uAtlas;
  uniform float uTime;
  varying vec2 vUv;
  varying vec4 vColor;
  #include <fog_pars_vertex>
  void main() {
    float age = uTime - iTime.x;
    float life = iTime.y;
    if (age < 0.0 || age > life) {
      gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
      vColor = vec4(0.0);
      vUv = vec2(0.0);
      return;
    }
    vec3 n = iNrmAng.xyz;
    vec3 ref = abs(n.y) < 0.95 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
    vec3 t = normalize(cross(ref, n));
    vec3 b = cross(n, t);
    float c = cos(iNrmAng.w);
    float s = sin(iNrmAng.w);
    vec3 T = t * c + b * s;
    vec3 B = b * c - t * s;
    // Splats spread out quickly, then sit; fade over the last few seconds.
    float spread = iTime.z;
    float k = spread > 0.0 ? smoothstep(0.0, spread, age) : 1.0;
    float sz = iPosSize.w * (0.45 + 0.55 * k);
    vec3 wp = iPosSize.xyz + (T * position.x + B * position.y) * sz;
    vec4 mvPosition = modelViewMatrix * vec4(wp, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    float fade = clamp((life - age) / min(5.0, life * 0.4), 0.0, 1.0);
    float a = iColor.a * min(1.0, age / 0.05) * fade;
    vColor = vec4(iColor.rgb, a);
    float f = iTime.w;
    vec2 cell = vec2(mod(f, uAtlas.x), floor(f / uAtlas.x));
    vUv = (cell + uv) / uAtlas;
    #include <fog_vertex>
  }
`;

const FRAG = /* glsl */ `
  uniform sampler2D uMap;
  uniform vec3 uLight;
  varying vec2 vUv;
  varying vec4 vColor;
  #include <fog_pars_fragment>
  void main() {
    vec4 t = texture2D(uMap, vUv);
    float a = t.a * vColor.a;
    if (a < 0.01) discard;
    gl_FragColor = vec4(vColor.rgb * t.rgb * uLight, a);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
  }
`;

export class DecalSystem {
  readonly mesh: THREE.Mesh;
  readonly mat: THREE.ShaderMaterial;
  private gpu: Float32Array;
  private buf: THREE.InstancedInterleavedBuffer;
  private geo: THREE.InstancedBufferGeometry;
  private cursor = 0;
  private used = 0;
  private time = 0;
  private dirtyMin = Infinity;
  private dirtyMax = -1;
  private range = newRange();

  constructor(
    readonly capacity: number,
    map: THREE.Texture,
  ) {
    this.gpu = new Float32Array(capacity * G);
    const geo = new THREE.InstancedBufferGeometry();
    geo.setIndex([0, 1, 2, 0, 2, 3]);
    geo.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
    this.buf = new THREE.InstancedInterleavedBuffer(this.gpu, G, 1);
    this.buf.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('iPosSize', new THREE.InterleavedBufferAttribute(this.buf, 4, 0));
    geo.setAttribute('iNrmAng', new THREE.InterleavedBufferAttribute(this.buf, 4, 4));
    geo.setAttribute('iColor', new THREE.InterleavedBufferAttribute(this.buf, 4, 8));
    geo.setAttribute('iTime', new THREE.InterleavedBufferAttribute(this.buf, 4, 12));
    geo.instanceCount = 0;
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
    this.geo = geo;
    const uniforms = THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      {
        uAtlas: { value: new THREE.Vector2(ATLAS_COLS, ATLAS_ROWS) },
        uTime: { value: 0 },
        uLight: { value: new THREE.Color(1, 1, 1) },
        uMap: { value: null },
      },
    ]);
    uniforms.uMap.value = map;
    this.mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms,
      transparent: true,
      depthWrite: false,
      fog: true,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -4,
    });
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.frustumCulled = false;
    // Before other transparent things (glass, particles) — decals sit on opaque surfaces.
    this.mesh.renderOrder = -2;
    this.mesh.visible = false;
    this.mesh.name = 'fx-decals';
  }

  get lightUniform(): THREE.Color {
    return this.mat.uniforms.uLight.value as THREE.Color;
  }

  /**
   * Add a decal. `nx,ny,nz` is the (unit) surface normal, `angle` the spin around
   * it, `spread` seconds of grow-in (0 = instant), colour in linear RGB.
   */
  add(
    x: number,
    y: number,
    z: number,
    nx: number,
    ny: number,
    nz: number,
    size: number,
    angle: number,
    r: number,
    g: number,
    b: number,
    alpha: number,
    life: number,
    frame: number,
    spread = 0.2,
  ) {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.capacity;
    if (this.used < this.capacity) this.used++;
    const o = i * G;
    const d = this.gpu;
    d[o] = x;
    d[o + 1] = y;
    d[o + 2] = z;
    d[o + 3] = size;
    d[o + 4] = nx;
    d[o + 5] = ny;
    d[o + 6] = nz;
    d[o + 7] = angle;
    d[o + 8] = r;
    d[o + 9] = g;
    d[o + 10] = b;
    d[o + 11] = alpha;
    d[o + 12] = this.time;
    d[o + 13] = life;
    d[o + 14] = spread;
    d[o + 15] = frame;
    if (i < this.dirtyMin) this.dirtyMin = i;
    if (i > this.dirtyMax) this.dirtyMax = i;
  }

  update(dt: number) {
    this.time += dt;
    this.mat.uniforms.uTime.value = this.time;
    if (this.dirtyMax >= 0) {
      uploadRange(this.buf, this.range, this.dirtyMin * G, (this.dirtyMax - this.dirtyMin + 1) * G);
      this.dirtyMin = Infinity;
      this.dirtyMax = -1;
    }
    this.geo.instanceCount = this.used;
    this.mesh.visible = this.used > 0;
  }

  clear() {
    this.gpu.fill(0);
    this.cursor = 0;
    this.used = 0;
    this.dirtyMin = Infinity;
    this.dirtyMax = -1;
    this.geo.instanceCount = 0;
    this.mesh.visible = false;
    this.buf.clearUpdateRanges();
    this.buf.needsUpdate = true;
  }

  dispose() {
    this.geo.dispose();
    this.mat.dispose();
  }
}
