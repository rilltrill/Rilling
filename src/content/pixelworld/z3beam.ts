import * as THREE from 'three';
import { Kit } from '../kit/ModelKit';

/**
 * HIGHWAY TO HELL (z3) searchlights for ART: PIXEL WORLD: instead of the
 * classic additive cone (from the bridge it fills the sky corners as a flat
 * lavender blob), each beam is ONE strip along its axis that turns round the
 * axis to face the camera (an axial billboard in the vertex shader: no CPU
 * work), drawn the 16-bit way: four stepped bands across the beam (a hot core,
 * two falloff steps, a ragged rim) whose edges are Bayer-dithered in screen
 * space, stepped fading along it, and gone when the camera stands in the
 * beam's own foot (it never fills the screen). Additive, no depth writes.
 */

const LEN = 90;

/** The beam strip: x across (−0.5…0.5 × the width at that height), y along 0…LEN; uv 0…1 both ways. */
export function z3BeamGeometry(w0 = 0.9, w1 = 9): THREE.BufferGeometry {
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  const N = 8;
  for (let j = 0; j <= N; j++) {
    const v = j / N;
    const w = w0 + (w1 - w0) * v;
    pos.push(-w / 2, v * LEN, 0, w / 2, v * LEN, 0);
    uv.push(0, v, 1, v);
    if (j < N) {
      const a = j * 2;
      idx.push(a, a + 1, a + 3, a, a + 3, a + 2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, LEN / 2, 0), LEN);
  return Kit.track(g);
}

/** The stepped, dithered beam material (`k` = how much light the core adds). */
export function z3BeamMaterial(color = 0xfff2d8, k = 0.2): THREE.MeshBasicMaterial {
  const m = new THREE.MeshBasicMaterial({ color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
  const uniforms = { uBeamK: { value: k } };
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vBmUv;\nvarying float vBmNear;')
      .replace(
        '#include <project_vertex>',
        /* glsl */ `
        // Axial billboard: the strip turns round the beam's axis to face the camera.
        vec3 bmAxis = normalize((modelMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz);
        vec3 bmBase = (modelMatrix * vec4(0.0, position.y, 0.0, 1.0)).xyz;
        vec3 bmFoot = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
        vec3 bmSide = cross(bmAxis, normalize(cameraPosition - bmBase));
        bmSide = length(bmSide) > 1e-4 ? normalize(bmSide) : vec3(1.0, 0.0, 0.0);
        vec3 bmWorld = bmBase + bmSide * position.x;
        vec4 mvPosition = viewMatrix * vec4(bmWorld, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        vBmUv = uv;
        // Fade out as the camera walks into the beam's foot.
        vBmNear = smoothstep(18.0, 40.0, distance(cameraPosition, bmFoot));`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vBmUv;\nvarying float vBmNear;\nuniform float uBeamK;')
      .replace(
        '#include <opaque_fragment>',
        /* glsl */ `
        {
          // Bayer 4×4 in screen space (the dither of the band edges).
          ivec2 bp = ivec2(mod(gl_FragCoord.xy, 4.0));
          int bi = bp.x + bp.y * 4;
          float bay[16] = float[16](0.03, 0.53, 0.16, 0.66, 0.78, 0.28, 0.91, 0.41, 0.22, 0.72, 0.09, 0.59, 0.97, 0.47, 0.84, 0.34);
          float d = abs(vBmUv.x - 0.5) * 2.0;
          // Four bands across: core, two falloff steps, a ragged rim; dithered at each edge.
          float e = d + (bay[bi] - 0.5) * 0.14;
          float band = e < 0.22 ? 1.0 : e < 0.5 ? 0.62 : e < 0.78 ? 0.34 : e < 0.96 ? 0.14 : 0.0;
          // Along the beam: stepped fade toward the top, a hot first metres.
          float t = vBmUv.y + (bay[bi] - 0.5) * 0.08;
          float along = t < 0.08 ? 1.0 : t < 0.35 ? 0.75 : t < 0.65 ? 0.48 : t < 0.9 ? 0.24 : 0.0;
          float a = band * along * vBmNear;
          if (a <= 0.0) discard;
          diffuseColor.a = uBeamK * a;
        }
        #include <opaque_fragment>`,
      );
  };
  m.customProgramCacheKey = () => 'z3Beam1';
  m.name = 'pw:z3-beam';
  m.userData.pixelWorld = true;
  return Kit.track(m);
}
