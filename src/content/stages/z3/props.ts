import * as THREE from 'three';
import { Kit } from '../../kit/ModelKit';
import type { Rng } from '../../../core/Rng';
import { M } from './bake';
import { addText, textWidth } from './font';

/**
 * Procedural props for the interstate: cars, trucks, the tanker, barriers,
 * light poles, sign gantries, billboards. Every builder returns a Group
 * (vehicles face +Z, ground at y = 0) built from cached Kit primitives with
 * `M` materials so the environment can bake them.
 */

// ─── Palette ─────────────────────────────────────────────────────────────────

export const PAL = {
  asphalt: 0x3b3a42,
  asphaltDark: 0x2c2b32,
  shoulder: 0x4a4650,
  concrete: 0x9a948c,
  concreteDark: 0x6e6a66,
  metal: 0x8e9298,
  metalDark: 0x45484e,
  rust: 0x6a3a22,
  glass: 0x1a2030,
  glassLit: 0x2c3a4c,
  tyre: 0x18181a,
  burnt: 0x262224,
  burntRust: 0x4a2a1c,
  white: 0xe8e4dc,
  yellow: 0xe0b020,
  signGreen: 0x1d6a3c,
  signText: 0xf0f0e8,
  sodium: 0xffb050,
  head: 0xfff0c8,
  tail: 0xff2a1a,
  olive: 0x4c5a34,
  dirt: 0x5a4a3c,
  grass: 0x4a4a2c,
  rock: 0x5a5058,
} as const;

export const CAR_COLORS = [0x7a1c1c, 0x1c3a6a, 0x9a9a9a, 0xd8d4c8, 0x2a2a2e, 0x3a5a3a, 0x8a6a2a, 0x5a2a5a, 0x3a6a7a, 0xb06a20];

export interface CarOpts {
  color?: number;
  burnt?: boolean;
  /** Headlights / taillights lit (abandoned cars with the battery still alive). */
  lights?: boolean;
  doorOpen?: boolean;
  /** 0 sedan, 1 hatch / compact, 2 SUV, 3 van, 4 police. */
  kind?: number;
}

function wheel(g: THREE.Object3D, x: number, y: number, z: number, r: number, burnt: boolean) {
  Kit.add(g, Kit.cyl(r, r, 0.26, 8), M.lam(burnt ? 0x141414 : PAL.tyre), x, y, z, 0, 0, Math.PI / 2);
  Kit.add(g, Kit.cyl(r * 0.55, r * 0.55, 0.28, 6), M.lam(burnt ? PAL.burntRust : 0x8a8a8a), x, y, z, 0, 0, Math.PI / 2);
}

/** A passenger vehicle. ~4.4 m long, facing +Z. */
export function car(rng: Rng, o: CarOpts = {}): THREE.Group {
  const g = new THREE.Group();
  const kind = o.kind ?? rng.int(0, 2);
  const burnt = !!o.burnt;
  const color = burnt ? PAL.burnt : o.color ?? rng.pick(CAR_COLORS);
  const body = M.lam(color, burnt ? 'metal' : undefined, 1, 0.6);
  const glass = M.lam(burnt ? 0x0c0c0e : PAL.glass);
  const trim = M.lam(burnt ? PAL.burntRust : 0x1e1e22);
  let len = 4.4;
  let w = 1.82;
  let bodyH = 0.62;
  let cabH = 0.52;
  let cabLen = 2.2;
  let cabZ = -0.25;
  let wheelR = 0.34;
  if (kind === 1) {
    len = 3.8;
    cabLen = 2.0;
    cabZ = -0.35;
  } else if (kind === 2) {
    len = 4.7;
    w = 1.95;
    bodyH = 0.85;
    cabH = 0.62;
    cabLen = 3.0;
    cabZ = -0.45;
    wheelR = 0.42;
  } else if (kind === 3) {
    len = 5.0;
    w = 1.98;
    bodyH = 1.9;
    cabH = 0;
    wheelR = 0.38;
  }
  const baseY = wheelR * 0.9;
  Kit.add(g, Kit.box(w, bodyH, len), body, 0, baseY + bodyH / 2, 0);
  if (kind === 3) {
    // Van: windscreen + side windows on the tall box.
    Kit.add(g, Kit.box(w * 0.92, 0.6, 0.06), glass, 0, baseY + bodyH - 0.45, len / 2 + 0.01);
    for (const s of [-1, 1]) Kit.add(g, Kit.box(0.04, 0.5, 1.2), glass, s * (w / 2 + 0.01), baseY + bodyH - 0.45, len / 2 - 1.0);
    // Courier stripe.
    if (!burnt) Kit.add(g, Kit.box(w + 0.02, 0.22, len * 0.6), M.lam(rng.pick([0xd04020, 0x2050a0, 0xe0b020])), 0, baseY + bodyH * 0.45, -0.5);
  } else {
    // Cabin: glass block + roof.
    Kit.add(g, Kit.box(w * 0.86, cabH, cabLen), glass, 0, baseY + bodyH + cabH / 2, cabZ);
    Kit.add(g, Kit.box(w * 0.88, 0.08, cabLen * 0.82), body, 0, baseY + bodyH + cabH, cabZ - 0.05);
    // Pillars so it reads as a car, not a box.
    for (const s of [-1, 1]) {
      Kit.add(g, Kit.box(0.08, cabH, 0.1), body, s * w * 0.42, baseY + bodyH + cabH / 2, cabZ + cabLen / 2 - 0.05);
      Kit.add(g, Kit.box(0.08, cabH, 0.14), body, s * w * 0.42, baseY + bodyH + cabH / 2, cabZ - cabLen / 2 + 0.07);
    }
  }
  // Bumpers.
  Kit.add(g, Kit.box(w + 0.04, 0.18, 0.14), trim, 0, baseY + 0.12, len / 2 + 0.03);
  Kit.add(g, Kit.box(w + 0.04, 0.18, 0.14), trim, 0, baseY + 0.12, -len / 2 - 0.03);
  // Lights.
  const lit = !!o.lights && !burnt;
  for (const s of [-1, 1]) {
    Kit.add(g, Kit.box(0.34, 0.12, 0.06), lit ? M.glow(PAL.head, 1.2) : M.lam(burnt ? 0x222222 : 0x9a9a90), s * (w / 2 - 0.26), baseY + bodyH * 0.72, len / 2 + 0.02);
    Kit.add(g, Kit.box(0.3, 0.12, 0.06), lit ? M.glow(PAL.tail, 1.1) : M.lam(burnt ? 0x221010 : 0x6a1010), s * (w / 2 - 0.22), baseY + bodyH * 0.75, -len / 2 - 0.02);
  }
  // Wheels.
  const wz = len / 2 - 0.85;
  for (const s of [-1, 1]) for (const z of [wz, -wz]) wheel(g, s * (w / 2 - 0.08), wheelR, z, wheelR, burnt);
  if (kind === 4 || (kind === 0 && o.color === 0xe8e8e8)) {
    // Police light bar.
    Kit.add(g, Kit.box(1.2, 0.12, 0.3), trim, 0, baseY + bodyH + cabH + 0.1, cabZ);
    Kit.add(g, Kit.box(0.5, 0.12, 0.28), M.glow(0xff2020, 1.4), -0.32, baseY + bodyH + cabH + 0.17, cabZ);
    Kit.add(g, Kit.box(0.5, 0.12, 0.28), M.glow(0x2050ff, 1.4), 0.32, baseY + bodyH + cabH + 0.17, cabZ);
    Kit.add(g, Kit.box(w + 0.01, 0.2, 1.6), M.lam(0x1a1a1e), 0, baseY + bodyH * 0.55, -0.3);
  }
  if (o.doorOpen && kind !== 3) {
    const s = rng.chance(0.5) ? 1 : -1;
    Kit.add(g, Kit.box(0.08, bodyH + cabH * 0.8, 1.05), body, s * (w / 2 + 0.45), baseY + (bodyH + cabH * 0.8) / 2, cabZ + 0.55, 0, s * 0.9, 0);
  }
  if (burnt) {
    // Scorch + rust patches.
    Kit.add(g, Kit.box(w * 0.7, 0.04, len * 0.35), M.lam(PAL.burntRust), 0, baseY + bodyH + 0.01, len * 0.28);
  }
  return g;
}

/** Long school bus (11 m), facing +Z. */
export function bus(burnt = false): THREE.Group {
  const g = new THREE.Group();
  const yel = M.lam(burnt ? PAL.burnt : 0xd8a018, burnt ? 'metal' : undefined, 1, 0.5);
  const black = M.lam(0x16161a);
  Kit.add(g, Kit.box(2.5, 2.3, 10.4), yel, 0, 1.75, -0.4);
  Kit.add(g, Kit.box(2.4, 1.2, 1.6), yel, 0, 1.2, 5.6);
  for (const s of [-1, 1]) {
    Kit.add(g, Kit.box(0.04, 0.75, 8.6), M.lam(burnt ? 0x0a0a0a : PAL.glass), s * 1.26, 2.3, -0.6);
    Kit.add(g, Kit.box(0.05, 0.1, 10.4), black, s * 1.26, 1.4, -0.4);
    Kit.add(g, Kit.box(0.05, 0.1, 10.4), black, s * 1.26, 1.1, -0.4);
  }
  Kit.add(g, Kit.box(2.2, 0.9, 0.06), M.lam(PAL.glass), 0, 2.3, 4.82);
  for (const s of [-1, 1]) for (const z of [4.6, -3.8]) wheel(g, s * 1.15, 0.5, z, 0.5, burnt);
  if (!burnt) for (const s of [-1, 1]) Kit.add(g, Kit.box(0.22, 0.22, 0.06), M.glow(0xff4020, 1.3), s * 0.9, 2.75, -5.62);
  return g;
}

/** Semi tractor cab (no trailer), facing +Z. ~6 m long. */
export function semiCab(color: number, burnt = false): THREE.Group {
  const g = new THREE.Group();
  const body = M.lam(burnt ? PAL.burnt : color);
  const chrome = M.lam(burnt ? PAL.burntRust : 0xb8bcc4);
  Kit.add(g, Kit.box(2.5, 2.6, 2.6), body, 0, 2.2, 0.6);
  Kit.add(g, Kit.box(2.4, 1.2, 1.6), body, 0, 1.4, 2.6);
  Kit.add(g, Kit.box(2.3, 0.9, 0.06), M.lam(burnt ? 0x0a0a0a : PAL.glass), 0, 2.8, 1.92);
  Kit.add(g, Kit.box(1.6, 1.0, 0.1), chrome, 0, 1.4, 3.42);
  Kit.add(g, Kit.box(2.6, 0.3, 6.0), M.lam(0x1c1c20), 0, 0.9, -0.4);
  for (const s of [-1, 1]) {
    Kit.add(g, Kit.cyl(0.1, 0.1, 2.2, 6), chrome, s * 1.1, 3.6, -0.8);
    Kit.add(g, Kit.cyl(0.32, 0.32, 1.1, 8), chrome, s * 1.25, 0.9, 0.0, Math.PI / 2, 0, 0);
    wheel(g, s * 1.1, 0.52, 2.5, 0.52, burnt);
    wheel(g, s * 1.1, 0.52, -1.6, 0.52, burnt);
    wheel(g, s * 1.1, 0.52, -2.8, 0.52, burnt);
  }
  return g;
}

/** Box trailer (13 m), facing +Z, hitch end at +Z. */
export function trailer(color = 0xd8d4cc, text = ''): THREE.Group {
  const g = new THREE.Group();
  Kit.add(g, Kit.box(2.6, 2.9, 12.8), M.lam(color, 'corrugated', 1, 0.5), 0, 2.75, 0);
  Kit.add(g, Kit.box(2.5, 0.25, 12.8), M.lam(0x1c1c20), 0, 1.15, 0);
  for (const s of [-1, 1]) {
    for (const z of [-4.6, -5.8]) wheel(g, s * 1.1, 0.52, z, 0.52, false);
    Kit.add(g, Kit.box(0.08, 0.8, 0.08), M.lam(0x2a2a2e), s * 0.9, 0.6, 4.2);
    if (text) {
      const tw = textWidth(text, 0.2);
      void tw;
      const side = new THREE.Group();
      side.position.set(s * 1.32, 3.0, 0);
      side.rotation.y = (s * Math.PI) / 2;
      addText(side, text, M.lam(0xb02020), 0, 0, 0, 0.2, 0.03);
      g.add(side);
    }
  }
  return g;
}

/**
 * Overturned fuel tanker: cab on its side + the tank lying across the lanes.
 * Returns the tank (shootable, explodes) separately from the static cab.
 */
export function tankerTank(): THREE.Group {
  const g = new THREE.Group();
  const steel = M.lam(0xc8ccd0, 'metal', 1, 0.5);
  const band = M.lam(0x6a6e74);
  // Tank lying on its side, axis along X (across the road).
  Kit.add(g, Kit.cyl(1.35, 1.35, 11, 12), steel, 0, 1.35, 0, 0, 0, Math.PI / 2);
  for (const x of [-4.5, -1.5, 1.5, 4.5]) Kit.add(g, Kit.cyl(1.4, 1.4, 0.18, 12), band, x, 1.35, 0, 0, 0, Math.PI / 2);
  for (const s of [-1, 1]) Kit.add(g, Kit.sphere(1.35, 12, 6), steel, s * 5.5, 1.35, 0, 0, 0, 0, 0.35, 1, 1);
  // Hazard placards + FLAMMABLE stripe.
  Kit.add(g, Kit.box(6, 0.42, 0.06), M.lam(0xc02018), 0, 1.6, 1.36);
  addText(g, 'FLAMMABLE', M.lam(0xf0f0e8), 0, 1.6, 1.4, 0.06, 0.02);
  for (const x of [-3.6, 3.6]) {
    const p = Kit.add(g, Kit.box(0.6, 0.6, 0.05), M.lam(0xd02a1a), x, 2.1, 1.25);
    p.rotation.z = Math.PI / 4;
    p.rotation.x = -0.35;
  }
  // Leaking valve (glowing fuel drip marks it as the thing to shoot).
  Kit.add(g, Kit.cyl(0.18, 0.18, 0.4, 8), band, 1.0, 0.4, 1.25, Math.PI / 2, 0, 0);
  return g;
}

/** Jersey barrier segment of length `len` along Z. */
export function jersey(g: THREE.Object3D, x: number, z: number, len: number, ry = 0, color: number = PAL.concrete) {
  const m = M.lam(color, 'concrete', 1, 0.7);
  const seg = new THREE.Group();
  seg.position.set(x, 0, z);
  seg.rotation.y = ry;
  Kit.add(seg, Kit.box(0.8, 0.3, len), m, 0, 0.15, 0);
  Kit.add(seg, Kit.box(0.5, 0.25, len), m, 0, 0.42, 0);
  Kit.add(seg, Kit.box(0.3, 0.38, len), m, 0, 0.73, 0);
  g.add(seg);
}

/** Highway light pole with one or two arms. `lit` false = dead lamp. */
export function lightPole(two: boolean, lit: boolean): THREE.Group {
  const g = new THREE.Group();
  const pole = M.lam(PAL.metalDark);
  Kit.add(g, Kit.cyl(0.11, 0.16, 10, 6), pole, 0, 5, 0);
  Kit.add(g, Kit.box(0.5, 0.5, 0.5), M.lam(PAL.concreteDark), 0, 0.25, 0);
  const lamp = lit ? M.glow(PAL.sodium, 1.4) : M.lam(0x3a3a3a);
  for (const s of two ? [-1, 1] : [1]) {
    Kit.add(g, Kit.box(0.1, 0.1, 2.6), pole, 0, 9.9, s * 1.3, 0.12 * s, 0, 0);
    Kit.add(g, Kit.box(0.42, 0.16, 0.9), pole, 0, 10.05, s * 2.65);
    Kit.add(g, Kit.box(0.34, 0.06, 0.7), lamp, 0, 9.95, s * 2.65);
  }
  return g;
}

/** A green overhead sign panel with text lines. Panel faces +Z. */
export function signPanel(lines: string[], width: number, height: number, color: number = PAL.signGreen): THREE.Group {
  const g = new THREE.Group();
  Kit.add(g, Kit.box(width, height, 0.12), M.lam(color), 0, 0, 0);
  Kit.add(g, Kit.box(width - 0.2, height - 0.2, 0.02), M.lam(PAL.signText), 0, 0, 0.065);
  Kit.add(g, Kit.box(width - 0.34, height - 0.34, 0.02), M.lam(color), 0, 0, 0.075);
  const px = Math.min(0.13, (height - 0.5) / (lines.length * 9));
  const lh = px * 9.5;
  lines.forEach((t, i) => {
    addText(g, t, M.lam(PAL.signText), 0, ((lines.length - 1) / 2 - i) * lh, 0.1, px, 0.03);
  });
  return g;
}

/** Billboard on two legs facing +Z. `art` paints the 12×5 m face. */
export function billboard(art: (face: THREE.Group) => void, lit = true): THREE.Group {
  const g = new THREE.Group();
  const steel = M.lam(PAL.metalDark);
  for (const x of [-3.5, 3.5]) {
    Kit.add(g, Kit.cyl(0.25, 0.3, 9, 8), steel, x, 4.5, -0.4);
    Kit.add(g, Kit.box(0.2, 0.2, 1.4), steel, x, 8.6, 0.2);
  }
  Kit.add(g, Kit.box(12.4, 5.4, 0.3), M.lam(0x2a2a2e), 0, 11.5, -0.2);
  Kit.add(g, Kit.box(12.6, 0.12, 1.2), steel, 0, 8.7, 0.4);
  const face = new THREE.Group();
  face.position.set(0, 11.5, 0);
  g.add(face);
  art(face);
  if (lit) for (const x of [-4, 0, 4]) Kit.add(g, Kit.box(0.5, 0.12, 0.3), M.glow(0xfff2d0, 1.3), x, 8.85, 0.85);
  return g;
}

/** Sandbag wall section (length along X). */
export function sandbags(g: THREE.Object3D, x: number, z: number, len: number, rows = 3, ry = 0) {
  const seg = new THREE.Group();
  seg.position.set(x, 0, z);
  seg.rotation.y = ry;
  const m = [M.lam(0x8a7a52, 'cloth', 1, 0.6), M.lam(0x7a6c48, 'cloth', 1, 0.6)];
  const n = Math.max(1, Math.round(len / 0.62));
  for (let r = 0; r < rows; r++) {
    for (let i = 0; i < n - (r % 2); i++) {
      const bx = -len / 2 + 0.31 + i * 0.62 + (r % 2) * 0.31;
      Kit.add(seg, Kit.box(0.6, 0.24, 0.42), m[(i + r) % 2], bx, 0.12 + r * 0.24, 0, 0, ((i * 7 + r * 3) % 5 - 2) * 0.03, 0);
    }
  }
  g.add(seg);
}

/** Dead roadside tree. */
export function deadTree(rng: Rng): THREE.Group {
  const g = new THREE.Group();
  const bark = M.lam(0x2e2622, 'bark');
  const h = rng.range(4, 7);
  Kit.add(g, Kit.cyl(0.1, 0.22, h, 5), bark, 0, h / 2, 0, rng.spread(0.08), 0, rng.spread(0.08));
  for (let i = 0; i < 4; i++) {
    const y = h * rng.range(0.45, 0.9);
    const a = rng.next() * Math.PI * 2;
    const l = rng.range(1.2, 2.4);
    const b = Kit.add(g, Kit.cyl(0.03, 0.08, l, 4), bark, Math.cos(a) * l * 0.3, y + l * 0.3, Math.sin(a) * l * 0.3);
    b.rotation.set(Math.sin(a) * 0.9, 0, -Math.cos(a) * 0.9);
  }
  return g;
}

/** Low scrubby bush (dusk-dark). */
export function bush(rng: Rng): THREE.Group {
  const g = new THREE.Group();
  const m = M.lam(rng.pick([0x3a3a24, 0x34361e, 0x403820]), 'leaves', 1, 0.6);
  for (let i = 0; i < 3; i++) {
    const s = rng.range(0.5, 1.0);
    Kit.add(g, Kit.ico(1, 0), m, rng.spread(0.6), s * 0.6, rng.spread(0.6), rng.next(), rng.next(), 0, s, s * 0.75, s);
  }
  return g;
}
